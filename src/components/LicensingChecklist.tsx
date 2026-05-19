import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, isValid, parseISO } from 'date-fns'
import { ru } from 'date-fns/locale'
import { Calendar, ChevronDown, ChevronRight, MessageSquare } from 'lucide-react'
import type { Client, License, OperationType, Warehouse } from '../types'

export interface LicensingChecklistProps {
  client: Client
  license: License | null
  warehouses: Warehouse[]
}

type ItemStatus = 'pending' | 'done' | 'na'

interface LicensingItemDef {
  id: number
  block: number
  title: string
  /** If set, item only applies to these operation types */
  operationTypes?: OperationType[]
}

interface LicensingBlockDef {
  num: number
  title: string
  operationTypes?: OperationType[]
}

interface ItemState {
  status: ItemStatus
  comment?: string
  dueDate?: string
  responsible?: string
}

interface PersistedChecklist {
  items: Record<string, ItemState>
  collapsed: Record<string, boolean>
}

const OPERATION_OPTIONS: {
  value: OperationType
  label: string
  description: string
}[] = [
  { value: 'ПОЛУЧЕНИЕ', label: 'ПОЛУЧЕНИЕ', description: 'новая лицензия' },
  {
    value: 'ПЕРЕОФОРМЛЕНИЕ',
    label: 'ПЕРЕОФОРМЛЕНИЕ',
    description: 'смена адреса / наименования / реорганизация',
  },
  { value: 'ПРОДЛЕНИЕ', label: 'ПРОДЛЕНИЕ', description: 'продление срока лицензии' },
  { value: 'ПРОВЕРКА_ВЫЕЗДНАЯ', label: 'ПРОВЕРКА_ВЫЕЗДНАЯ', description: 'выездная оценка РАТК' },
  {
    value: 'ПРОВЕРКА_ВНЕПЛАНОВАЯ',
    label: 'ПРОВЕРКА_ВНЕПЛАНОВАЯ',
    description: 'внеплановая проверка',
  },
]

const OPERATION_LABELS: Record<OperationType, string> = {
  ПОЛУЧЕНИЕ: 'Получение лицензии',
  ПЕРЕОФОРМЛЕНИЕ: 'Переоформление',
  ПРОДЛЕНИЕ: 'Продление',
  ПРОВЕРКА_ВЫЕЗДНАЯ: 'Выездная проверка РАТК',
  ПРОВЕРКА_ВНЕПЛАНОВАЯ: 'Внеплановая проверка',
}

const LICENSE_BLOCK_OPS: OperationType[] = [
  'ПЕРЕОФОРМЛЕНИЕ',
  'ПРОДЛЕНИЕ',
  'ПРОВЕРКА_ВЫЕЗДНАЯ',
  'ПРОВЕРКА_ВНЕПЛАНОВАЯ',
]

const INSPECTION_OPS: OperationType[] = ['ПРОВЕРКА_ВЫЕЗДНАЯ', 'ПРОВЕРКА_ВНЕПЛАНОВАЯ']

const BLOCKS: LicensingBlockDef[] = [
  { num: 1, title: 'Корпоративные документы' },
  { num: 2, title: 'Уставный капитал' },
  { num: 3, title: 'Реестры и выписки' },
  { num: 4, title: 'Обособленное подразделение и склад' },
  { num: 5, title: 'Технические требования' },
  { num: 6, title: 'ЕГАИС' },
  { num: 7, title: 'Лицензия', operationTypes: LICENSE_BLOCK_OPS },
  { num: 8, title: 'Дополнительно для проверок', operationTypes: INSPECTION_OPS },
]

