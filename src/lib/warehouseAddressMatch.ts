const FEDERAL_CITIES = ['Москва', 'Санкт-Петербург', 'Севастополь'] as const

const FEDERAL_CITY_RE =
  /\b(Москва|Санкт[\s-]?Петербург(?:а)?|Севастополь)(?:\b|\s+Город\b)/i

const GO_CITY_RE =
  /(?:^|[,\s])г\.\s*(?!муниципальн)([А-ЯЁа-яё][А-ЯЁа-яё\-]+?)(?=[,\s]|$)/i

const GO_DISTRICT_CITY_RE =
  /(?:^|[,\s])г\.о\.\s*([А-ЯЁа-яё][А-ЯЁа-яё\-]+?)(?=[,\s]|$)/i

const STREET_PREFIX_RE =
  /(?:^|[,\s])(?:ул\.?|улица|пр\.?|проспект|пр-т|ш\.?|шоссе|пер\.?|переулок|б-р|бульвар|наб\.?|набережная|проезд|аллея)\s*\.?\s*([А-ЯЁа-яё0-9][А-ЯЁа-яё0-9\-\.]*)/i

const STREET_SUFFIX_RE =
  /([А-ЯЁа-яё][А-ЯЁа-яё\-\.]+)\s+(?:ул\.?|улица|ш\.?|шоссе|пр\.?|проспект|пр-т|пер\.?|переулок)/i

const TERRITORY_RE =
  /(?:^|[,\s])(?:тер\.|территория)\s+([А-ЯЁа-яё0-9][А-ЯЁа-яё0-9\-\.\s]*?)(?=[,\s]|$)/i

const SETTLEMENT_RE =
  /(?:^|[,\s])(?:пос\.|поселок|п\.)\s*([А-ЯЁа-яё][А-ЯЁа-яё\-]+)/i

const MUNICIPAL_DISTRICT_RE =
  /муниципальный\s+округ\s+([А-ЯЁа-яё][А-ЯЁа-яё\-]+)/i

const HOUSE_RE = /(?:^|[,\s])д\.\s*([0-9]+[А-ЯЁа-яё]?)/i

function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function capitalizeWord(word: string): string {
  if (!word) return word
  return word.charAt(0).toUpperCase() + word.slice(1)
}

function normalizeFederalCity(raw: string): string {
  const lower = raw.toLowerCase().replace(/\s+/g, ' ').trim()
  if (lower.startsWith('санкт')) return 'Санкт-Петербург'
  if (lower.startsWith('москв')) return 'Москва'
  if (lower.startsWith('севастопол')) return 'Севастополь'
  return capitalizeWord(raw.replace(/а$/i, ''))
}

function extractCity(text: string): string | null {
  const federal = text.match(FEDERAL_CITY_RE)
  if (federal?.[1]) return normalizeFederalCity(federal[1])

  for (const city of FEDERAL_CITIES) {
    if (text.includes(city)) return city
  }

  const goCity = text.match(GO_CITY_RE)
  if (goCity?.[1]) {
    const token = normalizeToken(goCity[1])
    if (token && !token.startsWith('муниципальн')) {
      return capitalizeWord(token)
    }
  }

  const district = text.match(GO_DISTRICT_CITY_RE)
  if (district?.[1]) return capitalizeWord(normalizeToken(district[1]))

  return null
}

function extractStreet(text: string): string | null {
  const prefix = text.match(STREET_PREFIX_RE) ?? text.match(STREET_SUFFIX_RE)
  if (prefix?.[1]) return capitalizeWord(normalizeToken(prefix[1]))

  const territory = text.match(TERRITORY_RE)
  if (territory?.[1]) {
    const raw = territory[1].trim()
    if (raw.length <= 40) return capitalizeWord(raw)
  }

  const settlement = text.match(SETTLEMENT_RE)
  if (settlement?.[1]) return capitalizeWord(normalizeToken(settlement[1]))

  const district = text.match(MUNICIPAL_DISTRICT_RE)
  if (district?.[1]) return capitalizeWord(normalizeToken(district[1]))

  const house = text.match(HOUSE_RE)
  if (house?.[1]) return `д. ${house[1]}`

  return null
}

export function extractCityStreet(
  address: string | null | undefined,
): { city: string | null; street: string | null } {
  if (!address?.trim()) return { city: null, street: null }
  const text = address.trim().replace(/\s+/g, ' ')
  return {
    city: extractCity(text),
    street: extractStreet(text),
  }
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
