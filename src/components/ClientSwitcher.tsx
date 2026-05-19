import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X } from 'lucide-react'
import type { ClientWithMeta } from '../types'

interface ClientSwitcherProps {
  open: boolean
  onClose: () => void
  clients: ClientWithMeta[]
  recentIds: string[]
}

export function ClientSwitcher({ open, onClose, clients, recentIds }: ClientSwitcherProps) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    let items = clients
    if (q) {
      items = items.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.inn?.toLowerCase().includes(q) ?? false),
      )
    } else {
      const recentSet = new Set(recentIds.slice(0, 5))
      const recent = recentIds
        .map((id) => clients.find((c) => c.id === id))
        .filter((c): c is ClientWithMeta => !!c)
      const rest = items.filter((c) => !recentSet.has(c.id))
      items = [...recent, ...rest]
    }
    return items.slice(0, 10)
  }, [clients, query, recentIds])

  useEffect(() => {
    if (open) {
      setQuery('')
      setHighlight(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  useEffect(() => {
    setHighlight(0)
  }, [query])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlight((h) => Math.min(h + 1, list.length - 1))
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlight((h) => Math.max(h - 1, 0))
      }
      if (e.key === 'Enter' && list[highlight]) {
        e.preventDefault()
        navigate(`/clients/${list[highlight].id}`)
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, list, highlight, navigate, onClose])

  if (!open) return null

  const go = (id: string) => {
    navigate(`/clients/${id}`)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/60 px-4 pt-[12vh]"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-lg rounded-xl bg-slate-800 shadow-2xl border border-slate-700 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Переключение клиента"
      >
        <div className="flex items-center gap-2 border-b border-slate-700 px-3 py-2">
          <Search className="h-4 w-4 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="search"
            placeholder="Поиск клиента…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 outline-none py-2"
          />
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-white"
            aria-label="Закрыть"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <ul className="max-h-80 overflow-y-auto py-1">
          {list.length === 0 ? (
            <li className="px-4 py-6 text-sm text-slate-400 text-center">Клиенты не найдены</li>
          ) : (
            list.map((client, i) => (
              <li key={client.id}>
                <button
                  type="button"
                  onClick={() => go(client.id)}
                  onMouseEnter={() => setHighlight(i)}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm ${
                    i === highlight ? 'bg-slate-700 text-white' : 'text-slate-200 hover:bg-slate-700/60'
                  }`}
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      client.activeChecklist ? 'bg-emerald-500' : 'bg-slate-500'
                    }`}
                    title={client.activeChecklist ? 'Активный чеклист' : 'Нет активного чеклиста'}
                  />
                  <span className="flex-1 truncate font-medium">{client.name}</span>
                  {client.inn && (
                    <span className="text-xs text-slate-400 shrink-0">ИНН {client.inn}</span>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
        <p className="border-t border-slate-700 px-4 py-2 text-xs text-slate-500">
          ↑↓ навигация · Enter открыть · Esc закрыть · ⌘K / Ctrl+K
        </p>
      </div>
    </div>
  )
}
