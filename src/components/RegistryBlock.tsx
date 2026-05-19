import { useCallback, useEffect, useState } from 'react'
import { format, parseISO, addDays, isValid } from 'date-fns'
import { ru } from 'date-fns/locale'
import { ChevronDown, ChevronRight, Loader2, RefreshCw } from 'lucide-react'
import {
  loadFromCache,
  type LicenseRecord,
  type RegistryLookupResponse,
} from '../lib/licenseRegistry'

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
          <span className="font-medium">{record.license_number || '—'}</span>
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
              КПП {record.kpp}
              {firstAddress ? ' | ' : ''}
            </>
          )}
          {firstAddress && (
            <span>
              {firstAddress}
              {extraAddresses > 0 && ` +${extraAddresses} адресов`}
            </span>
          )}
          {!record.kpp && !firstAddress && '—'}
        </p>
      </button>
      {expanded && record.addresses.length > 0 && (
        <ul
          className={`mt-2 pl-6 text-xs list-disc space-y-0.5 ${archived ? 'text-red-600' : 'text-slate-600'}`}
        >
          {record.addresses.map((addr, i) => (
            <li key={i}>{addr}</li>
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

export function RegistryBlock({ clientInn }: RegistryBlockProps) {
  const inn = clientInn?.trim() ?? ''
  const hasInn = inn.length > 0

  const [state, setState] = useState<BlockState>(() => (hasInn ? 'loading' : 'idle'))
  const [data, setData] = useState<RegistryLookupResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  const lastUpdatedLabel =
    data?.last_updated && state === 'success'
      ? formatDateTime(data.last_updated)
      : null

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <h2 className="font-semibold text-slate-900">Реестр РАТ</h2>
          {lastUpdatedLabel && (
            <span className="text-xs text-slate-500">
              последнее обновление: {lastUpdatedLabel}
            </span>
          )}
        </div>
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
  )
}
