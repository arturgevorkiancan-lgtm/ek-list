import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Loader2, X } from 'lucide-react'
import {
  CONFLICT_FIELD_LABELS,
  SOURCE_LABELS,
  type ConflictSourceKey,
} from '../lib/conflictSourceData'
import {
  CONFLICT_LEVEL_ORDER,
  getConflictLevel,
  type ConflictLevel,
} from '../lib/conflictLevels'
import { getSourcePriorityOrder } from '../lib/conflictApi'
import type { DataConflict, DataConflictSource } from '../types'

const LEVEL_META: Record<
  ConflictLevel,
  { title: string; border: string; bg: string; emoji: string }
> = {
  critical: {
    title: 'Критичные',
    border: 'border-red-300',
    bg: 'bg-red-50',
    emoji: '🔴',
  },
  important: {
    title: 'Важные',
    border: 'border-amber-300',
    bg: 'bg-amber-50',
    emoji: '🟡',
  },
  info: {
    title: 'Справочные',
    border: 'border-blue-300',
    bg: 'bg-blue-50',
    emoji: '🔵',
  },
}

interface ConflictResolutionModalProps {
  open: boolean
  clientId: string
  conflicts: DataConflict[]
  onClose: () => void
  onResolve: (
    conflict: DataConflict,
    source: DataConflictSource,
    comment?: string,
  ) => Promise<void>
}

function groupByLevel(conflicts: DataConflict[]): Record<ConflictLevel, DataConflict[]> {
  const groups: Record<ConflictLevel, DataConflict[]> = {
    critical: [],
    important: [],
    info: [],
  }
  for (const c of conflicts.filter((x) => !x.resolved)) {
    const level = (c.level as ConflictLevel) || getConflictLevel(c.field)
    groups[level].push(c)
  }
  for (const key of Object.keys(groups) as ConflictLevel[]) {
    groups[key].sort((a, b) => a.field.localeCompare(b.field))
  }
  return groups
}

function ConflictRow({
  conflict,
  clientId,
  onResolve,
  resolvingId,
}: {
  conflict: DataConflict
  clientId: string
  onResolve: ConflictResolutionModalProps['onResolve']
  resolvingId: string | null
}) {
  const level = (conflict.level as ConflictLevel) || getConflictLevel(conflict.field)
  const [selected, setSelected] = useState<DataConflictSource>(
    conflict.priority_source ?? conflict.source_a,
  )
  const [comment, setComment] = useState('')
  const [prioritySource, setPrioritySource] = useState<ConflictSourceKey | null>(null)
  const busy = resolvingId === conflict.id

  useEffect(() => {
    let cancelled = false
    void getSourcePriorityOrder(clientId, conflict.field).then((order) => {
      if (cancelled) return
      const hit = order.find(
        (s) => s === conflict.source_a || s === conflict.source_b,
      )
      setPrioritySource(hit ?? order[0] ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [clientId, conflict])

  const fieldLabel =
    CONFLICT_FIELD_LABELS[conflict.field as keyof typeof CONFLICT_FIELD_LABELS] ??
    conflict.field

  const sources: Array<{ key: DataConflictSource; value: string | null }> = [
    { key: conflict.source_a, value: conflict.value_a },
    { key: conflict.source_b, value: conflict.value_b },
  ]

  const handleConfirm = async (source: DataConflictSource, requiredComment?: boolean) => {
    if (requiredComment && !comment.trim()) return
    await onResolve(conflict, source, comment.trim() || undefined)
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
      <div className="font-medium text-slate-900">{fieldLabel}</div>
      <div className="space-y-2">
        {sources.map((s) => (
          <label
            key={s.key}
            className={`flex items-start gap-3 rounded-md border px-3 py-2 cursor-pointer ${
              selected === s.key
                ? 'border-brand-400 bg-brand-50/50'
                : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <input
              type="radio"
              name={conflict.id}
              checked={selected === s.key}
              onChange={() => setSelected(s.key)}
              className="mt-1 h-4 w-4 text-brand-600"
            />
            <div className="min-w-0 flex-1">
              <div className="text-xs text-slate-500">{SOURCE_LABELS[s.key]}</div>
              <div className="text-sm text-slate-900 break-words">{s.value ?? '—'}</div>
            </div>
          </label>
        ))}
      </div>

      {level === 'critical' && (
        <div>
          <label className="block text-xs text-slate-600 mb-1">
            Комментарий (обязателен для подтверждения)
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Укажите причину выбора значения"
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {level === 'info' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleConfirm(selected)}
            className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Принять
          </button>
        )}

        {level === 'important' && (
          <>
            <button
              type="button"
              disabled={busy || !prioritySource}
              onClick={() => prioritySource && void handleConfirm(prioritySource)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
            >
              Принять как есть
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleConfirm(selected)}
              className="rounded-md bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50 inline-flex items-center gap-2"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Подтвердить
            </button>
          </>
        )}

        {level === 'critical' && (
          <button
            type="button"
            disabled={busy || !comment.trim()}
            onClick={() => void handleConfirm(selected, true)}
            className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Подтвердить с комментарием
          </button>
        )}
      </div>
    </div>
  )
}

export function ConflictResolutionModal({
  open,
  clientId,
  conflicts,
  onClose,
  onResolve,
}: ConflictResolutionModalProps) {
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const grouped = useMemo(() => groupByLevel(conflicts), [conflicts])
  const unresolvedCount = conflicts.filter((c) => !c.resolved).length

  const handleResolve: ConflictResolutionModalProps['onResolve'] = async (
    conflict,
    source,
    comment,
  ) => {
    setResolvingId(conflict.id)
    try {
      await onResolve(conflict, source, comment)
    } finally {
      setResolvingId(null)
    }
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const levels = (Object.keys(LEVEL_META) as ConflictLevel[]).sort(
    (a, b) => CONFLICT_LEVEL_ORDER[a] - CONFLICT_LEVEL_ORDER[b],
  )

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="conflict-modal-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2
              id="conflict-modal-title"
              className="text-lg font-semibold text-slate-900 flex items-center gap-2"
            >
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Расхождения в данных
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {unresolvedCount > 0
                ? `Требуют решения: ${unresolvedCount}`
                : 'Все расхождения устранены'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Закрыть"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {unresolvedCount === 0 ? (
            <p className="text-sm text-slate-600 text-center py-8">
              Нет нерешённых расхождений. Закройте окно или загрузите новый документ.
            </p>
          ) : (
            levels.map((level) => {
              const items = grouped[level]
              if (items.length === 0) return null
              const meta = LEVEL_META[level]
              return (
                <section key={level} className="space-y-3">
                  <h3
                    className={`text-sm font-semibold flex items-center gap-2 rounded-md border px-3 py-2 ${meta.border} ${meta.bg}`}
                  >
                    <span aria-hidden>{meta.emoji}</span>
                    {meta.title} ({items.length})
                  </h3>
                  <div className="space-y-3">
                    {items.map((c) => (
                      <ConflictRow
                        key={c.id}
                        conflict={c}
                        clientId={clientId}
                        onResolve={handleResolve}
                        resolvingId={resolvingId}
                      />
                    ))}
                  </div>
                </section>
              )
            })
          )}
        </div>

        <div className="border-t border-slate-200 px-5 py-3 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}
