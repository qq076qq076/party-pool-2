export const GAME_IDS = ['stair-climb'] as const

export type GameId = (typeof GAME_IDS)[number]

export const DEFAULT_GAME_ID: GameId = 'stair-climb'

export interface SharedGameDefinition {
  id: GameId
  title: string
  description: string
}

export const SHARED_GAME_DEFINITIONS: Record<GameId, SharedGameDefinition> = {
  'stair-climb': {
    id: 'stair-climb',
    title: 'Stair Climb',
    description: 'Tap to climb one stair at a time.'
  }
}

export const getSharedGameDefinition = (gameId: GameId): SharedGameDefinition =>
  SHARED_GAME_DEFINITIONS[gameId]
