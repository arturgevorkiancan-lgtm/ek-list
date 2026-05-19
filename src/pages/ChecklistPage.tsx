import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { ru } from 'date-fns/locale'
import {
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  CheckCircle2,
  Minus,
  Paperclip,
  FileDown,
  Loader2,
} from 'lucide-react'
import { Header } from '../components/Header'
import {
  fetchChecklist,
  fetchChecklistItems,
  fetchClient,
  updateChecklistItem,
  uploadDocument,
} from '../lib/api'
import { BLOCK_TITLES, OPERATION_LABELS } from '../data/checklistItems'
import { PDFDownloadLink } from '@react-pdf/renderer'
import { PDFReport, getChecklistPdfFilename } from '../components/PDFReport'
import { addRecentClient } from '../hooks/useRecentClients'
import { useToast } from '../context/ToastContext'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { ChecklistItem, ItemStatus } from '../types'

const STATUS_OPTIONS: { value: ItemStatus; label: string; icon: typeof Circle }[] = [
  { value: 'not_started', label: 'Не начато', icon: Circle },
  { value: 'in_progress', label: 'В процессе', icon: Clock },
  { value: 'done', label: 'Готово', icon: CheckCircle2 },
  { value: 'na', label: 'Н/П', icon: Minus },
]

function itemProgress(items: ChecklistItem[]) {
  const applicable = items.filter((i) => i.status !== 'na')
  const done = applicable.filter((i) => i.status === 'done').length
  return { done, total: applicable.length }
}

