import { useMemo, useState } from 'react'
import { differenceInDays, format, isValid, parseISO } from 'date-fns'
import { ru } from 'date-fns/locale'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { Client, Document, License, OperationType, Warehouse } from '../types'

export interface DeadlinePanelProps {
  client: Client
  license: License | null
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

const LICENSING_ITEM_TITLES: Record<number, string> = {
  1: 'Устав (последняя редакция)',
  2: 'Свидетельство ОГРН / Лист записи ЕГРЮЛ',
  3: 'Свидетельство ИНН',
  4: 'Лист записи ГРН к Уставу (при наличии изменений)',
  5: 'Решение о создании юридического лица',
  6: 'Решение об увеличении уставного капитала (при наличии)',
  7: 'Решение о внесении изменений в Устав (при наличии)',
  8: 'Решение о назначении генерального директора',
  9: 'Приказ о назначении генерального директора',
  10: 'Копия паспорта генерального директора (стр. 1 и прописка)',
  11: 'Приказ о назначении главного бухгалтера (если бухгалтер ≠ ГД)',
  12: 'Платёжные документы об оплате УК',
  13: 'Справка банка о зачислении средств в оплату УК',
  14: 'Баланс за последний отчётный период',
  15: 'Расчёт оценки стоимости чистых активов',
  16: 'Выписка из ЕГРЮЛ (не старше 1 месяца)',
  17: 'Выписка из ЕГРН (Росреестр)',
  18: 'Уведомление о постановке на учёт ОП',
  19: 'Договор аренды складского помещения',
  20: 'Выписка из ЕГРН на складское помещение',
  21: 'Технический паспорт / технический план помещения',
  22: 'Документы на гигрометры',
  23: 'Документы на термометры',
  24: 'Охранная сигнализация',
  25: 'Пожарная сигнализация',
  26: 'Стеллажи и поддоны',
  27: 'Расстояние от стен ≥ 0,5 м',
  28: 'Договор с ОФД',
  29: 'ЕГАИС подключён и работает',
  30: 'Сканер штрихкодов (2D)',
  31: 'Действующая лицензия',
  32: 'Предыдущие лицензии',
  33: 'Журнал учёта условий хранения',
  34: 'Журнал входящего контроля продукции',
  35: 'Договоры поставки с поставщиками',
  36: 'Товарные накладные / УПД',
}

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

function displayWarehouseName(name: string): string {
  return name.replace(/^склад\s+/i, '')
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

export function DeadlinePanel({ client, license }: DeadlinePanelProps) {
  const [open, setOpen] = useState(true)

  const alerts = useMemo(() => {
    const list: Alert[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    if (license?.expiry_date) {
      const expiry = parseISO(license.expiry_date)
      if (isValid(expiry)) {
        const daysLeft = differenceInDays(expiry, today)
        if (daysLeft < 0) {
          list.push({
            level: 'critical',
            icon: '🔴',
            text: 'Лицензия истекла',
            badge: format(expiry, 'dd.MM.yyyy', { locale: ru }),
          })
        } else if (daysLeft < 30) {
          list.push({
            level: 'critical',
            icon: '🔴',
            text: `Лицензия истекает через ${daysLeft} дн.`,
            badge: format(expiry, 'dd.MM.yyyy', { locale: ru }),
          })
        } else if (daysLeft <= 90) {
          list.push({
            level: 'warning',
            icon: '🟠',
            text: `Лицензия истекает через ${daysLeft} дн.`,
            badge: format(expiry, 'dd.MM.yyyy', { locale: ru }),
          })
        } else {
          list.push({
            level: 'info',
            icon: '🟢',
            text: `Лицензия действует ещё ${daysLeft} дн.`,
            badge: format(expiry, 'dd.MM.yyyy', { locale: ru }),
          })
        }
      }
    } else {
      list.push({
        level: 'warning',
        icon: '⚠',
        text: 'Нет данных о сроке лицензии',
      })
    }

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
      const name = displayWarehouseName(w.name)
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
  }, [client.id, license])

  const grouped = useMemo(() => {
    const critical = alerts.filter((a) => a.level === 'critical')
    const warning = alerts.filter((a) => a.level === 'warning')
    const info = alerts.filter((a) => a.level === 'info')
    return { critical, warning, info }
  }, [alerts])

  const hasAlerts =
    grouped.critical.length > 0 || grouped.warning.length > 0 || grouped.info.length > 0

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
          {!hasAlerts ? (
            <p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2 text-center">
              ✅ Все сроки в порядке
            </p>
          ) : (
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
            })
          )}
        </div>
      )}
    </section>
  )
}
