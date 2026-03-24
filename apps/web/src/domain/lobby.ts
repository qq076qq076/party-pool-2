import type { RoomSnapshot, ServerMessage } from '@party-pool/shared'

import type { LobbyStateMessage } from './lobby.types'

export interface LobbyState {
  room: RoomSnapshot | null
  selfPlayerId: string | null
  rejoinToken: string | null
  isHost: boolean
  readyDeadlineAt: number | null
  gameStartedAt: number | null
  error: string | null
}

export const initialLobbyState: LobbyState = {
  room: null,
  selfPlayerId: null,
  rejoinToken: null,
  isHost: false,
  readyDeadlineAt: null,
  gameStartedAt: null,
  error: null
}

export const applyServerMessage = (
  state: LobbyState,
  message: LobbyStateMessage | ServerMessage
): LobbyState => {
  switch (message.event) {
    case 'room_created':
      return {
        ...state,
        room: message.payload.room,
        selfPlayerId: message.payload.playerId,
        rejoinToken: message.payload.rejoinToken,
        isHost: true,
        error: null
      }
    case 'room_joined':
      return {
        ...state,
        room: message.payload.room,
        selfPlayerId: message.payload.playerId,
        rejoinToken: message.payload.rejoinToken,
        isHost: false,
        error: null
      }
    case 'room_state_updated':
      return {
        ...state,
        room: message.payload.room
      }
    case 'ready_timer_started':
      return {
        ...state,
        readyDeadlineAt: message.payload.readyDeadlineAt
      }
    case 'game_started':
      return {
        ...state,
        gameStartedAt: message.payload.startedAt,
        readyDeadlineAt: null
      }
    case 'error':
      return {
        ...state,
        error: message.payload.message
      }
    default:
      return state
  }
}
