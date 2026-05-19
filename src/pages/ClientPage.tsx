import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { ru } from 'date-fns/locale'
import { Plus } from 'lucide-react'
import { Header } from '../components/Header'
import { ClientDashboard } from '../components/ClientDashboard'
import { ClientDocumentsTab } from '../components/ClientDocumentsTab'
import {
  ClientRequisitesForm,
  LicenseOperationFields,
  type ClientRequisitesFormState,
  type LicenseExtendedFormState,
} from '../components/ClientRequisitesForm'
import { NewChecklistModal } from '../components/NewChecklistModal'
import {
  fetchClient,
  fetchClientDocuments,
  fetchChecklists,
  fetchLicenses,
  fetchWarehouses,
  upsertClient,
  upsertLicense,
  createChecklist,
} from '../lib/api'
import { addRecentClient } from '../hooks/useRecentClients'
import { useDataConflicts } from '../hooks/useDataConflicts'
import { useToast } from '../context/ToastContext'
import { ConflictBadge } from '../components/ConflictBadge'
import { ConflictResolutionModal } from '../components/ConflictResolutionModal'
import { runConflictDetectionAfterUpload } from '../lib/conflictUpload'
import type { DetectConflictsParams } from '../lib/conflictDetector'
import { OPERATION_LABELS } from '../data/checklistItems'
import type { LicenseAddressJson, OperationType, ProductTypeFlag } from '../types'
import { setDiagnosticsClientName } from '../lib/diagnostics'
import { uid } from '../lib/localStore'

type Tab = 'overview' | 'documents' | 'checklists' | 'licenses' | 'history'

