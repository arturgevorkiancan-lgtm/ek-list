import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, ChevronDown, ChevronUp, Circle, Minus } from 'lucide-react'
import { fetchStorageReadings } from '../lib/api'
import { getCombinedStorageRange, getValueRangeStatus } from './StorageJournal'
import type { ProductType } from './StorageStandardsCard'

const COMPLIANCE_ITEMS = [
  {
    id: 'thermometer',
    text: 'Термометр установлен и поверен (свидетельство о поверке актуально)',
    category: '289н',
  },
  {
    id: 'hygrometer',
    text: 'Гигрометр установлен и поверен (свидетельство о поверке актуально)',
    category: '289н',
  },
  {
    id: 'journal_kept',
    text: 'Журнал учёта условий хранения ведётся (записи не реже 1 раза в сутки)',
    category: '289н',
  },
  {
    id: 'pallets',
    text: 'Нижний ярус продукции на поддонах (высота ≥ 15 см от пола)',
    category: '289н',
  },
  {
    id: 'wall_distance',
    text: 'Расстояние от стен до продукции не менее 0,5 м',
    category: '289н',
  },
  {
    id: 'aisle_width',
    text: 'Ширина проходов между стеллажами не менее 0,5 м',
    category: '289н',
  },
  {
    id: 'no_sunlight',
    text: 'Прямой солнечный свет в зону хранения не попадает',
    category: 'ГОСТ',
  },
  {
    id: 'ventilation_ok',
    text: 'Вентиляция функционирует (приточно-вытяжная)',
    category: '289н',
  },
  {
    id: 'fire_alarm',
    text: 'Пожарная сигнализация установлена и работоспособна',
    category: 'РАТК',
  },
  {
    id: 'security_alarm',
    text: 'Охранная сигнализация установлена и работоспособна',
    category: 'РАТК',
  },
  {
    id: 'temp_in_range',
    text: 'Текущая температура соответствует нормам хранения продукции',
    category: 'ГОСТ',
  },
  {
    id: 'humidity_in_range',
    text: 'Текущая влажность соответствует нормам хранения продукции',
    category: 'ГОСТ',
  },
  {
    id: 'no_foreign_smell',
    text: 'Посторонние запахи в помещении отсутствуют',
    category: 'ГОСТ',
  },
  {
    id: 'egais_connected',
    text: 'ЕГАИС подключён и работает на данном складе',
    category: 'ЕГАИС',
  },
] as const

type ComplianceItemId = (typeof COMPLIANCE_ITEMS)[number]['id']
type ComplianceStatus = 'pending' | 'done' | 'na'

interface ComplianceItemState {
  status: ComplianceStatus
  comment?: string
}

type ComplianceState = Record<string, ComplianceItemState>

const CATEGORY_BADGE: Record<string, string> = {
  '289н': 'bg-blue-100 text-blue-800',
  ГОСТ: 'bg-purple-100 text-purple-800',
  РАТК: 'bg-orange-100 text-orange-800',
  ЕГАИС: 'bg-green-100 text-green-800',
}

function complianceKey(warehouseId: string): string {
  return `compliance_${warehouseId}`
}

function readComplianceState(warehouseId: string): ComplianceState {
  try {
    const raw = localStorage.getItem(complianceKey(warehouseId))
    return raw ? (JSON.parse(raw) as ComplianceState) : {}
  } catch {
    return {}
  }
}

