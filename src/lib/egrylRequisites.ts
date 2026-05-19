import type { ParsedEGRYLData } from '../types'
import { sanitizeEgrulLegalAddress } from './egrulAddress'

export interface ClientRequisitesSnapshot {
  name: string
  inn: string | null
  kpp: string | null
  ogrn: string | null
  legal_address: string | null
}

function norm(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

export function parsedEgrylToRequisites(parsed: ParsedEGRYLData['client']) {
  const name = parsed.fullName || parsed.shortName
  return {
    name: name.trim(),
    inn: parsed.inn.trim() || null,
    kpp: parsed.kpp.trim() || null,
    ogrn: parsed.ogrn.trim() || null,
    legal_address: sanitizeEgrulLegalAddress(parsed.legalAddress) || null,
  }
}

const FIELD_LABELS: Record<keyof ClientRequisitesSnapshot, string> = {
  name: 'название',
  inn: 'ИНН',
  kpp: 'КПП',
  ogrn: 'ОГРН',
  legal_address: 'адрес',
}

/** Fields that differ between stored client requisites and freshly parsed ЕГРЮЛ. */
export function getEgrylRequisiteChanges(
  current: ClientRequisitesSnapshot,
  parsed: ParsedEGRYLData['client'],
): (keyof ClientRequisitesSnapshot)[] {
  const next = parsedEgrylToRequisites(parsed)
  const keys: (keyof ClientRequisitesSnapshot)[] = [
    'name',
    'inn',
    'kpp',
    'ogrn',
    'legal_address',
  ]
  return keys.filter((key) => {
    const a = norm(current[key] ?? '')
    const b = norm(next[key] ?? '')
    return b && a !== b
  })
}

export function formatEgrylChangeLabels(
  keys: (keyof ClientRequisitesSnapshot)[],
): string {
  return keys.map((k) => FIELD_LABELS[k]).join(', ')
}
