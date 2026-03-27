import type { ErrorCode, GameId, PlayerSnapshot, RoomStatus } from '@party-pool/shared'

export interface MutableGamePlayer extends PlayerSnapshot {}

export interface MutableGameRoom {
  roomCode: string
  roundNo: number
  status: RoomStatus
  readyDeadlineAt: number | null
  players: MutableGamePlayer[]
}

export interface StartGameRoundWindow {
  roomCode: string
  roundNo: number
  countdownSec: number
  durationSec: number
  startAt: number
  endAt: number
}

export interface GameRoundProgressItem {
  playerId: string
  tapCount: number
}

export interface GameRoundRankItem {
  playerId: string
  nickname: string
  tapCount: number
  scoreAfter: number
}

export interface GameRoundFinishedEvent {
  roomCode: string
  roundNo: number
  winners: string[]
  ranking: GameRoundRankItem[]
  scoreboard: PlayerSnapshot[]
}

type ErrorResult = {
  ok: false
  code: ErrorCode
}

export type StartGameRoundResult =
  | {
      ok: true
      round: StartGameRoundWindow
    }
  | ErrorResult

export type SubmitPlayerInputResult =
  | {
      ok: true
      accepted: boolean
      tapCount: number
      progress: GameRoundProgressItem[]
    }
  | ErrorResult

export interface SubmitPlayerInput {
  playerId: string
  inputValue: number
}

export interface ServerGameRuntime {
  readonly gameId: GameId
  startRound(room: MutableGameRoom): StartGameRoundResult
  submitInput(room: MutableGameRoom, input: SubmitPlayerInput): SubmitPlayerInputResult
  tick(getRoomByCode: (roomCode: string) => MutableGameRoom | undefined): GameRoundFinishedEvent[]
}

export interface ServerGameRuntimeFactoryOptions {
  now: () => number
}
