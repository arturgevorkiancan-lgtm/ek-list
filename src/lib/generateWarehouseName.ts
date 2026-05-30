import { extractCityStreet } from './warehouseAddressMatch'

/** Краткое название: «Город, улица» из адреса. */
export function formatWarehouseShortTitle(address: string | null | undefined): string | null {
  const { city, street } = extractCityStreet(address)
  if (city && street) return `${city}, ${street}`
  if (city) return city
  return null
}

/** Имя склада при создании из реестра. */
export function generateWarehouseName(address: string, _allAddresses?: string[]): string {
  const short = formatWarehouseShortTitle(address)
  if (short) return `Склад ${short}`

  const trimmed = address.trim()
  const fallback = trimmed.length > 50 ? `${trimmed.slice(0, 47)}…` : trimmed
  return `Склад ${fallback}`
}

/** Заголовок склада в UI: адрес → кратко, иначе сохранённое имя. */
export function warehouseDisplayTitle(warehouse: {
  name: string
  address?: string | null
}): string {
  const fromAddress = formatWarehouseShortTitle(warehouse.address)
  if (fromAddress) return fromAddress
  return warehouse.name.replace(/^склад\s+/i, '')
}