const ITEMS: LicensingItemDef[] = [
  { id: 1, block: 1, title: 'Устав (последняя редакция)' },
  { id: 2, block: 1, title: 'Свидетельство ОГРН / Лист записи ЕГРЮЛ' },
  { id: 3, block: 1, title: 'Свидетельство ИНН' },
  { id: 4, block: 1, title: 'Лист записи ГРН к Уставу (при наличии изменений)' },
  { id: 5, block: 1, title: 'Решение о создании юридического лица' },
  { id: 6, block: 1, title: 'Решение об увеличении уставного капитала (при наличии)' },
  { id: 7, block: 1, title: 'Решение о внесении изменений в Устав (при наличии)' },
  { id: 8, block: 1, title: 'Решение о назначении генерального директора' },
  { id: 9, block: 1, title: 'Приказ о назначении генерального директора' },
  { id: 10, block: 1, title: 'Копия паспорта генерального директора (стр. 1 и прописка)' },
  { id: 11, block: 1, title: 'Приказ о назначении главного бухгалтера (если бухгалтер ≠ ГД)' },
  { id: 12, block: 2, title: 'Платёжные документы об оплате УК' },
  { id: 13, block: 2, title: 'Справка банка о зачислении средств в оплату УК' },
  {
    id: 14,
    block: 2,
    title: 'Баланс за последний отчётный период (если компания открыта ранее текущего года)',
  },
  { id: 15, block: 2, title: 'Расчёт оценки стоимости чистых активов' },
  { id: 16, block: 3, title: 'Выписка из ЕГРЮЛ (не старше 1 месяца)' },
  { id: 17, block: 3, title: 'Выписка из ЕГРН (Росреестр)' },
  { id: 18, block: 4, title: 'Уведомление о постановке на учёт обособленного подразделения' },
  { id: 19, block: 4, title: 'Договор аренды складского помещения (со всеми доп. соглашениями)' },
  { id: 20, block: 4, title: 'Выписка из ЕГРН на складское помещение' },
  { id: 21, block: 4, title: 'Технический паспорт / технический план помещения' },
  { id: 22, block: 4, title: 'Документы на гигрометры (свидетельства о поверке)' },
  { id: 23, block: 4, title: 'Документы на термометры (свидетельства о поверке)' },
  {
    id: 24,
    block: 5,
    title: 'Охранная сигнализация — договор обслуживания или акт проверки',
  },
  {
    id: 25,
    block: 5,
    title: 'Пожарная сигнализация — договор обслуживания или акт проверки',
  },
  { id: 26, block: 5, title: 'Стеллажи и поддоны установлены (нижний ярус ≥ 15 см от пола)' },
  { id: 27, block: 5, title: 'Расстояние от стен ≥ 0,5 м соблюдено' },
  { id: 28, block: 6, title: 'Договор с ОФД' },
  { id: 29, block: 6, title: 'ЕГАИС подключён и работает' },
  { id: 30, block: 6, title: 'Сканер штрихкодов (2D) — наличие' },
  {
    id: 31,
    block: 7,
    title: 'Действующая лицензия (оригинал или копия)',
    operationTypes: LICENSE_BLOCK_OPS,
  },
  {
    id: 32,
    block: 7,
    title: 'Предыдущие лицензии (при наличии, для истории)',
    operationTypes: LICENSE_BLOCK_OPS,
  },
  {
    id: 33,
    block: 8,
    title: 'Журнал учёта условий хранения (ведётся, актуален)',
    operationTypes: INSPECTION_OPS,
  },
  { id: 34, block: 8, title: 'Журнал входящего контроля продукции', operationTypes: INSPECTION_OPS },
  {
    id: 35,
    block: 8,
    title: 'Договоры поставки с поставщиками (выборочно)',
    operationTypes: INSPECTION_OPS,
  },
  {
    id: 36,
    block: 8,
    title: 'Товарные накладные / УПД за последние 3 месяца',
    operationTypes: INSPECTION_OPS,
  },
]

function opTypeKey(clientId: string): string {
  return `checklist_optype_${clientId}`
}

function checklistKey(clientId: string, operationType: OperationType): string {
  return `licensing_checklist_${clientId}_${operationType}`
}

function readOpType(clientId: string): OperationType | null {
  try {
    const raw = localStorage.getItem(opTypeKey(clientId))
    if (!raw) return null
    const valid = OPERATION_OPTIONS.some((o) => o.value === raw)
    return valid ? (raw as OperationType) : null
  } catch {
    return null
  }
}

function writeOpType(clientId: string, operationType: OperationType): void {
  localStorage.setItem(opTypeKey(clientId), operationType)
}

function readChecklist(clientId: string, operationType: OperationType): PersistedChecklist {
  try {
    const raw = localStorage.getItem(checklistKey(clientId, operationType))
    if (!raw) return { items: {}, collapsed: {} }
    const parsed = JSON.parse(raw) as PersistedChecklist
    return {
      items: parsed.items ?? {},
      collapsed: parsed.collapsed ?? {},
    }
  } catch {
    return { items: {}, collapsed: {} }
  }
}

