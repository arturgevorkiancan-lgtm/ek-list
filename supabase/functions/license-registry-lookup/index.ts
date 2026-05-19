import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  ZipReader,
  Uint8ArrayReader,
  Uint8ArrayWriter,
  TextWriter,
} from 'https://deno.land/x/zipjs@v2.7.32/index.js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const OPENDATA_PAGE = 'https://fsrar.gov.ru/opendata/7710747640-reestr'
const REGISTRY_ZIP_URL =
  'https://fsrar.gov.ru/opendata/7710747640-reestrlic/data-20260408t0000-structure-20190918t0000.zip'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const URL_CHECK_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000
const ZIP_DOWNLOAD_TIMEOUT_MS = 120_000

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

type ParsedCsvRow = Record<string, string>
type ClassifiedRecord = LicenseRecord & { raw_row?: ParsedCsvRow }

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function classifyLicense(activityType: string): { label: string; color: string } {
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

function isActiveSectionStatus(status: string): boolean {
  const s = status.toLowerCase()
  return s.includes('действующ') || s.includes('приостановлен')
}

function normalizeHeader(h: string): string {
  return h
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function normalizeInn(inn: string): string {
  return inn.replace(/\D/g, '')
}

function normalizeLicenseNumber(num: string): string {
  return num.replace(/\s+/g, ' ').trim().toUpperCase()
}

function parseDate(value: string): string | null {
  const v = value.trim()
  if (!v) return null
  const dmy = v.match(/^(\d{2})[.\-/](\d{2})[.\-/](\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`
  const ymd = v.match(/^(\d{4})[.\-/](\d{2})[.\-/](\d{2})$/)
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`
  return null
}

function detectDelimiter(headerLine: string): string {
  const semicolons = (headerLine.match(/;/g) ?? []).length
  const commas = (headerLine.match(/,/g) ?? []).length
  return semicolons >= commas ? ';' : ','
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === delimiter) {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out.map((c) => c.trim())
}

function pickField(row: ParsedCsvRow, patterns: RegExp[]): string {
  for (const [key, val] of Object.entries(row)) {
    const nk = normalizeHeader(key)
    for (const p of patterns) {
      if (p.test(nk) && val.trim()) return val.trim()
    }
  }
  return ''
}

function rowToRecord(row: ParsedCsvRow): ClassifiedRecord | null {
  const license_number = pickField(row, [
    /^номер лицензии/,
    /^серия и номер/,
    /^license/,
    /лицензи/,
  ])
  const inn = normalizeInn(pickField(row, [/^инн$/, /^инн лицензиата/, /^inn$/]))
  const company_name = pickField(row, [
    /^наименование/,
    /^полное наименование/,
    /^название/,
    /^организация/,
    /^лицензиат/,
  ])
  const status = pickField(row, [/^статус/, /^состояние/])
  const valid_from = parseDate(
    pickField(row, [/^дата начала/, /^дата выдачи/, /^дата начала действия/, /^начало действия/]),
  )
  const valid_to = parseDate(
    pickField(row, [/^дата окончания/, /^дата прекращения/, /^окончание действия/, /^срок действия/]),
  )
  const activity_type = pickField(row, [
    /^вид деятельности/,
    /^вид лицензируемой/,
    /^лицензируемый вид/,
    /^вид лицензии/,
  ])
  const address = pickField(row, [
    /^адрес/,
    /^место нахождения/,
    /^адрес осуществления/,
    /^адрес объекта/,
  ])
  const kpp = pickField(row, [/^кпп$/])

  if (!license_number && !inn) return null

  const classified = classifyLicense(activity_type)

  return {
    license_number: normalizeLicenseNumber(license_number),
    inn,
    company_name,
    status,
    valid_from,
    valid_to,
    activity_type,
    license_label: classified.label,
    license_color: classified.color,
    addresses: address ? [address] : [],
    kpp: kpp || null,
    raw_row: row,
  }
}

function mergeRecords(records: ClassifiedRecord[]): ClassifiedRecord[] {
  const map = new Map<string, ClassifiedRecord>()
  for (const r of records) {
    const key = `${r.inn}|${r.license_number}`
    const existing = map.get(key)
    if (!existing) {
      map.set(key, { ...r, addresses: [...r.addresses] })
      continue
    }
    for (const addr of r.addresses) {
      if (addr && !existing.addresses.includes(addr)) existing.addresses.push(addr)
    }
    if (!existing.company_name && r.company_name) existing.company_name = r.company_name
    if (!existing.status && r.status) existing.status = r.status
    if (!existing.activity_type && r.activity_type) {
      existing.activity_type = r.activity_type
      const c = classifyLicense(r.activity_type)
      existing.license_label = c.label
      existing.license_color = c.color
    }
    if (!existing.valid_from && r.valid_from) existing.valid_from = r.valid_from
    if (!existing.valid_to && r.valid_to) existing.valid_to = r.valid_to
    if (!existing.kpp && r.kpp) existing.kpp = r.kpp
  }
  return [...map.values()]
}

function parseCsvText(text: string): ClassifiedRecord[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []

  const delimiter = detectDelimiter(lines[0])
  const headers = parseCsvLine(lines[0], delimiter).map((h) => normalizeHeader(h))
  const records: ClassifiedRecord[] = []

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i], delimiter)
    if (cells.every((c) => !c.trim())) continue
    const row: ParsedCsvRow = {}
    headers.forEach((h, idx) => {
      row[h || `col_${idx}`] = cells[idx] ?? ''
    })
    const rec = rowToRecord(row)
    if (rec) records.push(rec)
  }

  return mergeRecords(records)
}

async function getRegistryUrl(): Promise<string> {
  try {
    const page = await fetch(OPENDATA_PAGE, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!page.ok) throw new Error('403')
    const html = await page.text()
    const match = html.match(/href="([^"]*data-[^"]*\.(zip|csv)[^"]*)"/)
    if (match) {
      return match[1].startsWith('http') ? match[1] : `https://fsrar.gov.ru${match[1]}`
    }
    throw new Error('ссылка не найдена')
  } catch {
    return REGISTRY_ZIP_URL
  }
}

