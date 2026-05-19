import type {
  Client,
  Document,
  License,
  ParsedEGRN,
  ParsedEGRYLData,
  ParsedLicenseData,
  ParsedTechPlanData,
  Warehouse,
} from '../types'
import { isEgrulLegalAddressBoilerplate, sanitizeEgrulLegalAddress } from './egrulAddress'
import type { ParsedWarehouseDocumentFields } from './parseWarehouseDocument'

export type ConflictSourceKey = 'egryl' | 'license' | 'egrn' | 'techplan'

export type ConflictField =
  | 'inn'
  | 'kpp'
  | 'ogrn'
  | 'address'
  | 'license_number'
  | 'license_status'
  | 'valid_to'
  | 'area'
  | 'cadastral_number'
  | 'floor'
  | 'purpose'

export type ConflictFieldMap = Partial<Record<ConflictField, string>>

export const DEFAULT_SOURCE_PRIORITY: ConflictSourceKey[] = [
  'egryl',
  'license',
  'egrn',
  'techplan',
]

export const CONFLICT_FIELD_LABELS: Record<ConflictField, string> = {
  inn: 'ИНН',
  kpp: 'КПП',
  ogrn: 'ОГРН',
  address: 'Адрес',
  license_number: 'Номер лицензии',
  license_status: 'Статус лицензии',
  valid_to: 'Срок действия',
  area: 'Площадь',
  cadastral_number: 'Кадастровый номер',
  floor: 'Этаж',
  purpose: 'Назначение',
}

export const SOURCE_LABELS: Record<ConflictSourceKey, string> = {
  egryl: 'ЕГРЮЛ',
  license: 'Реестр / РАТК',
  egrn: 'ЕГРН',
  techplan: 'Техплан',
}

const CLIENT_FIELDS: ConflictField[] = [
  'inn',
  'kpp',
  'ogrn',
  'address',
  'license_number',
  'license_status',
  'valid_to',
]

const WAREHOUSE_FIELDS: ConflictField[] = [
  'address',
  'area',
  'cadastral_number',
  'floor',
  'purpose',
]

function pickString(...values: Array<string | null | undefined>): string | undefined {
  for (const v of values) {
    const t = v?.trim()
    if (t) return t
  }
  return undefined
}

function formatArea(value: string | number | null | undefined): string | undefined {
  if (value == null || value === '') return undefined
  return String(value).trim()
}

export function fieldsForScope(warehouseId?: string | null): ConflictField[] {
  return warehouseId ? WAREHOUSE_FIELDS : CLIENT_FIELDS
}

export function clientRecordToFields(client: Client, license?: License | null): ConflictFieldMap {
  return {
    inn: pickString(client.inn ?? undefined),
    kpp: pickString(client.kpp ?? undefined),
    ogrn: pickString(client.ogrn ?? undefined),
    address: pickString(client.legal_address ?? undefined),
    license_number: pickString(license?.license_number ?? undefined),
    license_status: pickString(license?.license_status ?? undefined),
    valid_to: pickString(license?.expiry_date ?? undefined),
  }
}

export function warehouseToFields(warehouse: Warehouse): ConflictFieldMap {
  return {
    address: pickString(warehouse.address ?? undefined),
    area: warehouse.area_sqm != null ? String(warehouse.area_sqm) : undefined,
    cadastral_number: pickString(warehouse.cadastral_number ?? undefined),
    floor: pickString(warehouse.floor ?? undefined),
    purpose: pickString(warehouse.object_purpose ?? undefined),
  }
}

export function egrylParsedToFields(
  data: ParsedEGRYLData,
  options?: { includeLegalAddress?: boolean },
): ConflictFieldMap {
  const fields: ConflictFieldMap = {
    inn: pickString(data.client.inn),
    kpp: pickString(data.client.kpp),
    ogrn: pickString(data.client.ogrn),
    license_number: pickString(data.license?.licenseNumber),
    valid_to: pickString(data.license?.expiryDate),
  }
  if (options?.includeLegalAddress !== false) {
    const legal = sanitizeEgrulLegalAddress(data.client.legalAddress)
    if (legal) fields.address = legal
  }
  return fields
}

export function licenseParsedToFields(data: ParsedLicenseData): ConflictFieldMap {
  return {
    inn: pickString(data.inn),
    kpp: pickString(data.kpp),
    address: pickString(data.legalAddress),
    license_number: pickString(data.licenseNumber),
    license_status: pickString(data.licenseStatus),
    valid_to: pickString(data.expiryDate),
  }
}

export function egrnParsedToFields(data: ParsedEGRN): ConflictFieldMap {
  const rawAddress = data.address?.trim()
  const address =
    rawAddress && !isEgrulLegalAddressBoilerplate(rawAddress) ? rawAddress : undefined
  return {
    address: pickString(address),
    area: formatArea(data.area),
    cadastral_number: pickString(data.cadastralNumber),
    purpose: pickString(data.rightType),
  }
}

export function techPlanParsedToFields(data: ParsedTechPlanData): ConflictFieldMap {
  return {
    address: pickString(data.address),
    area: data.area != null ? String(data.area) : undefined,
    cadastral_number: pickString(data.cadastralNumber),
    floor: pickString(data.floor),
    purpose: pickString(data.purpose),
  }
}

