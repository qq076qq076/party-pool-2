import type { ComponentType } from 'react'

import type { GameId } from '@party-pool/shared'

export interface GameDisplayPlayer {
  playerId: string
  nickname: string
}

export interface GameDisplayProps {
  players: GameDisplayPlayer[]
  progress: Record<string, number>
  countdownSeconds: number | null
  remainingSeconds: number | null
}

export interface GameControllerProps {
  canInput: boolean
  onPrimaryInput: () => void
}

export interface WebGameModule {
  id: GameId
  Display: ComponentType<GameDisplayProps>
  Controller: ComponentType<GameControllerProps>
}
