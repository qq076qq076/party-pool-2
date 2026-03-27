import { describe, expect, it } from 'vitest'

import {
  DEFAULT_GAME_ID,
  getSharedGameDefinition,
  isValidRoomCode,
  normalizeRoomCode
} from './index'

describe('room code helpers', () => {
  it('normalizes room code to uppercase', () => {
    expect(normalizeRoomCode(' ab12 ')).toBe('AB12')
  })

  it('accepts 4-6 uppercase alnum room code', () => {
    expect(isValidRoomCode('ABCD')).toBe(true)
    expect(isValidRoomCode('AB1234')).toBe(true)
  })

  it('rejects invalid room code format', () => {
    expect(isValidRoomCode('ABC')).toBe(false)
    expect(isValidRoomCode('AB-12')).toBe(false)
    expect(isValidRoomCode('AB12345')).toBe(false)
  })

  it('exposes the default game definition', () => {
    expect(DEFAULT_GAME_ID).toBe('stair-climb')
    expect(getSharedGameDefinition(DEFAULT_GAME_ID).title).toBe('Stair Climb')
  })
})
