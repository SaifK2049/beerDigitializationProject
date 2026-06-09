import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Game } from '../domain/types'
import { loadGames, replaceGame, saveGames } from './localStore'
import { supabase } from './supabase'

const GAME_DOCUMENTS_TABLE = 'game_documents'

interface GameDocumentRow {
  id: string
  code: string
  payload: Game
  updated_at: string
}

export async function loadPersistedGames(): Promise<Game[]> {
  if (!supabase) {
    return loadGames()
  }

  const { data, error } = await supabase
    .from(GAME_DOCUMENTS_TABLE)
    .select('payload')
    .order('updated_at', { ascending: false })

  if (error) {
    console.warn('Supabase load failed; using local games.', error)
    return loadGames()
  }

  const games = (data ?? []).map((row) => row.payload as Game)
  saveGames(games)
  return games
}

export async function persistGame(game: Game): Promise<void> {
  const localGames = replaceGame(loadGames(), game)
  saveGames(localGames)

  if (!supabase) {
    return
  }

  const { error } = await supabase.from(GAME_DOCUMENTS_TABLE).upsert({
    id: game.id,
    code: game.code,
    payload: game,
    updated_at: new Date().toISOString(),
  })

  if (error) {
    console.warn('Supabase save failed; local copy was saved.', error)
  }
}

export function subscribeToGames(onGameChange: (game: Game) => void): () => void {
  if (!supabase) {
    return () => undefined
  }

  const client = supabase
  const channel: RealtimeChannel = client
    .channel('game-documents')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: GAME_DOCUMENTS_TABLE },
      (payload) => {
        const row = (payload.new || payload.old) as Partial<GameDocumentRow>
        if (row.payload) {
          onGameChange(row.payload)
        }
      },
    )
    .subscribe()

  return () => {
    void client.removeChannel(channel)
  }
}
