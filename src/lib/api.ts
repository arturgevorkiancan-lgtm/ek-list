import { getItemsForChecklist } from '../data/checklistItems'
import { diagnostics, setDiagnosticsStorageMode } from './diagnostics'
import { isSupabaseConfigured, supabase, STORAGE_BUCKET } from './supabase'
import { localStore, uid } from './localStore'
import { emitToast } from './toastBridge'
import type {
  ApplicationVerificationSave,
  Checklist,
  ChecklistItem,
  Client,
  ClientDocType,
  Document,
  License,
  LicenseAddress,
  OperationType,
  ParsedApplicationData,
  ParsedEGRN,
  ParsedLicenseData,
  ParsedRentalData,
  ProductTypeFlag,
  RentalContract,
  Warehouse,
} from '../types'

async function getAuthUserId(): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session?.user?.id ?? null
}

/** Keep only the latest document per filename + doc_type + client_id (+ warehouse). */
export function deduplicateDocuments(docs: Document[]): Document[] {
  const map = new Map<string, Document>()
  for (const doc of docs) {
    const key = [
      doc.filename,
      doc.doc_type ?? '',
      doc.client_id ?? '',
      doc.warehouse_id ?? '',
    ].join('|')
    const existing = map.get(key)
    if (!existing || doc.uploaded_at > existing.uploaded_at) {
      map.set(key, doc)
    }
  }
  return [...map.values()].sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))
}

export async function fetchClients(): Promise<Client[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.from('clients').select('*').order('name')
    if (error) throw error
    return data as Client[]
  }
  return localStore.getClients()
}

export async function fetchClient(id: string): Promise<Client | null> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.from('clients').select('*').eq('id', id).single()
    if (error) return null
    return data as Client
  }
  return localStore.getClients().find((c) => c.id === id) ?? null
}

export async function upsertClient(
  client: Partial<Client> & { name: string },
): Promise<Client> {
  const record: Client = {
    id: client.id ?? uid(),
    name: client.name,
    inn: client.inn ?? null,
    kpp: client.kpp ?? null,
    ogrn: client.ogrn ?? null,
    legal_address: client.legal_address ?? null,
    short_name: client.short_name ?? null,
    director_last_name: client.director_last_name ?? null,
    director_first_name: client.director_first_name ?? null,
    director_middle_name: client.director_middle_name ?? null,
    director_phone: client.director_phone ?? null,
    representative_name: client.representative_name ?? null,
    representative_poa: client.representative_poa ?? null,
    alcohol_over_15_pct: client.alcohol_over_15_pct ?? null,
    contact_person: client.contact_person ?? null,
    phone: client.phone ?? null,
    email: client.email ?? null,
    egrn_data: client.egrn_data ?? null,
    created_at: client.created_at ?? new Date().toISOString(),
  }

  if (isSupabaseConfigured && supabase) {
    const userId = await getAuthUserId()
    const payload = userId ? { ...record, user_id: userId } : record
    diagnostics.info('Supabase', 'Сохранение клиента', { clientId: record.id })
    const { data, error } = await supabase.from('clients').upsert(payload).select().single()
    if (error) {
      diagnostics.error('Supabase', 'Ошибка сохранения', { table: 'clients', error: error.message })
      throw error
    }
    diagnostics.success('Supabase', 'Клиент сохранён', { clientId: record.id })
    return data as Client
  }
  return localStore.saveClient(record)
}

export async function updateClient(id: string, data: Partial<Client>): Promise<Client> {
  if (isSupabaseConfigured && supabase) {
    const { data: updated, error } = await supabase
      .from('clients')
      .update(data)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return updated as Client
  }
  const existing = await fetchClient(id)
  if (!existing) throw new Error('Клиент не найден')
  return localStore.saveClient({ ...existing, ...data })
}

export async function deleteClient(id: string): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('clients').delete().eq('id', id)
    if (error) throw error
    return
  }
  localStore.deleteClient(id)
}