function needsUrlCheck(zipUrlCheckedAt: string | null | undefined): boolean {
  if (!zipUrlCheckedAt) return true
  return Date.now() - new Date(zipUrlCheckedAt).getTime() > URL_CHECK_INTERVAL_MS
}

async function resolveRegistryZipUrl(supabase: SupabaseClient): Promise<string> {
  const meta = await getRegistryMeta(supabase)
  if (!needsUrlCheck(meta?.zip_url_checked_at ?? null)) {
    return meta?.csv_url || REGISTRY_ZIP_URL
  }

  const url = await getRegistryUrl()
  await supabase.from('registry_meta').upsert({
    id: 1,
    zip_url_checked_at: new Date().toISOString(),
    csv_url: url,
  })
  return url
}

async function extractCsvFromZip(zipBuffer: ArrayBuffer): Promise<string> {
  const reader = new ZipReader(new Uint8ArrayReader(new Uint8Array(zipBuffer)))
  try {
    const entries = await reader.getEntries()
    const csvEntry = entries.find((e) => e.filename.endsWith('.csv'))
    if (!csvEntry) throw new Error('CSV не найден в ZIP')

    let csvText = await csvEntry.getData(new TextWriter())
    if (csvText.includes('?') || !csvText.includes('лицензи')) {
      const bytes = await csvEntry.getData(new Uint8ArrayWriter())
      csvText = new TextDecoder('windows-1251').decode(bytes)
    }
    return csvText
  } finally {
    await reader.close()
  }
}

async function logEvent(
  supabase: SupabaseClient,
  level: string,
  message: string,
  payload?: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase.from('function_logs').insert({
      function_name: 'license-registry-lookup',
      level,
      message,
      payload: payload ?? null,
    })
  } catch {
    /* ignore */
  }
}

async function getRegistryMeta(supabase: SupabaseClient) {
  const { data } = await supabase.from('registry_meta').select('*').eq('id', 1).maybeSingle()
  return data as {
    last_downloaded_at: string | null
    csv_url: string | null
    csv_size_bytes: number | null
    total_records: number | null
    zip_url_checked_at: string | null
  } | null
}

