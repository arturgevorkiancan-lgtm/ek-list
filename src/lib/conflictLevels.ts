export type ConflictLevel = 'critical' | 'important' | 'info'

const CRITICAL_FIELDS = ['inn', 'ogrn', 'license_number']
const IMPORTANT_FIELDS = ['kpp', 'address', 'license_status', 'valid_to']
const INFO_FIELDS = ['area', 'floor', 'purpose', 'cadastral_number']

/** Красный — требует комментария при подтверждении */
export function isCriticalField(field: string): boolean {
  return CRITICAL_FIELDS.includes(field)
}

/** Жёлтый — «Принять как есть» или «Подтвердить» */
export function isImportantField(field: string): boolean {
  return IMPORTANT_FIELDS.includes(field)
}

/** Синий — принять одним кликом */
export function isInfoField(field: string): boolean {
  return INFO_FIELDS.includes(field)
}

export function getConflictLevel(field: string): ConflictLevel {
  if (CRITICAL_FIELDS.includes(field)) return 'critical'
  if (IMPORTANT_FIELDS.includes(field)) return 'important'
  return 'info'
}

export const CONFLICT_LEVEL_ORDER: Record<ConflictLevel, number> = {
  critical: 0,
  important: 1,
  info: 2,
}