export async function fetchLicenses(clientId?: string): Promise<License[]> {
  if (isSupabaseConfigured && supabase) {
    let q = supabase.from('licenses').select('*')
    if (clientId) q = q.eq('client_id', clientId)
    const { data, error } = await q.order('expiry_date', { ascending: false })
    if (error) throw error
    return data as License[]
  }
  const all = localStore.getLicenses()
  return clientId ? all.filter((l) => l.client_id === clientId) : all
}

export async function upsertLicense(license: Partial<License> & { client_id: string }): Promise<License> {
  const record: License = {
    id: license.id ?? uid(),
    client_id: license.client_id,
    license_number: license.license_number ?? null,
    issue_date: license.issue_date ?? null,
    expiry_date: license.expiry_date ?? null,
    license_type: license.license_type ?? null,
    license_activity: license.license_activity ?? null,
    license_status: license.license_status ?? null,
    licensee_name: license.licensee_name ?? null,
    licensee_kpp: license.licensee_kpp ?? null,
    legal_address: license.legal_address ?? null,
    email: license.email ?? null,
    renewal_years: license.renewal_years ?? 5,
    payment_order_number: license.payment_order_number ?? null,
    payment_order_date: license.payment_order_date ?? null,
    reissue_reason: license.reissue_reason ?? null,
    reissue_description: license.reissue_description ?? null,
    addresses: license.addresses ?? [],
    created_at: license.created_at ?? new Date().toISOString(),
  }

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('licenses')
      .upsert(record, { onConflict: 'client_id,license_number' })
      .select()
      .single()
    if (error) throw error
    return data as License
  }
  return localStore.saveLicense(record)
}

export async function fetchLicenseAddresses(licenseId: string): Promise<LicenseAddress[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('license_addresses')
      .select('*')
      .eq('license_id', licenseId)
    if (error) throw error
    return data as LicenseAddress[]
  }
  return localStore.getLicenseAddresses(licenseId)
}

export async function saveLicenseFromParsed(
  clientId: string,
  data: ParsedLicenseData,
  existingLicenseId?: string,
): Promise<{ license: License; branchCount: number }> {
  const addressJson = data.branches.map((b) => ({
    address: b.address,
    kpp: b.kpp || undefined,
    cadastral_number: b.cadastral_number,
    area_sqm: b.area_sqm,
    floor: b.floor,
    room_number: b.room_number,
    object_purpose: b.object_purpose,
    additional_address_info: b.additional_address_info,
  }))

  const license = await upsertLicense({
    id: existingLicenseId,
    client_id: clientId,
    license_number: data.licenseNumber || null,
    issue_date: data.issueDate || null,
    expiry_date: data.expiryDate || null,
    license_type: data.licenseActivity || null,
    license_activity: data.licenseActivity || null,
    license_status: data.licenseStatus || null,
    licensee_name: data.fullName || null,
    licensee_kpp: data.kpp || null,
    legal_address: data.legalAddress || null,
    email: data.email || null,
    addresses: addressJson,
  })

  const branches = data.branches.filter((b) => b.address.trim() || b.kpp.trim())

  if (isSupabaseConfigured && supabase) {
    await supabase.from('license_addresses').delete().eq('license_id', license.id)
    if (branches.length) {
      const rows = branches.map((b) => ({
        id: uid(),
        license_id: license.id,
        address: b.address.trim() || '—',
        kpp: b.kpp.trim() || null,
        notes: null,
        cadastral_number: b.cadastral_number?.trim() || null,
        area_sqm: b.area_sqm != null && b.area_sqm !== '' ? Number(b.area_sqm) : null,
        floor: b.floor?.trim() || null,
        room_number: b.room_number?.trim() || null,
        object_purpose: b.object_purpose?.trim() || null,
        additional_address_info: b.additional_address_info?.trim() || null,
      }))
      const { error } = await supabase.from('license_addresses').insert(rows)
      if (error) throw error
    }
  } else {
    localStore.replaceLicenseAddresses(
      license.id,
      branches.map((b) => ({
        id: uid(),
        license_id: license.id,
        address: b.address.trim() || '—',
        kpp: b.kpp.trim() || null,
        notes: null,
        cadastral_number: b.cadastral_number?.trim() || null,
        area_sqm: b.area_sqm != null && b.area_sqm !== '' ? Number(b.area_sqm) : null,
        floor: b.floor?.trim() || null,
        room_number: b.room_number?.trim() || null,
        object_purpose: b.object_purpose?.trim() || null,
        additional_address_info: b.additional_address_info?.trim() || null,
      })),
    )
  }

  return { license, branchCount: branches.length }
}

