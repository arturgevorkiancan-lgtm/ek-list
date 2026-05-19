const CITY_PREFIX_RE =
  /(?:^|[,\s])(?:г\.?|город)\s*([А-ЯЁа-яё][А-ЯЁа-яё\-\s]+?)(?=[,\s]|$)/i
const FEDERAL_CITY_RE =
  /(?:^|[,\s])(Москва|Санкт-Петербург|Севастополь)(?=[,\s]|$)/i
const STREET_PREFIX_RE =
  /(?:ул\.?|улица|пр\.?|проспект|пр-т|ш\.?|шоссе|пер\.?|переулок|б-р|бульвар|наб\.?|набережная|проезд|аллея)\s*\.?\s*([А-ЯЁа-яё0-9][А-ЯЁа-яё0-9\-\.]*)/i
const STREET_SUFFIX_RE =
  /([А-ЯЁа-яё][А-ЯЁа-яё\-\.]+)\s+(?:ул\.?|улица|ш\.?|шоссе|пр\.?|проспект|пр-т|пер\.?|переулок)/i

function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function extractCityStreet(
  address: string | null | undefined,
): { city: string | null; street: string | null } {
  if (!address?.trim()) return { city: null, street: null }
  const text = address.trim()

  let city: string | null = null
  const cityMatch = text.match(CITY_PREFIX_RE) ?? text.match(FEDERAL_CITY_RE)
  if (cityMatch?.[1]) city = normalizeToken(cityMatch[1])

  let street: string | null = null
  const streetMatch = text.match(STREET_PREFIX_RE) ?? text.match(STREET_SUFFIX_RE)
  if (streetMatch?.[1]) street = normalizeToken(streetMatch[1])

  return { city, street }
}

export function isWarehouseAddressDuplicate(
  registryAddress: string,
  warehouseAddress: string | null | undefined,
): boolean {
  const reg = extractCityStreet(registryAddress)
  const wh = extractCityStreet(warehouseAddress)
  if (!reg.city || !reg.street || !wh.city || !wh.street) return false
  return reg.city === wh.city && reg.street === wh.street
}
