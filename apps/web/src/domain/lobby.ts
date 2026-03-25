import type { RoomSnapshot, ServerMessage } from '@party-pool/shared'

import type { LobbyStateMessage } from './lobby.types'

export interface LobbyState {
  room: RoomSnapshot | null
  selfPlayerId: string | null
  rejoinToken: string | null
  isHost: boolean
  readyDeadlineAt: number | null
  gameStartedAt: number | null
  activeRound: {
    roomCode: string
    roundNo: number
    countdownSec: number
    durationSec: number
    startAt: number
    endAt: number
  } | null
  lastRoundResult: {
    roomCode: string
    roundNo: number
    winners: string[]
    ranking: Array<{
      playerId: string
      nickname: string
      tapCount: number
      scoreAfter: number
    }>
  } | null
  roundProgress: Record<string, number>
  error: string | null
}

export const initialLobbyState: LobbyState = {
  room: null,
  selfPlayerId: null,
  rejoinToken: null,
  isHost: false,
  readyDeadlineAt: null,
  gameStartedAt: null,
  activeRound: null,
  lastRoundResult: null,
  roundProgress: {},
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
        roundProgress: {},
        error: null
      }
    case 'room_joined':
      return {
        ...state,
        room: message.payload.room,
        selfPlayerId: message.payload.playerId,
        rejoinToken: message.payload.rejoinToken,
        isHost: message.payload.isHost,
        roundProgress: {},
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
    case 'round_started':
      return {
        ...state,
        activeRound: {
          roomCode: message.payload.roomCode,
          roundNo: message.payload.roundNo,
          countdownSec: message.payload.countdownSec,
          durationSec: message.payload.durationSec,
          startAt: message.payload.startAt,
          endAt: message.payload.endAt
        },
        roundProgress:
          state.room?.players.reduce<Record<string, number>>((accumulator, player) => {
            accumulator[player.playerId] = 0
            return accumulator
          }, {}) ?? {},
        lastRoundResult: null
      }
    case 'round_progress':
      return {
        ...state,
        roundProgress: message.payload.progress.reduce<Record<string, number>>((accumulator, item) => {
          accumulator[item.playerId] = item.tapCount
          return accumulator
        }, {})
      }
    case 'round_result':
      return {
        ...state,
        activeRound: null,
        roundProgress: {},
        lastRoundResult: {
          roomCode: message.payload.roomCode,
          roundNo: message.payload.roundNo,
          winners: message.payload.winners,
          ranking: message.payload.ranking
        }
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
