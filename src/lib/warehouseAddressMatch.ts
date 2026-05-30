const FEDERAL_CITIES = ['Москва', 'Санкт-Петербург', 'Севастополь'] as const

const FEDERAL_CITY_RE =
  /\b(Москва|Санкт[\s-]?Петербург(?:а)?|Севастополь)(?:\b|\s+Город\b)/i

/** «г. Москва» — не «г.о.» и не «г. муниципальный». */
const GO_CITY_RE =
  /(?:^|[,\s])г\.\s+(?!о\.|муниципальн)([А-ЯЁа-яё]{2,}[А-ЯЁа-яё\-]*)/i

const GO_DISTRICT_CITY_RE =
  /(?:^|[,\s])г\.о\.\s*([А-ЯЁа-яё]{2,}[А-ЯЁа-яё\-]*)/i

/** «ул. Ленина», «шоссе Энтузиастов» — только явные сокращения с точкой и пробелом. */
const STREET_PREFIX_RE =
  /(?:^|[,\s])(?:улица|проспект|переулок|шоссе|бульвар|набережная|проезд|аллея|пр-т|(?:ул|пр|пер|ш|наб|б-р)\.\s+)([А-ЯЁа-яё0-9][А-ЯЁа-яё0-9\-\.]*)/i

/** «Горское шоссе», «Ленина ул.» */
const STREET_SUFFIX_RE =
  /([А-ЯЁа-яё][А-ЯЁа-яё\-\.]+)\s+(ул\.?|улица|шоссе|ш\.(?=\s|,|$)|пр\.(?=\s|,|$)|проспект|пр-т|пер\.(?=\s|,|$)|переулок|б-р|бульвар|наб\.(?=\s|,|$)|набережная)/i

const TERRITORY_RE =
  /(?:^|[,\s])(?:территория\s+|тер\.\s+(?!г\.))([А-ЯЁа-яё0-9][А-ЯЁа-яё0-9\-\.\s]*?)(?=[,\s]|$)/i

const SETTLEMENT_RE =
  /(?:^|[,\s])(?:пос\.|поселок)\s+([А-ЯЁа-яё]{2,}[А-ЯЁа-яё\-]*)/i

const MUNICIPAL_DISTRICT_RE =
  /муниципальный\s+округ\s+([А-ЯЁа-яё]{2,}[А-ЯЁа-яё\-]*)/i

const HOUSE_RE = /(?:^|[,\s])д\.\s*([0-9]+[А-ЯЁа-яё]?)/i

const STREET_TYPE_LABEL: Record<string, string> = {
  ул: 'ул.',
  улица: 'улица',
  ш: 'шоссе',
  шоссе: 'шоссе',
  пр: 'пр.',
  проспект: 'проспект',
  'пр-т': 'пр-т',
  пер: 'пер.',
  переулок: 'переулок',
  'б-р': 'б-р',
  бульвар: 'бульвар',
  наб: 'наб.',
  набережная: 'набережная',
}

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

function isValidStreetToken(value: string): boolean {
  const token = normalizeToken(value)
  return token.length >= 2
}

function normalizeFederalCity(raw: string): string {
  const lower = raw.toLowerCase().replace(/\s+/g, ' ').trim()
  if (lower.startsWith('санкт')) return 'Санкт-Петербург'
  if (lower.startsWith('москв')) return 'Москва'
  if (lower.startsWith('севастопол')) return 'Севастополь'
  return capitalizeWord(raw.replace(/а$/i, ''))
}

function formatStreetSuffix(name: string, typeRaw: string): string {
  const namePart = capitalizeWord(normalizeToken(name))
  const typeKey = normalizeToken(typeRaw)
  const label = STREET_TYPE_LABEL[typeKey] ?? typeRaw.trim()
  if (label.endsWith('.')) return `${namePart} ${label}`
  return `${namePart} ${label}`
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
  const suffix = text.match(STREET_SUFFIX_RE)
  if (suffix?.[1] && suffix[2] && isValidStreetToken(suffix[1])) {
    return formatStreetSuffix(suffix[1], suffix[2])
  }

  const prefix = text.match(STREET_PREFIX_RE)
  if (prefix?.[1] && isValidStreetToken(prefix[1])) {
    return capitalizeWord(normalizeToken(prefix[1]))
  }

  const territory = text.match(TERRITORY_RE)
  if (territory?.[1]) {
    const raw = territory[1].trim()
    if (raw.length >= 2 && raw.length <= 40) return capitalizeWord(raw)
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