export async function findClientByInn(inn: string): Promise<Client | null> {
  if (!inn) return null
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.from('clients').select('*').eq('inn', inn).maybeSingle()
    if (error) throw error
    return (data as Client) ?? null
  }
  return localStore.getClients().find((c) => c.inn === inn) ?? null
}

export async function fetchChecklists(clientId?: string): Promise<Checklist[]> {
  if (isSupabaseConfigured && supabase) {
    let q = supabase.from('checklists').select('*')
    if (clientId) q = q.eq('client_id', clientId)
    const { data, error } = await q.order('updated_at', { ascending: false })
    if (error) throw error
    return data as Checklist[]
  }
  const all = localStore.getChecklists()
  return clientId ? all.filter((c) => c.client_id === clientId) : all
}

export async function fetchChecklist(id: string): Promise<Checklist | null> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.from('checklists').select('*').eq('id', id).single()
    if (error) return null
    return data as Checklist
  }
  return localStore.getChecklists().find((c) => c.id === id) ?? null
}

export async function createChecklist(
  clientId: string,
  operationType: OperationType,
  productTypes: ProductTypeFlag[],
  licenseId?: string | null,
): Promise<Checklist> {
  const checklist: Checklist = {
    id: uid(),
    client_id: clientId,
    license_id: licenseId ?? null,
    operation_type: operationType,
    product_types: productTypes,
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const templateItems = getItemsForChecklist(operationType, productTypes)
  const items: ChecklistItem[] = templateItems.map((t) => ({
    id: uid(),
    checklist_id: checklist.id,
    block_num: t.block,
    item_num: t.id,
    title: t.title,
    notes: t.note ?? null,
    status: 'not_started',
    due_date: null,
    completed_at: null,
    comment: null,
  }))

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.from('checklists').insert(checklist).select().single()
    if (error) throw error
    const { error: itemsError } = await supabase.from('checklist_items').insert(items)
    if (itemsError) throw itemsError
    return data as Checklist
  }

  localStore.saveChecklist(checklist)
  localStore.saveItems(items)
  return checklist
}

export async function fetchChecklistItems(checklistId: string): Promise<ChecklistItem[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('checklist_items')
      .select('*')
      .eq('checklist_id', checklistId)
      .order('block_num')
      .order('item_num')
    if (error) throw error
    return data as ChecklistItem[]
  }
  return localStore
    .getItems()
    .filter((i) => i.checklist_id === checklistId)
    .sort((a, b) => a.block_num - b.block_num || a.item_num - b.item_num)
}

export async function updateChecklistItem(
  item: ChecklistItem,
): Promise<ChecklistItem> {
  const updated: ChecklistItem = {
    ...item,
    completed_at:
      item.status === 'done' ? item.completed_at ?? new Date().toISOString() : null,
  }

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('checklist_items')
      .update(updated)
      .eq('id', item.id)
      .select()
      .single()
    if (error) throw error
    return data as ChecklistItem
  }
  return localStore.saveItem(updated)
}

export async function fetchDocuments(checklistId: string): Promise<Document[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('checklist_id', checklistId)
    if (error) throw error
    return data as Document[]
  }
  return localStore.getDocuments().filter((d) => d.checklist_id === checklistId)
}

