import {
  assignValuesToPair,
  canonicalSourcePair,
  DEFAULT_SOURCE_PRIORITY,
  type ConflictField,
  type ConflictSourceKey,
} from './conflictSourceData'
import { getConflictLevel } from './conflictLevels'
import { isSupabaseConfigured, supabase } from './supabase'
import { localStore, uid } from './localStore'
import type { Client, DataConflict, License, SourcePriority, Warehouse } from '../types'
import { fetchClient, fetchClientDocuments, fetchLicenses, fetchWarehouses, upsertClient, upsertLicense, upsertWarehouse } from './api'

export type { ConflictSourceKey, ConflictField } from './conflictSourceData'

export async function fetchDataConflicts(
  clientId: string,
  options?: { warehouseId?: string | null; unresolvedOnly?: boolean },
): Promise<DataConflict[]> {
  if (isSupabaseConfigured && supabase) {
    let q = supabase.from('data_conflicts').select('*').eq('client_id', clientId)
    if (options?.warehouseId) {
      q = q.eq('warehouse_id', options.warehouseId)
    } else if (options?.warehouseId === null) {
      q = q.is('warehouse_id', null)
    }
    if (options?.unresolvedOnly) q = q.eq('resolved', false)
    const { data, error } = await q.order('created_at', { ascending: false })
    if (error) {
      if (error.code === '42P01') return []
      throw error
    }
    return (data ?? []) as DataConflict[]
  }

  let list = localStore.getDataConflicts(clientId)
  if (options?.warehouseId) {
    list = list.filter((c) => c.warehouse_id === options.warehouseId)
  }
  if (options?.unresolvedOnly) {
    list = list.filter((c) => !c.resolved)
  }
  return list.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )
}

export async function fetchUnresolvedConflictCount(clientId: string): Promise<number> {
  const rows = await fetchDataConflicts(clientId, { unresolvedOnly: true })
  return rows.length
}

function findExistingConflict(
  list: DataConflict[],
  clientId: string,
  warehouseId: string | null,
  field: string,
  sourceA: ConflictSourceKey,
  sourceB: ConflictSourceKey,
): DataConflict | undefined {
  const { sourceA: canonA, sourceB: canonB } = canonicalSourcePair(sourceA, sourceB)
  return list.find(
    (c) =>
      c.client_id === clientId &&
      (c.warehouse_id ?? null) === warehouseId &&
      c.field === field &&
      c.source_a === canonA &&
      c.source_b === canonB,
  )
}

export async function upsertDataConflict(
  payload: Omit<DataConflict, 'id' | 'created_at'> & { id?: string },
): Promise<DataConflict> {
  const row: DataConflict = {
    id: payload.id ?? uid(),
    client_id: payload.client_id,
    warehouse_id: payload.warehouse_id,
    field: payload.field,
    source_a: payload.source_a,
    value_a: payload.value_a,
    source_b: payload.source_b,
    value_b: payload.value_b,
    priority_source: payload.priority_source,
    level: payload.level,
    resolved: payload.resolved,
    resolved_at: payload.resolved_at,
    resolution_comment: payload.resolution_comment,
    created_at: payload.created_at ?? new Date().toISOString(),
  }

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('data_conflicts')
      .upsert(row)
      .select()
      .single()
    if (error) {
      if (error.code === '42P01') return localStore.saveDataConflict(row)
      throw error
    }
    return data as DataConflict
  }

  return localStore.saveDataConflict(row)
}

export async function loadExistingConflicts(
  clientId: string,
  warehouseId?: string | null,
): Promise<DataConflict[]> {
  return fetchDataConflicts(clientId, { warehouseId: warehouseId ?? null })
}

export async function getSourcePriorityOrder(
  clientId: string,
  field: string,
): Promise<ConflictSourceKey[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('source_priorities')
      .select('priority_order')
      .eq('client_id', clientId)
      .eq('field', field)
      .maybeSingle()
    if (error) {
      if (error.code === '42P01') return [...DEFAULT_SOURCE_PRIORITY]
      throw error
    }
    if (data?.priority_order?.length) {
      return data.priority_order as ConflictSourceKey[]
    }
    return [...DEFAULT_SOURCE_PRIORITY]
  }

  const row = localStore
    .getSourcePriorities(clientId)
    .find((p) => p.field === field)
  return row?.priority_order?.length ? row.priority_order : [...DEFAULT_SOURCE_PRIORITY]
}

