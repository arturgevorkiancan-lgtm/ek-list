import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { ru } from 'date-fns/locale'
import {
  BookOpen,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Factory,
  FileText,
  Loader2,
  Map,
  Pencil,
  Plus,
  Thermometer,
  Trash2,
  Upload,
  Warehouse as WarehouseIcon,
  X,
} from 'lucide-react'
import { parseEGRNFile } from '../lib/egrnParser'
import { parseRentalFile } from '../lib/rentalParser'
import { parseTechPlanFile } from '../lib/techPlanParser'
import { parseOPNotificationPdf } from '../lib/opNotificationParser'
import {
  deleteClientDocument,
  deleteWarehouse,
  fetchLicenseAddresses,
  fetchLicenses,
  fetchRentalContracts,
  fetchStorageReadings,
  fetchWarehouses,
  syncOfflineReadings,
  saveRentalFromParsed,
  uploadClientDocument,
  upsertWarehouse,
  type StorageReading,
  type WarehouseWithProducts,
} from '../lib/api'
import { useToast } from '../context/ToastContext'
import {
  defaultWarehouseExpanded,
  hasSuspiciousWarehouseName,
  readBoolStorage,
  warehouseExpandedKey,
  warehouseSectionKey,
  writeBoolStorage,
  type WarehouseSectionId,
} from '../lib/collapsibleStorage'
import { CopyOnClick } from './CopyOnClick'
import { OrganizationEgrylBlock } from './OrganizationEgrylBlock'
import { RegistryBlock } from './RegistryBlock'
import { RegistryWarehousesPanel } from './RegistryWarehousesPanel'
import { WarehouseDataUpdateModal } from './WarehouseDataUpdateModal'
import { parseWarehouseDocumentFile } from '../lib/parseWarehouseDocument'
import type { ParsedWarehouseDocumentFields } from '../lib/parseWarehouseDocument'
import type { ClientRequisitesSnapshot } from '../lib/egrylRequisites'
import { StorageComplianceChecklist } from './StorageComplianceChecklist'
import { StorageJournal, parseProductTypes } from './StorageJournal'
import { GOST_DATA, StorageStandardsCard } from './StorageStandardsCard'
import { computeSafeRange } from '../lib/storageUtils'
import {
  getWarehouseReadingStats,
  type WarehouseReadingStats,
} from '../lib/warehouseReadingStats'
import { opNotificationToDataSource } from '../lib/conflictMappers'
import type { DataSource, DetectConflictsParams } from '../lib/conflictDetector'
import {
  egrnParsedToFields,
  techPlanParsedToFields,
  warehouseDocFieldsToMap,
} from '../lib/conflictSourceData'
import type {
  Document,
  LicenseAddress,
  ParsedEGRN,
  ParsedOPNotification,
  Warehouse,
} from '../types'

type WarehouseDocType = 'egrn' | 'rental' | 'tech_plan'

const WAREHOUSE_DOC_META: Record<
  WarehouseDocType,
  { title: string; subtitle: string; accept: string; formats: string }
> = {
  egrn: {
    title: 'ЕГРН',
    subtitle: 'объект',
    accept: '.pdf,.docx',
    formats: 'PDF, DOCX',
  },
  rental: {
    title: 'Договор аренды',
    subtitle: 'аренда',
    accept: '.pdf,.docx',
    formats: 'PDF, DOCX',
  },
  tech_plan: {
    title: 'Технический план',
    subtitle: 'техплан',
    accept: '.pdf,.xml',
    formats: 'PDF, XML',
  },
}

interface WarehouseDocumentsSectionProps {
  clientId: string
  client: ClientRequisitesSnapshot
  clientInn?: string | null
  clientDocs: Document[]
  onRefetchDocs: () => void
  onRequisitesUpdated?: (patch: Partial<ClientRequisitesSnapshot>) => void
  onClientRefetch?: () => void
  onConflictSource?: (source: DataSource) => void
  onConflictAfterUpload?: (params: DetectConflictsParams) => Promise<void>
  onEgrnSummaryChange?: (egrn: ParsedEGRN | null) => void
  highlightWarehouseId?: string | null
}

type KppSuggestion = {
  warehouseId: string
  warehouseName: string
  kpp: string
  source: 'egrn' | 'op'
}

function normalizeCadastral(value: string): string {
  return value.replace(/\s/g, '').trim()
}

/** Strip leading "Склад " for card header only; stored name is unchanged. */
function displayWarehouseName(name: string): string {
  return name.replace(/^склад\s+/i, '')
}