export async function uploadDocument(
  checklistId: string,
  itemId: string | null,
  file: File,
): Promise<Document> {
  const path = `${checklistId}/${itemId ?? 'general'}/${Date.now()}_${file.name}`

  if (isSupabaseConfigured && supabase) {
    diagnostics.info('Storage', 'Загрузка файла', {
      path,
      fileSize: file.size,
      fileType: file.type,
    })
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, file)
    if (uploadError) {
      diagnostics.error('Storage', 'Ошибка загрузки', {
        message: uploadError.message,
        statusCode: (uploadError as { statusCode?: number }).statusCode,
        path,
        fileSize: file.size,
      })
      throw uploadError
    }
    diagnostics.success('Storage', 'Файл загружен', { path })
    setDiagnosticsStorageMode('supabase', true)

    const doc: Omit<Document, 'id'> & { id?: string } = {
      client_id: null,
      checklist_id: checklistId,
      item_id: itemId,
      filename: file.name,
      storage_path: path,
      doc_type: file.type,
      parsed_data: null,
      uploaded_at: new Date().toISOString(),
    }
    const { data, error } = await supabase.from('documents').insert(doc).select().single()
    if (error) throw error
    return data as Document
  }

  const record: Document = {
    id: uid(),
    client_id: null,
    checklist_id: checklistId,
    item_id: itemId,
    filename: file.name,
    storage_path: path,
    doc_type: file.type,
    parsed_data: null,
    uploaded_at: new Date().toISOString(),
  }
  return localStore.saveDocument(record)
}

export async function fetchClientDocuments(clientId: string): Promise<Document[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('client_id', clientId)
      .order('uploaded_at', { ascending: false })
    if (error) throw error
    return deduplicateDocuments(data as Document[])
  }
  return deduplicateDocuments(
    localStore
      .getDocuments()
      .filter((d) => d.client_id === clientId)
      .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at)),
  )
}

export type WarehouseWithProducts = Warehouse & { product_types?: string[] }

const WAREHOUSE_SELECT_COLUMNS =
  'id, client_id, name, kpp, address, cadastral_number, area_sqm, floor, room_number, object_purpose, additional_address_info, created_at'

function isPgrst204(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { code?: string; message?: string; details?: string }
  const text = [e.code, e.message, e.details].filter(Boolean).join(' ')
  return text.includes('PGRST204') || /product_types/i.test(text)
}

function formatApiError(error: unknown): Error {
  if (error instanceof Error) return error
  if (error && typeof error === 'object') {
    const e = error as { message?: string; code?: string; details?: string }
    const parts = [e.message, e.code, e.details].filter(Boolean)
    if (parts.length) return new Error(parts.join(' — '))
  }
  return new Error(String(error))
}

export async function fetchWarehouses(clientId: string): Promise<WarehouseWithProducts[]> {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('warehouses')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: true })
      if (error) {
        if (!isPgrst204(error)) throw formatApiError(error)
        const fallback = await supabase
          .from('warehouses')
          .select(WAREHOUSE_SELECT_COLUMNS)
          .eq('client_id', clientId)
          .order('created_at', { ascending: true })
        if (fallback.error) throw formatApiError(fallback.error)
        return (fallback.data as Warehouse[]).map((w) => ({
          ...w,
          product_types: [],
        }))
      }
      return data as WarehouseWithProducts[]
    } catch (e) {
      if (isPgrst204(e)) {
        const { data, error } = await supabase
          .from('warehouses')
          .select(WAREHOUSE_SELECT_COLUMNS)
          .eq('client_id', clientId)
          .order('created_at', { ascending: true })
        if (error) throw formatApiError(error)
        return (data as Warehouse[]).map((w) => ({
          ...w,
          product_types: [],
        }))
      }
      throw formatApiError(e)
    }
  }
  return localStore.getWarehouses(clientId) as WarehouseWithProducts[]
}

