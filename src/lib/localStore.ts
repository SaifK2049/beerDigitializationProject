import type { Game, Session } from '../domain/types'

const GAMES_KEY = 'beer-game.games'
const SESSION_KEY = 'beer-game.session'

export function loadGames(): Game[] {
  const raw = localStorage.getItem(GAMES_KEY)
  if (!raw) {
    return []
  }

  try {
    return JSON.parse(raw) as Game[]
  } catch {
    return []
  }
}

export function saveGames(games: Game[]): void {
  localStorage.setItem(GAMES_KEY, JSON.stringify(games))
}

export function loadSession(): Session | null {
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

export function clearLocalData(): void {
  localStorage.removeItem(GAMES_KEY)
  localStorage.removeItem(SESSION_KEY)
}
