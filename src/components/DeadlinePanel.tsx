import { useMemo, useState } from 'react'
import { differenceInDays, format, isValid, parseISO } from 'date-fns'
import { ru } from 'date-fns/locale'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { LicenseTypeBadge } from './LicenseTypeBadge'
import { warehouseDisplayTitle } from '../lib/generateWarehouseName'
import { LICENSING_ITEM_TITLES } from '../data/licensingChecklistTemplate'
import type { Client, Document, License, OperationType, Warehouse } from '../types'

export interface DeadlinePanelProps {
  client: Client
  licenses: License[]
}

type AlertLevel = 'critical' | 'warning' | 'info'

type Alert = {
  level: AlertLevel
  icon: string
  text: string
  badge?: string
}

const ALL_OPERATION_TYPES: OperationType[] = [
  'ПОЛУЧЕНИЕ',
  'ПЕРЕОФОРМЛЕНИЕ',
  'ПРОДЛЕНИЕ',
  'ПРОВЕРКА_ВЫЕЗДНАЯ',
  'ПРОВЕРКА_ВНЕПЛАНОВАЯ',
]

type LicensingItemState = {
  status?: string
  dueDate?: string
}

function readLocalDocuments(clientId: string): Document[] {
  try {
    const raw = localStorage.getItem('ek_documents')
    const all: Document[] = raw ? JSON.parse(raw) : []
    return all.filter((d) => d.client_id === clientId)
  } catch {
    return []
  }
}

function readLocalWarehouses(clientId: string): Warehouse[] {
  try {
    const raw = localStorage.getItem('ek_warehouses')
    const all: Warehouse[] = raw ? JSON.parse(raw) : []
    return all.filter((w) => w.client_id === clientId)
  } catch {
    return []
  }
}

function readLicensingChecklist(clientId: string, op: OperationType) {
  try {
    const raw = localStorage.getItem(`licensing_checklist_${clientId}_${op}`)
    if (!raw) return { items: {} as Record<string, LicensingItemState> }
    const parsed = JSON.parse(raw) as { items?: Record<string, LicensingItemState> }
    return { items: parsed.items ?? {} }
  } catch {
    return { items: {} }
  }
}

