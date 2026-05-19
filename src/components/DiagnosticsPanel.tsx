import { memo, useCallback, useMemo, useState, useSyncExternalStore } from 'react'
import { useParams } from 'react-router-dom'
import { Wrench, X, Download, Trash2 } from 'lucide-react'
import {
  diagnostics,
  formatTimeShort,
  type DiagnosticEntry,
  type DiagnosticLevel,
} from '../lib/diagnostics'

const LEVELS: DiagnosticLevel[] = ['info', 'warn', 'error', 'success']

const LEVEL_ICONS: Record<DiagnosticLevel, string> = {
  info: 'ℹ️',
  warn: '⚠️',
  error: '❌',
  success: '✅',
}

const LEVEL_BORDER: Record<DiagnosticLevel, string> = {
  info: 'border-l-slate-300',
  warn: 'border-l-amber-400',
  error: 'border-l-red-500',
  success: 'border-l-emerald-500',
}

const LEVEL_TEXT: Record<DiagnosticLevel, string> = {
  info: 'text-slate-600',
  warn: 'text-amber-900',
  error: 'text-red-700',
  success: 'text-emerald-900',
}

const LEVEL_FILTER_ACTIVE: Record<DiagnosticLevel, string> = {
  info: 'bg-slate-200 text-slate-800',
  warn: 'bg-amber-200 text-amber-900',
  error: 'bg-red-200 text-red-800',
  success: 'bg-emerald-200 text-emerald-900',
}

function formatDetailsInline(details?: Record<string, unknown>): string | null {
  if (!details) return null
  const parts: string[] = []
  for (const [key, value] of Object.entries(details)) {
    if (value === undefined || value === null || value === '') continue
    if (typeof value === 'object' && !Array.isArray(value)) continue
    parts.push(`${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}`)
  }
  return parts.length ? parts.join(' | ') : null
}

function EntryRow({ entry }: { entry: DiagnosticEntry }) {
  const inline = formatDetailsInline(entry.details)
  return (
    <div
      className={`border-l-4 pl-3 py-2 ${LEVEL_BORDER[entry.level]} ${entry.level === 'error' ? LEVEL_TEXT.error : ''}`}
    >
      <div className={`text-sm font-medium ${LEVEL_TEXT[entry.level]}`}>
        <span className="text-slate-400 font-normal tabular-nums">[{formatTimeShort(entry.timestamp)}]</span>{' '}
        {LEVEL_ICONS[entry.level]} {entry.category}
      </div>
      <div className={`text-sm mt-0.5 ${entry.level === 'info' ? 'text-slate-500' : 'text-slate-700'}`}>
        {entry.message}
      </div>
      {inline && <div className="text-xs text-slate-500 mt-1 break-all">{inline}</div>}
    </div>
  )
}

export const DiagnosticsPanel = memo(function DiagnosticsPanel() {
  const { id: clientId } = useParams<{ id: string }>()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [activeLevels, setActiveLevels] = useState<Set<DiagnosticLevel>>(
    () => new Set(LEVELS),
  )

  const entries = useSyncExternalStore(
    diagnostics.subscribe,
    diagnostics.getSnapshot,
    diagnostics.getSnapshot,
  )

  const errorCount = useMemo(() => entries.filter((e) => e.level === 'error').length, [entries])

  const clientName = useMemo(() => {
    if (!clientId) return undefined
    try {
      return sessionStorage.getItem(`ek-client-name:${clientId}`) ?? undefined
    } catch {
      return undefined
    }
  }, [clientId, entries])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return entries.filter((e) => {
      if (!activeLevels.has(e.level)) return false
      if (!q) return true
      const hay = `${e.category} ${e.message} ${JSON.stringify(e.details ?? {})}`.toLowerCase()
      return hay.includes(q)
    })
  }, [entries, search, activeLevels])

  const showAllLevels = useCallback(() => {
    setActiveLevels(new Set(LEVELS))
  }, [])

  const toggleLevel = useCallback((level: DiagnosticLevel) => {
    setActiveLevels((prev) => {
      const next = new Set(prev)
      if (next.has(level)) next.delete(level)
      else next.add(level)
      return next
    })
  }, [])

  const handleClear = () => {
    diagnostics.clear()
  }

  const handleDownload = () => {
    diagnostics.downloadTxt(clientName)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-md transition hover:bg-slate-50 hover:text-slate-700"
        aria-label="Диагностика"
        title="Диагностика"
      >
        <Wrench className="h-5 w-5" />
        {errorCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {errorCount > 99 ? '99+' : errorCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/20"
            aria-label="Закрыть диагностику"
            onClick={() => setOpen(false)}
          />
          <div
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[60vh] flex-col rounded-t-xl border border-slate-200 bg-white shadow-2xl"
            role="dialog"
            aria-label="Панель диагностики"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="flex items-center gap-2 text-base font-semibold text-slate-800">
                <Wrench className="h-4 w-4 text-slate-500" />
                Диагностика
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleClear}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Очистить
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  TXT
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
                  aria-label="Закрыть"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="border-b border-slate-100 px-4 py-2 space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <label className="text-slate-500">Фильтр:</label>
                <button
                  type="button"
                  onClick={showAllLevels}
                  className={`rounded border px-2 py-0.5 text-xs ${
                    activeLevels.size === LEVELS.length
                      ? 'border-slate-400 bg-slate-100 text-slate-800'
                      : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  Все
                </button>
                {LEVELS.map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => toggleLevel(level)}
                    className={`rounded px-2 py-0.5 text-xs font-medium uppercase ${
                      activeLevels.has(level)
                        ? LEVEL_FILTER_ACTIVE[level]
                        : 'bg-slate-100 text-slate-400 line-through'
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
              <input
                type="search"
                placeholder="Поиск по сообщению и категории…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm"
              />
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {filtered.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">Записей нет</p>
              ) : (
                filtered.map((entry, i) => <EntryRow key={`${entry.timestamp}-${i}`} entry={entry} />)
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
})