export async function upsertWarehouse(
  warehouse: Partial<WarehouseWithProducts> & { client_id: string; name: string },
): Promise<WarehouseWithProducts> {
  const record: WarehouseWithProducts = {
    id: warehouse.id ?? uid(),
    client_id: warehouse.client_id,
    name: warehouse.name,
    kpp: warehouse.kpp ?? null,
    address: warehouse.address ?? null,
    cadastral_number: warehouse.cadastral_number ?? null,
    area_sqm: warehouse.area_sqm ?? null,
    floor: warehouse.floor ?? null,
    room_number: warehouse.room_number ?? null,
    object_purpose: warehouse.object_purpose ?? null,
    additional_address_info: warehouse.additional_address_info ?? null,
    product_types: warehouse.product_types ?? [],
    created_at: warehouse.created_at ?? new Date().toISOString(),
  }

  if (isSupabaseConfigured && supabase) {
    const userId = await getAuthUserId()
    const payload = userId ? { ...record, user_id: userId } : record
    try {
      const { data, error } = await supabase.from('warehouses').upsert(payload).select().single()
      if (error) {
        if (!isPgrst204(error)) throw formatApiError(error)
        const { product_types: _pt, ...withoutProductTypes } = payload
        const retry = await supabase
          .from('warehouses')
          .upsert(withoutProductTypes)
          .select()
          .single()
        if (retry.error) throw formatApiError(retry.error)
        emitToast('Обновите схему БД: колонка product_types отсутствует')
        return { ...(retry.data as Warehouse), product_types: [] }
      }
      return data as WarehouseWithProducts
    } catch (e) {
      if (isPgrst204(e)) {
        const { product_types: _pt, ...withoutProductTypes } = payload
        const { data, error } = await supabase
          .from('warehouses')
          .upsert(withoutProductTypes)
          .select()
          .single()
        if (error) throw formatApiError(error)
        emitToast('Обновите схему БД: колонка product_types отсутствует')
        return { ...(data as Warehouse), product_types: [] }
      }
      throw formatApiError(e)
    }
  }
  return localStore.saveWarehouse(record) as WarehouseWithProducts
}

export async function deleteWarehouse(id: string): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('warehouses').delete().eq('id', id)
    if (error) throw error
    return
  }
  localStore.deleteWarehouse(id)
}

export type RegistryWarehouseInsert = {
  client_id: string
  name: string
  address: string
  kpp: string | null
}

export async function createWarehousesFromRegistry(
  items: RegistryWarehouseInsert[],
): Promise<number> {
  if (!items.length) return 0

  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('warehouses').insert(items)
    if (error) throw formatApiError(error)
    return items.length
  }

  for (const item of items) {
    localStore.saveWarehouse({
      id: uid(),
      client_id: item.client_id,
      name: item.name,
      address: item.address,
      kpp: item.kpp,
      cadastral_number: null,
      area_sqm: null,
      floor: null,
      room_number: null,
      object_purpose: null,
      additional_address_info: null,
      created_at: new Date().toISOString(),
    })
  }
  return items.length
}

function sanitizeStorageFilename(originalName: string): string {
  return `${Date.now()}_${originalName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')}`
}

function isStorageNetworkError(error: unknown): boolean {
  if (!error) return false
  if (error instanceof TypeError) return true
  const err = error as { name?: string; message?: string }
  if (err.name === 'NetworkError') return true
  const message = err.message ?? String(error)
  return /NetworkError|Failed to fetch|Network request failed|Load failed/i.test(message)
}

async function insertClientDocumentRecord(
  record: Omit<Document, 'id'> & { id?: string },
): Promise<Document> {
  const { data, error } = await supabase!.from('documents').insert(record).select().single()
  if (error) throw error
  return data as Document
}