export function ClientPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { showToast } = useToast()
  const dataConflicts = useDataConflicts(id)
  const [tab, setTab] = useState<Tab>('overview')
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [highlightWarehouseId, setHighlightWarehouseId] = useState<string | null>(null)

  const { data: client, isLoading } = useQuery({
    queryKey: ['client', id],
    queryFn: () => fetchClient(id!),
    enabled: !!id,
  })

  const { data: checklists = [] } = useQuery({
    queryKey: ['checklists', id],
    queryFn: () => fetchChecklists(id),
    enabled: !!id,
  })

  const { data: licenses = [] } = useQuery({
    queryKey: ['licenses', id],
    queryFn: () => fetchLicenses(id),
    enabled: !!id,
  })

  const { data: warehouses = [] } = useQuery({
    queryKey: ['warehouses', id],
    queryFn: () => fetchWarehouses(id!),
    enabled: !!id,
  })

  const { data: clientDocs = [] } = useQuery({
    queryKey: ['client-documents', id],
    queryFn: () => fetchClientDocuments(id!),
    enabled: !!id,
  })

  const [form, setForm] = useState<ClientRequisitesFormState>({
    name: '',
    short_name: '',
    inn: '',
    kpp: '',
    ogrn: '',
    legal_address: '',
    director_last_name: '',
    director_first_name: '',
    director_middle_name: '',
    director_phone: '',
    representative_name: '',
    representative_poa: '',
    alcohol_over_15_pct: false,
    phone: '',
    email: '',
  })

  const [licenseForm, setLicenseForm] = useState<LicenseExtendedFormState>({
    license_number: '',
    issue_date: '',
    expiry_date: '',
    license_type: '',
    renewal_years: 5,
    payment_order_number: '',
    payment_order_date: '',
    reissue_reason: '',
    reissue_description: '',
  })
  const [checklistModalOp, setChecklistModalOp] = useState<OperationType | undefined>()
  const [licenseAddresses, setLicenseAddresses] = useState<LicenseAddressJson[]>([])

  useEffect(() => {
    if (!client) return
    setForm({
      name: client.name ?? '',
      short_name: client.short_name ?? '',
      inn: client.inn ?? '',
      kpp: client.kpp ?? '',
      ogrn: client.ogrn ?? '',
      legal_address: client.legal_address ?? '',
      director_last_name: client.director_last_name ?? '',
      director_first_name: client.director_first_name ?? '',
      director_middle_name: client.director_middle_name ?? '',
      director_phone: client.director_phone ?? '',
      representative_name: client.representative_name ?? '',
      representative_poa: client.representative_poa ?? '',
      alcohol_over_15_pct: client.alcohol_over_15_pct ?? false,
      phone: client.phone ?? '',
      email: client.email ?? '',
    })
  }, [client])

  useEffect(() => {
    const lic = licenses[0]
    if (!lic) return
    setLicenseForm({
      license_number: lic.license_number ?? '',
      issue_date: lic.issue_date ?? '',
      expiry_date: lic.expiry_date ?? '',
      license_type: lic.license_activity ?? lic.license_type ?? '',
      renewal_years: lic.renewal_years ?? 5,
      payment_order_number: lic.payment_order_number ?? '',
      payment_order_date: lic.payment_order_date ?? '',
      reissue_reason: lic.reissue_reason ?? '',
      reissue_description: lic.reissue_description ?? '',
    })
    setLicenseAddresses(lic.addresses ?? [])
  }, [licenses])

  useEffect(() => {
    if (id && client) {
      const displayName =
        client.short_name?.trim() || client.name?.trim() || client.inn?.trim() || id
      setDiagnosticsClientName(id, displayName)
      const hasActive = checklists.some((c) => c.status === 'active')
      addRecentClient(id, displayName, hasActive)
    }
  }, [id, client, checklists])

  const saveClient = async () => {
    if (!id) return
    setSaving(true)
    try {
      const directorFull = [
        form.director_last_name,
        form.director_first_name,
        form.director_middle_name,
      ]
        .filter(Boolean)
        .join(' ')

      await upsertClient({
        id,
        name: form.name,
        short_name: form.short_name || null,
        inn: form.inn || null,
        kpp: form.kpp || null,
        ogrn: form.ogrn || null,
        legal_address: form.legal_address || null,
        director_last_name: form.director_last_name || null,
        director_first_name: form.director_first_name || null,
        director_middle_name: form.director_middle_name || null,
        director_phone: form.director_phone || null,
        representative_name: form.representative_name || null,
        representative_poa: form.representative_poa || null,
        alcohol_over_15_pct: form.alcohol_over_15_pct,
        phone: form.phone || null,
        email: form.email || null,
        contact_person: directorFull || (client?.contact_person ?? null),
      })
      await qc.invalidateQueries({ queryKey: ['client', id] })
      await qc.invalidateQueries({ queryKey: ['clients'] })
      showToast('Сохранено')
    } catch {
      showToast('Ошибка сохранения', 'error')
    } finally {
      setSaving(false)
    }
  }

  const saveLicense = async () => {
    if (!id) return
    try {
      const existing = licenses[0]
      await upsertLicense({
        id: existing?.id ?? uid(),
        client_id: id,
        license_number: licenseForm.license_number || null,
        issue_date: licenseForm.issue_date || null,
        expiry_date: licenseForm.expiry_date || null,
        license_type: licenseForm.license_type || null,
        license_activity: licenseForm.license_type || null,
        renewal_years: licenseForm.renewal_years,
        payment_order_number: licenseForm.payment_order_number || null,
        payment_order_date: licenseForm.payment_order_date || null,
        reissue_reason: licenseForm.reissue_reason || null,
        reissue_description: licenseForm.reissue_description || null,
        addresses: licenseAddresses.length ? licenseAddresses : (existing?.addresses ?? []),
      })
      await qc.invalidateQueries({ queryKey: ['licenses', id] })
      showToast('Лицензия сохранена')
    } catch {
      showToast('Ошибка', 'error')
    }
  }

  const handleNewChecklist = async (op: OperationType, products: ProductTypeFlag[]) => {
    if (!id) return
    try {
      const cl = await createChecklist(id, op, products, licenses[0]?.id)
      setModalOpen(false)
      showToast('Чеклист создан')
      navigate(`/checklists/${cl.id}`)
    } catch {
      showToast('Ошибка создания', 'error')
    }
  }

  const requisitesEmpty = !form.inn && !form.ogrn && !form.name

  const licenseOperationContext = checklists.find(
    (c) =>
      c.status === 'active' &&
      (c.operation_type === 'ПРОДЛЕНИЕ' || c.operation_type === 'ПЕРЕОФОРМЛЕНИЕ'),
  )?.operation_type as 'ПРОДЛЕНИЕ' | 'ПЕРЕОФОРМЛЕНИЕ' | undefined

  if (isLoading) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-6xl px-4 py-6 overflow-x-hidden">
          <div className="space-y-4 animate-pulse">
            <div className="h-4 bg-slate-200 rounded w-48" />
            <div className="flex gap-2 overflow-hidden">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-10 bg-slate-200 rounded w-20 shrink-0" />
              ))}
            </div>
            <div className="h-40 bg-slate-200 rounded-xl" />
            <div className="grid grid-cols-2 gap-4">
              <div className="h-28 bg-slate-200 rounded-xl" />
              <div className="h-28 bg-slate-200 rounded-xl" />
            </div>
          </div>
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

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Обзор' },
    { key: 'documents', label: 'Документы' },
    { key: 'checklists', label: 'Чеклисты' },
    { key: 'licenses', label: 'Лицензии' },
    { key: 'history', label: 'История' },
  ]

  const openTab = (next: Tab) => {
    setTab(next)
    if (next !== 'documents') setHighlightWarehouseId(null)
  }

  const openWarehouse = (warehouseId: string) => {
    setHighlightWarehouseId(warehouseId)
    setTab('documents')
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

  return (
    <>
      <Header breadcrumb={client.name} />
      <main className="mx-auto max-w-6xl px-4 py-6 space-y-6 overflow-x-hidden">
        {dataConflicts.unresolvedCount > 0 && (
          <ConflictBadge
            count={dataConflicts.unresolvedCount}
            onClick={() => dataConflicts.openModal()}
          />
        )}
        <div className="-mx-4 px-4 overflow-x-auto">
          <div className="flex border-b border-slate-200 -mb-2 min-w-max sm:min-w-0 whitespace-nowrap">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => openTab(t.key)}
                className={`shrink-0 px-4 py-3 text-sm font-medium border-b-2 -mb-px min-h-[44px] ${
                  tab === t.key
                    ? 'border-brand-600 text-brand-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {tab === 'overview' ? (
          <ClientDashboard
            client={client}
            licenses={licenses}
            warehouses={warehouses}
            checklists={checklists}
            clientDocs={clientDocs}
            onOpenTab={(t) => openTab(t)}
            onWarehouseSelect={openWarehouse}
            onNewChecklist={() => setModalOpen(true)}
          />
        ) : tab === 'documents' ? (
          <ClientDocumentsTab
            clientId={id!}
            client={client}
            licenses={licenses}
            checklists={checklists}
            highlightWarehouseId={highlightWarehouseId}
            requisitesForm={form}
            onRequisitesChange={setForm}
            licenseExtendedForm={licenseForm}
            onLicenseExtendedChange={setLicenseForm}
            licenseOperationType={licenseOperationContext ?? null}
            onSuggestChecklist={(op) => {
              setChecklistModalOp(op)
              setModalOpen(true)
            }}
            onConflictAfterUpload={handleConflictAfterUpload}
            onApplied={async () => {
              await qc.invalidateQueries({ queryKey: ['client', id] })
              await qc.invalidateQueries({ queryKey: ['licenses', id] })
              await qc.invalidateQueries({ queryKey: ['client-documents', id] })
              const updated = await qc.fetchQuery({
                queryKey: ['client', id],
                queryFn: () => fetchClient(id!),
              })
              if (updated) {
                setForm({
                  name: updated.name ?? '',
                  short_name: updated.short_name ?? '',
                  inn: updated.inn ?? '',
                  kpp: updated.kpp ?? '',
                  ogrn: updated.ogrn ?? '',
                  legal_address: updated.legal_address ?? '',
                  director_last_name: updated.director_last_name ?? '',
                  director_first_name: updated.director_first_name ?? '',
                  director_middle_name: updated.director_middle_name ?? '',
                  director_phone: updated.director_phone ?? '',
                  representative_name: updated.representative_name ?? '',
                  representative_poa: updated.representative_poa ?? '',
                  alcohol_over_15_pct: updated.alcohol_over_15_pct ?? false,
                  phone: updated.phone ?? '',
                  email: updated.email ?? '',
                })
              }
              showToast('Данные сохранены')
            }}
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-3">
            <section className="lg:col-span-2 space-y-4">
              <ClientRequisitesForm
                form={form}
                setForm={setForm}
                requisitesEmpty={requisitesEmpty}
                saving={saving}
                onSave={() => void saveClient()}
              />
            </section>

            <section className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 min-h-[200px]">
                {tab === 'checklists' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setModalOpen(true)}
                      className="mb-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm text-white"
                    >
                      <Plus className="h-4 w-4" />
                      Новый чеклист
                    </button>
                    {checklists.length === 0 ? (
                      <p className="text-sm text-slate-500 text-center py-6">Нет чеклистов</p>
                    ) : (
                      <ul className="space-y-2">
                        {checklists.map((c) => (
                          <li key={c.id}>
                            <Link
                              to={`/checklists/${c.id}`}
                              className="block rounded-lg border border-slate-100 px-3 py-2 text-sm hover:bg-slate-50"
                            >
                              <span className="font-medium">
                                {OPERATION_LABELS[c.operation_type]}
                              </span>
                              <span className="block text-xs text-slate-400 mt-0.5">
                                {format(parseISO(c.created_at), 'd MMM yyyy', { locale: ru })}
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}

                {tab === 'licenses' && (
                  <div className="space-y-4">
                    {licenses.length === 0 && (
                      <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                        💡 Загрузите выписку из реестра лицензий на вкладке «Документы»
                      </p>
                    )}

                    {licenses.map((lic) => (
                      <div
                        key={lic.id}
                        className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-sm"
                      >
                        <p className="font-medium text-slate-900">
                          {lic.license_number ?? 'Без номера'}
                        </p>
                        {lic.license_activity && (
                          <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                            {lic.license_activity}
                          </p>
                        )}
                        {(lic.issue_date || lic.expiry_date) && (
                          <p className="text-xs text-slate-400 mt-1">
                            {lic.issue_date && format(parseISO(lic.issue_date), 'dd.MM.yyyy')}
                            {lic.issue_date && lic.expiry_date && ' — '}
                            {lic.expiry_date && format(parseISO(lic.expiry_date), 'dd.MM.yyyy')}
                          </p>
                        )}
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={() => {
                        setLicenseForm({
                          license_number: '',
                          issue_date: '',
                          expiry_date: '',
                          license_type: '',
                          renewal_years: 5,
                          payment_order_number: '',
                          payment_order_date: '',
                          reissue_reason: '',
                          reissue_description: '',
                        })
                        setLicenseAddresses([])
                      }}
                      className="w-full rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                    >
                      + Добавить лицензию
                    </button>

                    <div className="space-y-3 border-t border-slate-100 pt-3">
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                        Ручное редактирование
                      </p>
                      {(
                        [
                          ['license_number', 'Номер'],
                          ['issue_date', 'Дата выдачи'],
                          ['expiry_date', 'Дата окончания'],
                          ['license_type', 'Тип'],
                        ] as const
                      ).map(([key, label]) => (
                        <label key={key} className="block text-sm">
                          <span className="text-slate-600">{label}</span>
                          <input
                            type={key.includes('date') ? 'date' : 'text'}
                            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                            value={licenseForm[key]}
                            onChange={(e) =>
                              setLicenseForm((f) => ({ ...f, [key]: e.target.value }))
                            }
                          />
                        </label>
                      ))}
                      <LicenseOperationFields
                        operationType={licenseOperationContext ?? null}
                        form={licenseForm}
                        setForm={setLicenseForm}
                      />
                      <button
                        type="button"
                        onClick={() => void saveLicense()}
                        className="w-full rounded-lg border border-brand-600 text-brand-700 px-3 py-2 text-sm hover:bg-brand-50"
                      >
                        Сохранить лицензию
                      </button>
                    </div>
                  </div>
                )}

                {tab === 'history' && (
                  <ul className="space-y-2 text-sm text-slate-600">
                    {checklists.map((c) => (
                      <li key={c.id}>
                        {OPERATION_LABELS[c.operation_type]} —{' '}
                        {format(parseISO(c.updated_at), 'd MMM yyyy HH:mm', { locale: ru })}
                      </li>
                    ))}
                    {checklists.length === 0 && (
                      <p className="text-slate-400">История пуста</p>
                    )}
                  </ul>
                )}
              </div>
            </section>
          </div>
        )}
      </main>

      <NewChecklistModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
          setChecklistModalOp(undefined)
        }}
        initialOperationType={checklistModalOp}
        onCreate={(op, p) => {
          void handleNewChecklist(op, p)
          setChecklistModalOp(undefined)
        }}
      />

      {id && (
        <ConflictResolutionModal
          open={dataConflicts.modalOpen}
          clientId={id}
          conflicts={dataConflicts.conflicts}
          onClose={dataConflicts.closeModal}
          onResolve={dataConflicts.resolve}
        />
      )}
    </>
  )
}
