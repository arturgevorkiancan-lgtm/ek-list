import { isSupabaseConfigured, supabase } from './supabase'

function normalizeInn(inn: string): string {
  return inn.replace(/\D/g, '')
}

function classifyLicense(activityType: string): { label: string; color: string } {
  const t = activityType.toLowerCase()
  const isSpirit = t.includes('спиртосодержащ')
  const isSpiritFood = isSpirit && t.includes('пищев')
  const isSpiritNonFood = isSpirit && t.includes('непищев')
  const isEthanol = t.includes('этилового спирта')
  const isAlco = !isSpirit && !isEthanol
  const isRetail = t.includes('розничн')
  const isRestaurant = t.includes('общепит') || t.includes('общественного питания')
  const isProduction = t.includes('производств')
  const isWholesale = t.includes('закупк') || t.includes('хранен') || t.includes('поставк')

  if (isEthanol) return { label: 'ЭТИЛ СПИРТ', color: 'orange' }
  if (isSpiritNonFood) {
    return {
      label: isProduction ? 'ПРОИЗВ СПИРТ-НЕПИЩ' : 'ЗХП СПИРТ-НЕПИЩ',
      color: 'gray',
    }
  }
  if (isSpiritFood) {
    return {
      label: isProduction ? 'ПРОИЗВ СПИРТ-ПИЩ' : 'ЗХП СПИРТ-ПИЩ',
      color: 'purple',
    }
  }
  if (isAlco && isRetail && isRestaurant) return { label: 'РОЗНИЦА ОБЩЕПИТ', color: 'blue' }
  if (isAlco && isRetail) return { label: 'РОЗНИЦА АЛКО', color: 'blue' }
  if (isAlco && isProduction) return { label: 'ПРОИЗВ АЛКО', color: 'blue' }
  if (isAlco && isWholesale) return { label: 'ЗХП АЛКО', color: 'blue' }
  return { label: 'ИНОЕ', color: 'gray' }
}

export interface LicenseRecord {
  license_number: string
  inn: string
  company_name: string
  status: string
  valid_from: string | null
  valid_to: string | null
  activity_type: string
  license_label: string
  license_color: string
  addresses: string[]
  kpp: string | null
}

export interface RegistryLookupResponse {
  active: LicenseRecord[]
  archived: LicenseRecord[]
  from_cache: boolean
  cache_age_hours: number
  last_updated: string
  error?: string
}

type RegistryCacheRow = {
  inn: string | null
  license_number: string | null
  company_name: string | null
  status: string | null
  valid_from: string | null
  valid_to: string | null
  activity_type: string | null
  license_label: string | null
  license_color: string | null
  addresses: string[] | unknown | null
  kpp: string | null
  downloaded_at: string
}

function isActiveSectionStatus(status: string): boolean {
  const s = status.toLowerCase()
  return s.includes('действующ') || s.includes('приостановлен')
}

function cacheAgeHours(downloadedAt: string | null | undefined): number {
  if (!downloadedAt) return 0
  return Math.round((Date.now() - new Date(downloadedAt).getTime()) / (60 * 60 * 1000))
}

function toLicenseRecord(row: RegistryCacheRow): LicenseRecord {
  const addresses = Array.isArray(row.addresses)
    ? (row.addresses as string[]).filter(Boolean)
    : []
  const activity = row.activity_type ?? ''
  const classified = row.license_label
    ? { label: row.license_label, color: row.license_color ?? 'gray' }
    : classifyLicense(activity)

  return {
    license_number: row.license_number ?? '',
    inn: row.inn ?? '',
    company_name: row.company_name ?? '',
    status: row.status ?? '',
    valid_from: row.valid_from,
    valid_to: row.valid_to,
    activity_type: activity,
    license_label: classified.label,
    license_color: classified.color,
    addresses,
    kpp: row.kpp,
  }
}

function sortByValidTo(records: LicenseRecord[], direction: 'asc' | 'desc'): LicenseRecord[] {
  return [...records].sort((a, b) => {
    const ta = a.valid_to ? new Date(a.valid_to).getTime() : 0
    const tb = b.valid_to ? new Date(b.valid_to).getTime() : 0
    return direction === 'asc' ? ta - tb : tb - ta
  })
}

function splitActiveArchived(records: LicenseRecord[]): {
  active: LicenseRecord[]
  archived: LicenseRecord[]
} {
  const active: LicenseRecord[] = []
  const archived: LicenseRecord[] = []
  for (const r of records) {
    if (isActiveSectionStatus(r.status)) active.push(r)
    else archived.push(r)
  }
  return {
    active: sortByValidTo(active, 'asc'),
    archived: sortByValidTo(archived, 'desc'),
  }
}

async function readCacheRows(inn: string): Promise<LicenseRecord[]> {
  if (!supabase) return []

  const normalized = normalizeInn(inn)
  const { data, error } = await supabase
    .from('registry_cache')
    .select('*')
    .eq('inn', normalized)
    .order('valid_to', { ascending: true, nullsFirst: false })

  if (error) throw new Error(error.message)
  if (!data?.length) return []

  const byKey = new Map<string, RegistryCacheRow>()
  for (const row of data as RegistryCacheRow[]) {
    const key = `${row.inn}|${row.license_number ?? ''}`
    const prev = byKey.get(key)
    if (!prev || new Date(row.downloaded_at) > new Date(prev.downloaded_at)) {
      byKey.set(key, row)
    }
  }

  return [...byKey.values()].map(toLicenseRecord)
}

/** Читает лицензии из registry_cache в Supabase (без Edge Function) */
export async function loadFromCache(inn: string): Promise<RegistryLookupResponse> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Проверка реестра доступна только при подключённом Supabase')
  }

  const normalized = normalizeInn(inn)
  if (!normalized) throw new Error('Некорректный ИНН')

  const { data: meta, error: metaError } = await supabase
    .from('registry_meta')
    .select('last_downloaded_at')
    .eq('id', 1)
    .maybeSingle()

  if (metaError) throw new Error(metaError.message)

  const records = await readCacheRows(normalized)
  const lastUpdated = meta?.last_downloaded_at ?? new Date().toISOString()

  return {
    ...splitActiveArchived(records),
    from_cache: true,
    cache_age_hours: cacheAgeHours(meta?.last_downloaded_at),
    last_updated: lastUpdated,
  }
}
