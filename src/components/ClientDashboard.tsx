import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { CopyOnClick } from './CopyOnClick'
import { useAuth } from '../lib/auth'
import { isSupabaseConfigured } from '../lib/supabase'
import {
  getPushPermissionState,
  subscribeToPush,
  savePushSubscription,
} from '../lib/push'
import {
  differenceInCalendarDays,
  differenceInDays,
  differenceInHours,
  differenceInMinutes,
  format,
  parseISO,
} from 'date-fns'
import { ru } from 'date-fns/locale'
import { DeadlinePanel } from './DeadlinePanel'
import { LicenseTypeBadge } from './LicenseTypeBadge'
import type { Checklist, Client, Document, License, Warehouse } from '../types'

const COMPLIANCE_TOTAL = 14
const PUSH_PROMPT_DISMISSED_KEY = 'push_prompt_dismissed'

const COMPLIANCE_ITEM_TEXT: Record<string, string> = {
  thermometer: 'Термометр установлен и поверен',
  hygrometer: 'Гигрометр установлен и поверен',
  journal_kept: 'Журнал учёта условий хранения ведётся',
  pallets: 'Нижний ярус продукции на поддонах',
  wall_distance: 'Расстояние от стен до продукции не менее 0,5 м',
  aisle_width: 'Ширина проходов между стеллажами не менее 0,5 м',
  no_sunlight: 'Прямой солнечный свет в зону хранения не попадает',
  ventilation_ok: 'Вентиляция функционирует',
  fire_alarm: 'Пожарная сигнализация установлена',
  security_alarm: 'Охранная сигнализация установлена',
  temp_in_range: 'Текущая температура соответствует нормам',
  humidity_in_range: 'Текущая влажность соответствует нормам',
  no_foreign_smell: 'Посторонние запахи отсутствуют',
  egais_connected: 'ЕГАИС подключён и работает',
}

export interface ClientDashboardProps {
  client: Client
  licenses: License[]
  warehouses: Warehouse[]
  onWarehouseSelect?: (warehouseId: string) => void
}

/** @internal optional props for legacy ClientPage compile compatibility */
export type ClientDashboardCompatProps = ClientDashboardProps & {
  checklists?: Checklist[]
  clientDocs?: Document[]
  onOpenTab?: (tab: 'documents' | 'checklists' | 'licenses') => void
  onNewChecklist?: () => void
  onEditLicense?: () => void
  onLicenseUpdated?: () => void | Promise<void>
}

type StorageReadingRow = {
  recorded_at: string
  temperature: number
  humidity: number
}

type ComplianceState = Record<string, { status?: string }>

type ActivityEvent = {
  at: number
  text: string
}

type LicenseBadge = {
  label: string
  className: string
}

function displayWarehouseName(name: string): string {
  return name.replace(/^склад\s+/i, '')
}

function RequisitesLine({ client }: { client: Client }) {
  const parts: ReactNode[] = []
  if (client.inn) {
    parts.push(
      <span key="inn">
        ИНН{' '}
        <CopyOnClick text={client.inn} label="ИНН скопирован">
          {client.inn}
        </CopyOnClick>
      </span>,
    )
  }
  if (client.kpp) {
    parts.push(
      <span key="kpp">
        КПП{' '}
        <CopyOnClick text={client.kpp} label="КПП скопирован">
          {client.kpp}
        </CopyOnClick>
      </span>,
    )
  }
  if (client.ogrn) {
    parts.push(
      <span key="ogrn">
        ОГРН{' '}
        <CopyOnClick text={client.ogrn} label="ОГРН скопирован">
          {client.ogrn}
        </CopyOnClick>
      </span>,
    )
  }
  if (client.legal_address) {
    parts.push(
      <span key="addr">
        <CopyOnClick text={client.legal_address} label="Адрес скопирован">
          {client.legal_address}
        </CopyOnClick>
      </span>,
    )
  }
  if (client.phone) {
    parts.push(
      <span key="phone">
        <CopyOnClick text={client.phone} label="Телефон скопирован">
          {client.phone}
        </CopyOnClick>
      </span>,
    )
  }
  if (client.email) {
    parts.push(
      <span key="email">
        <CopyOnClick text={client.email} label="Email скопирован">
          {client.email}
        </CopyOnClick>
      </span>,
    )
  }
  if (parts.length === 0) {
    return <span>Реквизиты не заполнены</span>
  }
  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && <span className="text-slate-400"> · </span>}
          {part}
        </span>
      ))}
    </>
  )
}

