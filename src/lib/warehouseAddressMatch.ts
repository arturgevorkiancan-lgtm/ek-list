import {
  formatAddressShortTitleFromRaw,
  parseAddress,
} from './addressParser/parseAddress'

/** @deprecated Используйте parseAddress — сохранено для совместимости. */
export function extractCityStreet(
  address: string | null | undefined,
): { city: string | null; street: string | null } {
  const parsed = parseAddress(address)
  return {
    city: parsed.city,
    street: parsed.location,
  }
}

export function isWarehouseAddressDuplicate(
  registryAddress: string,
  warehouseAddress: string | null | undefined,
): boolean {
  const reg = parseAddress(registryAddress)
  const wh = parseAddress(warehouseAddress)
  if (!reg.city || !reg.location || !wh.city || !wh.location) return false
  return reg.city === wh.city && reg.location === wh.location
}

export { formatAddressShortTitleFromRaw as formatWarehouseShortTitleFromParser }
export { parseAddress, formatAddressShortTitleFromRaw } from './addressParser/parseAddress'