export async function saveSourcePriority(
  clientId: string,
  field: string,
  priorityOrder: ConflictSourceKey[],
): Promise<SourcePriority> {
  const row: SourcePriority = {
    id: uid(),
    client_id: clientId,
    field,
    priority_order: priorityOrder,
    created_at: new Date().toISOString(),
  }

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('source_priorities')
      .upsert(
        { client_id: clientId, field, priority_order: priorityOrder },
        { onConflict: 'client_id,field' },
      )
      .select()
      .single()
    if (error) {
      if (error.code === '42P01') return localStore.saveSourcePriority(row)
      throw error
    }
    return data as SourcePriority
  }

  const existing = localStore.getSourcePriorities(clientId).find((p) => p.field === field)
  if (existing) row.id = existing.id
  return localStore.saveSourcePriority(row)
}

export async function resolveDataConflict(
  conflict: DataConflict,
  chosenSource: ConflictSourceKey,
  comment?: string,
): Promise<DataConflict> {
  const chosenValue =
    chosenSource === conflict.source_a
      ? conflict.value_a
      : chosenSource === conflict.source_b
        ? conflict.value_b
        : null

  const resolved: DataConflict = {
    ...conflict,
    priority_source: chosenSource,
    resolved: true,
    resolved_at: new Date().toISOString(),
    resolution_comment: comment?.trim() || null,
  }

  const saved = await upsertDataConflict(resolved)

  if (chosenValue && conflict.client_id) {
    await applyConflictValue(
      conflict.client_id,
      conflict.warehouse_id,
      conflict.field as ConflictField,
      chosenValue,
    )
  }

  return saved
}

async function applyConflictValue(
  clientId: string,
  warehouseId: string | null,
  field: ConflictField,
  value: string,
): Promise<void> {
  if (warehouseId) {
    const warehouses = await fetchWarehouses(clientId)
    const w = warehouses.find((x) => x.id === warehouseId)
    if (!w) return
    const patch: Partial<Warehouse> = { ...w }
    switch (field) {
      case 'address':
        patch.address = value
        break
      case 'area': {
        const num = Number(value.replace(',', '.').replace(/[^\d.]/g, ''))
        if (!Number.isNaN(num)) patch.area_sqm = num
        break
      }
      case 'cadastral_number':
        patch.cadastral_number = value
        break
      case 'floor':
        patch.floor = value
        break
      case 'purpose':
        patch.object_purpose = value
        break
      default:
        return
    }
    await upsertWarehouse(patch as Warehouse)
    return
  }

  const client = await fetchClient(clientId)
  if (!client) return

  const clientPatch: Partial<Client> = {}
  const licenseFields: ConflictField[] = ['license_number', 'license_status', 'valid_to']

  if (licenseFields.includes(field)) {
    const licenses = await fetchLicenses(clientId)
    const license = licenses[0]
    if (!license) return
    const licensePatch: Partial<License> = { ...license }
    switch (field) {
      case 'license_number':
        licensePatch.license_number = value
        break
      case 'license_status':
        licensePatch.license_status = value
        break
      case 'valid_to':
        licensePatch.expiry_date = value
        break
    }
    await upsertLicense(licensePatch as License)
    return
  }

  switch (field) {
    case 'inn':
      clientPatch.inn = value
      break
    case 'kpp':
      clientPatch.kpp = value
      break
    case 'ogrn':
      clientPatch.ogrn = value
      break
    case 'address':
      clientPatch.legal_address = value
      break
    default:
      return
  }

  await upsertClient({ ...client, ...clientPatch })
}

export async function loadConflictContext(clientId: string, warehouseId?: string | null) {
  const [client, licenses, docs, warehouses] = await Promise.all([
    fetchClient(clientId),
    fetchLicenses(clientId),
    fetchClientDocuments(clientId),
    fetchWarehouses(clientId),
  ])
  if (!client) throw new Error('Клиент не найден')
  const warehouse = warehouseId
    ? warehouses.find((w) => w.id === warehouseId) ?? null
    : null
  return { client, license: licenses[0] ?? null, docs, warehouse }
}

export { assignValuesToPair }
