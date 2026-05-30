export type {
  AddressFixture,
  AddressLevel,
  AddressSegment,
  LocationKind,
  ParsedAddress,
} from './types'
export { normalizeAddressRaw, splitAddressSegments } from './normalize'
export { classifyAddressSegment } from './classifySegment'
export {
  formatAddressShortTitle,
  formatAddressShortTitleFromRaw,
  parseAddress,
} from './parseAddress'
export { ADDRESS_FIXTURES } from './fixtures'
