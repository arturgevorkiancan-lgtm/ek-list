import { diagnostics } from './diagnostics'
import {
  SOURCE_APPLICATION,
  SOURCE_EGRYL,
  SOURCE_RATK,
  SOURCE_REGISTRY,
} from './conflictDetector.constants'

export interface ConsolidatedData {
  fullName?: string
  shortName?: string
  inn?: string
  kpp?: string
  ogrn?: string
  legalAddress?: string
  licenseNumber?: string
  issueDate?: string
  expiryDate?: string
  licenseActivity?: string
  branches?: Array<{ kpp: string; address: string }>
}

export interface DataSource {
  sourceName: string
  sourceDate?: string
  data: Partial<ConsolidatedData>
}

export interface ConflictItem {
  field: string
  fieldKey: string
  values: Array<{ sourceName: string; value: string }>
}

/** Higher priority first: РАТК > Реестр > ЕГРЮЛ > Заявление */
export const SOURCE_PRIORITY = [
  SOURCE_RATK,
  SOURCE_REGISTRY,
  SOURCE_EGRYL,
  SOURCE_APPLICATION,
] as const

export const FIELD_LABELS: Record<string, string> = {
  fullName: 'Полное наименование',
  shortName: 'Сокращённое наименование',
  inn: 'ИНН',
  kpp: 'КПП (организации)',
  ogrn: 'ОГРН',
  legalAddress: 'Юридический адрес',
  licenseNumber: 'Номер лицензии',
  issueDate: 'Дата начала действия',
  expiryDate: 'Дата окончания действия',
  licenseActivity: 'Вид деятельности',
}

const SCALAR_FIELDS = [
  'fullName',
  'shortName',
  'inn',
  'kpp',
  'ogrn',
  'legalAddress',
  'licenseNumber',
  'issueDate',
  'expiryDate',
  'licenseActivity',
] as const

const DATE_FIELDS = new Set<string>(['issueDate', 'expiryDate'])

export function normalizeValue(val: string): string {
  return val
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase()
    .replace(/,+/g, ',')
}