function readReadings(warehouseId: string): StorageReadingRow[] {
  try {
    const raw = localStorage.getItem(`storage_readings_${warehouseId}`)
    return raw ? (JSON.parse(raw) as StorageReadingRow[]) : []
  } catch {
    return []
  }
}

function readCompliance(warehouseId: string): ComplianceState {
  try {
    const raw = localStorage.getItem(`compliance_${warehouseId}`)
    return raw ? (JSON.parse(raw) as ComplianceState) : {}
  } catch {
    return {}
  }
}

function countComplianceDone(warehouseId: string): number {
  return Object.values(readCompliance(warehouseId)).filter((x) => x.status === 'done').length
}

function getLatestReading(warehouseId: string): StorageReadingRow | null {
  const readings = readReadings(warehouseId)
  if (readings.length === 0) return null
  return [...readings].sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))[0]
}

function isReadingOlderThan24h(warehouseId: string): boolean {
  const latest = getLatestReading(warehouseId)
  if (!latest) return false
  return Date.now() - parseISO(latest.recorded_at).getTime() > 24 * 60 * 60 * 1000
}

function formatAgo(date: Date): string {
  const mins = differenceInMinutes(new Date(), date)
  if (mins < 60) return `${Math.max(mins, 1)} мин назад`
  const hours = differenceInHours(new Date(), date)
  if (hours < 24) return `${hours} ч назад`
  const days = differenceInCalendarDays(new Date(), date)
  if (days === 1) return 'вчера'
  return `${differenceInDays(new Date(), date)} дн назад`
}

function formatRelativeActivity(date: Date): string {
  if (differenceInCalendarDays(new Date(), date) === 1) return 'вчера'
  const hours = differenceInHours(new Date(), date)
  if (hours < 24) return `${hours} ч назад`
  const days = differenceInDays(new Date(), date)
  return `${days} дн назад`
}

function getLatestLicense(licenses: License[]): License | null {
  if (licenses.length === 0) return null
  const active = licenses.filter(
    (l) => l.license_status === 'действующая' || l.license_status === 'приостановлена',
  )
  const pool = active.length > 0 ? active : licenses
  return [...pool].sort((a, b) =>
    (b.expiry_date ?? '').localeCompare(a.expiry_date ?? ''),
  )[0]
}

function getActiveLicenses(licenses: License[]): License[] {
  return licenses
    .filter(
      (l) =>
        l.license_status === 'действующая' || l.license_status === 'приостановлена',
    )
    .sort((a, b) => (b.expiry_date ?? '').localeCompare(a.expiry_date ?? ''))
}

function getOverviewLicenses(licenses: License[]): License[] {
  const active = getActiveLicenses(licenses)
  if (active.length > 0) return active
  if (licenses.length === 0) return []
  return [...licenses]
    .sort((a, b) => (b.expiry_date ?? '').localeCompare(a.expiry_date ?? ''))
    .slice(0, 1)
}

function nearestExpiryDays(licenses: License[]): number | null {
  const dates = licenses
    .map((l) => l.expiry_date)
    .filter((d): d is string => Boolean(d))
    .map((d) => parseISO(d))
  if (dates.length === 0) return null
  const nearest = dates.sort((a, b) => a.getTime() - b.getTime())[0]
  return differenceInDays(nearest, new Date())
}

function getLicenseBadge(licenses: License[]): LicenseBadge {
  const daysLeft = nearestExpiryDays(licenses)
  if (daysLeft === null) {
    return { label: 'Нет лицензии', className: 'bg-slate-100 text-slate-600' }
  }
  if (daysLeft < 0) {
    return { label: 'Лицензия истекла', className: 'bg-red-100 text-red-800' }
  }
  if (daysLeft <= 90) {
    return {
      label: `Истекает через ${daysLeft} дн.`,
      className: 'bg-orange-100 text-orange-800',
    }
  }
  return { label: 'Лицензия активна', className: 'bg-emerald-100 text-emerald-800' }
}

