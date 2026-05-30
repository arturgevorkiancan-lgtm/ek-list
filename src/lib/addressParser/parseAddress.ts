import { classifyAddressSegment } from './classifySegment'
import { normalizeAddressRaw, splitAddressSegments } from './normalize'
import type { AddressSegment, LocationKind, ParsedAddress } from './types'

const LOCATION_PRIORITY: LocationKind[] = [
  'street',
  'territory',
  'settlement',
  'district',
  'house',
]

function pickCity(segments: AddressSegment[]): string | null {
  const cities = segments.filter((segment) => segment.level === 'city')
  if (cities.length === 0) return null
  return [...cities].sort((a, b) => b.confidence - a.confidence)[0]?.value ?? null
}

function pickLocation(segments: AddressSegment[]): {
  location: string | null
  locationKind: LocationKind | null
} {
  for (const kind of LOCATION_PRIORITY) {
    const level = kind === 'district' ? 'district' : kind
    const matches = segments.filter((segment) => segment.level === level)
    if (matches.length === 0) continue
    const best = [...matches].sort((a, b) => b.confidence - a.confidence)[0]
    if (best) return { location: best.value, locationKind: kind }
  }
  return { location: null, locationKind: null }
}

export function parseAddress(raw: string | null | undefined): ParsedAddress {
  const source = raw?.trim() ?? ''
  if (!source) {
    return {
      raw: '',
      segments: [],
      city: null,
      location: null,
      locationKind: null,
    }
  }

  const normalized = normalizeAddressRaw(source)
  const parts = splitAddressSegments(normalized)
  const segments = parts.flatMap((part) => classifyAddressSegment(part))
  const city = pickCity(segments)
  const { location, locationKind } = pickLocation(segments)

  return {
    raw: source,
    segments,
    city,
    location,
    locationKind,
  }
}

export function formatAddressShortTitle(parsed: ParsedAddress): string | null {
  if (parsed.city && parsed.location) return `${parsed.city}, ${parsed.location}`
  if (parsed.city) return parsed.city
  if (parsed.location) return parsed.location
  return null
}

export function formatAddressShortTitleFromRaw(raw: string | null | undefined): string | null {
  return formatAddressShortTitle(parseAddress(raw))
}