function normalizeDate(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return trimmed
  const dmy = trimmed.match(/(\d{2})[.\-/](\d{2})[.\-/](\d{4})/)
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`
  return trimmed
}

function normalizeField(fieldKey: string, value: string): string {
  if (DATE_FIELDS.has(fieldKey)) return normalizeDate(value)
  return normalizeValue(value)
}

export function sourcePriorityIndex(sourceName: string): number {
  const idx = SOURCE_PRIORITY.indexOf(sourceName as (typeof SOURCE_PRIORITY)[number])
  return idx >= 0 ? idx : SOURCE_PRIORITY.length
}

function compareSources(a: DataSource, b: DataSource): number {
  const pa = sourcePriorityIndex(a.sourceName)
  const pb = sourcePriorityIndex(b.sourceName)
  if (pa !== pb) return pa - pb
  const da = a.sourceDate ?? ''
  const db = b.sourceDate ?? ''
  return db.localeCompare(da)
}

function pickBestValue(entries: Array<{ source: DataSource; value: string }>): string {
  const sorted = [...entries].sort((a, b) => compareSources(a.source, b.source))
  return sorted[0]?.value ?? ''
}

export function getDefaultValue(conflict: ConflictItem): string {
  return conflict.values[0]?.value ?? ''
}

export function detectConflicts(sources: DataSource[]): {
  conflicts: ConflictItem[]
  merged: ConsolidatedData
} {
  const conflicts: ConflictItem[] = []
  const merged: ConsolidatedData = {}

  for (const fieldKey of SCALAR_FIELDS) {
    const entries: Array<{ source: DataSource; value: string; display: string }> = []
    for (const source of sources) {
      const raw = source.data[fieldKey as keyof ConsolidatedData]
      if (typeof raw !== 'string' || !raw.trim()) continue
      entries.push({
        source,
        value: raw.trim(),
        display: DATE_FIELDS.has(fieldKey) ? normalizeDate(raw) : raw.trim(),
      })
    }
    if (entries.length === 0) continue

    const normalizedGroups = new Map<
      string,
      Array<{ sourceName: string; value: string }>
    >()
    for (const entry of entries) {
      const norm = normalizeField(fieldKey, entry.value)
      const list = normalizedGroups.get(norm) ?? []
      const displayValue = DATE_FIELDS.has(fieldKey)
        ? normalizeDate(entry.value)
        : entry.display
      if (!list.some((v) => v.sourceName === entry.source.sourceName)) {
        list.push({
          sourceName: entry.source.sourceName,
          value: displayValue,
        })
      }
      normalizedGroups.set(norm, list)
    }

    if (normalizedGroups.size > 1) {
      const allValues: Array<{ sourceName: string; value: string }> = []
      for (const group of normalizedGroups.values()) {
        for (const v of group) {
          if (!allValues.some((x) => x.sourceName === v.sourceName && x.value === v.value)) {
            allValues.push(v)
          }
        }
      }
      allValues.sort(
        (a, b) => sourcePriorityIndex(a.sourceName) - sourcePriorityIndex(b.sourceName),
      )
      const fieldLabel = FIELD_LABELS[fieldKey] ?? fieldKey
      conflicts.push({
        field: fieldLabel,
        fieldKey,
        values: allValues,
      })
      diagnostics.warn('Конфликты', `Расхождение: ${fieldLabel}`, {
        values: allValues.map((v) => `${v.sourceName}: ${v.value}`),
      })
    }

    const best = pickBestValue(entries.map((e) => ({ source: e.source, value: e.value })))
    if (DATE_FIELDS.has(fieldKey)) {
      merged[fieldKey as 'issueDate' | 'expiryDate'] = normalizeDate(best)
    } else {
      ;(merged as Record<string, string>)[fieldKey] = best
    }
  }

  const kppAddressMap = new Map<
    string,
    Map<string, { source: DataSource; address: string }>
  >()

  for (const source of sources) {
    for (const branch of source.data.branches ?? []) {
      const kpp = branch.kpp?.trim()
      const address = branch.address?.trim()
      if (!kpp || !address) continue
      if (!kppAddressMap.has(kpp)) kppAddressMap.set(kpp, new Map())
      const byNorm = kppAddressMap.get(kpp)!
      const norm = normalizeValue(address)
      if (!byNorm.has(norm)) {
        byNorm.set(norm, { source, address })
      }
    }
  }

  const mergedBranches: Array<{ kpp: string; address: string }> = []
  for (const [kpp, normMap] of kppAddressMap) {
    const variants = [...normMap.values()]
    if (variants.length > 1) {
      const values = variants
        .map((v) => ({
          sourceName: v.source.sourceName,
          value: v.address,
        }))
        .sort(
          (a, b) => sourcePriorityIndex(a.sourceName) - sourcePriorityIndex(b.sourceName),
        )
      const branchField = `Адрес подразделения (КПП ${kpp})`
      conflicts.push({
        field: branchField,
        fieldKey: `branch:${kpp}`,
        values,
      })
      diagnostics.warn('Конфликты', `Расхождение: ${branchField}`, {
        values: values.map((v) => `${v.sourceName}: ${v.value}`),
      })
    }
    const best = [...variants].sort((a, b) => compareSources(a.source, b.source))[0]
    if (best) mergedBranches.push({ kpp, address: best.address })
  }

  if (mergedBranches.length > 0) {
    merged.branches = mergedBranches
  }

  return { conflicts, merged }
}

export {
  detectAndSaveConflicts,
  normalizeForConflictCompare,
  valuesConflict,
} from './conflictPersistence'
export type { DetectConflictsParams, DetectConflictsResult } from './conflictPersistence'

export function formatSourceBadge(sourceName: string | 'manual'): string {
  if (sourceName === 'manual') return '✏️ вручную'
  const short =
    sourceName === SOURCE_RATK
      ? 'РАТК'
      : sourceName === SOURCE_REGISTRY
        ? 'реестра'
        : sourceName === SOURCE_EGRYL
          ? 'ЕГРЮЛ'
          : sourceName === SOURCE_APPLICATION
            ? 'заявления'
            : sourceName
  return `📄 из ${short}`
}
