import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadGames, sanitizeGames, saveGames } from './localStore'
import { createGame, defaultGameConfig } from '../domain/engine'

describe('localStore', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('ignores malformed saved game records instead of returning unsafe data', () => {
    expect(
      sanitizeGames([
        {
          id: 'old-game',
          code: 'OLD123',
          name: 'Old saved game',
          status: 'lobby',
          currentRound: 0,
        },
      ]),
    ).toEqual([])
  })

  it('does not throw when localStorage quota is exceeded', () => {
    const setItem = vi.fn(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    })
    const removeItem = vi.fn()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(),
      removeItem,
      setItem,
    })

    expect(() => saveGames([createGame({ name: 'Quota', config: defaultGameConfig })])).not.toThrow()
    expect(setItem).toHaveBeenCalled()
    expect(removeItem).toHaveBeenCalledWith('beer-game.games')
  })

  it('clears stale game and session data when the storage version changes', () => {
    const storage = new Map<string, string>([
      ['beer-game.storage-version', 'old-version'],
      ['beer-game.games', JSON.stringify([createGame({ name: 'Old cache', config: defaultGameConfig })])],
      ['beer-game.session', JSON.stringify({ gameId: 'old-game', access: 'admin' })],
    ])
    const removeItem = vi.fn((key: string) => {
      storage.delete(key)
    })
    const setItem = vi.fn((key: string, value: string) => {
      storage.set(key, value)
    })
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      removeItem,
      setItem,
    })

    expect(loadGames()).toEqual([])
    expect(removeItem).toHaveBeenCalledWith('beer-game.games')
    expect(removeItem).toHaveBeenCalledWith('beer-game.session')
    expect(setItem).toHaveBeenCalledWith('beer-game.storage-version', 'local-dev')
  })
})