function expiryTone(days: number | null): 'default' | 'ok' | 'warn' | 'bad' {
  if (days === null) return 'default'
  if (days < 30) return 'bad'
  if (days < 90) return 'warn'
  return 'ok'
}

function shorten(text: string, max = 40): string {
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}

function StatCard({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string
  tone?: 'default' | 'ok' | 'warn' | 'bad'
}) {
  const toneClass = {
    default: 'border-slate-200 bg-white',
    ok: 'border-emerald-200 bg-emerald-50/50',
    warn: 'border-orange-200 bg-orange-50/50',
    bad: 'border-red-200 bg-red-50/50',
  }[tone]

  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <p className="text-sm text-slate-600">
        <span className="text-slate-500">{label}:</span>{' '}
        <span className="font-semibold text-slate-900">{value}</span>
      </p>
    </div>
  )
}

export function ClientDashboard({
  client,
  licenses,
  warehouses,
  onWarehouseSelect,
  onEditLicense,
}: ClientDashboardCompatProps) {
  const { user } = useAuth()
  const [showPushPrompt, setShowPushPrompt] = useState(false)
  const [pushEnabling, setPushEnabling] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured || !user) return
    try {
      if (localStorage.getItem(PUSH_PROMPT_DISMISSED_KEY)) return
    } catch {
      return
    }
    if (getPushPermissionState() !== 'default') return
    setShowPushPrompt(true)
  }, [user?.id])

  const dismissPushPrompt = () => {
    try {
      localStorage.setItem(PUSH_PROMPT_DISMISSED_KEY, '1')
    } catch {
      /* ignore */
    }
    setShowPushPrompt(false)
  }

  const enablePushFromPrompt = async () => {
    if (!user) return
    setPushEnabling(true)
    try {
      const sub = await subscribeToPush()
      if (sub) await savePushSubscription(sub, user.id)
    } finally {
      dismissPushPrompt()
      setPushEnabling(false)
    }
  }

  const displayName = client.short_name?.trim() || client.name
  const latestLicense = getLatestLicense(licenses)
  const overviewLicenses = getOverviewLicenses(licenses)
  const badge = getLicenseBadge(licenses)
  const warehouseCount = warehouses.length

  const journalEntries = useMemo(
    () => warehouses.reduce((sum, w) => sum + readReadings(w.id).length, 0),
    [warehouses],
  )

  const complianceDone = useMemo(
    () => warehouses.reduce((sum, w) => sum + countComplianceDone(w.id), 0),
    [warehouses],
  )

  const complianceTotal = COMPLIANCE_TOTAL * warehouseCount
  const expiryDays = nearestExpiryDays(licenses)

  const warehouseCards = useMemo(
    () =>
      warehouses.map((w) => {
        const latest = getLatestReading(w.id)
        const done = countComplianceDone(w.id)
        const stale = isReadingOlderThan24h(w.id)
        return { warehouse: w, latest, done, stale }
      }),
    [warehouses],
  )

  const activity = useMemo(() => {
    const events: ActivityEvent[] = []

    for (const w of warehouses) {
      const name = displayWarehouseName(w.name)
      for (const r of readReadings(w.id)) {
        events.push({
          at: parseISO(r.recorded_at).getTime(),
          text: `📋 Запись: ${r.temperature}°C, ${r.humidity}% — ${name}`,
        })
      }

      const compliance = readCompliance(w.id)
      for (const [id, item] of Object.entries(compliance)) {
        if (item.status !== 'done') continue
        const label = COMPLIANCE_ITEM_TEXT[id] ?? id
        events.push({
          at: 0,
          text: `✅ ${shorten(label)} — ${name}`,
        })
      }
    }

    return events
      .sort((a, b) => b.at - a.at)
      .slice(0, 10)
  }, [warehouses])

  return (
    <div className="space-y-6 overflow-x-hidden">
      {showPushPrompt && (
        <div
          className="rounded-xl border border-brand-200 bg-brand-50/80 p-4 flex flex-col sm:flex-row sm:items-center gap-3"
          role="region"
          aria-label="Включить уведомления"
        >
          <p className="text-sm text-slate-800 flex-1">
            Включить уведомления об истечении лицензии и пропуске записей в журнале?
          </p>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              disabled={pushEnabling}
              onClick={() => void enablePushFromPrompt()}
              className="min-h-[44px] rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Включить
            </button>
            <button
              type="button"
              onClick={dismissPushPrompt}
              className="min-h-[44px] rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-700 hover:bg-slate-50"
            >
              Не сейчас
            </button>
          </div>
        </div>
      )}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-slate-900">{displayName}</h1>
            <p className="mt-1 text-sm text-slate-500">
              <RequisitesLine client={client} />
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {overviewLicenses.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {overviewLicenses.map((lic) => (
                    <div
                      key={lic.id}
                      className="flex flex-wrap items-center gap-2 text-sm text-slate-700"
                    >
                      <LicenseTypeBadge
                        licenseType={lic.license_label ?? lic.license_activity}
                      />
                      <span className="font-medium">{lic.license_number}</span>
                      {lic.expiry_date && (
                        <span className="text-slate-500">
                          · до{' '}
                          {format(parseISO(lic.expiry_date), 'd MMMM yyyy', {
                            locale: ru,
                          })}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">Лицензия не указана</p>
              )}
              {onEditLicense && (
                <button
                  type="button"
                  onClick={onEditLicense}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                >
                  {latestLicense ? (
                    <Pencil className="h-3 w-3" />
                  ) : (
                    <Plus className="h-3 w-3" />
                  )}
                  {latestLicense ? 'Редактировать' : 'Добавить лицензию'}
                </button>
              )}
            </div>
          </div>
          <span
            className={`inline-flex shrink-0 items-center rounded-full px-3 py-1 text-sm font-medium ${badge.className}`}
          >
            {badge.label}
          </span>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Складов" value={String(warehouseCount)} />
        <StatCard label="Записей журнала" value={String(journalEntries)} />
        <StatCard
          label="Чеклист"
          value={warehouseCount === 0 ? '—' : `${complianceDone}/${complianceTotal}`}
        />
        <StatCard
          label="До истечения"
          value={expiryDays === null ? '—' : `${expiryDays} дней`}
          tone={expiryTone(expiryDays)}
        />
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-800 mb-3">Склады</h2>
        {warehouses.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 py-12 px-6 text-center">
            <p className="text-4xl mb-3" aria-hidden>
              🏭
            </p>
            <p className="text-sm font-semibold text-slate-900">Нет складов</p>
            <p className="mt-1 text-sm text-slate-500">
              Добавьте склад на вкладке «Документы и склады»
            </p>
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory md:grid md:grid-cols-2 md:overflow-visible md:pb-0">
            {warehouseCards.map(({ warehouse: w, latest, done, stale }) => (
              <button
                key={w.id}
                type="button"
                onClick={() => onWarehouseSelect?.(w.id)}
                className="snap-start shrink-0 w-[min(100%,280px)] md:w-auto rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-brand-300 hover:shadow-sm transition"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-slate-900">{displayWarehouseName(w.name)}</p>
                  {stale && (
                    <span
                      className="h-2.5 w-2.5 rounded-full bg-orange-500 shrink-0 mt-1.5"
                      title="Последняя запись старше 24 ч"
                    />
                  )}
                </div>
                {latest ? (
                  <p className="mt-2 text-sm text-slate-700">
                    {latest.temperature}°C · {latest.humidity}%
                    <span className="text-slate-400 ml-1">
                      · {formatAgo(parseISO(latest.recorded_at))}
                    </span>
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-slate-400">нет записей</p>
                )}
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span>Чеклист условий</span>
                    <span>
                      {done}/{COMPLIANCE_TOTAL}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-brand-500 transition-all"
                      style={{ width: `${(done / COMPLIANCE_TOTAL) * 100}%` }}
                    />
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-800 mb-3">Недавняя активность</h2>
        {activity.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-3xl mb-3" aria-hidden>
              📭
            </p>
            <p className="text-sm font-medium text-slate-700">Нет активности</p>
            <p className="mt-1 text-sm text-slate-400">
              Активность появится после первых действий
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {activity.map((ev, i) => (
              <li key={`${ev.at}-${i}`} className="flex gap-3 text-sm">
                <span className="shrink-0 w-20 text-xs text-slate-400 tabular-nums">
                  {ev.at > 0 ? formatRelativeActivity(new Date(ev.at)) : '—'}
                </span>
                <span className="text-slate-700 min-w-0">{ev.text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <DeadlinePanel client={client} license={latestLicense} />
    </div>
  )
}