export async function uploadClientDocument(
  clientId: string,
  file: File,
  docType: ClientDocType,
  parsedData?: Record<string, unknown> | null,
  warehouseId?: string | null,
): Promise<Document> {
  const safeFilename = sanitizeStorageFilename(file.name)
  const path = `${clientId}/${docType}/${safeFilename}`

  if (isSupabaseConfigured && supabase) {
    diagnostics.info('Storage', 'Загрузка файла', {
      path,
      fileSize: file.size,
      fileType: file.type,
    })
    let uploadError: unknown = null
    try {
      const { error } = await supabase.storage
        .from('documents')
        .upload(path, file, { contentType: file.type, upsert: true })
      if (error) uploadError = error
    } catch (e) {
      uploadError = e
    }

    if (uploadError) {
      const errMessage =
        uploadError instanceof Error ? uploadError.message : String(uploadError)
      diagnostics.error('Storage', 'Ошибка загрузки', {
        message: errMessage,
        statusCode: (uploadError as { statusCode?: number }).statusCode,
        path,
        fileSize: file.size,
      })

      if (isStorageNetworkError(uploadError)) {
        setDiagnosticsStorageMode('supabase', false)
        return insertClientDocumentRecord({
          client_id: clientId,
          warehouse_id: warehouseId ?? null,
          checklist_id: null,
          item_id: null,
          filename: `[локально] ${file.name}`,
          storage_path: null,
          doc_type: docType,
          parsed_data: parsedData ?? null,
          uploaded_at: new Date().toISOString(),
        })
      }

      throw uploadError instanceof Error ? uploadError : new Error(errMessage)
    }

    diagnostics.success('Storage', 'Файл загружен', { path })
    setDiagnosticsStorageMode('supabase', true)

    return insertClientDocumentRecord({
      client_id: clientId,
      warehouse_id: warehouseId ?? null,
      checklist_id: null,
      item_id: null,
      filename: file.name,
      storage_path: path,
      doc_type: docType,
      parsed_data: parsedData ?? null,
      uploaded_at: new Date().toISOString(),
    })
  }

  const record: Document = {
    id: uid(),
    client_id: clientId,
    warehouse_id: warehouseId ?? null,
    checklist_id: null,
    item_id: null,
    filename: file.name,
    storage_path: path,
    doc_type: docType,
    parsed_data: parsedData ?? null,
    uploaded_at: new Date().toISOString(),
  }
  return localStore.saveDocument(record)
}

export async function deleteClientDocument(doc: Document): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    if (doc.storage_path) {
      await supabase.storage.from('documents').remove([doc.storage_path])
    }
    const { error } = await supabase.from('documents').delete().eq('id', doc.id)
    if (error) throw error
    return
  }
  localStore.deleteDocument(doc.id)
}

export async function getClientDocumentUrl(storagePath: string): Promise<string | null> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.storage
      .from('documents')
      .createSignedUrl(storagePath, 3600)
    if (error) return null
    return data.signedUrl
  }
  return null
}

export async function fetchRentalContracts(clientId: string): Promise<RentalContract[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('rental_contracts')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data as RentalContract[]
  }
  return localStore.getRentalContracts(clientId)
}

export async function upsertRentalContract(
  contract: Partial<RentalContract> & { client_id: string },
): Promise<RentalContract> {
  const record: RentalContract = {
    id: contract.id ?? uid(),
    client_id: contract.client_id,
    warehouse_id: contract.warehouse_id ?? null,
    contract_number: contract.contract_number ?? null,
    contract_date: contract.contract_date ?? null,
    landlord_name: contract.landlord_name ?? null,
    rent_start: contract.rent_start ?? null,
    rent_end: contract.rent_end ?? null,
    address: contract.address ?? null,
    area_sqm: contract.area_sqm ?? null,
    license_address_id: contract.license_address_id ?? null,
    parsed_data: contract.parsed_data ?? null,
    created_at: contract.created_at ?? new Date().toISOString(),
  }

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('rental_contracts')
      .upsert(record)
      .select()
      .single()
    if (error) throw error
    return data as RentalContract
  }
  return localStore.saveRentalContract(record)
}