function isFreshDownloadedAt(iso: string | null | undefined): boolean {
  if (!iso) return false
  return Date.now() - new Date(iso).getTime() < CACHE_TTL_MS
}

function cacheAgeHours(downloadedAt: string | null | undefined): number {
  if (!downloadedAt) return 0
  return Math.round((Date.now() - new Date(downloadedAt).getTime()) / (60 * 60 * 1000))
}

function toLicenseRecord(row: {
  license_number: string | null
  inn: string | null
  company_name: string | null
  status: string | null
  valid_from: string | null
  valid_to: string | null
  activity_type: string | null
  license_label: string | null
  license_color: string | null
  addresses: string[] | unknown | null
  kpp: string | null
}): LicenseRecord {
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

async function loadCacheByInn(supabase: SupabaseClient, inn: string): Promise<LicenseRecord[]> {
  const normalized = normalizeInn(inn)
  const { data } = await supabase
    .from('registry_cache')
    .select('*')
    .eq('inn', normalized)
    .order('valid_to', { ascending: true, nullsFirst: false })

  if (!data?.length) return []

  const byKey = new Map<string, (typeof data)[0]>()
  for (const row of data) {
    const key = `${row.inn}|${row.license_number ?? ''}`
    const prev = byKey.get(key)
    if (!prev || new Date(row.downloaded_at) > new Date(prev.downloaded_at)) {
      byKey.set(key, row)
    }
  }

  return [...byKey.values()].map((row) =>
    toLicenseRecord({
      ...row,
      addresses: (row.addresses as string[] | null) ?? [],
    }),
  )
}

function sortByValidTo(
  records: LicenseRecord[],
  direction: 'asc' | 'desc',
): LicenseRecord[] {
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

async function upsertCacheRecord(
  supabase: SupabaseClient,
  record: ClassifiedRecord,
): Promise<void> {
  const inn = normalizeInn(record.inn)
  const licenseNumber = normalizeLicenseNumber(record.license_number)
  if (!inn) return

  const { data: existingRows } = await supabase
    .from('registry_cache')
    .select('id, status')
    .eq('inn', inn)
    .eq('license_number', licenseNumber)
    .order('downloaded_at', { ascending: false })
    .limit(1)

  const oldStatus = existingRows?.[0]?.status?.trim() ?? null
  const newStatus = record.status?.trim() ?? null

  if (existingRows?.[0]?.id) {
    await supabase
      .from('registry_cache')
      .update({
        company_name: record.company_name || null,
        status: newStatus,
        valid_from: record.valid_from,
        valid_to: record.valid_to,
        activity_type: record.activity_type || null,
        license_label: record.license_label,
        license_color: record.license_color,
        addresses: record.addresses,
        kpp: record.kpp,
        raw_data: record.raw_row ?? null,
        downloaded_at: new Date().toISOString(),
      })
      .eq('id', existingRows[0].id)
  } else {
    await supabase.from('registry_cache').insert({
      inn,
      license_number: licenseNumber || null,
      company_name: record.company_name || null,
      status: newStatus,
      valid_from: record.valid_from,
      valid_to: record.valid_to,
      activity_type: record.activity_type || null,
      license_label: record.license_label,
      license_color: record.license_color,
      addresses: record.addresses,
      kpp: record.kpp,
      raw_data: record.raw_row ?? null,
      downloaded_at: new Date().toISOString(),
    })
  }

  if (oldStatus !== newStatus && (oldStatus || newStatus)) {
    await supabase.from('license_status_history').insert({
      inn,
      license_number: licenseNumber || null,
      old_status: oldStatus,
      new_status: newStatus,
    })
  }
}

async function downloadRegistryCsv(
  supabase: SupabaseClient,
): Promise<{ text: string; url: string; sizeBytes: number }> {
  const zipUrl = await resolveRegistryZipUrl(supabase)

  const zipResponse = await fetch(zipUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(ZIP_DOWNLOAD_TIMEOUT_MS),
  })
  if (!zipResponse.ok) throw new Error(`HTTP ${zipResponse.status}`)

  const zipBuffer = await zipResponse.arrayBuffer()
  const text = await extractCsvFromZip(zipBuffer)
  return { text, url: zipUrl, sizeBytes: zipBuffer.byteLength }
}

async function refreshRegistryCache(supabase: SupabaseClient): Promise<void> {
  const { text, url, sizeBytes } = await downloadRegistryCsv(supabase)
  const all = parseCsvText(text)

  for (const record of all) {
    await upsertCacheRecord(supabase, record)
  }

  await supabase.from('registry_meta').upsert({
    id: 1,
    last_downloaded_at: new Date().toISOString(),
    csv_url: url,
    csv_size_bytes: sizeBytes,
    total_records: all.length,
  })
}

async function lookupByInn(
  supabase: SupabaseClient,
  inn: string,
): Promise<{
  active: LicenseRecord[]
  archived: LicenseRecord[]
  from_cache: boolean
  cache_age_hours: number
  last_updated: string
}> {
  const normalized = normalizeInn(inn)
  if (!normalized) throw new Error('Некорректный ИНН')

  const metaBefore = await getRegistryMeta(supabase)
  const wasFresh = isFreshDownloadedAt(metaBefore?.last_downloaded_at ?? null)

  if (!wasFresh) {
    try {
      await refreshRegistryCache(supabase)
    } catch (err) {
      const cached = await loadCacheByInn(supabase, normalized)
      if (cached.length === 0) throw err
    }
  }

  const records = await loadCacheByInn(supabase, normalized)
  const metaAfter = await getRegistryMeta(supabase)
  const lastUpdated = metaAfter?.last_downloaded_at ?? new Date().toISOString()

  return {
    ...splitActiveArchived(records),
    from_cache: wasFresh,
    cache_age_hours: cacheAgeHours(metaAfter?.last_downloaded_at),
    last_updated: lastUpdated,
  }
}

async function batchAll(supabase: SupabaseClient): Promise<{
  processed: number
  updated: number
  errors: string[]
}> {
  const errors: string[] = []
  let processed = 0
  let updated = 0

  try {
    const meta = await getRegistryMeta(supabase)
    if (!isFreshDownloadedAt(meta?.last_downloaded_at ?? null)) {
      await refreshRegistryCache(supabase)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await logEvent(supabase, 'error', `batch download: ${msg}`)
    errors.push(msg)
  }

  const { data: licenses, error: licErr } = await supabase
    .from('licenses')
    .select('id, license_number, license_status, clients(inn)')

  if (licErr) throw licErr

  for (const lic of licenses ?? []) {
    const client = lic.clients as { inn?: string } | null
    const inn = client?.inn ? normalizeInn(client.inn) : ''
    if (!inn) continue

    processed++
    try {
      const cached = await loadCacheByInn(supabase, inn)
      const best =
        cached.find(
          (m) =>
            lic.license_number &&
            normalizeLicenseNumber(m.license_number) ===
              normalizeLicenseNumber(lic.license_number as string),
        ) ?? cached[0]

      if (!best?.status) continue

      const newStatus = best.status.trim()
      const oldStatus = (lic.license_status as string | null)?.trim() ?? null
      if (newStatus === oldStatus) continue

      const { error: updErr } = await supabase
        .from('licenses')
        .update({ license_status: newStatus })
        .eq('id', lic.id)

      if (updErr) {
        errors.push(`license ${lic.id}: ${updErr.message}`)
        continue
      }

      await supabase.from('license_status_history').insert({
        inn,
        license_number: best.license_number || lic.license_number,
        old_status: oldStatus,
        new_status: newStatus,
      })

      updated++
    } catch (err) {
      errors.push(`license ${lic.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return { processed, updated, errors }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const body = (await req.json().catch(() => ({}))) as { inn?: string; mode?: string }

    if (body.mode === 'batch_all') {
      const result = await batchAll(supabase)
      return jsonResponse(result)
    }

    const inn = body.inn?.trim()
    if (!inn) {
      return jsonResponse({ error: 'Укажите inn' }, 400)
    }

    const result = await lookupByInn(supabase, inn)
    return jsonResponse(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await logEvent(supabase, 'error', message)
    return jsonResponse({ error: message }, 500)
  }
})
