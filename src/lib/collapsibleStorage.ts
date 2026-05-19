export type WarehouseSectionId = 'documents' | 'journal' | 'compliance' | 'gost'

export function readBoolStorage(key: string, defaultValue: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    if (v === null) return defaultValue
    return v === 'true'
  } catch {
    return defaultValue
  }
}

export function writeBoolStorage(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    /* ignore */
  }
}

export function warehouseExpandedKey(warehouseId: string): string {
  return `warehouse_expanded_${warehouseId}`
}

export function warehouseSectionKey(warehouseId: string, section: WarehouseSectionId): string {
  return `warehouse_section_${warehouseId}_${section}`
}

export function defaultWarehouseExpanded(
  warehouseCount: number,
  warehouseIndex: number,
): boolean {
  if (warehouseCount === 1) return true
  if (warehouseCount > 1) return false
  return warehouseIndex === 0
}

/** Name contains 11+ consecutive digits (e.g. API smoke test timestamps). */
export function hasSuspiciousWarehouseName(name: string): boolean {
  return /\d{11,}/.test(name)
}