export async function saveRentalFromParsed(
  clientId: string,
  data: ParsedRentalData,
  existingId?: string,
  warehouseId?: string | null,
): Promise<RentalContract> {
  return upsertRentalContract({
    id: existingId,
    client_id: clientId,
    warehouse_id: warehouseId ?? null,
    contract_number: data.contractNumber ?? null,
    contract_date: data.contractDate ?? null,
    landlord_name: data.landlordName ?? null,
    rent_start: data.rentStart ?? null,
    rent_end: data.rentEnd ?? null,
    address: data.address ?? null,
    area_sqm: data.areaSqm ?? null,
    parsed_data: data as unknown as Record<string, unknown>,
  })
}

/** Fill empty client fields from Gosuslugi application without overwriting. */
export async function applyApplicationToClient(
  clientId: string,
  app: ParsedApplicationData,
): Promise<Client> {
  const existing = await fetchClient(clientId)
  if (!existing) throw new Error('Клиент не найден')

  const directorParts = [
    app.client.directorLastName,
    app.client.directorFirstName,
    app.client.directorMiddleName,
  ].filter(Boolean)

  return upsertClient({
    id: clientId,
    name: existing.name || app.client.fullName || '—',
    inn: existing.inn || app.client.inn || null,
    kpp: existing.kpp || app.client.kpp || null,
    ogrn: existing.ogrn || app.client.ogrn || null,
    legal_address: existing.legal_address || app.client.legalAddress || null,
    short_name: existing.short_name || app.client.shortName || null,
    director_last_name: existing.director_last_name || app.client.directorLastName || null,
    director_first_name: existing.director_first_name || app.client.directorFirstName || null,
    director_middle_name: existing.director_middle_name || app.client.directorMiddleName || null,
    director_phone: existing.director_phone || null,
    phone: existing.phone || app.client.phone || null,
    email: existing.email || app.client.email || null,
    alcohol_over_15_pct:
      existing.alcohol_over_15_pct ?? app.license.alcoholOver15 ?? null,
    contact_person:
      existing.contact_person ||
      (directorParts.length ? directorParts.join(' ') : null),
    egrn_data: existing.egrn_data,
    created_at: existing.created_at,
  })
}

export async function saveApplicationVerification(
  clientId: string,
  file: File,
  payload: ApplicationVerificationSave,
): Promise<Document> {
  return uploadClientDocument(
    clientId,
    file,
    'application_verification',
    payload as unknown as Record<string, unknown>,
  )
}

export async function saveClientEgrnData(
  clientId: string,
  egrnData: ParsedEGRN,
  existing?: Partial<Client>,
): Promise<Client> {
  return upsertClient({
    id: clientId,
    name: existing?.name ?? '—',
    ...existing,
    egrn_data: egrnData,
  })
}

export interface StorageReading {
  id: string
  warehouse_id: string
  client_id: string
  recorded_at: string
  temperature: number
  humidity: number
  recorded_by: string | null
  notes: string | null
  created_at: string
  synced?: boolean
}

type LocalStorageReading = StorageReading & { synced?: boolean }

function storageReadingsLocalKey(warehouseId: string): string {
  return `storage_readings_${warehouseId}`
}

function readLocalStorageReadings(warehouseId: string): LocalStorageReading[] {
  try {
    const raw = localStorage.getItem(storageReadingsLocalKey(warehouseId))
    return raw ? (JSON.parse(raw) as LocalStorageReading[]) : []
  } catch {
    return []
  }
}

function writeLocalStorageReadings(warehouseId: string, readings: LocalStorageReading[]): void {
  localStorage.setItem(storageReadingsLocalKey(warehouseId), JSON.stringify(readings))
}

function toStorageReading(row: Record<string, unknown>): StorageReading {
  return {
    id: String(row.id),
    warehouse_id: String(row.warehouse_id),
    client_id: String(row.client_id),
    recorded_at: String(row.recorded_at),
    temperature: Number(row.temperature),
    humidity: Number(row.humidity),
    recorded_by: row.recorded_by != null ? String(row.recorded_by) : null,
    notes: row.notes != null ? String(row.notes) : null,
    created_at: String(row.created_at ?? row.recorded_at),
  }
}

