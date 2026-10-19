import { describe, expect, it } from 'vitest'
import {
  MAX_PRICE_MINOR,
  currencyExponent,
  minorToMajorString,
  parseMajorToMinor,
} from './money.ts'

describe('parseMajorToMinor', () => {
  it('converts without float error', () => {
    expect(parseMajorToMinor('19.99', 2)).toBe(1999)
    expect(parseMajorToMinor('0.29', 2)).toBe(29)
    expect(parseMajorToMinor('1.1', 2)).toBe(110)
    expect(parseMajorToMinor('250', 2)).toBe(25000)
    expect(parseMajorToMinor('0', 2)).toBe(0)
  })

  it('accepts Arabic-Indic digits and the Arabic decimal separator', () => {
    expect(parseMajorToMinor('١٩٩٫٥', 2)).toBe(19950)
  })

  it('rejects too many decimals, junk and negatives', () => {
    expect(parseMajorToMinor('1.999', 2)).toBeNull()
    expect(parseMajorToMinor('5.5', 0)).toBeNull()
    expect(parseMajorToMinor('abc', 2)).toBeNull()
    expect(parseMajorToMinor('-5', 2)).toBeNull()
    expect(parseMajorToMinor('', 2)).toBeNull()
    expect(parseMajorToMinor('1e3', 2)).toBeNull()
    expect(parseMajorToMinor('5.', 2)).toBeNull()
  })

  it('rejects amounts above the API maximum', () => {
    expect(parseMajorToMinor(String(MAX_PRICE_MINOR / 100), 2)).toBe(MAX_PRICE_MINOR)
    expect(parseMajorToMinor(String(MAX_PRICE_MINOR / 100 + 1), 2)).toBeNull()
  })
})

describe('minorToMajorString', () => {
  it('round-trips with parseMajorToMinor', () => {
    for (const minor of [0, 5, 99, 100, 1999, 25000, 123456789]) {
      expect(parseMajorToMinor(minorToMajorString(minor, 2), 2)).toBe(minor)
    }
    expect(minorToMajorString(5, 2)).toBe('0.05')
    expect(minorToMajorString(7, 0)).toBe('7')
    expect(minorToMajorString(1234, 3)).toBe('1.234')
  })
})

describe('currencyExponent', () => {
  it('knows common currencies', () => {
    expect(currencyExponent('EGP')).toBe(2)
    expect(currencyExponent('JPY')).toBe(0)
    expect(currencyExponent('KWD')).toBe(3)
  })
})
