import { useEffect, useRef, useState } from 'react'
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useParams,
  useLocation,
} from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { Header } from './components/Header'
import { DiagnosticsPanel } from './components/DiagnosticsPanel'
import { ToastProvider } from './context/ToastContext'
import { ClientDashboard } from './components/ClientDashboard'
import { LicensingChecklist } from './components/LicensingChecklist'
import { ReportExport } from './components/ReportExport'
import { WarehouseDocumentsSection } from './components/WarehouseDocumentsSection'
import { ClientsPage } from './pages/ClientsPage'
import { ChecklistPage } from './pages/ChecklistPage'
import { LoginPage } from './pages/LoginPage'
import { AuthProvider, useAuth } from './lib/auth'
import { isSupabaseConfigured } from './lib/supabase'
import { EditClientModal, type EditClientFormState } from './components/EditClientModal'
import {
  EditLicenseModal,
  addressesFromText,
  type EditLicenseFormState,
} from './components/EditLicenseModal'
import {
  deleteClient,
  fetchClient,
  fetchClientDocuments,
  fetchLicenses,
  fetchWarehouses,
  updateClient,
  upsertLicense,
} from './lib/api'
import { uid } from './lib/localStore'
import { navigateToClientsList } from './lib/clientNavigation'
import { useToast } from './context/ToastContext'
import { useDataConflicts } from './hooks/useDataConflicts'
import { ConflictBadge } from './components/ConflictBadge'
import { ConflictResolutionModal } from './components/ConflictResolutionModal'
import { runConflictDetectionAfterUpload } from './lib/conflictUpload'
import type { DetectConflictsParams } from './lib/conflictDetector'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

const LAST_CLIENT_KEY = 'checklist_last_client'
const ONBOARDED_KEY = 'checklist_onboarded'

function OnboardingModal() {
  const [open, setOpen] = useState(() => {
    try {
      return !localStorage.getItem(ONBOARDED_KEY)
    } catch {
      return false
    }
  })
  const [step, setStep] = useState(1)

  const finish = () => {
    try {
      localStorage.setItem(ONBOARDED_KEY, 'true')
    } catch {
      /* ignore */
    }
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const onEsc = () => finish()
    window.addEventListener('checklist:escape', onEsc)
    return () => window.removeEventListener('checklist:escape', onEsc)
  }, [open])

  if (!open) return null

  const steps = [
    {
      title: 'Добро пожаловать в ЧЕК-Лист',
      text: 'Приложение для подготовки к лицензированию алкогольной продукции. Ведите чеклисты, журналы хранения и документы по каждому клиенту.',
      button: 'Начать →',
    },
    {
      title: 'Добавьте клиента',
      text: 'Создайте карточку организации. Все данные хранятся локально и в вашей базе Supabase.',
      button: 'Далее →',
    },
    {
      title: 'Всё готово',
      text: 'Выберите тип операции в чеклисте, добавьте склады и начните отслеживать условия хранения.',
      button: 'Начать работу',
    },
  ]

  const current = steps[step - 1]

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4"
      onClick={finish}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-md rounded-xl bg-white shadow-xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={finish}
          className="absolute top-3 right-3 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
          aria-label="Закрыть"
        >
          <X className="h-5 w-5" />
        </button>
        <p className="text-xs text-slate-400 mb-2">Шаг {step}/3</p>
        <h2 className="text-xl font-bold text-slate-900 pr-8">{current.title}</h2>
        <p className="mt-3 text-sm text-slate-600 leading-relaxed">{current.text}</p>
        <button
          type="button"
          onClick={() => {
            if (step < 3) setStep((s) => s + 1)
            else finish()
          }}
          className="mt-6 w-full min-h-[44px] rounded-lg bg-brand-600 text-sm font-medium text-white hover:bg-brand-700"
        >
          {current.button}
        </button>
      </div>
    </div>
  )
}

type ClientTab = 'overview' | 'checklist' | 'documents' | 'report'

const TAB_ORDER: ClientTab[] = ['overview', 'checklist', 'documents', 'report']

function ClientWorkspaceSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-4 bg-slate-200 rounded w-48" />
      <div className="flex gap-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-10 bg-slate-200 rounded w-24" />
        ))}
      </div>
      <div className="h-40 bg-slate-200 rounded-xl" />
      <div className="grid grid-cols-2 gap-4">
        <div className="h-28 bg-slate-200 rounded-xl" />
        <div className="h-28 bg-slate-200 rounded-xl" />
      </div>
    </div>
  )
}

function ClientWorkspace() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { showToast } = useToast()
  const dataConflicts = useDataConflicts(id)
  const settingsRef = useRef<HTMLDivElement>(null)
  const [activeTab, setActiveTab] = useState<ClientTab>('overview')
  const [highlightWarehouseId, setHighlightWarehouseId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [confirmDeleteClient, setConfirmDeleteClient] = useState(false)
  const [deletingClient, setDeletingClient] = useState(false)
  const [editClientOpen, setEditClientOpen] = useState(false)
  const [savingClient, setSavingClient] = useState(false)
  const [licenseModalOpen, setLicenseModalOpen] = useState(false)
  const [savingLicense, setSavingLicense] = useState(false)

  const { data: client, isLoading: clientLoading } = useQuery({
    queryKey: ['client', id],
    queryFn: () => fetchClient(id!),
    enabled: !!id,
  })

  const { data: licenses = [] } = useQuery({
    queryKey: ['licenses', id],
    queryFn: () => fetchLicenses(id),
    enabled: !!id,
  })

  const { data: warehouses = [], isLoading: warehousesLoading } = useQuery({
    queryKey: ['warehouses', id],
    queryFn: () => fetchWarehouses(id!),
    enabled: !!id,
  })

  const { data: clientDocs = [], refetch: refetchDocs } = useQuery({
    queryKey: ['client-documents', id],
    queryFn: () => fetchClientDocuments(id!),
    enabled: !!id,
  })

  useEffect(() => {
    if (id) {
      try {
        localStorage.setItem(LAST_CLIENT_KEY, id)
      } catch {
        /* ignore */
      }
    }
  }, [id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        const n = Number(e.key)
        if (n >= 1 && n <= 4) {
          e.preventDefault()
          setActiveTab(TAB_ORDER[n - 1])
          if (TAB_ORDER[n - 1] !== 'documents') setHighlightWarehouseId(null)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!settingsOpen) return
    const onPointerDown = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [settingsOpen])

  const handleSaveClient = async (form: EditClientFormState) => {
    if (!id || !client) return
    setSavingClient(true)
    try {
      await updateClient(id, {
        name: form.name.trim(),
        inn: form.inn.trim() || null,
        kpp: form.kpp.trim() || null,
        ogrn: form.ogrn.trim() || null,
        contact_person: form.contact_person.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
      })
      await qc.invalidateQueries({ queryKey: ['client', id] })
      await qc.invalidateQueries({ queryKey: ['clients'] })
      setEditClientOpen(false)
      setSettingsOpen(false)
      showToast('Данные клиента обновлены')
    } catch {
      showToast('Ошибка сохранения', 'error')
    } finally {
      setSavingClient(false)
    }
  }

  const handleSaveLicense = async (form: EditLicenseFormState) => {
    if (!id) return
    setSavingLicense(true)
    try {
      const existing = licenses[0]
      const addresses = addressesFromText(form.addressesText)
      await upsertLicense({
        id: existing?.id ?? uid(),
        client_id: id,
        license_number: form.license_number.trim() || null,
        issue_date: form.issue_date || null,
        expiry_date: form.expiry_date || null,
        license_type: form.license_type || null,
        license_activity: form.license_type || null,
        addresses,
      })
      await qc.invalidateQueries({ queryKey: ['licenses', id] })
      setLicenseModalOpen(false)
      showToast('Лицензия сохранена')
    } catch {
      showToast('Ошибка сохранения лицензии', 'error')
    } finally {
      setSavingLicense(false)
    }
  }

  const handleDeleteClient = async () => {
    if (!id) return
    setDeletingClient(true)
    try {
      await deleteClient(id)
      try {
        localStorage.removeItem(LAST_CLIENT_KEY)
      } catch {
        /* ignore */
      }
      await qc.invalidateQueries({ queryKey: ['clients'] })
      showToast('Клиент удалён')
      navigate('/')
    } catch {
      showToast('Ошибка удаления клиента', 'error')
    } finally {
      setDeletingClient(false)
      setConfirmDeleteClient(false)
      setSettingsOpen(false)
    }
  }

  const handleWarehouseSelect = (warehouseId: string) => {
    setActiveTab('documents')
    setHighlightWarehouseId(warehouseId)
    window.setTimeout(() => {
      document.getElementById(`warehouse-${warehouseId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    }, 100)
  }

  const handleConflictAfterUpload = async (params: DetectConflictsParams) => {
    if (!id) return
    const result = await runConflictDetectionAfterUpload({
      ...params,
      clientId: id,
    })
    await dataConflicts.refresh()
    if (result.reopenedResolved > 0) {
      showToast('Подтверждённое значение изменилось — проверьте', 'error')
    }
    if (result.hasUnresolved) {
      dataConflicts.openModal(params.warehouseId ?? null)
    }
  }

  if (clientLoading) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-6xl px-4 py-6 overflow-x-hidden">
          <ClientWorkspaceSkeleton />
        </main>
      </>
    )
  }

  if (!client) {
    return (
      <>
        <Header />
        <p className="text-center py-20 text-slate-500">Клиент не найден</p>
      </>
    )
  }

  const tabs: { key: ClientTab; label: string }[] = [
    { key: 'overview', label: '📊 Обзор' },
    { key: 'checklist', label: '📋 Чеклист' },
    { key: 'documents', label: '📁 Документы и склады' },
    { key: 'report', label: '📄 Отчёт' },
  ]

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-6 space-y-4 overflow-x-hidden">
        {dataConflicts.unresolvedCount > 0 && (
          <ConflictBadge
            count={dataConflicts.unresolvedCount}
            onClick={() => dataConflicts.openModal()}
          />
        )}
        <div className="flex items-start justify-between gap-3">
          <nav className="text-sm text-slate-600 min-w-0">
            <button
              type="button"
              onClick={() => navigateToClientsList(navigate)}
              className="cursor-pointer text-blue-600 hover:underline min-h-[44px] inline-flex items-center"
            >
              Все клиенты
            </button>
            <span className="mx-2 text-slate-300">›</span>
            <span className="font-medium text-slate-900">{client.name}</span>
          </nav>

          <div ref={settingsRef} className="relative shrink-0">
            {confirmDeleteClient ? (
              <div className="w-64 rounded-lg border border-slate-200 bg-white p-3 shadow-lg text-sm">
                <p className="text-slate-700">Удалить клиента? Все данные будут удалены.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={deletingClient}
                    onClick={() => void handleDeleteClient()}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    Да, удалить
                  </button>
                  <button
                    type="button"
                    disabled={deletingClient}
                    onClick={() => setConfirmDeleteClient(false)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setSettingsOpen((o) => !o)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 text-lg"
                  title="Настройки клиента"
                  aria-label="Настройки клиента"
                >
                  ⚙
                </button>
                {settingsOpen && (
                  <div className="absolute right-0 top-full mt-1 z-20 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                    <button
                      type="button"
                      onClick={() => {
                        setSettingsOpen(false)
                        setEditClientOpen(true)
                      }}
                      className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                    >
                      Редактировать клиента
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSettingsOpen(false)
                        setConfirmDeleteClient(true)
                      }}
                      className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                    >
                      Удалить клиента
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="-mx-4 px-4 overflow-x-auto">
          <div className="flex border-b border-slate-200 min-w-max sm:min-w-0 whitespace-nowrap">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  setActiveTab(t.key)
                  if (t.key !== 'documents') setHighlightWarehouseId(null)
                }}
                className={`shrink-0 px-4 py-3 text-sm font-medium border-b-2 -mb-px min-h-[44px] ${
                  activeTab === t.key
                    ? 'border-brand-600 text-brand-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'overview' ? (
          warehousesLoading ? (
            <div className="grid grid-cols-2 gap-4 animate-pulse">
              <div className="h-32 bg-slate-200 rounded-xl" />
              <div className="h-32 bg-slate-200 rounded-xl" />
            </div>
          ) : (
            <ClientDashboard
              client={client}
              licenses={licenses}
              warehouses={warehouses}
              onWarehouseSelect={handleWarehouseSelect}
              onEditLicense={() => setLicenseModalOpen(true)}
              onLicenseUpdated={() => qc.invalidateQueries({ queryKey: ['licenses', id] })}
            />
          )
        ) : activeTab === 'checklist' ? (
          <LicensingChecklist
            client={client}
            license={licenses[0] ?? null}
            warehouses={warehouses}
          />
        ) : activeTab === 'report' ? (
          <ReportExport
            client={client}
            license={licenses[0] ?? null}
            warehouses={warehouses}
          />
        ) : (
          <WarehouseDocumentsSection
            clientId={id!}
            client={{
              name: client.name,
              inn: client.inn,
              kpp: client.kpp,
              ogrn: client.ogrn,
              legal_address: client.legal_address,
            }}
            clientInn={client.inn}
            clientDocs={clientDocs}
            onRefetchDocs={() => void refetchDocs()}
            onClientRefetch={() => {
              void qc.invalidateQueries({ queryKey: ['client', id] })
              void qc.invalidateQueries({ queryKey: ['clients'] })
            }}
            onConflictAfterUpload={handleConflictAfterUpload}
            highlightWarehouseId={highlightWarehouseId}
          />
        )}
      </main>

      {id && (
        <ConflictResolutionModal
          open={dataConflicts.modalOpen}
          clientId={id}
          conflicts={dataConflicts.conflicts}
          onClose={dataConflicts.closeModal}
          onResolve={dataConflicts.resolve}
        />
      )}

      <EditClientModal
        open={editClientOpen}
        client={client}
        saving={savingClient}
        onClose={() => setEditClientOpen(false)}
        onSave={handleSaveClient}
      />
      <EditLicenseModal
        open={licenseModalOpen}
        license={licenses[0] ?? null}
        saving={savingLicense}
        onClose={() => setLicenseModalOpen(false)}
        onSave={handleSaveLicense}
      />
    </>
  )
}

function AuthLoadingSkeleton() {
  return (
    <div className="min-h-screen bg-slate-50 animate-pulse">
      <div className="h-14 border-b border-slate-200 bg-white" />
      <main className="mx-auto max-w-6xl px-4 py-6 space-y-4">
        <div className="h-8 bg-slate-200 rounded w-1/3" />
        <div className="h-40 bg-slate-200 rounded-xl" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-28 bg-slate-200 rounded-xl" />
          <div className="h-28 bg-slate-200 rounded-xl" />
        </div>
      </main>
    </div>
  )
}

function LoginRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <AuthLoadingSkeleton />
  if (user) {
    const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/'
    return <Navigate to={from} replace />
  }

  const redirectTo =
    (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/'

  return <LoginPage redirectTo={redirectTo} />
}

function AppRoutes() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (isSupabaseConfigured) {
    if (loading) return <AuthLoadingSkeleton />
    if (!user) {
      return <Navigate to="/login" state={{ from: location }} replace />
    }
  }

  return (
    <>
      <OnboardingModal />
      <Routes>
        <Route path="/" element={<ClientsPage />} />
        <Route path="/clients/:id" element={<ClientWorkspace />} />
        <Route path="/checklists/:id" element={<ChecklistPage />} />
      </Routes>
      <DiagnosticsPanel />
    </>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginRoute />} />
              <Route path="*" element={<AppRoutes />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  )
}