export function warehouseDocFieldsToMap(
  parsed: ParsedWarehouseDocumentFields,
): ConflictFieldMap {
  const rawAddress = parsed.address?.trim()
  const address =
    rawAddress && !isEgrulLegalAddressBoilerplate(rawAddress) ? rawAddress : undefined
  return {
    address: pickString(address),
    area: formatArea(parsed.area),
    cadastral_number: pickString(parsed.cadastral_number ?? undefined),
    floor: pickString(parsed.floor ?? undefined),
    purpose: pickString(parsed.purpose ?? undefined),
  }
}

function docTypeToSource(docType: string | null): ConflictSourceKey | null {
  if (docType === 'egryl') return 'egryl'
  if (docType === 'license') return 'license'
  if (docType === 'egrn') return 'egrn'
  if (docType === 'tech_plan') return 'techplan'
  return null
}

function parseDocFields(
  doc: Document,
  warehouse?: Warehouse | null,
): ConflictFieldMap | null {
  const source = docTypeToSource(doc.doc_type)
  if (!source || !doc.parsed_data) return null

  const data = doc.parsed_data

  if (source === 'egryl') {
    const payload = data as { client?: ParsedEGRYLData['client']; license?: ParsedEGRYLData['license'] }
    if (!payload.client) return null
    return egrylParsedToFields(
      {
        client: payload.client as ParsedEGRYLData['client'],
        license: payload.license as ParsedEGRYLData['license'] | undefined,
        rawText: '',
      },
      { includeLegalAddress: !warehouse },
    )
  }

  if (source === 'license') {
    return licenseParsedToFields(data as unknown as ParsedLicenseData)
  }

  if (source === 'egrn') {
    return egrnParsedToFields(data as unknown as ParsedEGRN)
  }

  if (source === 'techplan') {
    return techPlanParsedToFields(data as unknown as ParsedTechPlanData)
  }

  if (warehouse) return warehouseToFields(warehouse)
  return null
}

/** Последний документ каждого типа источника (по дате загрузки). */
export function buildSourceSnapshotsFromDocs(
  docs: Document[],
  options: {
    client: Client
    license?: License | null
    warehouse?: Warehouse | null
    warehouseId?: string | null
  },
): Map<ConflictSourceKey, ConflictFieldMap> {
  const snapshots = new Map<ConflictSourceKey, ConflictFieldMap>()
  const scopeWarehouseId = options.warehouseId ?? null

  const relevant = docs.filter((d) => {
    if (scopeWarehouseId) return d.warehouse_id === scopeWarehouseId
    return !d.warehouse_id
  })

  const sorted = [...relevant].sort(
    (a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime(),
  )

  for (const doc of sorted) {
    const source = docTypeToSource(doc.doc_type)
    if (!source || snapshots.has(source)) continue
    const fields = parseDocFields(doc, options.warehouse)
    if (fields && Object.keys(fields).length > 0) {
      snapshots.set(source, fields)
    }
  }

  const clientFields = clientRecordToFields(options.client, options.license)
  if (!scopeWarehouseId) {
    for (const [field, value] of Object.entries(clientFields) as [ConflictField, string][]) {
      if (!value) continue
      for (const snap of snapshots.values()) {
        if (!snap[field]) snap[field] = value
      }
    }
  }

  if (scopeWarehouseId && options.warehouse) {
    const whFields = warehouseToFields(options.warehouse)
    for (const [field, value] of Object.entries(whFields) as [ConflictField, string][]) {
      if (!value) continue
      for (const snap of snapshots.values()) {
        if (!snap[field]) snap[field] = value
      }
    }
  }

  return snapshots
}

export function canonicalSourcePair(
  a: ConflictSourceKey,
  b: ConflictSourceKey,
): { sourceA: ConflictSourceKey; sourceB: ConflictSourceKey } {
  return a < b ? { sourceA: a, sourceB: b } : { sourceA: b, sourceB: a }
}

export function valueForSource(
  source: ConflictSourceKey,
  pair: { sourceA: ConflictSourceKey; sourceB: ConflictSourceKey },
  valueA: string | null,
  valueB: string | null,
): string | null {
  if (source === pair.sourceA) return valueA
  if (source === pair.sourceB) return valueB
  return null
}

export function assignValuesToPair(
  source1: ConflictSourceKey,
  value1: string,
  source2: ConflictSourceKey,
  value2: string,
): {
  sourceA: ConflictSourceKey
  sourceB: ConflictSourceKey
  valueA: string
  valueB: string
} {
  const { sourceA, sourceB } = canonicalSourcePair(source1, source2)
  return {
    sourceA,
    sourceB,
    valueA: source1 === sourceA ? value1 : value2,
    valueB: source1 === sourceB ? value1 : value2,
  }
}

export function pickPriorityValue(
  fields: ConflictFieldMap,
  priorityOrder: ConflictSourceKey[],
  snapshots: Map<ConflictSourceKey, ConflictFieldMap>,
  field: ConflictField,
): { source: ConflictSourceKey; value: string } | null {
  for (const source of priorityOrder) {
    const fromNew = fields[field]
    if (fromNew?.trim()) return { source, value: fromNew.trim() }
    const fromSnap = snapshots.get(source)?.[field]
    if (fromSnap?.trim()) return { source, value: fromSnap.trim() }
  }
  return null
}