function buildBulkStorageCsv(
  rows: { warehouseName: string; reading: StorageReading }[],
): string {
  const header = [
    'Склад',
    'Дата',
    'Время',
    'Температура (°C)',
    'Влажность (%)',
    'Кто замерял',
    'Примечания',
  ]
  const dataRows = rows.map(({ warehouseName, reading: r }) => {
    const dt = parseISO(r.recorded_at)
    return [
      warehouseName,
      format(dt, 'dd.MM.yyyy', { locale: ru }),
      format(dt, 'HH:mm', { locale: ru }),
      String(r.temperature),
      String(r.humidity),
      r.recorded_by ?? '',
      r.notes ?? '',
    ]
  })
  return [header, ...dataRows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
    .join('\n')
}

function findKppByCadastral(
  cadastral: string,
  addresses: LicenseAddress[],
): string | null {
  const norm = normalizeCadastral(cadastral)
  if (!norm) return null
  const match = addresses.find(
    (a) =>
      a.kpp &&
      a.cadastral_number &&
      normalizeCadastral(a.cadastral_number) === norm,
  )
  return match?.kpp?.trim() || null
}

function WarehouseUploadZone({
  title,
  subtitle,
  accept,
  formats,
  icon,
  fileName,
  loading,
  onFile,
  onClear,
}: {
  title: string
  subtitle: string
  accept: string
  formats: string
  icon: ReactNode
  fileName: string | null
  loading: boolean
  onFile: (file: File) => void
  onClear: () => void
}) {
  const [dragging, setDragging] = useState(false)
  const uploaded = !!fileName

  const dropClass = `relative rounded-lg border-2 border-dashed p-3 text-center transition-colors min-h-[120px] flex flex-col items-center justify-center ${
    dragging ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-white'
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
          if (file && !loading) onFile(file)
        }}
        className={dropClass}
      >
        {uploaded && (
          <button
            type="button"
            onClick={onClear}
            className="absolute top-2 right-2 text-xs text-slate-500 hover:text-red-600"
            title="Удалить и загрузить снова"
          >
            × удалить
          </button>
        )}

        {loading ? (
          <Loader2 className="h-7 w-7 animate-spin text-brand-600" />
        ) : uploaded && fileName ? (
          <>
            <Check className="h-6 w-6 text-green-600 shrink-0" />
            <p className="mt-2 text-xs font-medium text-slate-700 truncate max-w-full px-2">
              {fileName}
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
                  disabled={loading}
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
    </div>
  )
}

function WarehouseOpUploadZone({
  loading,
  notifications,
  onFile,
  onRemove,
}: {
  loading: boolean
  notifications: Document[]
  onFile: (file: File) => void
  onRemove: (doc: Document) => void
}) {
  const [dragging, setDragging] = useState(false)

  const dropClass = `relative rounded-lg border-2 border-dashed p-3 text-center transition-colors min-h-[120px] flex flex-col items-center justify-center ${
    dragging ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-white'
  }`

  const handleDrop = (file: File | undefined) => {
    if (file && !loading) onFile(file)
  }

  return (
    <div>
      <p className="text-sm font-medium text-slate-800 mb-0.5">Уведомление ОП</p>
      <p className="text-xs text-slate-500 mb-2">(постановка на учёт)</p>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          handleDrop(e.dataTransfer.files[0])
        }}
        className={dropClass}
      >
        {loading ? (
          <Loader2 className="h-7 w-7 animate-spin text-brand-600" />
        ) : (
          <>
            <FileText className="h-6 w-6 text-slate-400" />
            <p className="mt-2 text-xs text-slate-500">PDF</p>
            <p className="mt-1 text-xs text-slate-600">
              Перетащите или{' '}
              <label className="cursor-pointer font-medium text-brand-600 hover:underline">
                выберите
                <input
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  disabled={loading}
                  onChange={(e) => {
                    handleDrop(e.target.files?.[0])
                    e.target.value = ''
                  }}
                />
              </label>
            </p>
          </>
        )}
      </div>
      {notifications.length > 0 && (
        <ul className="space-y-1 text-sm mt-2">
          {notifications.map((d) => {
            const parsed = (d.parsed_data ?? {}) as unknown as ParsedOPNotification
            return (
              <li key={d.id} className="flex items-center gap-2 text-slate-700">
                <span className="min-w-0 truncate">
                  📄 {d.filename} → КПП: {parsed.kppOP || '—'}
                </span>
                {parsed.kppOP && <Check className="h-4 w-4 text-green-600 shrink-0" />}
                <button
                  type="button"
                  onClick={() => onRemove(d)}
                  className="ml-auto shrink-0 text-slate-400 hover:text-red-600 text-lg leading-none"
                  title="Удалить"
                >
                  ×
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

const WAREHOUSE_SECTIONS: WarehouseSectionId[] = [
  'documents',
  'journal',
  'compliance',
  'gost',
]

const COMPLIANCE_TOTAL = 14

function countComplianceDone(warehouseId: string): number {
  try {
    const raw = localStorage.getItem(`compliance_${warehouseId}`)
    const state = raw ? (JSON.parse(raw) as Record<string, { status?: string }>) : {}
    return Object.values(state).filter((x) => x.status === 'done').length
  } catch {
    return 0
  }
}

function getLatestJournalLabel(warehouseId: string): string {
  try {
    const raw = localStorage.getItem(`storage_readings_${warehouseId}`)
    const readings: { recorded_at: string }[] = raw ? JSON.parse(raw) : []
    if (readings.length === 0) return 'нет записей'
    let latest: string | null = null
    for (const r of readings) {
      if (!latest || r.recorded_at > latest) latest = r.recorded_at
    }
    if (!latest) return 'нет записей'
    return format(parseISO(latest), 'dd.MM.yyyy', { locale: ru })
  } catch {
    return 'нет записей'
  }
}

function countWarehouseFiles(warehouseId: string, clientDocs: Document[]): number {
  return clientDocs.filter((d) => d.warehouse_id === warehouseId).length
}

function formatGostSubtitle(productTypes: ReturnType<typeof parseProductTypes>): string {
  if (productTypes.length === 0) return 'не выбрано'
  return productTypes.map((k) => GOST_DATA[k].label).join(', ')
}

function warehouseStatusBadge(stats: WarehouseReadingStats | undefined): {
  text: string
  className: string
} {
  if (!stats || stats.count30 === 0) {
    return { text: 'нет записей', className: 'bg-slate-100 text-slate-600' }
  }
  if (stats.stale24h) {
    return { text: 'запись устарела', className: 'bg-orange-100 text-orange-800' }
  }
  return { text: 'активен', className: 'bg-emerald-100 text-emerald-800' }
}

function WarehouseNestedSection({
  icon,
  title,
  subtitle,
  expanded,
  onToggle,
  children,
}: {
  icon: ReactNode
  title: string
  subtitle: string
  expanded: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-slate-50"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
        )}
        <span className="shrink-0 text-brand-600">{icon}</span>
        <span className="font-medium text-slate-900 min-w-0 truncate">{title}</span>
        <span className="ml-auto text-xs text-slate-500 shrink-0 pl-2">{subtitle}</span>
      </button>
      {expanded && <div className="border-t border-slate-100 p-3">{children}</div>}
    </div>
  )
}

export function WarehouseDocumentsSection({
  clientId,
  client,
  clientInn,
  clientDocs,
  onRefetchDocs,
  onRequisitesUpdated,
  onClientRefetch,
  onConflictSource,
  onConflictAfterUpload,
  onEgrnSummaryChange,
  highlightWarehouseId,
}: WarehouseDocumentsSectionProps) {
  const qc = useQueryClient()
  const { showToast } = useToast()
  const [modalOpen, setModalOpen] = useState(false)
  const [newName, setNewName] = useState('')

  useEffect(() => {
    if (!modalOpen) return
    const onEsc = () => setModalOpen(false)
    window.addEventListener('checklist:escape', onEsc)
    return () => window.removeEventListener('checklist:escape', onEsc)
  }, [modalOpen])
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState<Record<string, boolean>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [warehouseExpanded, setWarehouseExpanded] = useState<Record<string, boolean>>({})
  const [sectionExpanded, setSectionExpanded] = useState<Record<string, boolean>>({})
  const [kppSuggestion, setKppSuggestion] = useState<KppSuggestion | null>(null)

  const [opContext, setOpContext] = useState<{
    warehouseId: string
    parsed: ParsedOPNotification
    file: File
  } | null>(null)
  const [opApplyKpp, setOpApplyKpp] = useState(true)
  const [opLoadingWarehouseId, setOpLoadingWarehouseId] = useState<string | null>(null)
  const [bulkExporting, setBulkExporting] = useState(false)
  const [readingStats, setReadingStats] = useState<Record<string, WarehouseReadingStats>>({})
  const [confirmDeleteWarehouseId, setConfirmDeleteWarehouseId] = useState<string | null>(null)
  const [deletingWarehouseId, setDeletingWarehouseId] = useState<string | null>(null)
  const [dataUpdateModal, setDataUpdateModal] = useState<{
    warehouse: WarehouseWithProducts
    parsed: ParsedWarehouseDocumentFields
  } | null>(null)
  const [dataUpdateSaving, setDataUpdateSaving] = useState(false)
  const [dataUpdateLoadingId, setDataUpdateLoadingId] = useState<string | null>(null)
  const [dataUpdateWarehouseId, setDataUpdateWarehouseId] = useState<string | null>(null)
  const dataUpdateInputRef = useRef<HTMLInputElement>(null)

  const {
    data: warehouses = [],
    isLoading: warehousesLoading,
    error: warehousesError,
    refetch: refetchWarehouses,
  } = useQuery({
    queryKey: ['warehouses', clientId],
    queryFn: () => fetchWarehouses(clientId),
  })

  const warehousesErrorMessage =
    warehousesError instanceof Error
      ? warehousesError.message
      : warehousesError
        ? String(warehousesError)
        : ''

  const { data: rentals = [] } = useQuery({
    queryKey: ['rental-contracts', clientId],
    queryFn: () => fetchRentalContracts(clientId),
  })

  const { data: licenses = [] } = useQuery({
    queryKey: ['licenses', clientId],
    queryFn: () => fetchLicenses(clientId),
  })

  const licenseIdsKey = licenses.map((l) => l.id).join(',')

  const { data: licenseAddresses = [] } = useQuery({
    queryKey: ['license-addresses-all', clientId, licenseIdsKey],
    queryFn: async () => {
      const rows: LicenseAddress[] = []
      for (const lic of licenses) {
        const fromTable = await fetchLicenseAddresses(lic.id)
        rows.push(...fromTable)
        for (const b of lic.addresses ?? []) {
          if (b.kpp || b.cadastral_number) {
            rows.push({
              id: `${lic.id}-${b.kpp ?? b.cadastral_number}`,
              license_id: lic.id,
              address: b.address,
              kpp: b.kpp ?? null,
              notes: null,
              cadastral_number: b.cadastral_number ?? null,
              area_sqm: b.area_sqm != null ? Number(b.area_sqm) : null,
              floor: b.floor ?? null,
              room_number: b.room_number ?? null,
              object_purpose: b.object_purpose ?? null,
              additional_address_info: b.additional_address_info ?? null,
            })
          }
        }
      }
      return rows
    },
    enabled: licenses.length > 0,
  })

  useEffect(() => {
    const stats: Record<string, WarehouseReadingStats> = {}
    for (const w of warehouses) {
      stats[w.id] = getWarehouseReadingStats(w.id)
    }
    setReadingStats(stats)
  }, [warehouses])

  useEffect(() => {
    if (warehouses.length === 0) return
    const syncAll = async () => {
      for (const w of warehouses) {
        await syncOfflineReadings(w.id)
        void qc.invalidateQueries({ queryKey: ['storage-readings', w.id] })
      }
    }
    void syncAll()

    const onOnline = () => void syncAll()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [warehouses, qc])

  useEffect(() => {
    if (warehouses.length === 0) return
    const nextWarehouse: Record<string, boolean> = {}
    const nextSection: Record<string, boolean> = {}
    warehouses.forEach((w, index) => {
      const defaultExpanded = defaultWarehouseExpanded(warehouses.length, index)
      nextWarehouse[w.id] = readBoolStorage(warehouseExpandedKey(w.id), defaultExpanded)
      for (const section of WAREHOUSE_SECTIONS) {
        const sectionKey = `${w.id}_${section}`
        nextSection[sectionKey] = readBoolStorage(
          warehouseSectionKey(w.id, section),
          false,
        )
      }
    })
    setWarehouseExpanded(nextWarehouse)
    setSectionExpanded(nextSection)
  }, [warehouses])

  useEffect(() => {
    if (!highlightWarehouseId) return
    setWarehouseExpanded((prev) => {
      const next = { ...prev, [highlightWarehouseId]: true }
      writeBoolStorage(warehouseExpandedKey(highlightWarehouseId), true)
      return next
    })
    const el = document.getElementById(`warehouse-${highlightWarehouseId}`)
    if (el) {
      window.setTimeout(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    }
  }, [highlightWarehouseId])

  const docsForWarehouse = (warehouseId: string, docType: WarehouseDocType) =>
    clientDocs.find((d) => d.warehouse_id === warehouseId && d.doc_type === docType)

  const opDocsForWarehouse = (warehouseId: string) =>
    clientDocs.filter(
      (d) => d.doc_type === 'op_notification' && d.warehouse_id === warehouseId,
    )

  const rentalForWarehouse = (warehouseId: string) =>
    rentals.find((r) => r.warehouse_id === warehouseId)

  const uploadKey = (warehouseId: string, docType: string) => `${warehouseId}:${docType}`

  const isWarehouseExpanded = (warehouseId: string) => warehouseExpanded[warehouseId] ?? false

  const toggleWarehouseExpanded = (warehouseId: string) => {
    setWarehouseExpanded((prev) => {
      const nextVal = !prev[warehouseId]
      writeBoolStorage(warehouseExpandedKey(warehouseId), nextVal)
      return { ...prev, [warehouseId]: nextVal }
    })
  }

  const isSectionExpanded = (warehouseId: string, section: WarehouseSectionId) =>
    sectionExpanded[`${warehouseId}_${section}`] ?? false

  const toggleSectionExpanded = (warehouseId: string, section: WarehouseSectionId) => {
    const mapKey = `${warehouseId}_${section}`
    setSectionExpanded((prev) => {
      const nextVal = !prev[mapKey]
      writeBoolStorage(warehouseSectionKey(warehouseId, section), nextVal)
      return { ...prev, [mapKey]: nextVal }
    })
  }

  const handleAddWarehouse = async () => {
    if (!newName.trim()) return
    setSaving(true)
    try {
      await upsertWarehouse({
        client_id: clientId,
        name: newName.trim(),
      })
      setNewName('')
      setModalOpen(false)
      void refetchWarehouses()
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : 'Не удалось сохранить склад',
        'error',
      )
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteWarehouse = async (w: WarehouseWithProducts) => {
    setDeletingWarehouseId(w.id)
    try {
      await deleteWarehouse(w.id)
      setConfirmDeleteWarehouseId(null)
      void refetchWarehouses()
      void qc.invalidateQueries({ queryKey: ['warehouses', clientId] })
      onRefetchDocs()
      showToast('Склад удалён')
    } catch {
      showToast('Ошибка удаления склада', 'error')
    } finally {
      setDeletingWarehouseId(null)
    }
  }

  const handleSaveName = async (w: WarehouseWithProducts) => {
    if (!editName.trim()) return
    await upsertWarehouse({ ...w, name: editName.trim() })
    setEditingId(null)
    void refetchWarehouses()
  }

  const suggestKppForWarehouse = (
    warehouseId: string,
    kpp: string,
    source: KppSuggestion['source'],
  ) => {
    const w = warehouses.find((x) => x.id === warehouseId)
    if (!w || w.kpp || !kpp.trim()) return
    setKppSuggestion({
      warehouseId,
      warehouseName: w.name,
      kpp: kpp.trim(),
      source,
    })
  }

  const applyKppSuggestion = async () => {
    if (!kppSuggestion) return
    const w = warehouses.find((x) => x.id === kppSuggestion.warehouseId)
    if (!w) return
    await upsertWarehouse({ ...w, kpp: kppSuggestion.kpp })
    setKppSuggestion(null)
    void refetchWarehouses()
  }

  const applyEgrnToWarehouse = async (warehouseId: string, egrn: ParsedEGRN) => {
    const w = warehouses.find((x) => x.id === warehouseId)
    if (!w) return
    await upsertWarehouse({
      ...w,
      address: egrn.address || w.address,
      cadastral_number: egrn.cadastralNumber || w.cadastral_number,
      area_sqm: egrn.area ? Number(String(egrn.area).replace(',', '.')) : w.area_sqm,
    })
    if (warehouses[0]?.id === warehouseId) {
      onEgrnSummaryChange?.(egrn)
    }
    if (egrn.cadastralNumber && !w.kpp) {
      const matchedKpp = findKppByCadastral(egrn.cadastralNumber, licenseAddresses)
      if (matchedKpp) {
        suggestKppForWarehouse(warehouseId, matchedKpp, 'egrn')
      }
    }
    void qc.invalidateQueries({ queryKey: ['warehouses', clientId] })
  }

  const handleWarehouseUpload = async (
    warehouseId: string,
    docType: WarehouseDocType,
    file: File,
  ) => {
    const key = uploadKey(warehouseId, docType)
    setUploading((u) => ({ ...u, [key]: true }))
    try {
      if (docType === 'egrn') {
        const result = await parseEGRNFile(file)
        await uploadClientDocument(
          clientId,
          file,
          'egrn',
          result as unknown as Record<string, unknown>,
          warehouseId,
        )
        await onConflictAfterUpload?.({
          clientId,
          warehouseId,
          newData: egrnParsedToFields(result),
          newSource: 'egrn',
        })
        await applyEgrnToWarehouse(warehouseId, result)
      } else if (docType === 'rental') {
        const result = await parseRentalFile(file)
        await uploadClientDocument(
          clientId,
          file,
          'rental',
          result as unknown as Record<string, unknown>,
          warehouseId,
        )
        if (!result.isProbablyScan) {
          await saveRentalFromParsed(clientId, result, undefined, warehouseId)
          const w = warehouses.find((x) => x.id === warehouseId)
          if (w && (result.address || result.areaSqm)) {
            await upsertWarehouse({
              ...w,
              address: result.address || w.address,
              area_sqm: result.areaSqm ?? w.area_sqm,
            })
          }
        }
      } else {
        const result = await parseTechPlanFile(file)
        await uploadClientDocument(
          clientId,
          file,
          'tech_plan',
          result as unknown as Record<string, unknown>,
          warehouseId,
        )
        await onConflictAfterUpload?.({
          clientId,
          warehouseId,
          newData: techPlanParsedToFields(result),
          newSource: 'techplan',
        })
        const w = warehouses.find((x) => x.id === warehouseId)
        if (w) {
          await upsertWarehouse({
            ...w,
            cadastral_number: result.cadastralNumber ?? w.cadastral_number,
            area_sqm: result.area ?? w.area_sqm,
            floor: result.floor ?? w.floor,
            room_number: result.roomNumber ?? w.room_number,
            object_purpose: result.purpose ?? w.object_purpose,
            address: result.address ?? w.address,
          })
          if (result.cadastralNumber && !w.kpp) {
            const matchedKpp = findKppByCadastral(result.cadastralNumber, licenseAddresses)
            if (matchedKpp) {
              suggestKppForWarehouse(warehouseId, matchedKpp, 'egrn')
            }
          }
        }
      }
      onRefetchDocs()
      void refetchWarehouses()
      void qc.invalidateQueries({ queryKey: ['rental-contracts', clientId] })
    } finally {
      setUploading((u) => ({ ...u, [key]: false }))
    }
  }

  const openDataUpdatePicker = (warehouseId: string) => {
    setDataUpdateWarehouseId(warehouseId)
    dataUpdateInputRef.current?.click()
  }

  const handleDataUpdateFile = async (warehouseId: string, file: File) => {
    setDataUpdateLoadingId(warehouseId)
    try {
      const parsed = await parseWarehouseDocumentFile(file)
      const w = warehouses.find((x) => x.id === warehouseId)
      if (!w) return
      setDataUpdateModal({ warehouse: w, parsed })
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : 'Ошибка разбора документа',
        'error',
      )
    } finally {
      setDataUpdateLoadingId(null)
      setDataUpdateWarehouseId(null)
    }
  }

  const applyDataUpdate = async (patch: Partial<Warehouse>) => {
    if (!dataUpdateModal) return
    setDataUpdateSaving(true)
    try {
      const docFields = warehouseDocFieldsToMap(dataUpdateModal.parsed)
      const source =
        dataUpdateModal.parsed.cadastral_number && dataUpdateModal.parsed.floor != null
          ? 'techplan'
          : 'egrn'
      if (Object.keys(docFields).length > 0) {
        await onConflictAfterUpload?.({
          clientId,
          warehouseId: dataUpdateModal.warehouse.id,
          newData: docFields,
          newSource: source,
        })
      }
      await upsertWarehouse({ ...dataUpdateModal.warehouse, ...patch })
      setDataUpdateModal(null)
      showToast('Данные склада обновлены')
      void refetchWarehouses()
      void qc.invalidateQueries({ queryKey: ['warehouses', clientId] })
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : 'Не удалось обновить склад',
        'error',
      )
    } finally {
      setDataUpdateSaving(false)
    }
  }

  const handleClearDoc = async (doc: Document) => {
    if (!window.confirm(`Удалить файл «${doc.filename}»?`)) return
    await deleteClientDocument(doc)
    onRefetchDocs()
  }

  const handleOpFile = async (warehouseId: string, file: File) => {
    setOpLoadingWarehouseId(warehouseId)
    try {
      const parsed = await parseOPNotificationPdf(file)
      setOpContext({ warehouseId, parsed, file })
      setOpApplyKpp(true)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Ошибка парсинга')
    } finally {
      setOpLoadingWarehouseId(null)
    }
  }

  const opTargetWarehouse = useMemo(() => {
    if (!opContext?.parsed.kppOP) return null
    const w = warehouses.find((x) => x.id === opContext.warehouseId)
    if (!w || w.kpp) return null
    return w
  }, [opContext, warehouses])

  const confirmOpNotification = async () => {
    if (!opContext) return
    const { warehouseId, parsed, file } = opContext
    setOpLoadingWarehouseId(warehouseId)
    try {
      if (onConflictSource) {
        onConflictSource(opNotificationToDataSource(parsed))
      }

      const w = warehouses.find((x) => x.id === warehouseId)
      if (w) {
        const updates: Partial<Warehouse> = {}
        if (parsed.opAddress && !w.address) {
          updates.address = parsed.opAddress
        }
        if (opApplyKpp && parsed.kppOP && !w.kpp) {
          updates.kpp = parsed.kppOP
        }
        if (Object.keys(updates).length > 0) {
          await upsertWarehouse({ ...w, ...updates })
        }
      }

      await uploadClientDocument(
        clientId,
        file,
        'op_notification',
        parsed as unknown as Record<string, unknown>,
        warehouseId,
      )

      setOpContext(null)
      setOpApplyKpp(true)
      onRefetchDocs()
      void refetchWarehouses()
    } finally {
      setOpLoadingWarehouseId(null)
    }
  }

  const docIcons: Record<WarehouseDocType, ReactNode> = {
    egrn: <Map className="h-6 w-6 text-slate-400" />,
    rental: <FileText className="h-6 w-6 text-slate-400" />,
    tech_plan: <Upload className="h-6 w-6 text-slate-400" />,
  }

  const handleBulkExport = async () => {
    if (warehouses.length === 0) return
    setBulkExporting(true)
    try {
      const batches = await Promise.all(
        warehouses.map(async (w) => ({
          warehouseName: w.name,
          readings: await fetchStorageReadings(w.id),
        })),
      )
      const combined = batches.flatMap(({ warehouseName, readings }) =>
        readings.map((reading) => ({ warehouseName, reading })),
      )
      if (combined.length === 0) {
        showToast('Нет данных для экспорта')
        return
      }
      combined.sort((a, b) => b.reading.recorded_at.localeCompare(a.reading.recorded_at))
      const csv = buildBulkStorageCsv(combined)
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `Журнал_хранения_все_склады_${format(new Date(), 'yyyy-MM-dd')}.csv`
      link.click()
      URL.revokeObjectURL(url)
    } finally {
      setBulkExporting(false)
    }
  }

  return (
    <>
    <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 overflow-x-hidden">
      <OrganizationEgrylBlock
        clientId={clientId}
        client={client}
        clientDocs={clientDocs}
        onRefetchDocs={onRefetchDocs}
        onRequisitesUpdated={onRequisitesUpdated}
        onClientRefetch={onClientRefetch}
        onConflictAfterUpload={onConflictAfterUpload}
      />

      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold text-slate-900">
          <Factory className="h-5 w-5 text-brand-600" />
          Складские помещения
        </h2>
        <div className="flex items-center gap-2 shrink-0">
          {warehouses.length > 0 && (
            <button
              type="button"
              disabled={bulkExporting}
              onClick={() => void handleBulkExport()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {bulkExporting && <Loader2 className="h-4 w-4 animate-spin" />}
              📥 Экспорт всех журналов
            </button>
          )}
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1 min-h-[44px] rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-100"
          >
            <Plus className="h-4 w-4" />
            Добавить склад
          </button>
        </div>
      </div>

      {kppSuggestion && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm flex flex-wrap items-center justify-between gap-2">
          <p className="text-amber-900">
            Установить КПП <span className="font-mono font-medium">{kppSuggestion.kpp}</span> для
            склада «{kppSuggestion.warehouseName}»?
            {kppSuggestion.source === 'egrn' && (
              <span className="block text-xs text-amber-700 mt-0.5">
                Найдено по кадастровому номеру в реестре лицензий
              </span>
            )}
          </p>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void applyKppSuggestion()}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs text-white hover:bg-brand-700"
            >
              Установить
            </button>
            <button
              type="button"
              onClick={() => setKppSuggestion(null)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
            >
              Пропустить
            </button>
          </div>
        </div>
      )}

      {warehousesError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Ошибка загрузки складов. Проверьте подключение к базе данных.
          <br />
          <code className="text-xs">{warehousesErrorMessage}</code>
        </div>
      ) : warehousesLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 animate-pulse">
          <div className="h-40 rounded-xl bg-slate-200" />
          <div className="h-40 rounded-xl bg-slate-200" />
        </div>
      ) : warehouses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-16 px-6 text-center">
          <p className="text-4xl mb-4" aria-hidden>
            🏭
          </p>
          <h3 className="text-lg font-semibold text-slate-900">Нет складов</h3>
          <p className="mt-2 text-sm text-slate-500 max-w-sm mx-auto">
            Добавьте склад для отслеживания условий хранения
          </p>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="mt-6 inline-flex items-center justify-center min-h-[44px] rounded-lg bg-brand-600 px-5 text-sm font-medium text-white hover:bg-brand-700"
          >
            Добавить склад
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {warehouses.map((w) => {
            const rental = rentalForWarehouse(w.id)
            const displayAddress = w.address || rental?.address || '—'
            const displayKpp = w.kpp || '—'
            const displayArea =
              w.area_sqm != null ? `${w.area_sqm} кв.м` : '—'
            const expanded = isWarehouseExpanded(w.id)
            const productTypes = parseProductTypes(w.product_types)
            const safeRange = computeSafeRange(productTypes)
            const statusBadge = warehouseStatusBadge(readingStats[w.id])
            const fileCount = countWarehouseFiles(w.id, clientDocs)
            const complianceDone = countComplianceDone(w.id)
            const suspiciousName = hasSuspiciousWarehouseName(w.name)

            return (
              <div
                key={w.id}
                id={`warehouse-${w.id}`}
                className={`rounded-lg border bg-slate-50/50 overflow-hidden scroll-mt-24 ${
                  highlightWarehouseId === w.id
                    ? 'border-brand-400 ring-2 ring-brand-200'
                    : 'border-slate-200'
                }`}
              >
                <div className="p-4 space-y-2">
                  {confirmDeleteWarehouseId === w.id ? (
                    <div className="space-y-2">
                      <p className="text-sm text-slate-700">
                        Удалить склад? Все документы и журнал будут удалены.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={deletingWarehouseId === w.id}
                          onClick={() => void handleDeleteWarehouse(w)}
                          className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          Да, удалить
                        </button>
                        <button
                          type="button"
                          disabled={deletingWarehouseId === w.id}
                          onClick={() => setConfirmDeleteWarehouseId(null)}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          Отмена
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => toggleWarehouseExpanded(w.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        {editingId === w.id ? (
                          <div
                            className="flex gap-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              className="rounded-md border border-slate-300 px-2 py-1 text-sm font-medium"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') void handleSaveName(w)
                              }}
                            />
                            <button
                              type="button"
                              className="text-brand-600 text-sm"
                              onClick={() => void handleSaveName(w)}
                            >
                              OK
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex flex-wrap items-center gap-2">
                              {expanded ? (
                                <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
                              ) : (
                                <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
                              )}
                              <WarehouseIcon className="h-4 w-4 text-brand-600 shrink-0" />
                              <span className="font-semibold text-slate-900">
                                {displayWarehouseName(w.name)}
                              </span>
                              {suspiciousName && (
                                <span
                                  className="text-amber-600"
                                  title="Проверьте название склада"
                                >
                                  ⚠️
                                </span>
                              )}
                              <span className="text-sm text-slate-600 font-normal">
                                КПП:{' '}
                                {w.kpp ? (
                                  <CopyOnClick text={w.kpp} label="КПП скопирован">
                                    {displayKpp}
                                  </CopyOnClick>
                                ) : (
                                  displayKpp
                                )}
                              </span>
                            </div>
                            <p className="mt-1 pl-6 text-xs text-slate-600 flex flex-wrap items-center gap-x-1 gap-y-0.5">
                              {displayAddress !== '—' ? (
                                <CopyOnClick text={displayAddress} label="Адрес скопирован">
                                  {displayAddress}
                                </CopyOnClick>
                              ) : (
                                <span>{displayAddress}</span>
                              )}
                              <span className="text-slate-400">·</span>
                              <span>{displayArea}</span>
                              <span className="text-slate-400">·</span>
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${statusBadge.className}`}
                              >
                                {statusBadge.text}
                              </span>
                            </p>
                            {expanded && (w.cadastral_number || rental?.rent_end) && (
                              <p className="text-xs text-slate-500 mt-1 pl-6">
                                {w.cadastral_number && <>КН: {w.cadastral_number}</>}
                                {w.cadastral_number && rental?.rent_end && ' · '}
                                {rental?.rent_end && (
                                  <>
                                    Аренда до{' '}
                                    {format(parseISO(rental.rent_end), 'dd.MM.yyyy', {
                                      locale: ru,
                                    })}
                                  </>
                                )}
                              </p>
                            )}
                          </>
                        )}
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          className="rounded p-1.5 text-slate-500 hover:bg-white"
                          title="Редактировать название"
                          onClick={() => {
                            setEditingId(w.id)
                            setEditName(w.name)
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                          title="Удалить склад"
                          onClick={() => setConfirmDeleteWarehouseId(w.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {expanded && confirmDeleteWarehouseId !== w.id && (
                  <div className="border-t border-slate-200 px-4 pb-4 pt-3 space-y-2">
                    <WarehouseNestedSection
                      icon={<FileText className="h-4 w-4" />}
                      title="Документы склада"
                      subtitle={`${fileCount} файлов`}
                      expanded={isSectionExpanded(w.id, 'documents')}
                      onToggle={() => toggleSectionExpanded(w.id, 'documents')}
                    >
                      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        {(['egrn', 'rental', 'tech_plan'] as WarehouseDocType[]).map(
                          (docType) => {
                            const meta = WAREHOUSE_DOC_META[docType]
                            const doc = docsForWarehouse(w.id, docType)
                            const key = uploadKey(w.id, docType)
                            const loading = uploading[key]
                            return (
                              <WarehouseUploadZone
                                key={docType}
                                title={meta.title}
                                subtitle={meta.subtitle}
                                accept={meta.accept}
                                formats={meta.formats}
                                icon={docIcons[docType]}
                                fileName={doc?.filename ?? null}
                                loading={loading}
                                onFile={(f) => void handleWarehouseUpload(w.id, docType, f)}
                                onClear={() => {
                                  if (doc) void handleClearDoc(doc)
                                }}
                              />
                            )
                          },
                        )}
                        <WarehouseOpUploadZone
                          loading={opLoadingWarehouseId === w.id}
                          notifications={opDocsForWarehouse(w.id)}
                          onFile={(f) => void handleOpFile(w.id, f)}
                          onRemove={(doc) => void handleClearDoc(doc)}
                        />
                      </div>

                      <div className="pt-2">
                        <button
                          type="button"
                          disabled={dataUpdateLoadingId === w.id}
                          onClick={() => openDataUpdatePicker(w.id)}
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 min-h-[44px]"
                        >
                          {dataUpdateLoadingId === w.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <FileText className="h-4 w-4 text-brand-600" />
                          )}
                          Обновить данные из документа
                        </button>
                      </div>

                    {opContext?.warehouseId === w.id && (
                      <div className="rounded-lg border border-brand-200 bg-brand-50/50 p-4 space-y-3 text-sm">
                        <p className="font-medium text-slate-800">
                          Подтвердите данные уведомления
                        </p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className="block">
                            <span className="text-slate-600">КПП ОП</span>
                            <input
                              className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
                              value={opContext.parsed.kppOP}
                              onChange={(e) =>
                                setOpContext({
                                  ...opContext,
                                  parsed: { ...opContext.parsed, kppOP: e.target.value },
                                })
                              }
                            />
                          </label>
                          <label className="block">
                            <span className="text-slate-600">Дата постановки</span>
                            <input
                              className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
                              value={opContext.parsed.registrationDate ?? ''}
                              onChange={(e) =>
                                setOpContext({
                                  ...opContext,
                                  parsed: {
                                    ...opContext.parsed,
                                    registrationDate: e.target.value,
                                  },
                                })
                              }
                            />
                          </label>
                        </div>
                        <label className="block">
                          <span className="text-slate-600">Адрес ОП</span>
                          <textarea
                            className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
                            rows={2}
                            value={opContext.parsed.opAddress}
                            onChange={(e) =>
                              setOpContext({
                                ...opContext,
                                parsed: { ...opContext.parsed, opAddress: e.target.value },
                              })
                            }
                          />
                        </label>
                        {opTargetWarehouse && opContext.parsed.kppOP && (
                          <div className="rounded-md border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-900">
                            <label className="flex items-start gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                className="mt-1"
                                checked={opApplyKpp}
                                onChange={(e) => setOpApplyKpp(e.target.checked)}
                              />
                              <span>
                                Установить КПП{' '}
                                <span className="font-mono font-medium">
                                  {opContext.parsed.kppOP}
                                </span>{' '}
                                для склада «{displayWarehouseName(opTargetWarehouse.name)}»?
                              </span>
                            </label>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={opLoadingWarehouseId === w.id}
                            onClick={() => void confirmOpNotification()}
                            className="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700 disabled:opacity-50"
                          >
                            Подтвердить
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setOpContext(null)
                              setOpApplyKpp(true)
                            }}
                            className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
                          >
                            Отмена
                          </button>
                        </div>
                      </div>
                    )}

                    </WarehouseNestedSection>

                    <WarehouseNestedSection
                      icon={<Thermometer className="h-4 w-4" />}
                      title="Журнал хранения"
                      subtitle={`последняя запись: ${getLatestJournalLabel(w.id)}`}
                      expanded={isSectionExpanded(w.id, 'journal')}
                      onToggle={() => toggleSectionExpanded(w.id, 'journal')}
                    >
                      <StorageJournal
                        warehouseId={w.id}
                        clientId={clientId}
                        warehouseName={w.name}
                        safeRange={safeRange}
                      />
                    </WarehouseNestedSection>

                    <WarehouseNestedSection
                      icon={<CheckSquare className="h-4 w-4" />}
                      title="Условия хранения"
                      subtitle={`${complianceDone}/${COMPLIANCE_TOTAL} выполнено`}
                      expanded={isSectionExpanded(w.id, 'compliance')}
                      onToggle={() => toggleSectionExpanded(w.id, 'compliance')}
                    >
                      <StorageComplianceChecklist
                        warehouseId={w.id}
                        warehouseName={w.name}
                        productTypes={productTypes}
                      />
                    </WarehouseNestedSection>

                    <WarehouseNestedSection
                      icon={<BookOpen className="h-4 w-4" />}
                      title="Требования ГОСТ"
                      subtitle={formatGostSubtitle(productTypes)}
                      expanded={isSectionExpanded(w.id, 'gost')}
                      onToggle={() => toggleSectionExpanded(w.id, 'gost')}
                    >
                      <StorageStandardsCard
                        warehouse={w}
                        onSaveProductTypes={async (types) => {
                          await upsertWarehouse({ ...w, product_types: types })
                          void refetchWarehouses()
                        }}
                      />
                    </WarehouseNestedSection>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="presentation"
          onClick={() => {
            setModalOpen(false)
            setNewName('')
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">Добавить склад</h3>
              <button
                type="button"
                onClick={() => {
                  setModalOpen(false)
                  setNewName('')
                }}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md hover:bg-slate-100"
                aria-label="Закрыть"
              >
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <label className="block text-sm">
              <span className="text-slate-600">Название склада *</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="например: Склад Внуково"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newName.trim()) void handleAddWarehouse()
                }}
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={saving || !newName.trim()}
                onClick={() => void handleAddWarehouse()}
                className="flex-1 min-h-[44px] rounded-lg bg-brand-600 py-2 text-sm text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {saving ? 'Сохранение…' : 'Создать'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setModalOpen(false)
                  setNewName('')
                }}
                className="flex-1 min-h-[44px] rounded-lg border border-slate-300 py-2 text-sm"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>

    <input
      ref={dataUpdateInputRef}
      type="file"
      accept=".pdf,.xml,.txt"
      className="hidden"
      onChange={(e) => {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (file && dataUpdateWarehouseId) {
          void handleDataUpdateFile(dataUpdateWarehouseId, file)
        }
      }}
    />

    {dataUpdateModal && (
      <WarehouseDataUpdateModal
        warehouse={dataUpdateModal.warehouse}
        parsed={dataUpdateModal.parsed}
        saving={dataUpdateSaving}
        onCancel={() => setDataUpdateModal(null)}
        onApply={(patch) => void applyDataUpdate(patch)}
      />
    )}

    <div className="mt-4 space-y-4">
      <RegistryWarehousesPanel
        clientId={clientId}
        clientInn={clientInn}
        warehouses={warehouses}
        onWarehousesCreated={() => {
          void refetchWarehouses()
          void qc.invalidateQueries({ queryKey: ['warehouses', clientId] })
        }}
      />
      <RegistryBlock clientInn={clientInn} />
    </div>
    </>
  )
}
