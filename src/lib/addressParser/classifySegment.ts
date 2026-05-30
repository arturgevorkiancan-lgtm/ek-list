import type { AddressSegment } from './types'

const FEDERAL_CITIES = ['Москва', 'Санкт-Петербург', 'Севастополь'] as const

const FEDERAL_CITY_RE =
  /^(?:.*?,\s*)?(Москва|Санкт[\s-]?Петербург(?:а)?|Севастополь)(?:\s+Город)?$/i

const REGION_RE =
  /^([А-ЯЁ][а-яё]+(?:ая|ой|ий|ая)\s+(?:область|край)|республика\s+[А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+)?)$/i

const GO_DISTRICT_RE = /(?:^|[,\s])г\.о\.\s*([А-ЯЁа-яё]{2,}[А-ЯЁа-яё\-]*)/i

const GO_CITY_RE = /(?:^|[,\s])г\.\s+(?!о\.|муниципальн)([А-ЯЁа-яё]{2,}[А-ЯЁа-яё\-]*)/i

const MUNICIPAL_DISTRICT_RE = /муниципальный\s+округ\s+([А-ЯЁа-яё]{2,}[А-ЯЁа-яё\-]*)/i

const SETTLEMENT_RE = /(?:^|[,\s])(?:пос\.|поселок)\s+([А-ЯЁа-яё]{2,}[А-ЯЁа-яё\-]*)/i

const STREET_SUFFIX_RE =
  /([А-ЯЁа-яё][А-ЯЁа-яё\-\.]+)\s+(ул\.?|улица|шоссе|ш\.(?=\s|,|$)|пр\.(?=\s|,|$)|проспект|пр-т|пер\.(?=\s|,|$)|переулок|б-р|бульвар|наб\.(?=\s|,|$)|набережная)/i

const STREET_PREFIX_RE =
  /(?:^|[,\s])(?:улица|проспект|переулок|шоссе|бульвар|набережная|проезд|аллея|пр-т|(?:ул|пр|пер|ш|наб|б-р)\.)\s+([А-ЯЁа-яё0-9][А-ЯЁа-яё0-9\-\.]*)/i

const TERRITORY_RE =
  /(?:^|[,\s])(?:территория\s+|тер\.\s+(?!г\.))([А-ЯЁа-яё0-9][А-ЯЁа-яё0-9\-\.\s]+)/i

const HOUSE_RE = /(?:^|[,\s])(?:д\.|дом)\s*([0-9]+[А-ЯЁа-яё]?)/i

const NOISE_RE =
  /^(?:россия|российская\s+федерация|\d{6})$|(?:назначение|нежилое|кв-л|литера|помещение|этаж|уровень|комната|корпус|стр\.|S\s*=|площадь|административно|складское|здание|ЕГАИС|внутригородское|образование|федерального\s+значения|муниципальное)/i

const VNUTR_TER_RE = /^вн\.?\s*тер\.?(?:\s|$)/i

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

function capitalizePhrase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => capitalizeWord(word))
    .join(' ')
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

function isValidToken(value: string): boolean {
  return normalizeToken(value).length >= 2
}

function segment(segmentRaw: string, level: AddressSegment['level'], value: string, confidence: number): AddressSegment {
  return { level, raw: segmentRaw, value, confidence }
}

function classifyFederalCity(part: string): AddressSegment | null {
  for (const city of FEDERAL_CITIES) {
    if (part === city || new RegExp(`^${city}\\s+Город$`, 'i').test(part)) {
      return segment(part, 'city', city, 1)
    }
  }

  const match = part.match(FEDERAL_CITY_RE)
  if (match?.[1]) {
    return segment(part, 'city', normalizeFederalCity(match[1]), 1)
  }

  if (FEDERAL_CITIES.some((city) => part.includes(city))) {
    const found = FEDERAL_CITIES.find((city) => part.includes(city))
    if (found) return segment(part, 'city', found, 0.95)
  }

  return null
}

function classifyGoDistrict(part: string): AddressSegment | null {
  const match = part.match(GO_DISTRICT_RE)
  if (match?.[1] && isValidToken(match[1])) {
    return segment(part, 'city', capitalizeWord(normalizeToken(match[1])), 0.9)
  }
  return null
}

function classifyGoCity(part: string): AddressSegment | null {
  const match = part.match(GO_CITY_RE)
  if (match?.[1] && isValidToken(match[1])) {
    return segment(part, 'city', capitalizeWord(normalizeToken(match[1])), 0.85)
  }
  return null
}

function classifyMunicipalDistrict(part: string): AddressSegment | null {
  const match = part.match(MUNICIPAL_DISTRICT_RE)
  if (match?.[1] && isValidToken(match[1])) {
    return segment(part, 'district', capitalizeWord(normalizeToken(match[1])), 0.88)
  }
  return null
}

function classifySettlement(part: string): AddressSegment | null {
  const match = part.match(SETTLEMENT_RE)
  if (match?.[1] && isValidToken(match[1])) {
    return segment(part, 'settlement', capitalizeWord(normalizeToken(match[1])), 0.82)
  }
  return null
}

function classifyStreet(part: string): AddressSegment | null {
  const suffix = part.match(STREET_SUFFIX_RE)
  if (suffix?.[1] && suffix[2] && isValidToken(suffix[1])) {
    return segment(part, 'street', formatStreetSuffix(suffix[1], suffix[2]), 0.95)
  }

  const prefix = part.match(STREET_PREFIX_RE)
  if (prefix?.[1] && isValidToken(prefix[1])) {
    return segment(part, 'street', capitalizeWord(normalizeToken(prefix[1])), 0.9)
  }

  return null
}

function classifyTerritory(part: string): AddressSegment | null {
  const match = part.match(TERRITORY_RE)
  if (match?.[1]) {
    const raw = match[1].trim()
    if (raw.length >= 2 && raw.length <= 40) {
      return segment(part, 'territory', capitalizePhrase(raw), 0.8)
    }
  }
  return null
}

function classifyHouse(part: string): AddressSegment | null {
  const match = part.match(HOUSE_RE)
  if (match?.[1]) {
    return segment(part, 'house', `д. ${match[1]}`, 0.6)
  }
  return null
}

function classifyRegion(part: string): AddressSegment | null {
  if (REGION_RE.test(part)) {
    return segment(part, 'region', part, 0.3)
  }
  return null
}

function classifyNoise(part: string): AddressSegment | null {
  if (VNUTR_TER_RE.test(part) && !MUNICIPAL_DISTRICT_RE.test(part)) {
    return segment(part, 'noise', part, 0.1)
  }
  if (NOISE_RE.test(part)) {
    return segment(part, 'noise', part, 0.1)
  }
  return null
}

/** Классификация одного сегмента; составные сегменты (округ внутри «вн. тер.») разбираются по приоритету. */
export function classifyAddressSegment(part: string): AddressSegment[] {
  const found: AddressSegment[] = []

  const pushUnique = (candidate: AddressSegment | null) => {
    if (!candidate) return
    if (found.some((item) => item.level === candidate.level && item.value === candidate.value)) return
    found.push(candidate)
  }

  pushUnique(classifyFederalCity(part))
  pushUnique(classifyGoDistrict(part))
  pushUnique(classifyGoCity(part))
  pushUnique(classifyMunicipalDistrict(part))
  pushUnique(classifySettlement(part))
  pushUnique(classifyStreet(part))
  pushUnique(classifyTerritory(part))
  pushUnique(classifyHouse(part))
  pushUnique(classifyRegion(part))

  if (found.length === 0) {
    pushUnique(classifyNoise(part))
  }

  return found
}
