import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { ru } from 'date-fns/locale'
import { Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { EditClientModal, type EditClientFormState } from '../components/EditClientModal'
import { Header } from '../components/Header'
import { NotificationBanners } from '../components/NotificationBanners'
import {
  deleteClient,
  fetchClient,
  fetchClients,
  fetchChecklists,
  fetchLicenses,
  updateClient,
  upsertClient,
} from '../lib/api'
import { seedDemoDataIfEmpty } from '../lib/seed'
import { getLicenseExpiryStatus, EXPIRY_COLORS, EXPIRY_DOT, EXPIRY_LABEL } from '../lib/licenseUtils'
import { useNotifications } from '../hooks/useNotifications'
import { useToast } from '../context/ToastContext'
import { OPERATION_LABELS } from '../data/checklistItems'
import type { ClientWithMeta } from '../types'
import { uid } from '../lib/localStore'
import { isSupabaseConfigured } from '../lib/supabase'

const LAST_CLIENT_KEY = 'checklist_last_client'
const SKIP_LAST_CLIENT_KEY = 'checklist_skip_last_client'

seedDemoDataIfEmpty()

function highlightMatch(text: string, query: string): ReactNode {
  const q = query.trim()
  if (!q || !text) return text
  const lower = text.toLowerCase()
  const needle = q.toLowerCase()
  const idx = lower.indexOf(needle)
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 rounded px-0.5">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  )
}

function EmptyState({
  icon,
  title,
  subtitle,
  buttonLabel,
  onButton,
}: {
  icon: string
  title: string
  subtitle: string
  buttonLabel?: string
  onButton?: () => void
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 py-16 px-6 text-center">
      <p className="text-4xl mb-4" aria-hidden>
        {icon}
      </p>
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <p className="mt-2 text-sm text-slate-500 max-w-sm mx-auto">{subtitle}</p>
      {buttonLabel && onButton && (
        <button
          type="button"
          onClick={onButton}
          className="mt-6 inline-flex items-center justify-center min-h-[44px] rounded-lg bg-brand-600 px-5 text-sm font-medium text-white hover:bg-brand-700"
        >
          {buttonLabel}
        </button>
      )}
    </div>
  )
}

export function ClientsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { showToast } = useToast()
  const searchRef = useRef<HTMLInputElement>(null)
  const [search, setSearch] = useState('')
  const [showNewForm, setShowNewForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [lastClientChecked, setLastClientChecked] = useState(false)
  const [confirmDeleteClientId, setConfirmDeleteClientId] = useState<string | null>(null)
  const [deletingClientId, setDeletingClientId] = useState<string | null>(null)
  const [editClient, setEditClient] = useState<ClientWithMeta | null>(null)
  const [savingClient, setSavingClient] = useState(false)

  const { data: clients = [], isLoading, error } = useQuery({
    queryKey: ['clients'],
    queryFn: fetchClients,
  })

  const { data: licenses = [] } = useQuery({
    queryKey: ['licenses'],
    queryFn: () => fetchLicenses(),
  })

  const { data: checklists = [] } = useQuery({
    queryKey: ['checklists'],
    queryFn: () => fetchChecklists(),
  })

  const { banners, count, dismissBanner } = useNotifications(clients, licenses)

  useEffect(() => {
    const onFocus = () => searchRef.current?.focus()
    window.addEventListener('checklist:focus-search', onFocus)
    return () => window.removeEventListener('checklist:focus-search', onFocus)
  }, [])

  useEffect(() => {
    if (isLoading || lastClientChecked) return
    try {
      if (sessionStorage.getItem(SKIP_LAST_CLIENT_KEY)) {
        sessionStorage.removeItem(SKIP_LAST_CLIENT_KEY)
        setLastClientChecked(true)
        return
      }
    } catch {
      /* ignore */
    }
    let cancelled = false
    const run = async () => {
      try {
        const lastId = localStorage.getItem(LAST_CLIENT_KEY)
        if (!lastId) {
          setLastClientChecked(true)
          return
        }
        const existsInList = clients.some((c) => c.id === lastId)
        if (existsInList) {
          navigate(`/clients/${lastId}`, { replace: true })
          return
        }
        const client = await fetchClient(lastId)
        if (!cancelled && client) {
          navigate(`/clients/${lastId}`, { replace: true })
          return
        }
      } catch {
        /* client not found */
      }
      if (!cancelled) setLastClientChecked(true)
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [clients, isLoading, lastClientChecked, navigate])

  const clientsWithMeta: ClientWithMeta[] = useMemo(() => {
    return clients.map((client) => {
      const clientLicenses = licenses
        .filter((l) => l.client_id === client.id)
        .sort((a, b) => (b.expiry_date ?? '').localeCompare(a.expiry_date ?? ''))
      const latestLicense = clientLicenses[0] ?? null
      const activeChecklist =
        checklists.find((c) => c.client_id === client.id && c.status === 'active') ?? null

      return {
        ...client,
        latestLicense,
        activeChecklist,
        expiryStatus: getLicenseExpiryStatus(latestLicense),
      }
    })
  }, [clients, licenses, checklists])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = clientsWithMeta
    if (q) {
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.inn?.toLowerCase().includes(q) ?? false) ||
          (c.ogrn?.toLowerCase().includes(q) ?? false),
      )
    }
    return [...list].sort((a, b) => {
      const da = a.latestLicense?.expiry_date ?? '9999-12-31'
      const db = b.latestLicense?.expiry_date ?? '9999-12-31'
      return da.localeCompare(db)
    })
  }, [clientsWithMeta, search])

  const handleCreateClient = async () => {
    if (!newName.trim()) return
    try {
      const client = await upsertClient({ id: uid(), name: newName.trim() })
      setNewName('')
      setShowNewForm(false)
      showToast('Клиент создан')
      navigate(`/clients/${client.id}`)
    } catch {
      showToast('Ошибка создания клиента', 'error')
    }
  }

  const handleSaveClient = async (form: EditClientFormState) => {
    if (!editClient) return
    setSavingClient(true)
    try {
      await updateClient(editClient.id, {
        name: form.name.trim(),
        inn: form.inn.trim() || null,
        kpp: form.kpp.trim() || null,
        ogrn: form.ogrn.trim() || null,
        contact_person: form.contact_person.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
      })
      await qc.invalidateQueries({ queryKey: ['clients'] })
      setEditClient(null)
      showToast('Данные клиента обновлены')
    } catch {
      showToast('Ошибка сохранения', 'error')
    } finally {
      setSavingClient(false)
    }
  }

  const handleDeleteClient = async (clientId: string) => {
    setDeletingClientId(clientId)
    try {
      await deleteClient(clientId)
      await qc.invalidateQueries({ queryKey: ['clients'] })
      setConfirmDeleteClientId(null)
      showToast('Клиент удалён')
    } catch {
      showToast('Ошибка удаления клиента', 'error')
    } finally {
      setDeletingClientId(null)
    }
  }

  const q = search.trim()

  return (
    <>
      <Header notificationCount={count} />
      <main className="mx-auto max-w-6xl px-4 py-6 overflow-x-hidden">
        <NotificationBanners banners={banners} onDismiss={dismissBanner} />

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Клиенты</h1>
            <p className="text-sm text-slate-500 mt-1">
              Чеклисты лицензирования алкогольной продукции
              {!isSupabaseConfigured && ' · данные в браузере'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowNewForm(true)}
            className="inline-flex items-center justify-center gap-2 min-h-[44px] rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" />
            Новый клиент
          </button>
        </div>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            ref={searchRef}
            id="client-search"
            type="search"
            placeholder="Поиск по названию, ИНН или ОГРН..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-4 text-sm min-h-[44px] focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        {showNewForm && (
          <div className="mb-6 rounded-lg border border-brand-200 bg-brand-50 p-4 flex flex-col sm:flex-row gap-3">
            <input
              autoFocus
              placeholder="Название организации"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void handleCreateClient()}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm min-h-[44px]"
            />
            <button
              type="button"
              onClick={() => void handleCreateClient()}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white min-h-[44px]"
            >
              Создать
            </button>
            <button
              type="button"
              onClick={() => setShowNewForm(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm min-h-[44px]"
            >
              Отмена
            </button>
          </div>
        )}

        {isLoading && (
          <div className="space-y-4 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-xl bg-slate-200" />
            ))}
          </div>
        )}

        {error && (
          <p className="text-center text-red-600 py-8">Ошибка загрузки данных</p>
        )}

        {!isLoading && !error && clients.length === 0 && (
          <EmptyState
            icon="🏢"
            title="Нет клиентов"
            subtitle="Добавьте первого клиента, чтобы начать работу"
            buttonLabel="Добавить клиента"
            onButton={() => setShowNewForm(true)}
          />
        )}

        {!isLoading && !error && clients.length > 0 && filtered.length === 0 && (
          <EmptyState
            icon="🔍"
            title="Ничего не найдено"
            subtitle="Попробуйте изменить запрос поиска"
          />
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((client) => (
            <div
              key={client.id}
              className={`group relative rounded-xl border border-slate-200 border-l-4 shadow-sm transition hover:shadow-md min-h-[44px] ${EXPIRY_COLORS[client.expiryStatus]}`}
            >
              {confirmDeleteClientId === client.id ? (
                <div className="p-4">
                  <p className="text-sm text-slate-700">
                    Удалить клиента? Все данные будут удалены.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={deletingClientId === client.id}
                      onClick={() => void handleDeleteClient(client.id)}
                      className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      Да, удалить
                    </button>
                    <button
                      type="button"
                      disabled={deletingClientId === client.id}
                      onClick={() => setConfirmDeleteClientId(null)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <Link
                    to={`/clients/${client.id}`}
                    className="block p-4 pr-10 min-h-[44px]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="font-semibold text-slate-900 line-clamp-2">
                        {highlightMatch(client.name, q)}
                      </h2>
                      <span
                        className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${EXPIRY_DOT[client.expiryStatus]}`}
                        title={EXPIRY_LABEL[client.expiryStatus]}
                      />
                    </div>
                    {client.inn && (
                      <p className="mt-1 text-sm text-slate-500">
                        ИНН {highlightMatch(client.inn, q)}
                      </p>
                    )}
                    {client.ogrn && (
                      <p className="mt-0.5 text-sm text-slate-500">
                        ОГРН {highlightMatch(client.ogrn, q)}
                      </p>
                    )}
                    {client.activeChecklist && (
                      <p className="mt-2 text-xs text-brand-700 bg-brand-50 inline-block rounded px-2 py-0.5">
                        {OPERATION_LABELS[client.activeChecklist.operation_type]}
                      </p>
                    )}
                    <p className="mt-3 text-xs text-slate-500">
                      {client.latestLicense?.expiry_date ? (
                        <>
                          Лицензия до{' '}
                          {format(parseISO(client.latestLicense.expiry_date), 'd MMM yyyy', {
                            locale: ru,
                          })}
                          <span className="ml-1 text-slate-400">
                            · {EXPIRY_LABEL[client.expiryStatus]}
                          </span>
                        </>
                      ) : (
                        'Лицензия не указана'
                      )}
                    </p>
                  </Link>
                  <div className="absolute top-2 right-2 flex gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setEditClient(client)
                      }}
                      className="rounded p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50"
                      title="Редактировать клиента"
                      aria-label="Редактировать клиента"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setConfirmDeleteClientId(client.id)
                      }}
                      className="rounded p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50"
                      title="Удалить клиента"
                      aria-label="Удалить клиента"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </main>

      <EditClientModal
        open={!!editClient}
        client={editClient}
        saving={savingClient}
        onClose={() => setEditClient(null)}
        onSave={handleSaveClient}
      />
    </>
  )
}
