import { useCallback, useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { ru } from 'date-fns/locale'
import {
  Building2,
  Check,
  Eye,
  FileText,
  FolderOpen,
  Loader2,
  Trash2,
  X,
} from 'lucide-react'
import { parseEGRYLPdf } from '../lib/egrnParser'
import { parseLicenseFile } from '../lib/licenseParser'
import {
  deleteClientDocument,
  fetchClientDocuments,
  saveClientEgrnData,
  saveLicenseFromParsed,
  uploadClientDocument,
  upsertClient,
  upsertLicense,
} from '../lib/api'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { DataSource } from '../lib/conflictDetector'
import {
  applyFieldToEgryl,
  applyFieldToLicense,
  egrylToDataSource,
  licenseToDataSource,
  mergedToEgrylForm,
  mergedToLicenseForm,
} from '../lib/conflictMappers'
import { useDocumentConflicts } from '../hooks/useDocumentConflicts'
import { ConflictTable } from './ConflictTable'
import { ApplicationVerification } from './ApplicationVerification'
import { LicenseOperationFields, type ClientRequisitesFormState, type LicenseExtendedFormState } from './ClientRequisitesForm'
import { WarehouseDocumentsSection } from './WarehouseDocumentsSection'
import type {
  Client,
  ClientDocType,
  Document,
  License,
  ParsedEGRN,
  ParsedEGRYLData,
  ParsedLicenseData,
  Checklist,
  OperationType,
} from '../types'

const EMPTY_EGRN: ParsedEGRN = {
  address: '',
  cadastralNumber: '',
  ownerName: '',
  area: '',
  rightType: '',
  registrationDate: '',
}

const EMPTY_EGRYL: ParsedEGRYLData = {
  client: {
    fullName: '',
    shortName: '',
    ogrn: '',
    inn: '',
    kpp: '',
    legalAddress: '',
    registrationDate: '',
  },
  rawText: '',
}

const EMPTY_LICENSE: ParsedLicenseData = {
  licenseNumber: '',
  inn: '',
  kpp: '',
  issueDate: '',
  expiryDate: '',
  licenseActivity: '',
  licenseStatus: '',
  branches: [],
  format: 'registry_table',
  rawText: '',
}

const isLocalhost =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')

const DOC_TYPE_LABELS: Record<string, string> = {
  egryl: 'ЕГРЮЛ',
  license: 'Лицензия',
  egrn: 'ЕГРН',
  rental: 'Договор аренды',
  tech_plan: 'Технический план',
  op_notification: 'Уведомление ОП',
  application_verification: 'Сверка заявления',
}

type ZoneKey = 'egryl' | 'license'

interface ZoneState {
  fileName: string | null
  loading: boolean
  error: string | null
  uploaded: boolean
}

const INITIAL_ZONE: ZoneState = {
  fileName: null,
  loading: false,
  error: null,
  uploaded: false,
}

function fieldInputClass(unresolved: boolean, extra = '') {
  return `mt-1 w-full rounded-md border px-3 py-2 text-sm ${extra} ${
    unresolved ? 'border-red-500 ring-1 ring-red-200' : 'border-slate-300'
  }`
}

function FormField({
  label,
  badge,
  children,
}: {
  label: string
  badge: string | null
  children: ReactNode
}) {
  return (
    <label className="block text-sm">
      <span className="text-slate-600">
        {label}
        {badge && <span className="ml-2 text-xs font-normal text-slate-500">{badge}</span>}
      </span>
      {children}
    </label>
  )
}

interface ClientDocumentsTabProps {
  clientId: string
  client: Client
  licenses: License[]
  checklists: Checklist[]
  requisitesForm: ClientRequisitesFormState
  onRequisitesChange: Dispatch<SetStateAction<ClientRequisitesFormState>>
  licenseExtendedForm: LicenseExtendedFormState
  onLicenseExtendedChange: Dispatch<SetStateAction<LicenseExtendedFormState>>
  licenseOperationType: 'ПРОДЛЕНИЕ' | 'ПЕРЕОФОРМЛЕНИЕ' | null
  onSuggestChecklist?: (operation: OperationType) => void
  onApplied: () => void
  highlightWarehouseId?: string | null
}

export function ClientDocumentsTab({
  clientId,
  client,
  licenses,
  checklists,
  requisitesForm,
  onRequisitesChange,
  licenseExtendedForm,
  onLicenseExtendedChange,
  licenseOperationType,
  onSuggestChecklist,
  onApplied,
  highlightWarehouseId,
}: ClientDocumentsTabProps) {
  const qc = useQueryClient()
  const existingLicenseId = licenses[0]?.id

  const [zones, setZones] = useState<Record<ZoneKey, ZoneState>>({
    egryl: { ...INITIAL_ZONE },
    license: { ...INITIAL_ZONE },
  })
  const [egrylForm, setEgrylForm] = useState<ParsedEGRYLData>(EMPTY_EGRYL)
  const [licenseForm, setLicenseForm] = useState<ParsedLicenseData>(EMPTY_LICENSE)
  const [egrnForm, setEgrnForm] = useState<ParsedEGRN>(EMPTY_EGRN)
  const [parsedSources, setParsedSources] = useState<DataSource[]>([])
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)

  const { data: clientDocs = [], refetch: refetchDocs } = useQuery({
    queryKey: ['client-documents', clientId],
    queryFn: () => fetchClientDocuments(clientId),
  })

  const {
    conflicts,
    selectedByField,
    unresolvedFieldKeys,
    manualOverrides,
    addSource,
    handleConflictSelect,
    markManual,
    isUnresolved,
    getBadge,
    hasConflicts,
  } = useDocumentConflicts(parsedSources, setParsedSources)

  const setZone = (key: ZoneKey, patch: Partial<ZoneState>) => {
    setZones((z) => ({ ...z, [key]: { ...z[key], ...patch } }))
  }

  const onConflictResolve = useCallback(
    (fieldKey: string, value: string) => {
      handleConflictSelect(fieldKey, value)
      applyFieldToEgryl(fieldKey, value, setEgrylForm)
      applyFieldToLicense(fieldKey, value, setLicenseForm)
    },
    [handleConflictSelect],
  )

  const clearZone = (key: ZoneKey) => {
    setZone(key, { ...INITIAL_ZONE })
    if (key === 'egryl') {
      setEgrylForm(EMPTY_EGRYL)
      setParsedSources((prev) => prev.filter((s) => s.sourceName !== 'ЕГРЮЛ'))
    } else if (key === 'license') {
      setLicenseForm(EMPTY_LICENSE)
      setParsedSources((prev) => prev.filter((s) => s.sourceName === 'ЕГРЮЛ'))
    }
  }

  useEffect(() => {
    if (client.egrn_data) {
      setEgrnForm({ ...EMPTY_EGRN, ...client.egrn_data })
    }
  }, [client.egrn_data])

  const handleEgrylFile = async (file: File) => {
    setZone('egryl', { loading: true, error: null, fileName: file.name })
    try {
      const ext = file.name.split('.').pop()?.toLowerCase()
      if (ext !== 'pdf') throw new Error('Выписка ЕГРЮЛ поддерживается только в формате PDF')
      const result = await parseEGRYLPdf(file)
      const source = egrylToDataSource(result)
      addSource(source, (merged) =>
        setEgrylForm((prev) => mergedToEgrylForm(merged, { ...prev, ...result })),
      )
      await uploadClientDocument(clientId, file, 'egryl', { client: result.client, license: result.license })
      setZone('egryl', { loading: false, uploaded: true })
      void refetchDocs()
    } catch (e) {
      setZone('egryl', {
        loading: false,
        error: e instanceof Error ? e.message : 'Ошибка парсинга',
        uploaded: false,
        fileName: null,
      })
    }
  }

  const handleLicenseFile = async (file: File) => {
    setZone('license', { loading: true, error: null, fileName: file.name })
    try {
      const result = await parseLicenseFile(file)
      const source = licenseToDataSource(result)
      addSource(source, (merged) =>
        setLicenseForm((prev) => mergedToLicenseForm(merged, { ...prev, ...result })),
      )
      await uploadClientDocument(clientId, file, 'license', result as unknown as Record<string, unknown>)
      setZone('license', { loading: false, uploaded: true })
      void refetchDocs()
    } catch (e) {
      setZone('license', {
        loading: false,
        error: e instanceof Error ? e.message : 'Ошибка парсинга',
        uploaded: false,
        fileName: null,
      })
    }
  }

  const handleApplicationConflictSource = (source: DataSource) => {
    addSource(source, (merged) => {
      onRequisitesChange((prev) => ({
        ...prev,
        name: merged.fullName ?? prev.name,
        short_name: merged.shortName ?? prev.short_name,
        inn: merged.inn ?? prev.inn,
        kpp: merged.kpp ?? prev.kpp,
        ogrn: merged.ogrn ?? prev.ogrn,
        legal_address: merged.legalAddress ?? prev.legal_address,
      }))
      setLicenseForm((prev) => mergedToLicenseForm(merged, prev))
    })
  }

  const hasEgrylData = zones.egryl.uploaded || !!egrylForm.client.inn || !!egrylForm.client.fullName
  const hasLicenseData =
    zones.license.uploaded || !!licenseForm.licenseNumber || !!egrylForm.license?.licenseNumber
  const hasEgrnData = !!egrnForm.address || !!egrnForm.cadastralNumber
  const hasAnyParsed = hasEgrylData || hasLicenseData || hasEgrnData

  const licenseFromEgryl = egrylForm.license
  const showLicenseSection = hasLicenseData
  const showBranches = licenseForm.branches.length > 0
  const showEgrnSection = hasEgrnData

  const getLicenseDataForSave = (): ParsedLicenseData | null => {
    if (zones.license.uploaded || licenseForm.licenseNumber) {
      return licenseForm
    }
    if (licenseFromEgryl?.licenseNumber) {
      return {
        ...EMPTY_LICENSE,
        licenseNumber: licenseFromEgryl.licenseNumber,
        issueDate: licenseFromEgryl.issueDate,
        expiryDate: licenseFromEgryl.expiryDate,
        licenseActivity: licenseFromEgryl.licenseActivity,
        inn: egrylForm.client.inn,
        kpp: egrylForm.client.kpp,
        fullName: egrylForm.client.fullName,
        legalAddress: egrylForm.client.legalAddress,
        licenseStatus: '',
        branches: [],
        format: 'registry_table',
        rawText: '',
      }
    }
    return null
  }

  const handleApplyAll = async () => {
    if (hasConflicts && unresolvedFieldKeys.size > 0) {
      setApplyError('Разрешите все расхождения перед сохранением')
      return
    }
    setApplying(true)
    setApplyError(null)
    try {
      const clientName =
        egrylForm.client.fullName ||
        egrylForm.client.shortName ||
        licenseForm.fullName ||
        client.name

      const directorFull = [
        requisitesForm.director_last_name,
        requisitesForm.director_first_name,
        requisitesForm.director_middle_name,
      ]
        .filter(Boolean)
        .join(' ')

      if (hasEgrylData || hasLicenseData) {
        await upsertClient({
          id: clientId,
          name: clientName || requisitesForm.name,
          short_name: requisitesForm.short_name || egrylForm.client.shortName || null,
          inn: egrylForm.client.inn || licenseForm.inn || requisitesForm.inn || client.inn,
          kpp: egrylForm.client.kpp || licenseForm.kpp || requisitesForm.kpp || client.kpp,
          ogrn: egrylForm.client.ogrn || requisitesForm.ogrn || client.ogrn,
          legal_address:
            egrylForm.client.legalAddress ||
            licenseForm.legalAddress ||
            requisitesForm.legal_address ||
            client.legal_address,
          director_last_name: requisitesForm.director_last_name || null,
          director_first_name: requisitesForm.director_first_name || null,
          director_middle_name: requisitesForm.director_middle_name || null,
          director_phone: requisitesForm.director_phone || null,
          representative_name: requisitesForm.representative_name || null,
          representative_poa: requisitesForm.representative_poa || null,
          alcohol_over_15_pct: requisitesForm.alcohol_over_15_pct,
          contact_person: directorFull || client.contact_person,
          phone: requisitesForm.phone || client.phone,
          email: requisitesForm.email || client.email,
          egrn_data: hasEgrnData ? egrnForm : client.egrn_data ?? null,
        })
      } else if (hasEgrnData) {
        await saveClientEgrnData(clientId, egrnForm, {
          name: clientName,
          inn: client.inn,
          kpp: client.kpp,
          ogrn: client.ogrn,
          legal_address: client.legal_address,
          contact_person: directorFull || client.contact_person,
          phone: requisitesForm.phone || client.phone,
          email: requisitesForm.email || client.email,
        })
      }

      const licenseData = getLicenseDataForSave()
      if (licenseData?.licenseNumber) {
        await saveLicenseFromParsed(clientId, licenseData, existingLicenseId)
        if (licenseOperationType) {
          await upsertLicense({
            id: existingLicenseId ?? licenses[0]?.id ?? undefined,
            client_id: clientId,
            license_number: licenseData.licenseNumber,
            renewal_years: licenseExtendedForm.renewal_years,
            payment_order_number: licenseExtendedForm.payment_order_number || null,
            payment_order_date: licenseExtendedForm.payment_order_date || null,
            reissue_reason: licenseExtendedForm.reissue_reason || null,
            reissue_description: licenseExtendedForm.reissue_description || null,
          })
        }
      }

      await qc.invalidateQueries({ queryKey: ['client', clientId] })
      await qc.invalidateQueries({ queryKey: ['licenses', clientId] })
      await qc.invalidateQueries({ queryKey: ['clients'] })
      onApplied()
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : 'Ошибка сохранения')
    } finally {
      setApplying(false)
    }
  }

  const handleViewDoc = async (doc: Document) => {
    if (!doc.storage_path) return
    if (!isSupabaseConfigured || !supabase) return
    const { data } = await supabase.storage
      .from('documents')
      .createSignedUrl(doc.storage_path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  const handleDeleteDoc = async (doc: Document) => {
    if (!window.confirm(`Удалить файл «${doc.filename}»?`)) return
    await deleteClientDocument(doc)
    void refetchDocs()
    void qc.invalidateQueries({ queryKey: ['client-documents', clientId] })
  }

  return (
    <div className="space-y-6">
      {isLocalhost && (
        <div
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          ⚠️ Загрузка файлов в облако недоступна в Firefox на localhost. Используйте Chrome, или
          задеплойте приложение на Vercel.
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="flex items-center gap-2 font-semibold text-slate-900 mb-4">
          <FolderOpen className="h-5 w-5 text-brand-600" />
          Загрузка документов
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <UploadZone
            title="ЕГРЮЛ"
            subtitle="реквизиты"
            accept=".pdf"
            formats="PDF"
            icon={<Building2 className="h-7 w-7 text-slate-400" />}
            zone={zones.egryl}
            onFile={(f) => void handleEgrylFile(f)}
            onClear={() => clearZone('egryl')}
          />
          <UploadZone
            title="Реестр лицензий"
            subtitle="лицензия"
            accept=".docx,.pdf"
            formats="PDF, DOCX"
            icon={<FileText className="h-7 w-7 text-slate-400" />}
            zone={zones.license}
            onFile={(f) => void handleLicenseFile(f)}
            onClear={() => clearZone('license')}
          />
        </div>
      </div>

      <WarehouseDocumentsSection
        clientId={clientId}
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
        onRequisitesUpdated={(patch) => {
          onRequisitesChange((prev) => ({
            ...prev,
            name: patch.name ?? prev.name,
            inn: patch.inn ?? prev.inn,
            kpp: patch.kpp ?? prev.kpp,
            ogrn: patch.ogrn ?? prev.ogrn,
            legal_address: patch.legal_address ?? prev.legal_address,
          }))
        }}
        onClientRefetch={onApplied}
        onConflictSource={(source) => addSource(source)}
        onEgrnSummaryChange={(egrn) => {
          if (egrn) setEgrnForm({ ...EMPTY_EGRN, ...egrn })
        }}
        highlightWarehouseId={highlightWarehouseId}
      />

      {hasAnyParsed && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-5">
          {hasConflicts && (
            <ConflictTable
              conflicts={conflicts}
              onResolve={onConflictResolve}
              selectedByField={selectedByField}
              manualFieldKeys={manualOverrides}
              unresolvedFieldKeys={unresolvedFieldKeys}
            />
          )}

          {(hasEgrylData || hasLicenseData) && (
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-slate-800 border-b border-slate-100 pb-1 w-full">
                📋 Реквизиты организации
              </legend>
              <FormField label="Полное наименование" badge={getBadge('fullName')}>
                <input
                  className={fieldInputClass(isUnresolved('fullName'))}
                  value={egrylForm.client.fullName || licenseForm.fullName || ''}
                  onChange={(e) => {
                    markManual('fullName')
                    setEgrylForm((f) => ({
                      ...f,
                      client: { ...f.client, fullName: e.target.value },
                    }))
                    setLicenseForm((f) => ({ ...f, fullName: e.target.value }))
                  }}
                />
              </FormField>
              <FormField label="Краткое наименование" badge={getBadge('shortName')}>
                <input
                  className={fieldInputClass(isUnresolved('shortName'))}
                  value={egrylForm.client.shortName}
                  onChange={(e) => {
                    markManual('shortName')
                    setEgrylForm((f) => ({
                      ...f,
                      client: { ...f.client, shortName: e.target.value },
                    }))
                  }}
                />
              </FormField>
              <div className="grid gap-3 sm:grid-cols-3">
                <FormField label="ОГРН" badge={getBadge('ogrn')}>
                  <input
                    className={fieldInputClass(isUnresolved('ogrn'))}
                    value={egrylForm.client.ogrn}
                    onChange={(e) => {
                      markManual('ogrn')
                      setEgrylForm((f) => ({
                        ...f,
                        client: { ...f.client, ogrn: e.target.value },
                      }))
                    }}
                  />
                </FormField>
                <FormField label="ИНН" badge={getBadge('inn')}>
                  <input
                    className={fieldInputClass(isUnresolved('inn'))}
                    value={egrylForm.client.inn || licenseForm.inn}
                    onChange={(e) => {
                      markManual('inn')
                      setEgrylForm((f) => ({
                        ...f,
                        client: { ...f.client, inn: e.target.value },
                      }))
                      setLicenseForm((f) => ({ ...f, inn: e.target.value }))
                    }}
                  />
                </FormField>
                <FormField label="КПП" badge={getBadge('kpp')}>
                  <input
                    className={fieldInputClass(isUnresolved('kpp'))}
                    value={egrylForm.client.kpp || licenseForm.kpp}
                    onChange={(e) => {
                      markManual('kpp')
                      setEgrylForm((f) => ({
                        ...f,
                        client: { ...f.client, kpp: e.target.value },
                      }))
                      setLicenseForm((f) => ({ ...f, kpp: e.target.value }))
                    }}
                  />
                </FormField>
              </div>
              <FormField label="Юридический адрес" badge={getBadge('legalAddress')}>
                <textarea
                  className={fieldInputClass(isUnresolved('legalAddress'))}
                  rows={2}
                  value={egrylForm.client.legalAddress || licenseForm.legalAddress || ''}
                  onChange={(e) => {
                    markManual('legalAddress')
                    setEgrylForm((f) => ({
                      ...f,
                      client: { ...f.client, legalAddress: e.target.value },
                    }))
                    setLicenseForm((f) => ({ ...f, legalAddress: e.target.value }))
                  }}
                />
              </FormField>
              <div className="grid gap-3 sm:grid-cols-3">
                {(
                  [
                    ['director_last_name', 'Фамилия руководителя'],
                    ['director_first_name', 'Имя'],
                    ['director_middle_name', 'Отчество'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="block text-sm">
                    <span className="text-slate-600">{label}</span>
                    <input
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={requisitesForm[key]}
                      onChange={(e) =>
                        onRequisitesChange((f) => ({ ...f, [key]: e.target.value }))
                      }
                    />
                  </label>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="text-slate-600">Email</span>
                  <input
                    type="email"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={requisitesForm.email}
                    onChange={(e) =>
                      onRequisitesChange((f) => ({ ...f, email: e.target.value }))
                    }
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-slate-600">Телефон</span>
                  <input
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={requisitesForm.phone}
                    onChange={(e) =>
                      onRequisitesChange((f) => ({ ...f, phone: e.target.value }))
                    }
                  />
                </label>
              </div>
            </fieldset>
          )}

          {showLicenseSection && (
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-slate-800 border-b border-slate-100 pb-1 w-full">
                📄 Данные лицензии
              </legend>
              <FormField label="Номер" badge={getBadge('licenseNumber')}>
                <input
                  className={fieldInputClass(isUnresolved('licenseNumber'))}
                  value={
                    licenseForm.licenseNumber || licenseFromEgryl?.licenseNumber || ''
                  }
                  onChange={(e) => {
                    markManual('licenseNumber')
                    setLicenseForm((f) => ({ ...f, licenseNumber: e.target.value }))
                    setEgrylForm((f) =>
                      f.license
                        ? { ...f, license: { ...f.license, licenseNumber: e.target.value } }
                        : f,
                    )
                  }}
                />
              </FormField>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Дата начала" badge={getBadge('issueDate')}>
                  <input
                    type="date"
                    className={fieldInputClass(isUnresolved('issueDate'))}
                    value={licenseForm.issueDate || licenseFromEgryl?.issueDate || ''}
                    onChange={(e) => {
                      markManual('issueDate')
                      setLicenseForm((f) => ({ ...f, issueDate: e.target.value }))
                    }}
                  />
                </FormField>
                <FormField label="Дата окончания" badge={getBadge('expiryDate')}>
                  <input
                    type="date"
                    className={fieldInputClass(isUnresolved('expiryDate'))}
                    value={licenseForm.expiryDate || licenseFromEgryl?.expiryDate || ''}
                    onChange={(e) => {
                      markManual('expiryDate')
                      setLicenseForm((f) => ({ ...f, expiryDate: e.target.value }))
                    }}
                  />
                </FormField>
              </div>
              <FormField label="Вид деятельности" badge={getBadge('licenseActivity')}>
                <textarea
                  className={fieldInputClass(isUnresolved('licenseActivity'))}
                  rows={2}
                  value={
                    licenseForm.licenseActivity || licenseFromEgryl?.licenseActivity || ''
                  }
                  onChange={(e) => {
                    markManual('licenseActivity')
                    setLicenseForm((f) => ({ ...f, licenseActivity: e.target.value }))
                  }}
                />
              </FormField>
              <label className="block text-sm">
                <span className="text-slate-600">Статус</span>
                <input
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={licenseForm.licenseStatus}
                  onChange={(e) =>
                    setLicenseForm((f) => ({ ...f, licenseStatus: e.target.value }))
                  }
                />
              </label>
              <LicenseOperationFields
                operationType={licenseOperationType}
                form={licenseExtendedForm}
                setForm={onLicenseExtendedChange}
              />
              <label className="block text-sm">
                <span className="text-slate-600">Орган</span>
                <input
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={licenseFromEgryl?.licenseAuthority ?? ''}
                  onChange={(e) =>
                    setEgrylForm((f) =>
                      f.license
                        ? { ...f, license: { ...f.license, licenseAuthority: e.target.value } }
                        : f,
                    )
                  }
                />
              </label>
            </fieldset>
          )}

          {showBranches && (
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-slate-800 border-b border-slate-100 pb-1 w-full">
                🏭 Обособленные подразделения
              </legend>
              <div className="overflow-x-auto rounded-md border border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-600">
                      <th className="px-3 py-2 w-28">КПП</th>
                      <th className="px-3 py-2">Адрес</th>
                    </tr>
                  </thead>
                  <tbody>
                    {licenseForm.branches.map((branch, idx) => {
                      const bKey = `branch:${branch.kpp}`
                      return (
                        <tr key={`${branch.kpp}-${idx}`} className="border-b border-slate-50">
                          <td className="px-3 py-2 align-top font-mono text-xs">{branch.kpp}</td>
                          <td className="px-3 py-2">
                            <textarea
                              className={fieldInputClass(isUnresolved(bKey))}
                              rows={2}
                              value={branch.address}
                              onChange={(e) => {
                                markManual(bKey)
                                setLicenseForm((f) => {
                                  const branches = [...f.branches]
                                  branches[idx] = { ...branches[idx], address: e.target.value }
                                  return { ...f, branches }
                                })
                              }}
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </fieldset>
          )}

          {showEgrnSection && (
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-slate-800 border-b border-slate-100 pb-1 w-full">
                🏢 Складское помещение (ЕГРН)
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="text-slate-600">Кадастровый номер</span>
                  <input
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={egrnForm.cadastralNumber}
                    onChange={(e) =>
                      setEgrnForm((f) => ({ ...f, cadastralNumber: e.target.value }))
                    }
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-slate-600">Площадь (кв.м)</span>
                  <input
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={egrnForm.area ?? ''}
                    onChange={(e) => setEgrnForm((f) => ({ ...f, area: e.target.value }))}
                  />
                </label>
              </div>
              <label className="block text-sm">
                <span className="text-slate-600">Адрес</span>
                <textarea
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  rows={2}
                  value={egrnForm.address}
                  onChange={(e) => setEgrnForm((f) => ({ ...f, address: e.target.value }))}
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">Вид права</span>
                <input
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={egrnForm.rightType ?? ''}
                  onChange={(e) => setEgrnForm((f) => ({ ...f, rightType: e.target.value }))}
                />
              </label>
            </fieldset>
          )}

          {applyError && <p className="text-sm text-red-600">{applyError}</p>}

          <button
            type="button"
            disabled={applying}
            onClick={() => void handleApplyAll()}
            className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {applying ? 'Сохранение…' : 'Применить все данные'}
          </button>
        </div>
      )}


      <ApplicationVerification
        clientId={clientId}
        client={client}
        license={licenses[0] ?? null}
        branches={licenseForm.branches}
        checklists={checklists}
        onConflictSource={handleApplicationConflictSource}
        onApplied={onApplied}
        onSuggestChecklist={onSuggestChecklist}
      />

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">Загруженные файлы</h3>
        {clientDocs.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-4">Нет загруженных файлов</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                  <th className="pb-2 pr-3 font-medium">Файл</th>
                  <th className="pb-2 pr-3 font-medium">Тип</th>
                  <th className="pb-2 pr-3 font-medium">Загружен</th>
                  <th className="pb-2 font-medium text-right">Действия</th>
                </tr>
              </thead>
              <tbody>
                {clientDocs.map((doc) => (
                  <tr key={doc.id} className="border-b border-slate-50 last:border-0">
                    <td className="py-2 pr-3 max-w-[200px] truncate" title={doc.filename}>
                      {doc.filename}
                    </td>
                    <td className="py-2 pr-3 text-slate-600">
                      {DOC_TYPE_LABELS[(doc.doc_type as ClientDocType) ?? 'egryl'] ??
                        doc.doc_type ??
                        '—'}
                    </td>
                    <td className="py-2 pr-3 text-slate-600 whitespace-nowrap">
                      {format(parseISO(doc.uploaded_at), 'dd.MM.yyyy', { locale: ru })}
                    </td>
                    <td className="py-2 text-right">
                      <div className="inline-flex gap-1">
                        <button
                          type="button"
                          disabled={!doc.storage_path}
                          onClick={() => void handleViewDoc(doc)}
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-brand-600 disabled:opacity-40 disabled:pointer-events-none"
                          title={doc.storage_path ? 'Просмотр' : 'Файл не сохранён в облаке'}
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteDoc(doc)}
                          className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                          title="Удалить"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function UploadZone({
  title,
  subtitle,
  accept,
  formats,
  icon,
  zone,
  onFile,
  onClear,
}: {
  title: string
  subtitle: string
  accept: string
  formats: string
  icon: ReactNode
  zone: ZoneState
  onFile: (file: File) => void
  onClear: () => void
}) {
  const [dragging, setDragging] = useState(false)

  const dropClass = `relative rounded-xl border-2 border-dashed p-4 text-center transition-colors min-h-[140px] flex flex-col items-center justify-center ${
    dragging ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-slate-50'
  }`

  return (
    <div>
      <p className="text-sm font-medium text-slate-800 mb-0.5">{title}</p>
      <p className="text-xs text-slate-500 mb-2">({subtitle})</p>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const file = e.dataTransfer.files[0]
          if (file) onFile(file)
        }}
        className={dropClass}
      >
        {zone.uploaded && zone.fileName && (
          <button
            type="button"
            onClick={onClear}
            className="absolute top-2 right-2 rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
            title="Удалить и загрузить снова"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {zone.loading ? (
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        ) : zone.uploaded && zone.fileName ? (
          <>
            <Check className="h-7 w-7 text-green-600" />
            <p className="mt-2 text-xs font-medium text-slate-700 truncate max-w-full px-2">
              {zone.fileName}
            </p>
          </>
        ) : (
          <>
            {icon}
            <p className="mt-2 text-xs text-slate-500">{formats}</p>
            <p className="mt-1 text-xs text-slate-600">
              Перетащите или{' '}
              <label className="cursor-pointer font-medium text-brand-600 hover:underline">
                выберите
                <input
                  type="file"
                  accept={accept}
                  className="hidden"
                  disabled={zone.loading}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) onFile(f)
                    e.target.value = ''
                  }}
                />
              </label>
            </p>
          </>
        )}
      </div>
      {zone.error && <p className="mt-1 text-xs text-red-600">{zone.error}</p>}
    </div>
  )
}
