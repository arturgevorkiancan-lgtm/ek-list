import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bell, BellOff, ClipboardList, HelpCircle, Search, X } from 'lucide-react'
import { isSupabaseConfigured } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import {
  getPushPermissionState,
  hasActivePushSubscription,
  subscribeToPush,
  savePushSubscription,
  unsubscribeFromPush,
  type PushPermissionState,
} from '../lib/push'
import { fetchClients, fetchChecklists, fetchLicenses } from '../lib/api'
import { getLicenseExpiryStatus } from '../lib/licenseUtils'
import { getRecentClientIds } from '../hooks/useRecentClients'
import { navigateToClientsList } from '../lib/navigation'
import { ClientSwitcher } from './ClientSwitcher'
import type { ClientWithMeta } from '../types'

interface HeaderProps {
  notificationCount?: number
  breadcrumb?: string
}

const SHORTCUTS = [
  { keys: 'Ctrl+K', desc: 'Фокус на поиск клиентов' },
  { keys: 'Ctrl+1 … Ctrl+4', desc: 'Переключение вкладок (в карточке клиента)' },
  { keys: 'Esc', desc: 'Назад / закрыть модальное окно' },
]

export function Header({ notificationCount = 0, breadcrumb }: HeaderProps) {
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [pushState, setPushState] = useState<'loading' | PushPermissionState | 'subscribed'>(
    'loading',
  )
  const [pushBusy, setPushBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    const sync = async () => {
      const perm = getPushPermissionState()
      if (perm === 'unsupported' || perm === 'denied') {
        if (!cancelled) setPushState(perm)
        return
      }
      const active = await hasActivePushSubscription()
      if (!cancelled) setPushState(active ? 'subscribed' : perm)
    }
    void sync()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  const handlePushToggle = async () => {
    if (!user || pushBusy || pushState === 'unsupported') return
    setPushBusy(true)
    try {
      if (pushState === 'subscribed') {
        await unsubscribeFromPush()
        setPushState(getPushPermissionState() === 'denied' ? 'denied' : 'default')
        return
      }
      if (pushState === 'denied') return
      const sub = await subscribeToPush()
      if (!sub) {
        setPushState(getPushPermissionState())
        return
      }
      await savePushSubscription(sub, user.id)
      setPushState('subscribed')
    } catch (e) {
      console.error(e)
    } finally {
      setPushBusy(false)
    }
  }

  const handleSignOut = async () => {
    setSigningOut(true)
    try {
      await unsubscribeFromPush()
      await signOut()
      navigate('/login', { replace: true })
    } finally {
      setSigningOut(false)
    }
  }

  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: fetchClients,
    enabled: switcherOpen,
  })

  const { data: licenses = [] } = useQuery({
    queryKey: ['licenses'],
    queryFn: () => fetchLicenses(),
    enabled: switcherOpen,
  })

  const { data: checklists = [] } = useQuery({
    queryKey: ['checklists'],
    queryFn: () => fetchChecklists(),
    enabled: switcherOpen,
  })

  const clientsWithMeta: ClientWithMeta[] = clients.map((client) => {
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        navigateToClientsList(navigate)
        window.setTimeout(() => {
          document.getElementById('client-search')?.focus()
        }, 100)
      }
      if (e.key === 'Escape') {
        setHelpOpen(false)
        setSwitcherOpen(false)
        window.dispatchEvent(new CustomEvent('checklist:escape'))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur overflow-x-hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-2 sm:gap-4 px-4 py-3">
          <button
            type="button"
            onClick={() => navigateToClientsList(navigate)}
            className="flex items-center gap-2 font-semibold text-brand-700 shrink-0 min-h-[44px] cursor-pointer hover:opacity-70"
          >
            <ClipboardList className="h-6 w-6" />
            <span className="hidden sm:inline">ЧЕК-Лист</span>
          </button>

          {breadcrumb && (
            <div className="min-w-0 flex-1 text-sm text-slate-600 truncate hidden sm:block">
              <button
                type="button"
                onClick={() => navigateToClientsList(navigate)}
                className="cursor-pointer text-blue-600 hover:underline"
              >
                Все клиенты
              </button>
              <span className="mx-2 text-slate-300">/</span>
              <span className="font-medium text-slate-900">{breadcrumb}</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => setSwitcherOpen(true)}
            className="hidden sm:flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 min-h-[44px] text-xs text-slate-500 hover:bg-slate-100"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Клиенты</span>
            <kbd className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-mono">
              ⌘K
            </kbd>
          </button>

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            {isSupabaseConfigured && user && (
              <div className="hidden sm:flex items-center gap-2 mr-1">
                <span className="text-xs text-slate-400 max-w-[140px] truncate" title={user.email}>
                  {user.email}
                </span>
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  disabled={signingOut}
                  className="text-xs text-slate-600 hover:text-slate-900 disabled:opacity-50 min-h-[44px] px-2"
                >
                  Выйти
                </button>
              </div>
            )}
            {isSupabaseConfigured && user && pushState !== 'loading' && pushState !== 'unsupported' && (
              <button
                type="button"
                onClick={() => void handlePushToggle()}
                disabled={pushBusy || pushState === 'denied'}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-slate-100 disabled:opacity-50"
                title={
                  pushState === 'denied'
                    ? 'Уведомления заблокированы в браузере'
                    : pushState === 'subscribed'
                      ? 'Отключить push-уведомления'
                      : 'Включить push-уведомления'
                }
                aria-label={
                  pushState === 'denied'
                    ? 'Уведомления заблокированы'
                    : pushState === 'subscribed'
                      ? 'Push включены'
                      : 'Включить push'
                }
              >
                {pushState === 'denied' ? (
                  <BellOff className="h-5 w-5 text-slate-400" />
                ) : (
                  <Bell
                    className={`h-5 w-5 ${
                      pushState === 'subscribed' ? 'text-brand-600' : 'text-slate-400'
                    }`}
                  />
                )}
              </button>
            )}
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              title="Горячие клавиши"
              aria-label="Горячие клавиши"
            >
              <HelpCircle className="h-5 w-5" />
            </button>
            {!isSupabaseConfigured && (
              <span className="hidden sm:inline text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded">
                Локальный режим
              </span>
            )}
            {notificationCount > 0 && (
              <div className="relative min-h-[44px] min-w-[44px] flex items-center justify-center" title="Уведомления">
                <Bell className="h-5 w-5 text-slate-600" />
                <span className="absolute top-2 right-2 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                  {notificationCount > 9 ? '9+' : notificationCount}
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      {helpOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => setHelpOpen(false)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-xl bg-white shadow-xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-900">Горячие клавиши</h2>
              <button
                type="button"
                onClick={() => setHelpOpen(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <ul className="space-y-3 text-sm">
              {SHORTCUTS.map((s) => (
                <li key={s.keys} className="flex items-center justify-between gap-4">
                  <span className="text-slate-600">{s.desc}</span>
                  <kbd className="shrink-0 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-mono">
                    {s.keys}
                  </kbd>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <ClientSwitcher
        open={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
        clients={clientsWithMeta}
        recentIds={getRecentClientIds()}
      />
    </>
  )
}
