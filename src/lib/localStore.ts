import type { Game, Session } from '../domain/types'

const GAMES_KEY = 'beer-game.games'
const SESSION_KEY = 'beer-game.session'
const STORAGE_VERSION_KEY = 'beer-game.storage-version'
const LOCAL_GAME_CACHE_LIMIT = 6
const STORAGE_VERSION = import.meta.env.VITE_APP_VERSION ?? 'local-dev'

export function loadGames(): Game[] {
  ensureCurrentStorageVersion()
  const raw = localStorage.getItem(GAMES_KEY)
  if (!raw) {
    return []
  }

  try {
    return sanitizeGames(JSON.parse(raw))
  } catch {
    return []
  }
}

export function saveGames(games: Game[]): void {
  const cache = sanitizeGames(games).slice(0, LOCAL_GAME_CACHE_LIMIT)
  if (trySaveGames(cache)) {
    return
  }

  if (trySaveGames(cache.slice(0, 1))) {
    return
  }

  try {
    localStorage.removeItem(GAMES_KEY)
  } catch (error) {
    console.warn('Could not clear local game cache.', error)
  }
}

export function loadSession(): Session | null {
  ensureCurrentStorageVersion()
  const raw = localStorage.getItem(SESSION_KEY)
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as Session
  } catch {
    return null
  }
}

export function saveSession(session: Session | null): void {
  if (!session) {
    localStorage.removeItem(SESSION_KEY)
    return
  }

  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function replaceGame(games: Game[], updatedGame: Game): Game[] {
  return games.some((game) => game.id === updatedGame.id)
    ? games.map((game) => (game.id === updatedGame.id ? updatedGame : game))
    : [updatedGame, ...games]
}

export function sanitizeGames(value: unknown): Game[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter(isGameRecord)
}

function isGameRecord(value: unknown): value is Game {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<Game>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.code === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.status === 'string' &&
    typeof candidate.currentRound === 'number' &&
    Boolean(candidate.config) &&
    Array.isArray(candidate.roleAssignments) &&
    Array.isArray(candidate.rounds) &&
    Array.isArray(candidate.roleRoundStates) &&
    Array.isArray(candidate.orders) &&
    Array.isArray(candidate.shipments) &&
    Array.isArray(candidate.costSnapshots) &&
    Array.isArray(candidate.decisionRecommendations) &&
    Array.isArray(candidate.auditLogs)
  )
}

export function clearLocalData(): void {
  localStorage.removeItem(GAMES_KEY)
  localStorage.removeItem(SESSION_KEY)
}

function ensureCurrentStorageVersion(): void {
  try {
    if (localStorage.getItem(STORAGE_VERSION_KEY) === STORAGE_VERSION) {
      return
    }

    localStorage.removeItem(GAMES_KEY)
    localStorage.removeItem(SESSION_KEY)
    localStorage.setItem(STORAGE_VERSION_KEY, STORAGE_VERSION)
  } catch (error) {
    console.warn('Could not update local storage version; continuing with available local data.', error)
  }
}

function trySaveGames(games: Game[]): boolean {
  try {
    localStorage.setItem(GAMES_KEY, JSON.stringify(games))
    return true
  } catch (error) {
    console.warn('Local game cache save failed; continuing without full local cache.', error)
    return false
  }
}