export async function syncOfflineReadings(warehouseId: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return

  const key = storageReadingsLocalKey(warehouseId)
  let cached: LocalStorageReading[] = JSON.parse(localStorage.getItem(key) || '[]')
  const unsynced = cached.filter((r) => r.synced === false)
  if (!unsynced.length) return

  const userId = await getAuthUserId()

  for (const reading of unsynced) {
    try {
      const { id, synced: _synced, ...data } = reading
      const row = userId ? { ...data, user_id: userId } : data
      const { data: saved, error } = await supabase
        .from('storage_readings')
        .insert(row)
        .select()
        .single()
      if (error) throw error
      if (saved) {
        cached = cached.map((r) =>
          r.id === id ? { ...toStorageReading(saved as Record<string, unknown>), synced: true } : r,
        )
        localStorage.setItem(key, JSON.stringify(cached))
      }
    } catch {
      break
    }
  }
}

export async function fetchStorageReadings(warehouseId: string): Promise<StorageReading[]> {
  if (!isSupabaseConfigured || !supabase) {
    const cached = localStorage.getItem(storageReadingsLocalKey(warehouseId))
    return cached ? JSON.parse(cached) : []
  }

  try {
    const { data, error } = await supabase
      .from('storage_readings')
      .select('*')
      .eq('warehouse_id', warehouseId)
      .order('recorded_at', { ascending: false })
      .limit(100)
    if (error) throw error
    const rows = (data as StorageReading[]).map((row) => ({
      ...row,
      temperature: Number(row.temperature),
      humidity: Number(row.humidity),
    }))
    localStorage.setItem(storageReadingsLocalKey(warehouseId), JSON.stringify(rows))
    return rows
  } catch {
    const cached = localStorage.getItem(storageReadingsLocalKey(warehouseId))
    return cached ? JSON.parse(cached) : []
  }
}

export async function addStorageReading(
  reading: Omit<StorageReading, 'id' | 'created_at'>,
): Promise<StorageReading> {
  if (!isSupabaseConfigured || !supabase) {
    const offline: StorageReading = {
      ...reading,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      synced: false,
    }
    const key = storageReadingsLocalKey(reading.warehouse_id)
    const cached: StorageReading[] = JSON.parse(localStorage.getItem(key) || '[]')
    localStorage.setItem(key, JSON.stringify([offline, ...cached]))
    return offline
  }

  try {
    const userId = await getAuthUserId()
    const row = userId ? { ...reading, user_id: userId } : reading
    const { data, error } = await supabase
      .from('storage_readings')
      .insert(row)
      .select()
      .single()
    if (error) throw error
    const saved = {
      ...toStorageReading(data as Record<string, unknown>),
      temperature: Number(data.temperature),
      humidity: Number(data.humidity),
    }
    const key = storageReadingsLocalKey(reading.warehouse_id)
    const cached: StorageReading[] = JSON.parse(localStorage.getItem(key) || '[]')
    localStorage.setItem(key, JSON.stringify([saved, ...cached]))
    return saved
  } catch {
    const offline: StorageReading = {
      ...reading,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      synced: false,
    }
    const key = storageReadingsLocalKey(reading.warehouse_id)
    const cached: StorageReading[] = JSON.parse(localStorage.getItem(key) || '[]')
    localStorage.setItem(key, JSON.stringify([offline, ...cached]))
    return offline
  }
}

function removeLocalStorageReading(id: string): void {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key?.startsWith('storage_readings_')) continue
    const warehouseId = key.replace('storage_readings_', '')
    const local = readLocalStorageReadings(warehouseId)
    if (!local.some((r) => r.id === id)) continue
    writeLocalStorageReadings(
      warehouseId,
      local.filter((r) => r.id !== id),
    )
    return
  }
}

export async function deleteStorageReading(id: string): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    try {
      const { error } = await supabase.from('storage_readings').delete().eq('id', id)
      if (error) throw error
    } catch {
      /* still update local cache */
    }
  }
  removeLocalStorageReading(id)
}
