import { useCallback, useEffect, useState } from 'react'
import { format, parseISO, addDays, isValid } from 'date-fns'
import { ru } from 'date-fns/locale'
import {
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import {
  loadFromCache,
  type LicenseRecord,
  type RegistryLookupResponse,
} from '../lib/licenseRegistry'
import { readBoolStorage, writeBoolStorage } from '../lib/collapsibleStorage'
import { CopyOnClick } from './CopyOnClick'

const REGISTRY_EXPANDED_KEY = 'registry_rat_expanded'
const REGISTRY_URL = 'https://fsrar.gov.ru/opendata/7710747640-reestr'
const REGISTRY_UPDATE_CMD = 'python3 ~/Desktop/update_registry.py'

type BlockState = 'idle' | 'loading' | 'success' | 'error'

interface RegistryBlockProps {
  clientInn: string | null | undefined
}

const LABEL_COLORS: Record<string, string> = {
  blue: 'bg-blue-100 text-blue-800',
  purple: 'bg-purple-100 text-purple-800',
  gray: 'bg-gray-100 text-gray-600',
  orange: 'bg-orange-100 text-orange-800',
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = parseISO(iso)
  if (!isValid(d)) return iso
  return format(d, 'dd.MM.yyyy', { locale: ru })
}

function formatDateTime(iso: string): string {
  const d = parseISO(iso)
  if (!isValid(d)) return iso
  return format(d, 'dd.MM.yyyy HH:mm', { locale: ru })
}

function isActiveStatus(status: string): boolean {
  const s = status.toLowerCase()
  return s.includes('действующ')
}

function isSuspendedStatus(status: string): boolean {
  return status.toLowerCase().includes('приостановлен')
}

type StatusIndicator = 'green' | 'yellow' | 'orange' | 'red'

function getStatusIndicator(record: LicenseRecord, archived: boolean): StatusIndicator {
  if (archived) return 'red'
  if (isSuspendedStatus(record.status)) return 'orange'
  if (!isActiveStatus(record.status)) return 'red'
  if (!record.valid_to) return 'green'
  const end = parseISO(record.valid_to)
  if (!isValid(end)) return 'green'
  const threshold = addDays(new Date(), 90)
  return end > threshold ? 'green' : 'yellow'
}

const INDICATOR_DOT: Record<StatusIndicator, string> = {
  green: 'bg-green-500',
  yellow: 'bg-yellow-400',
  orange: 'bg-orange-500',
  red: 'bg-red-500',
}

function LicenseLabelBadge({ record }: { record: LicenseRecord }) {
  const colorClass = LABEL_COLORS[record.license_color] ?? LABEL_COLORS.gray
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${colorClass}`}
    >
      {record.license_label}
    </span>
  )
}

function LicenseCard({
  record,
  archived,
}: {
  record: LicenseRecord
  archived: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const indicator = getStatusIndicator(record, archived)
  const extraAddresses = record.addresses.length > 1 ? record.addresses.length - 1 : 0
  const firstAddress = record.addresses[0]

  const cardClass = archived
    ? 'rounded-lg border border-red-200 bg-red-50 p-3 text-red-700'
    : 'rounded-lg border border-slate-200 bg-white p-3 text-slate-800'

  const licenseNumber = record.license_number || '—'

  return (
    <div className={cardClass}>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full text-left"
      >
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {expanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
          )}
          <LicenseLabelBadge record={record} />
          {record.license_number ? (
            <CopyOnClick text={record.license_number} label="Номер лицензии скопирован">
              <span className="font-medium">{licenseNumber}</span>
            </CopyOnClick>
          ) : (
            <span className="font-medium">{licenseNumber}</span>
          )}
          <span className={archived ? 'text-red-500' : 'text-slate-500'}>
            до {formatDate(record.valid_to)}
          </span>
          <span
            className={`ml-auto h-2.5 w-2.5 shrink-0 rounded-full ${INDICATOR_DOT[indicator]}`}
            title={record.status}
          />
        </div>
        <p className={`mt-1.5 pl-6 text-xs ${archived ? 'text-red-600' : 'text-slate-600'}`}>
          {record.kpp && (
            <>
              КПП{' '}
              <CopyOnClick text={record.kpp} label="КПП скопирован">
                {record.kpp}
              </CopyOnClick>
              {firstAddress ? ' | ' : ''}
            </>
          )}
          {firstAddress && (
            <CopyOnClick text={firstAddress} label="Адрес скопирован">
              <span>
                {firstAddress}
                {extraAddresses > 0 && ` +${extraAddresses} адресов`}
              </span>
            </CopyOnClick>
          )}
          {!record.kpp && !firstAddress && '—'}
        </p>
      </button>
      {expanded && record.addresses.length > 0 && (
        <ul
          className={`mt-2 pl-6 text-xs list-disc space-y-0.5 ${archived ? 'text-red-600' : 'text-slate-600'}`}
        >
          {record.addresses.map((addr, i) => (
            <li key={i}>
              <CopyOnClick text={addr} label="Адрес скопирован">
                {addr}
              </CopyOnClick>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Section({
  title,
  count,
  records,
  archived,
  defaultOpen,
  titleClassName,
}: {
  title: string
  count: number
  records: LicenseRecord[]
  archived: boolean
  defaultOpen: boolean
  titleClassName?: string
}) {
  const [open, setOpen] = useState(defaultOpen)

  if (count === 0) return null

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center gap-1.5 text-sm font-semibold ${titleClassName ?? 'text-slate-800'}`}
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0" />
        )}
        {title} ({count})
      </button>
      {open && (
        <div className="space-y-2">
          {records.map((record) => (
            <LicenseCard
              key={`${record.license_number}-${record.valid_to}`}
              record={record}
              archived={archived}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function RegistryUpdateGuide() {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/80 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-slate-800 hover:bg-slate-100/80"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
        )}
        Как обновить данные?
      </button>
      {open && (
        <div className="border-t border-slate-200 px-4 py-4 text-sm text-slate-700 space-y-4">
          <p className="font-medium text-slate-900">Для обновления реестра:</p>
          <ol className="list-decimal list-inside space-y-3">
            <li>
              <span className="ml-1">Скачайте файл реестра:</span>
              <div className="mt-1.5 pl-5">
                <CopyOnClick text={REGISTRY_URL} label="Ссылка скопирована">
                  <span className="break-all text-brand-700">{REGISTRY_URL}</span>
                </CopyOnClick>
                <p className="mt-1.5">
                  <CopyOnClick text={REGISTRY_URL} label="Ссылка скопирована">
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-600">
                      <Copy className="h-3.5 w-3.5" />
                      Скопировать ссылку
                    </span>
                  </CopyOnClick>
                </p>
              </div>
            </li>
            <li>Разархивируйте ZIP в папку Загрузки</li>
            <li>
              <span className="ml-1">Запустите в Терминале:</span>
              <div className="mt-1.5 pl-5 rounded-md bg-slate-900 text-slate-100 px-3 py-2 font-mono text-xs">
                <CopyOnClick text={REGISTRY_UPDATE_CMD} label="Команда скопирована">
                  {REGISTRY_UPDATE_CMD}
                </CopyOnClick>
              </div>
              <p className="mt-1.5 pl-5">
                <CopyOnClick text={REGISTRY_UPDATE_CMD} label="Команда скопирована">
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-600">
                    <Copy className="h-3.5 w-3.5" />
                    Скопировать команду
                  </span>
                </CopyOnClick>
              </p>
            </li>
          </ol>
        </div>
      )}
    </div>
  )
}

export function RegistryBlock({ clientInn }: RegistryBlockProps) {
  const inn = clientInn?.trim() ?? ''
  const hasInn = inn.length > 0

  const [blockExpanded, setBlockExpanded] = useState(() =>
    readBoolStorage(REGISTRY_EXPANDED_KEY, false),
  )
  const [state, setState] = useState<BlockState>(() => (hasInn ? 'loading' : 'idle'))
  const [data, setData] = useState<RegistryLookupResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const toggleBlockExpanded = () => {
    setBlockExpanded((prev) => {
      const next = !prev
      writeBoolStorage(REGISTRY_EXPANDED_KEY, next)
      return next
    })
  }

  const runLookup = useCallback(async () => {
    if (!hasInn) return
    setState('loading')
    setError(null)
    try {
      const result = await loadFromCache(inn)
      setData(result)
      setState('success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки реестра')
      setState('error')
    }
  }, [hasInn, inn])

  useEffect(() => {
    if (!hasInn) {
      setState('idle')
      setData(null)
      setError(null)
      return
    }
    void runLookup()
  }, [hasInn, runLookup])

  const lastUpdatedShort =
    data?.last_updated && state === 'success' ? formatDate(data.last_updated) : null

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 justify-between p-4 border-b border-slate-100">
        <button
          type="button"
          onClick={toggleBlockExpanded}
          className="flex flex-wrap items-center gap-2 min-w-0 text-left flex-1"
        >
          {blockExpanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
          )}
          <FileText className="h-5 w-5 text-brand-600 shrink-0" />
          <h2 className="font-semibold text-slate-900">Реестр РАТ</h2>
          {lastUpdatedShort && (
            <span className="text-xs text-slate-500 font-normal">
              последнее обновление: {lastUpdatedShort}
            </span>
          )}
        </button>
        <button
          type="button"
          disabled={!hasInn || state === 'loading'}
          onClick={() => void runLookup()}
          className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white p-2 text-slate-700 hover:bg-slate-50 disabled:opacity-50 min-h-[44px] min-w-[44px]"
          title={!hasInn ? 'Добавьте ИНН клиента' : 'Обновить данные реестра'}
        >
          {state === 'loading' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </button>
      </div>

      {blockExpanded && (
        <div className="p-5 space-y-4">
          <RegistryUpdateGuide />

          {!hasInn && state === 'idle' && (
            <p className="text-sm text-slate-600">Добавьте ИНН клиента для просмотра реестра</p>
          )}

          {state === 'loading' && (
            <p className="text-sm text-slate-600 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
              Загружаем реестр...
            </p>
          )}

          {state === 'error' && error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 space-y-2">
              <p>{error}</p>
              <button
                type="button"
                onClick={() => void runLookup()}
                disabled={!hasInn}
                className="text-sm font-medium text-red-800 underline hover:no-underline disabled:opacity-50"
              >
                Повторить
              </button>
            </div>
          )}

          {state === 'success' && data && (
            <div className="space-y-4">
              {data.last_updated && (
                <p className="text-xs text-slate-500">
                  Данные из кэша · обновлено {formatDateTime(data.last_updated)}
                </p>
              )}
              {data.active.length === 0 && data.archived.length === 0 && (
                <p className="text-sm text-slate-600 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  Лицензии по ИНН в реестре не найдены
                </p>
              )}
              <Section
                title="ДЕЙСТВУЮЩИЕ"
                count={data.active.length}
                records={data.active}
                archived={false}
                defaultOpen
              />
              <Section
                title="АРХИВ"
                count={data.archived.length}
                records={data.archived}
                archived
                defaultOpen={false}
                titleClassName="text-red-600"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
