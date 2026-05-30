import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { format, isValid, parseISO } from 'date-fns'
import { ru } from 'date-fns/locale'
import {
  Calendar,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Circle,
  Info,
  MessageSquare,
  Upload,
  XCircle,
} from 'lucide-react'
import { checklistItemRowClass } from '../lib/checklistStatusStyles'
import {
  getCheckableItems,
  getItemsForOperation,
  isBlockDeferred,
  itemApplies,
  LICENSING_BLOCKS,
  LICENSING_ITEMS,
  OPERATION_LABELS,
  OPERATION_OPTIONS,
  type LicensingItemDef,
} from '../data/licensingChecklistTemplate'
import type { Client, License, OperationType, Warehouse } from '../types'

export interface LicensingChecklistProps {
  client: Client
  license: License | null
  warehouses: Warehouse[]
}

type ItemStatus = 'pending' | 'done' | 'na'

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

interface FormFiles {
  templateName?: string
  clientFileName?: string
}

function opTypeKey(clientId: string): string {
  return `checklist_optype_${clientId}`
}

function checklistKey(clientId: string, operationType: OperationType): string {
  return `licensing_checklist_${clientId}_${operationType}`
}

function formFilesKey(clientId: string, itemId: number): string {
  return `checklist_form_${clientId}_${itemId}`
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

function readFormFiles(clientId: string, itemId: number): FormFiles {
  try {
    const raw = localStorage.getItem(formFilesKey(clientId, itemId))
    return raw ? (JSON.parse(raw) as FormFiles) : {}
  } catch {
    return {}
  }
}

function writeFormFiles(clientId: string, itemId: number, data: FormFiles): void {
  localStorage.setItem(formFilesKey(clientId, itemId), JSON.stringify(data))
}

function defaultItemState(): ItemState {
  return { status: 'pending' }
}

function nextStatus(status: ItemStatus): ItemStatus {
  if (status === 'pending') return 'done'
  if (status === 'done') return 'na'
  return 'pending'
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

function blockApplies(block: (typeof LICENSING_BLOCKS)[number], operationType: OperationType): boolean {
  if (block.operationTypes && !block.operationTypes.includes(operationType)) return false
  return true
}

function isDueOverdue(dueDate: string | undefined): boolean {
  if (!dueDate) return false
  const d = parseISO(dueDate)
  if (!isValid(d)) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return d < today
}

function FormUploadRow({
  clientId,
  itemId,
}: {
  clientId: string
  itemId: number
}) {
  const templateRef = useRef<HTMLInputElement>(null)
  const clientRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<FormFiles>(() => readFormFiles(clientId, itemId))

  const save = (patch: Partial<FormFiles>) => {
    const next = { ...files, ...patch }
    setFiles(next)
    writeFormFiles(clientId, itemId, next)
  }

  return (
    <div className="pl-10 space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={templateRef}
          type="file"
          accept=".pdf,.doc,.docx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) save({ templateName: f.name })
            e.target.value = ''
          }}
        />
        <button
          type="button"
          onClick={() => templateRef.current?.click()}
          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-700 hover:bg-slate-50"
        >
          <Upload className="h-3 w-3" />
          Шаблон
        </button>
        {files.templateName ? (
          <span className="text-slate-600 truncate max-w-[180px]">{files.templateName}</span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={clientRef}
          type="file"
          accept=".pdf,.doc,.docx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) save({ clientFileName: f.name })
            e.target.value = ''
          }}
        />
        <button
          type="button"
          onClick={() => clientRef.current?.click()}
          className="inline-flex items-center gap-1 rounded-md border border-brand-200 bg-brand-50 px-2 py-1 text-brand-700 hover:bg-brand-100"
        >
          <Upload className="h-3 w-3" />
          Файл для клиента
        </button>
        {files.clientFileName ? (
          <span className="text-slate-600 truncate max-w-[180px]">{files.clientFileName}</span>
        ) : null}
      </div>
    </div>
  )
}

