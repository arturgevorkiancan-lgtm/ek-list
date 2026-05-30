import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { ADDRESS_FIXTURES } from './fixtures.ts'
import { formatAddressShortTitle, parseAddress } from './parseAddress.ts'

describe('addressParser', () => {
  for (const fixture of ADDRESS_FIXTURES) {
    test(fixture.id, () => {
      const parsed = parseAddress(fixture.input)
      assert.equal(parsed.city, fixture.city, 'city')
      assert.equal(parsed.location, fixture.location, 'location')
      assert.equal(parsed.locationKind, fixture.locationKind, 'locationKind')
      assert.equal(formatAddressShortTitle(parsed), fixture.shortTitle, 'shortTitle')
    })
  }
})