function readCompliance(warehouseId: string): Record<string, { status?: string }> {
  try {
    const raw = localStorage.getItem(`compliance_${warehouseId}`)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function getLatestReadingAt(warehouseId: string): string | null {
  try {
    const raw = localStorage.getItem(`storage_readings_${warehouseId}`)
    const readings: { recorded_at: string }[] = raw ? JSON.parse(raw) : []
    if (readings.length === 0) return null
    return readings.reduce((a, b) => (a.recorded_at > b.recorded_at ? a : b)).recorded_at
  } catch {
    return null
  }
}

const LEVEL_STYLES: Record<AlertLevel, string> = {
  critical: 'border-red-200 bg-red-50/80',
  warning: 'border-orange-200 bg-orange-50/80',
  info: 'border-emerald-200 bg-emerald-50/80',
}

const LEVEL_LABELS: Record<AlertLevel, string> = {
  critical: 'Критичные',
  warning: 'Требуют внимания',
  info: 'Информация',
}

function licenseIndicatorDot(daysLeft: number | null): string {
  if (daysLeft === null) return 'bg-slate-300'
  if (daysLeft < 0) return 'bg-red-500'
  if (daysLeft <= 90) return 'bg-amber-400'
  return 'bg-emerald-500'
}

export function DeadlinePanel({ client, licenses }: DeadlinePanelProps) {
  const [open, setOpen] = useState(true)

  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const alerts = useMemo(() => {
    const list: Alert[] = []

    const egrylDocs = readLocalDocuments(client.id)
      .filter((d) => d.doc_type === 'egryl')
      .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))
    const latestEgryl = egrylDocs[0]
    if (latestEgryl) {
      const uploaded = parseISO(latestEgryl.uploaded_at)
      if (isValid(uploaded)) {
        const ageDays = differenceInDays(today, uploaded)
        if (ageDays > 30) {
          list.push({
            level: 'warning',
            icon: '⚠',
            text: 'Выписка ЕГРЮЛ устарела (>30 дней)',
            badge: `${ageDays} дн.`,
          })
        }
      }
    }

    const seenOverdue = new Set<string>()
    for (const op of ALL_OPERATION_TYPES) {
      const { items } = readLicensingChecklist(client.id, op)
      for (const [id, item] of Object.entries(items)) {
        if (item.status === 'done' || item.status === 'na' || !item.dueDate) continue
        const due = parseISO(item.dueDate)
        if (!isValid(due) || due >= today) continue
        const key = `${op}-${id}`
        if (seenOverdue.has(key)) continue
        seenOverdue.add(key)
        const title = LICENSING_ITEM_TITLES[Number(id)] ?? `Пункт ${id}`
        list.push({
          level: 'critical',
          icon: '⚠',
          text: `Просрочен: ${title}`,
          badge: format(due, 'dd.MM.yyyy', { locale: ru }),
        })
      }
    }

    const warehouses = readLocalWarehouses(client.id)
    for (const w of warehouses) {
      const name = warehouseDisplayTitle(w)
      const latestAt = getLatestReadingAt(w.id)
      if (!latestAt) {
        list.push({
          level: 'warning',
          icon: '📋',
          text: `Нет записи в журнале: ${name}`,
        })
      } else {
        const ageMs = Date.now() - parseISO(latestAt).getTime()
        if (ageMs > 24 * 60 * 60 * 1000) {
          list.push({
            level: 'warning',
            icon: '📋',
            text: `Нет записи в журнале: ${name}`,
            badge: '>24 ч',
          })
        }
      }

      const compliance = readCompliance(w.id)
      const therm = compliance.thermometer?.status
      const hygro = compliance.hygrometer?.status
      if (therm !== 'done' || hygro !== 'done') {
        list.push({
          level: 'warning',
          icon: '🌡',
          text: `Поверка приборов не подтверждена: ${name}`,
        })
      }
    }

    return list
  }, [client.id, today])

  const grouped = useMemo(() => {
    const critical = alerts.filter((a) => a.level === 'critical')
    const warning = alerts.filter((a) => a.level === 'warning')
    const info = alerts.filter((a) => a.level === 'info')
    return { critical, warning, info }
  }, [alerts])

  const hasOtherAlerts =
    grouped.critical.length > 0 || grouped.warning.length > 0 || grouped.info.length > 0

  const allLicensesOk =
    licenses.length > 0 &&
    licenses.every((lic) => {
      if (!lic.expiry_date) return false
      const expiry = parseISO(lic.expiry_date)
      if (!isValid(expiry)) return false
      return differenceInDays(expiry, today) > 90
    })

  const showAllOk = !hasOtherAlerts && allLicensesOk

  return (
    <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left bg-slate-50/80 hover:bg-slate-50"
      >
        <span className="font-semibold text-slate-900 text-sm">⏰ Сроки и напоминания</span>
        {open ? (
          <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
        )}
      </button>

      {open && (
        <div className="p-4 space-y-4">
          {licenses.length > 0 ? (
            <div className="space-y-2">
              {licenses.map((lic) => {
                const expiry = lic.expiry_date ? parseISO(lic.expiry_date) : null
                const daysLeft =
                  expiry && isValid(expiry) ? differenceInDays(expiry, today) : null
                const isExpired = daysLeft !== null && daysLeft < 0

                return (
                  <div
                    key={lic.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${licenseIndicatorDot(daysLeft)}`}
                        aria-hidden
                      />
                      <LicenseTypeBadge
                        licenseType={lic.license_label ?? lic.license_activity}
                      />
                      <span className="min-w-0 text-slate-800">
                        {daysLeft === null
                          ? 'Нет данных о сроке лицензии'
                          : isExpired
                            ? `Лицензия истекла ${Math.abs(daysLeft)} дн. назад`
                            : `Лицензия действует ещё ${daysLeft} дн.`}
                      </span>
                    </div>
                    {lic.expiry_date && isValid(parseISO(lic.expiry_date)) && (
                      <span className="shrink-0 text-slate-500 tabular-nums">
                        {format(parseISO(lic.expiry_date), 'd.MM.yyyy')}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-amber-800 bg-amber-50 rounded-lg border border-amber-200 px-3 py-2">
              ⚠ Нет данных о сроке лицензии
            </p>
          )}

          {showAllOk && (
            <p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2 text-center">
              ✅ Все сроки в порядке
            </p>
          )}

          {hasOtherAlerts &&
            (['critical', 'warning', 'info'] as AlertLevel[]).map((level) => {
              const rows = grouped[level]
              if (rows.length === 0) return null
              return (
                <div key={level}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                    {LEVEL_LABELS[level]}
                  </p>
                  <ul className="space-y-2">
                    {rows.map((a, i) => (
                      <li
                        key={`${level}-${i}`}
                        className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${LEVEL_STYLES[level]}`}
                      >
                        <span className="shrink-0">{a.icon}</span>
                        <span className="flex-1 min-w-0 text-slate-800">{a.text}</span>
                        {a.badge && (
                          <span className="shrink-0 text-xs font-medium text-slate-600 bg-white/80 px-2 py-0.5 rounded-full border border-slate-200">
                            {a.badge}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
        </div>
      )}
    </section>
  )
}
