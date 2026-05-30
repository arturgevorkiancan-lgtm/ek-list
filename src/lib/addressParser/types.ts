export type AddressLevel =
  | 'country'
  | 'region'
  | 'city'
  | 'district'
  | 'settlement'
  | 'territory'
  | 'street'
  | 'house'
  | 'building'
  | 'noise'

export type LocationKind = 'street' | 'territory' | 'settlement' | 'district' | 'house'

export interface AddressSegment {
  level: AddressLevel
  raw: string
  value: string
  confidence: number
}

export interface ParsedAddress {
  raw: string
  segments: AddressSegment[]
  city: string | null
  location: string | null
  locationKind: LocationKind | null
}

export interface AddressFixture {
  id: string
  input: string
  shortTitle: string | null
  city: string | null
  location: string | null
  locationKind: LocationKind | null
}