export function ChecklistPage() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const { showToast } = useToast()
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({})
  const [uploading, setUploading] = useState<string | null>(null)

  const { data: checklist, isLoading: clLoading } = useQuery({
    queryKey: ['checklist', id],
    queryFn: () => fetchChecklist(id!),
    enabled: !!id,
  })

  const { data: items = [], isLoading: itemsLoading } = useQuery({
    queryKey: ['checklist-items', id],
    queryFn: () => fetchChecklistItems(id!),
    enabled: !!id,
  })

  const { data: client } = useQuery({
    queryKey: ['client', checklist?.client_id],
    queryFn: () => fetchClient(checklist!.client_id),
    enabled: !!checklist?.client_id,
  })

  useEffect(() => {
    if (client) addRecentClient(client.id, client.name, true)
  }, [client])

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !id) return
    const client = supabase
    const channel = client
      .channel(`checklist-items-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'checklist_items', filter: `checklist_id=eq.${id}` },
        () => {
          void qc.invalidateQueries({ queryKey: ['checklist-items', id] })
        },
      )
      .subscribe()
    return () => {
      void client.removeChannel(channel)
    }
  }, [id, qc])

  const blocks = useMemo(() => {
    const map = new Map<number, ChecklistItem[]>()
    for (const item of items) {
      const list = map.get(item.block_num) ?? []
      list.push(item)
      map.set(item.block_num, list)
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0])
  }, [items])

  const overall = itemProgress(items)

  const updateItem = async (item: ChecklistItem, patch: Partial<ChecklistItem>) => {
    try {
      const updated = await updateChecklistItem({ ...item, ...patch })
      qc.setQueryData(['checklist-items', id], (old: ChecklistItem[] | undefined) =>
        old?.map((i) => (i.id === updated.id ? updated : i)),
      )
    } catch {
      showToast('Ошибка сохранения', 'error')
    }
  }

  const handleFile = async (item: ChecklistItem, file: File) => {
    if (!id) return
    setUploading(item.id)
    try {
      await uploadDocument(id, item.id, file)
      showToast('Файл загружен')
    } catch {
      showToast('Ошибка загрузки', 'error')
    } finally {
      setUploading(null)
    }
  }

  if (clLoading || itemsLoading) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-6xl px-4 py-6 overflow-x-hidden">
          <div className="space-y-4 animate-pulse">
            <div className="h-8 bg-slate-200 rounded w-64" />
            <div className="h-4 bg-slate-200 rounded w-full max-w-md" />
            <div className="h-3 bg-slate-200 rounded-full w-full" />
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-xl bg-slate-200" />
            ))}
          </div>
        </main>
      </>
    )
  }

  if (!checklist || !client) {
    return (
      <>
        <Header />
        <p className="text-center py-20 text-slate-500">Чеклист не найден</p>
      </>
    )
  }

  return (
    <>
      <Header breadcrumb={OPERATION_LABELS[checklist.operation_type]} />
      <main className="mx-auto max-w-4xl px-4 py-6">
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <Link to={`/clients/${client.id}`} className="text-sm text-brand-600 hover:underline">
                {client.name}
              </Link>
              <h1 className="text-xl font-bold text-slate-900 mt-1">
                {OPERATION_LABELS[checklist.operation_type]}
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Создан {format(parseISO(checklist.created_at), 'd MMMM yyyy', { locale: ru })}
              </p>
            </div>
            <PDFDownloadLink
              document={
                <PDFReport
                  client={client}
                  operationType={checklist.operation_type}
                  items={items}
                />
              }
              fileName={getChecklistPdfFilename(client.name)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 no-underline text-slate-900"
            >
              {({ loading }) => (
                <>
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileDown className="h-4 w-4" />
                  )}
                  {loading ? 'Формирование PDF…' : 'Экспорт PDF'}
                </>
              )}
            </PDFDownloadLink>
          </div>
          <div className="mt-4">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-slate-600">Общий прогресс</span>
              <span className="font-medium">
                {overall.done} из {overall.total}
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-brand-600 transition-all"
                style={{ width: overall.total ? `${(overall.done / overall.total) * 100}%` : '0%' }}
              />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {blocks.map(([blockNum, blockItems]) => {
            const prog = itemProgress(blockItems)
            const isOpen = !collapsed[blockNum]
            return (
              <section key={blockNum} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <button
                  type="button"
                  onClick={() => setCollapsed((c) => ({ ...c, [blockNum]: !c[blockNum] }))}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
                >
                  {isOpen ? (
                    <ChevronDown className="h-5 w-5 text-slate-400" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-slate-400" />
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-slate-900">
                      Блок {blockNum}: {BLOCK_TITLES[blockNum]}
                    </span>
                    <span className="ml-2 text-xs text-slate-500">
                      {prog.done}/{prog.total}
                    </span>
                  </div>
                  <div className="w-20 h-1.5 rounded-full bg-slate-100 overflow-hidden shrink-0">
                    <div
                      className="h-full bg-emerald-500"
                      style={{
                        width: prog.total ? `${(prog.done / prog.total) * 100}%` : '0%',
                      }}
                    />
                  </div>
                </button>

                {isOpen && (
                  <ul className="divide-y divide-slate-100 border-t border-slate-100">
                    {blockItems.map((item) => (
                      <li key={item.id} className="p-4 space-y-3">
                        <div>
                          <p className="font-medium text-sm text-slate-900">{item.title}</p>
                          {item.notes && (
                            <p className="text-xs text-slate-500 mt-0.5">{item.notes}</p>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {STATUS_OPTIONS.map(({ value, label, icon: Icon }) => (
                            <button
                              key={value}
                              type="button"
                              title={label}
                              onClick={() => void updateItem(item, { status: value })}
                              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs border ${
                                item.status === value
                                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              <Icon className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">{label}</span>
                            </button>
                          ))}
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className="text-xs text-slate-600">
                            Срок
                            <input
                              type="date"
                              className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                              value={item.due_date ?? ''}
                              onChange={(e) =>
                                void updateItem(item, {
                                  due_date: e.target.value || null,
                                })
                              }
                            />
                          </label>
                          <label className="text-xs text-slate-600 sm:col-span-1">
                            Комментарий
                            <input
                              type="text"
                              className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                              value={item.comment ?? ''}
                              onChange={(e) =>
                                void updateItem(item, { comment: e.target.value || null })
                              }
                              onBlur={(e) =>
                                void updateItem(item, { comment: e.target.value || null })
                              }
                            />
                          </label>
                        </div>
                        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-brand-600 hover:underline">
                          <Paperclip className="h-3.5 w-3.5" />
                          {uploading === item.id ? 'Загрузка...' : 'Прикрепить файл'}
                          <input
                            type="file"
                            className="hidden"
                            disabled={uploading === item.id}
                            onChange={(e) => {
                              const f = e.target.files?.[0]
                              if (f) void handleFile(item, f)
                            }}
                          />
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      </main>
    </>
  )
}