export function LicensingChecklist({ client, license, warehouses }: LicensingChecklistProps) {
  const [operationType, setOperationType] = useState<OperationType | null>(() =>
    readOpType(client.id),
  )
  const [items, setItems] = useState<Record<string, ItemState>>({})
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [commentOpen, setCommentOpen] = useState<Set<number>>(() => new Set())
  const [dateOpen, setDateOpen] = useState<Set<number>>(() => new Set())

  const activeItems = useMemo(() => {
    if (!operationType) return []
    return getItemsForOperation(operationType)
  }, [operationType])

  const checkableItems = useMemo(() => {
    if (!operationType) return []
    return getCheckableItems(operationType)
  }, [operationType])

  const visibleBlocks = useMemo(() => {
    if (!operationType) return []
    return LICENSING_BLOCKS.filter((b) => blockApplies(b, operationType)).map((block) => ({
      block,
      items: activeItems.filter((i) => i.block === block.num),
      deferred: isBlockDeferred(block, operationType),
    }))
  }, [operationType, activeItems])

  const loadChecklist = useCallback(
    (op: OperationType) => {
      const data = readChecklist(client.id, op)
      const nextItems: Record<string, ItemState> = {}
      for (const item of LICENSING_ITEMS.filter((i) => itemApplies(i, op))) {
        if (item.mode === 'info') continue
        nextItems[String(item.id)] = data.items[String(item.id)] ?? defaultItemState()
      }
      setItems(nextItems)
      setCollapsed({})
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
      const isCurrentlyCollapsed = prev[key] !== false
      const next = { ...prev, [key]: isCurrentlyCollapsed ? false : true }
      persist(items, next)
      return next
    })
  }

  const handleOperationChange = (op: OperationType) => {
    setCollapsed({})
    setOperationType(op)
    writeOpType(client.id, op)
  }

  const progress = useMemo(() => {
    const applicable = checkableItems.filter(
      (i) => (items[String(i.id)]?.status ?? 'pending') !== 'na',
    )
    const total = applicable.length
    const done = applicable.filter((i) => items[String(i.id)]?.status === 'done').length
    return { done, total }
  }, [checkableItems, items])

  const exportPDF = () => {
    if (!operationType) return
    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    const now = new Date()
    const printedAt = format(now, 'd MMMM yyyy, HH:mm', { locale: ru })
    const inn = client.inn ? `ИНН ${client.inn}` : ''

    const rows = activeItems
      .map((item) => {
        const block = LICENSING_BLOCKS.find((b) => b.num === item.block)
        const state = items[String(item.id)] ?? defaultItemState()
        const due =
          state.dueDate && isValid(parseISO(state.dueDate))
            ? format(parseISO(state.dueDate), 'dd.MM.yyyy')
            : '—'
        const status =
          item.mode === 'info' ? 'Информация' : statusLabel(state.status)
        return `
    <tr>
      <td>${item.id}</td>
      <td>${escapeHtml(block ? `Блок ${block.num}` : '')}</td>
      <td>${escapeHtml(item.title)}</td>
      <td>${escapeHtml(status)}</td>
      <td>${due}</td>
      <td>${escapeHtml(state.responsible?.trim() || '—')}</td>
      <td>${escapeHtml(state.comment?.trim() || item.note || '—')}</td>
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
        ${warehouses.length ? `<br>Складов: ${warehouses.length}` : ''}
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

  const renderCheckableItem = (item: LicensingItemDef) => {
    const state = items[String(item.id)] ?? defaultItemState()
    const showComment = commentOpen.has(item.id)
    const showDate = dateOpen.has(item.id)
    const overdue = isDueOverdue(state.dueDate)

    return (
      <li
        key={item.id}
        className={`mx-2 my-1 rounded-lg border px-3 py-3 space-y-2 ${checklistItemRowClass(state.status)}`}
      >
        <div className="flex flex-wrap items-start gap-2">
          <button
            type="button"
            onClick={() => cycleStatus(item.id)}
            className={`shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md border bg-white/80 hover:opacity-90 ${checklistItemRowClass(state.status)}`}
            title="Статус: ожидание → готово → н/п"
          >
            {state.status === 'done' && <CheckCircle className="h-5 w-5 text-green-600" />}
            {state.status === 'pending' && <XCircle className="h-5 w-5 text-red-600" />}
            {state.status === 'na' && <Circle className="h-5 w-5 text-gray-400" />}
          </button>
          <div className="flex-1 min-w-0 pt-1">
            <p className="text-sm">
              <span className="opacity-60 mr-1.5">{item.id}.</span>
              {item.title}
            </p>
            {item.note ? <p className="text-xs text-slate-500 mt-0.5">{item.note}</p> : null}
            {item.mode === 'auto' ? (
              <p className="text-xs text-brand-600 mt-0.5">Авто: данные из загруженных документов</p>
            ) : null}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {state.dueDate && !showDate && (
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  overdue ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
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
                state.comment?.trim() ? 'text-brand-600' : 'text-slate-500'
              }`}
              title="Комментарий"
            >
              <MessageSquare className="h-4 w-4" />
            </button>
          </div>
        </div>

        {item.mode === 'form' ? <FormUploadRow clientId={client.id} itemId={item.id} /> : null}

        <label className="block text-xs text-slate-500 pl-10">
          Ответственный
          <input
            type="text"
            value={state.responsible ?? ''}
            onChange={(e) => updateItem(item.id, { responsible: e.target.value })}
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
              onChange={(e) => updateItem(item.id, { dueDate: e.target.value || undefined })}
              className="mt-0.5 rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
          </label>
        )}

        {showComment && (
          <label className="block text-xs text-slate-500 pl-10">
            Комментарий
            <textarea
              value={state.comment ?? ''}
              onChange={(e) => updateItem(item.id, { comment: e.target.value })}
              rows={2}
              className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
          </label>
        )}
      </li>
    )
  }

  const renderInfoItem = (item: LicensingItemDef) => (
    <li
      key={item.id}
      className="mx-2 my-1 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-3"
    >
      <div className="flex gap-2">
        <Info className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm text-amber-950">{item.title}</p>
          {item.note ? <p className="text-xs text-amber-800 mt-1">{item.note}</p> : null}
        </div>
      </div>
    </li>
  )

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
                    progress.total > 0 ? `${(progress.done / progress.total) * 100}%` : '0%',
                }}
              />
            </div>
            <p className="text-xs text-slate-500">
              Документы по складам и требования 289н — на вкладке «Документы и склады». ЕГАИС — на
              каждом складе отдельно.
            </p>
          </div>

          <div className="space-y-3">
            {visibleBlocks.map(({ block, items: blockItems, deferred }) => {
              if (blockItems.length === 0 && !deferred) return null
              const blockKey = String(block.num)
              const isCollapsed = collapsed[blockKey] !== false
              const checkableInBlock = blockItems.filter((i) => i.mode !== 'info')
              const blockDone = checkableInBlock.filter(
                (i) => items[String(i.id)]?.status === 'done',
              ).length
              const blockTotal = checkableInBlock.filter(
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
                      Блок {block.num} — {block.title}
                      {!deferred && checkableInBlock.length > 0
                        ? ` (${blockDone}/${blockTotal} готово)`
                        : ''}
                    </span>
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                    )}
                  </button>

                  {!isCollapsed && (
                    <ul className="divide-y divide-slate-100 pb-2">
                      {deferred ? (
                        <li className="mx-2 my-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                          <p className="font-medium text-slate-800">Этап отложен</p>
                          <p className="mt-1">
                            При получении новой лицензии действующая лицензия появится позже. После
                            выдачи добавьте её на вкладке «Обзор» или «Документы и склады» — пункты
                            блока активируются автоматически.
                          </p>
                        </li>
                      ) : (
                        blockItems.map((item) =>
                          item.mode === 'info' ? renderInfoItem(item) : renderCheckableItem(item),
                        )
                      )}
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
