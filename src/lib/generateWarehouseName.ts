import { extractCityStreet } from './warehouseAddressMatch'

function capitalizeWord(word: string): string {
  if (!word) return word
  return word.charAt(0).toUpperCase() + word.slice(1)
}

/** Имя склада по адресу; при нескольких адресах в одном городе добавляет улицу. */
export function generateWarehouseName(address: string, allAddresses: string[]): string {
  const { city, street } = extractCityStreet(address)
  const sameCityCount = allAddresses.filter(
    (a) => extractCityStreet(a).city === city && city,
  ).length

  if (street && sameCityCount > 1) {
    const cityPart = city ? `${capitalizeWord(city)}, ` : ''
    return `Склад ${cityPart}${capitalizeWord(street)}`
  }
  if (city) return `Склад ${capitalizeWord(city)}`

  const short = address.length > 50 ? `${address.slice(0, 47)}…` : address
  return `Склад ${short}`
}