function writeChecklist(
  clientId: string,
  operationType: OperationType,
  data: PersistedChecklist,
): void {
  localStorage.setItem(checklistKey(clientId, operationType), JSON.stringify(data))
}

function defaultItemState(): ItemState {
  return { status: 'pending' }
}

function nextStatus(status: ItemStatus): ItemStatus {
  if (status === 'pending') return 'done'
  if (status === 'done') return 'na'
  return 'pending'
}

function statusIcon(status: ItemStatus): string {
  if (status === 'done') return '✅'
  if (status === 'na') return '—'
  return '○'
}

function statusLabel(status: ItemStatus): string {
  if (status === 'done') return 'Выполнено'
  if (status === 'na') return 'Н/П'
  return 'Не начато'
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function itemApplies(item: LicensingItemDef, operationType: OperationType): boolean {
  if (!item.operationTypes) return true
  return item.operationTypes.includes(operationType)
}

function blockApplies(block: LicensingBlockDef, operationType: OperationType): boolean {
  if (!block.operationTypes) return true
  return block.operationTypes.includes(operationType)
}

function isDueOverdue(dueDate: string | undefined): boolean {
  if (!dueDate) return false
  const d = parseISO(dueDate)
  if (!isValid(d)) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return d < today
}

export function LicensingChecklist({ client, license, warehouses: _warehouses }: LicensingChecklistProps) {
  const [operationType, setOperationType] = useState<OperationType | null>(() =>
    readOpType(client.id),
  )
  const [items, setItems] = useState<Record<string, ItemState>>({})
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [commentOpen, setCommentOpen] = useState<Set<number>>(() => new Set())
  const [dateOpen, setDateOpen] = useState<Set<number>>(() => new Set())

  const activeItems = useMemo(() => {
    if (!operationType) return []
    return ITEMS.filter((item) => itemApplies(item, operationType))
  }, [operationType])

  const visibleBlocks = useMemo(() => {
    if (!operationType) return []
    return BLOCKS.filter((b) => blockApplies(b, operationType)).map((block) => ({
      block,
      items: activeItems.filter((i) => i.block === block.num),
    }))
  }, [operationType, activeItems])

  const loadChecklist = useCallback(
    (op: OperationType) => {
      const data = readChecklist(client.id, op)
      const nextItems: Record<string, ItemState> = {}
      for (const item of ITEMS.filter((i) => itemApplies(i, op))) {
        nextItems[String(item.id)] = data.items[String(item.id)] ?? defaultItemState()
      }
      setItems(nextItems)
      setCollapsed(data.collapsed ?? {})
      setCommentOpen(new Set())
      setDateOpen(new Set())
    },
    [client.id],
  )

  useEffect(() => {
    if (!operationType) return
    loadChecklist(operationType)
  }, [operationType, loadChecklist])

  const persist = useCallback(
    (nextItems: Record<string, ItemState>, nextCollapsed: Record<string, boolean>) => {
      if (!operationType) return
      writeChecklist(client.id, operationType, {
        items: nextItems,
        collapsed: nextCollapsed,
      })
    },
    [client.id, operationType],
  )

  const updateItem = (id: number, patch: Partial<ItemState>) => {
    const key = String(id)
    setItems((prev) => {
      const next = {
        ...prev,
        [key]: { ...(prev[key] ?? defaultItemState()), ...patch },
      }
      persist(next, collapsed)
      return next
    })
  }

  const cycleStatus = (id: number) => {
    const key = String(id)
    const current = items[key]?.status ?? 'pending'
    updateItem(id, { status: nextStatus(current) })
  }

  const toggleBlock = (blockNum: number) => {
    const key = String(blockNum)
    setCollapsed((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      persist(items, next)
      return next
    })
  }

  const handleOperationChange = (op: OperationType) => {
    setOperationType(op)
    writeOpType(client.id, op)
  }

  const progress = useMemo(() => {
    const applicable = activeItems.filter((i) => (items[String(i.id)]?.status ?? 'pending') !== 'na')
    const total = applicable.length
    const done = applicable.filter((i) => items[String(i.id)]?.status === 'done').length
    return { done, total }
  }, [activeItems, items])

  const exportPDF = () => {
    if (!operationType) return
    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    const now = new Date()
    const printedAt = format(now, 'd MMMM yyyy, HH:mm', { locale: ru })
    const inn = client.inn ? `ИНН ${client.inn}` : ''

    const rows = activeItems
      .map((item) => {
        const block = BLOCKS.find((b) => b.num === item.block)
        const state = items[String(item.id)] ?? defaultItemState()
        const due =
          state.dueDate && isValid(parseISO(state.dueDate))
            ? format(parseISO(state.dueDate), 'dd.MM.yyyy')
            : '—'
        return `
    <tr>
      <td>${item.id}</td>
      <td>${escapeHtml(block ? `Блок ${block.num}` : '')}</td>
      <td>${escapeHtml(item.title)}</td>
      <td>${escapeHtml(statusLabel(state.status))}</td>
      <td>${due}</td>
      <td>${escapeHtml(state.responsible?.trim() || '—')}</td>
      <td>${escapeHtml(state.comment?.trim() || '—')}</td>
    </tr>`
      })
      .join('')

    printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Чеклист лицензирования — ${escapeHtml(client.name)}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; color: #111; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        .meta { color: #555; margin-bottom: 16px; font-size: 11px; line-height: 1.5; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #f3f4f6; text-align: left; padding: 6px 8px; border: 1px solid #d1d5db; font-size: 11px; }
        td { padding: 5px 8px; border: 1px solid #e5e7eb; font-size: 11px; vertical-align: top; }
        tr:nth-child(even) td { background: #f9fafb; }
        .footer { margin-top: 24px; font-size: 10px; color: #9ca3af; }
      </style>
    </head>
    <body>
      <h1>${escapeHtml(client.name)}</h1>
      <div class="meta">
        ${escapeHtml(inn)}<br>
        Операция: ${escapeHtml(OPERATION_LABELS[operationType])}<br>
        Дата формирования: ${escapeHtml(printedAt)}
        ${license?.license_number ? `<br>Лицензия: ${escapeHtml(license.license_number)}` : ''}
      </div>
      <table>
        <thead>
          <tr>
            <th>№</th><th>Блок</th><th>Документ</th><th>Статус</th><th>Срок</th><th>Ответственный</th><th>Комментарий</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="footer">ЧЕК-Лист · Сформирован: ${escapeHtml(format(now, 'd MMMM yyyy, HH:mm', { locale: ru }))}</div>
    </body>
    </html>
  `)
    printWindow.document.close()
    printWindow.focus()
    window.setTimeout(() => {
      printWindow.print()
      printWindow.close()
    }, 300)
  }

  return (
    <div className="space-y-6 overflow-x-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Чеклист лицензирования</h2>
        {operationType && (
          <button
            type="button"
            onClick={exportPDF}
            className="inline-flex items-center gap-1.5 min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            📤 Экспорт отчёта (PDF)
          </button>
        )}
      </div>

      <fieldset className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <legend className="text-sm font-medium text-slate-800 px-1">
          Тип операции <span className="text-red-500">*</span>
        </legend>
        <div className="space-y-2">
          {OPERATION_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 min-h-[44px] cursor-pointer transition ${
                operationType === opt.value
                  ? 'border-brand-500 bg-brand-50/60'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <input
                type="radio"
                name={`optype-${client.id}`}
                value={opt.value}
                checked={operationType === opt.value}
                onChange={() => handleOperationChange(opt.value)}
                className="mt-1 text-brand-600"
              />
              <span className="text-sm">
                <span className="font-medium text-slate-900">{opt.label}</span>
                <span className="text-slate-500"> — {opt.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {!operationType ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-16 px-6 text-center">
          <p className="text-4xl mb-4" aria-hidden>
            📋
          </p>
          <h2 className="text-lg font-semibold text-slate-900">Выберите тип операции</h2>
          <p className="mt-2 text-sm text-slate-500 max-w-sm mx-auto">
            Чеклист сформируется автоматически под выбранный тип
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="font-medium text-slate-800">
                Готово {progress.done} из {progress.total} пунктов
              </span>
              <span className="text-slate-500 tabular-nums">
                {progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0}%
              </span>
            </div>
            <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-brand-600 transition-all duration-300"
                style={{
                  width:
                    progress.total > 0
                      ? `${(progress.done / progress.total) * 100}%`
                      : '0%',
                }}
              />
            </div>
          </div>

          <div className="space-y-3">
            {visibleBlocks.map(({ block, items: blockItems }) => {
              if (blockItems.length === 0) return null
              const blockKey = String(block.num)
              const isCollapsed = collapsed[blockKey] ?? false
              const blockDone = blockItems.filter(
                (i) => items[String(i.id)]?.status === 'done',
              ).length
              const blockTotal = blockItems.filter(
                (i) => (items[String(i.id)]?.status ?? 'pending') !== 'na',
              ).length

              return (
                <section
                  key={block.num}
                  className="rounded-xl border border-slate-200 bg-white overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => toggleBlock(block.num)}
                    className="w-full flex items-center justify-between gap-2 px-4 py-3 min-h-[44px] text-left bg-slate-50/80 hover:bg-slate-50"
                  >
                    <span className="font-semibold text-slate-900 text-sm">
                      Блок {block.num} — {block.title} ({blockDone}/{blockTotal} готово)
                    </span>
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                    )}
                  </button>

                  {!isCollapsed && (
                    <ul className="divide-y divide-slate-100">
                      {blockItems.map((item) => {
                        const state = items[String(item.id)] ?? defaultItemState()
                        const showComment = commentOpen.has(item.id)
                        const showDate = dateOpen.has(item.id)
                        const overdue = isDueOverdue(state.dueDate)

                        return (
                          <li key={item.id} className="px-4 py-3 space-y-2">
                            <div className="flex flex-wrap items-start gap-2">
                              <button
                                type="button"
                                onClick={() => cycleStatus(item.id)}
                                className="shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md border border-slate-200 text-base leading-none hover:bg-slate-50"
                                title="Статус: ожидание → готово → н/п"
                              >
                                {statusIcon(state.status)}
                              </button>
                              <p className="flex-1 min-w-0 text-sm text-slate-800 pt-1">
                                <span className="text-slate-400 mr-1.5">{item.id}.</span>
                                {item.title}
                              </p>
                              <div className="flex items-center gap-1 shrink-0">
                                {state.dueDate && !showDate && (
                                  <span
                                    className={`text-xs px-2 py-0.5 rounded-full ${
                                      overdue
                                        ? 'bg-red-100 text-red-700'
                                        : 'bg-slate-100 text-slate-600'
                                    }`}
                                  >
                                    {format(parseISO(state.dueDate), 'dd.MM.yyyy')}
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDateOpen((prev) => {
                                      const next = new Set(prev)
                                      if (next.has(item.id)) next.delete(item.id)
                                      else next.add(item.id)
                                      return next
                                    })
                                  }}
                                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
                                  title="Срок"
                                >
                                  <Calendar className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCommentOpen((prev) => {
                                      const next = new Set(prev)
                                      if (next.has(item.id)) next.delete(item.id)
                                      else next.add(item.id)
                                      return next
                                    })
                                  }}
                                  className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md hover:bg-slate-100 ${
                                    state.comment?.trim()
                                      ? 'text-brand-600'
                                      : 'text-slate-500'
                                  }`}
                                  title="Комментарий"
                                >
                                  <MessageSquare className="h-4 w-4" />
                                </button>
                              </div>
                            </div>

                            <label className="block text-xs text-slate-500 pl-10">
                              Ответственный
                              <input
                                type="text"
                                value={state.responsible ?? ''}
                                onChange={(e) =>
                                  updateItem(item.id, { responsible: e.target.value })
                                }
                                placeholder="ФИО"
                                className="mt-0.5 w-full max-w-xs rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-800"
                              />
                            </label>

                            {showDate && (
                              <label className="block text-xs text-slate-500 pl-10">
                                Срок исполнения
                                <input
                                  type="date"
                                  value={state.dueDate ?? ''}
                                  onChange={(e) =>
                                    updateItem(item.id, {
                                      dueDate: e.target.value || undefined,
                                    })
                                  }
                                  className="mt-0.5 rounded-md border border-slate-300 px-2 py-1 text-sm"
                                />
                              </label>
                            )}

                            {showComment && (
                              <label className="block text-xs text-slate-500 pl-10">
                                Комментарий
                                <textarea
                                  value={state.comment ?? ''}
                                  onChange={(e) =>
                                    updateItem(item.id, { comment: e.target.value })
                                  }
                                  rows={2}
                                  className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                                />
                              </label>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </section>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