function writeComplianceState(warehouseId: string, state: ComplianceState): void {
  localStorage.setItem(complianceKey(warehouseId), JSON.stringify(state))
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function statusPrintLabel(status: ComplianceStatus): string {
  if (status === 'done') return '✅ Выполнено'
  if (status === 'na') return '— Н/П'
  return '⏳ Не выполнено'
}

interface StorageComplianceChecklistProps {
  warehouseId: string
  warehouseName: string
  productTypes: ProductType[]
}

export function StorageComplianceChecklist({
  warehouseId,
  warehouseName,
  productTypes,
}: StorageComplianceChecklistProps) {
  const [open, setOpen] = useState(true)
  const [state, setState] = useState<ComplianceState>(() => readComplianceState(warehouseId))
  const [commentOpen, setCommentOpen] = useState<Set<string>>(() => new Set())

  const range = useMemo(() => getCombinedStorageRange(productTypes), [productTypes])

  const { data: readings = [] } = useQuery({
    queryKey: ['storage-readings', warehouseId],
    queryFn: () => fetchStorageReadings(warehouseId),
  })

  const latestReading = readings[0] ?? null

  const persist = useCallback(
    (next: ComplianceState) => {
      setState(next)
      writeComplianceState(warehouseId, next)
    },
    [warehouseId],
  )

  useEffect(() => {
    setState(readComplianceState(warehouseId))
    setCommentOpen(new Set())
  }, [warehouseId])

  useEffect(() => {
    if (!latestReading || !range) return

    const tempOk =
      getValueRangeStatus(latestReading.temperature, range.tempMin, range.tempMax, 2) === 'ok'
    const humidOk =
      getValueRangeStatus(latestReading.humidity, range.humidityMin, range.humidityMax, 2) === 'ok'

    setState((prev) => {
      const next = { ...prev }
      let changed = false

      const applyAuto = (id: ComplianceItemId, inRange: boolean) => {
        const current = next[id]?.status
        if (current === 'na') return
        const target: ComplianceStatus = inRange ? 'done' : 'pending'
        if (current !== target) {
          next[id] = { ...next[id], status: target, comment: next[id]?.comment }
          changed = true
        }
      }

      applyAuto('temp_in_range', tempOk)
      applyAuto('humidity_in_range', humidOk)

      if (changed) {
        writeComplianceState(warehouseId, next)
      }
      return changed ? next : prev
    })
  }, [latestReading, range, warehouseId])

  const progress = useMemo(() => {
    const applicable = COMPLIANCE_ITEMS.filter((item) => state[item.id]?.status !== 'na')
    const done = applicable.filter((item) => state[item.id]?.status === 'done').length
    return { done, total: applicable.length }
  }, [state])

  const setStatus = (id: ComplianceItemId, status: ComplianceStatus) => {
    persist({
      ...state,
      [id]: { ...state[id], status, comment: state[id]?.comment },
    })
  }

  const setComment = (id: ComplianceItemId, comment: string) => {
    persist({
      ...state,
      [id]: { status: state[id]?.status ?? 'pending', comment: comment || undefined },
    })
  }

  const toggleComment = (id: string) => {
    setCommentOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const printChecklist = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    const rows = COMPLIANCE_ITEMS.map((item, index) => {
      const itemState = state[item.id]
      const currentStatus = itemState?.status ?? 'pending'
      const comment = itemState?.comment?.trim() || '—'
      return `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(item.text)}</td>
      <td>${escapeHtml(item.category)}</td>
      <td>${statusPrintLabel(currentStatus)}</td>
      <td>${escapeHtml(comment)}</td>
    </tr>
  `
    }).join('')

    const now = new Date()
    const printedAt = `${now.toLocaleDateString('ru-RU')} ${now.toLocaleTimeString('ru-RU')}`

    printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Чеклист условий хранения — ${escapeHtml(warehouseName)}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; color: #111; }
        h2 { font-size: 16px; margin-bottom: 4px; }
        .meta { color: #555; margin-bottom: 16px; font-size: 11px; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #f3f4f6; text-align: left; padding: 6px 8px; border: 1px solid #d1d5db; font-size: 11px; }
        td { padding: 5px 8px; border: 1px solid #e5e7eb; font-size: 11px; vertical-align: top; }
        tr:nth-child(even) td { background: #f9fafb; }
        .footer { margin-top: 24px; font-size: 10px; color: #9ca3af; }
      </style>
    </head>
    <body>
      <h2>Чеклист условий хранения — ${escapeHtml(warehouseName)}</h2>
      <div class="meta">Прогресс: ${progress.done} из ${progress.total} выполнено</div>
      <table>
        <thead>
          <tr>
            <th>№</th><th>Требование</th><th>Категория</th><th>Статус</th><th>Комментарий</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="footer">${printedAt} · ЧЕК-Лист</div>
    </body>
    </html>
  `)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => {
      printWindow.print()
      printWindow.close()
    }, 300)
  }

  const statusButton = (id: ComplianceItemId, status: ComplianceStatus, label: string, Icon: typeof Circle) => (
    <button
      key={status}
      type="button"
      title={label}
      onClick={() => setStatus(id, status)}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs border ${
        (state[id]?.status ?? 'pending') === status
          ? 'border-brand-500 bg-brand-50 text-brand-700'
          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  )

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/80 overflow-hidden">
      <div className="flex w-full items-center gap-2 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex flex-1 items-center justify-between gap-2 text-left text-sm font-medium text-slate-800 hover:bg-slate-100/80 -mx-2 px-2 py-0 rounded"
        >
          <span className="flex items-center gap-2 min-w-0">
            <span>✅ Чеклист условий хранения</span>
            <span className="rounded-full bg-brand-100 text-brand-800 text-xs font-medium px-2 py-0.5 shrink-0">
              {progress.done} / {progress.total}
            </span>
          </span>
          {open ? (
            <ChevronUp className="h-4 w-4 text-slate-500 shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" />
          )}
        </button>
        <button
          type="button"
          onClick={printChecklist}
          className="shrink-0 text-xs text-brand-600 hover:underline whitespace-nowrap"
        >
          🖨️ Распечатать
        </button>
      </div>

      {open && (
        <div className="border-t border-slate-200 px-4 py-4 space-y-3 bg-white">
          <div>
            <div className="flex justify-between text-xs text-slate-600 mb-1">
              <span>Прогресс</span>
              <span className="font-medium">
                {progress.done} из {progress.total} выполнено
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-brand-600 transition-all"
                style={{
                  width: progress.total ? `${(progress.done / progress.total) * 100}%` : '0%',
                }}
              />
            </div>
          </div>

          <ul className="space-y-3">
            {COMPLIANCE_ITEMS.map((item) => {
              const itemState = state[item.id]
              const currentStatus = itemState?.status ?? 'pending'
              const showComment = commentOpen.has(item.id)

              return (
                <li
                  key={item.id}
                  className="rounded-lg border border-slate-100 p-3 space-y-2 bg-slate-50/50"
                >
                  <div className="flex flex-wrap items-start gap-2">
                    {item.category === 'РАТК' ? (
                      <span className="shrink-0 rounded px-1.5 py-0.5 font-medium bg-orange-100 text-orange-800">
                        <span className="block text-[10px] leading-none opacity-70">РАТК</span>
                        <span className="block text-xs leading-tight">Росалкогольтабакконтроль</span>
                      </span>
                    ) : (
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          CATEGORY_BADGE[item.category] ?? 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {item.category}
                      </span>
                    )}
                    <p className="text-sm text-slate-800 flex-1 min-w-0">{item.text}</p>
                    <button
                      type="button"
                      onClick={() => toggleComment(item.id)}
                      className={`shrink-0 rounded p-1 text-sm ${
                        itemState?.comment
                          ? 'text-brand-600 bg-brand-50'
                          : 'text-slate-400 hover:text-slate-600'
                      }`}
                      title="Комментарий"
                    >
                      💬
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {statusButton(item.id, 'pending', 'Не выполнено', Circle)}
                    {statusButton(item.id, 'done', 'Выполнено', CheckCircle2)}
                    {statusButton(item.id, 'na', 'Н/П', Minus)}
                  </div>

                  {showComment && (
                    <input
                      type="text"
                      className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                      placeholder="Комментарий…"
                      value={itemState?.comment ?? ''}
                      onChange={(e) => setComment(item.id, e.target.value)}
                    />
                  )}

                  {(item.id === 'temp_in_range' || item.id === 'humidity_in_range') &&
                    latestReading &&
                    range &&
                    currentStatus === 'done' && (
                      <p className="text-xs text-emerald-700">
                        По последней записи журнала:{' '}
                        {item.id === 'temp_in_range'
                          ? `${latestReading.temperature}°C`
                          : `${latestReading.humidity}%`}
                      </p>
                    )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
