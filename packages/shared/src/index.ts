export const ROOM_CODE_REGEX = /^[A-Z0-9]{4,6}$/

export type Locale = 'zh-TW' | 'en'
export type RoomStatus = 'waiting' | 'readying' | 'playing' | 'ended'
export type ReadyStatus = 'pending' | 'ok'
export type SensorStatus = 'granted' | 'denied' | 'unsupported' | 'unknown'
export type ControlMode = 'tap' | 'swipe' | 'shake'

export interface ControlProfile {
  mode: ControlMode
  instructionKey: string
  roundDurationSec: number
  readyTimeoutSec: number
  countdownSec: number
  allowInputBeforeStart: boolean
}

export interface PlayerSnapshot {
  playerId: string
  nickname: string
  isConnected: boolean
  readyStatus: ReadyStatus
  score: number
  sensorStatus: SensorStatus
  lastSeenAt: number
}

export interface RoomSnapshot {
  roomId: string
  roomCode: string
  status: RoomStatus
  maxPlayers: number
  players: PlayerSnapshot[]
  readyDeadlineAt: number | null
  roundNo: number
  createdAt: number
}

export type ErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'ROOM_NOT_JOINABLE'
  | 'INVALID_ROOM_CODE'
  | 'INVALID_NICKNAME'
  | 'DUPLICATE_NICKNAME'
  | 'REJOIN_TOKEN_INVALID'
  | 'REJOIN_SLOT_TAKEN'
  | 'NOT_ROOM_HOST'
  | 'ROUND_NOT_READY'

export const normalizeRoomCode = (value: string): string => value.trim().toUpperCase()

export const isValidRoomCode = (value: string): boolean => ROOM_CODE_REGEX.test(normalizeRoomCode(value))

export interface Envelope<TEvent extends string, TPayload> {
  event: TEvent
  requestId?: string
  sentAt?: number
  payload: TPayload
}

export interface CreateRoomPayload {
  nickname: string
  maxPlayers?: number
}

export interface JoinRoomPayload {
  roomCode: string
  nickname: string
  rejoinToken?: string
}

export interface HostEnterReadyPhasePayload {
  roomCode: string
}

export interface PlayerReadyPayload {
  roomCode: string
  playerId: string
}

export interface PlayerInputPayload {
  roomCode: string
  playerId: string
  inputType: 'tap'
  inputValue: number
  tsClientMs: number
}

export interface RequestRejoinPayload {
  roomCode: string
  rejoinToken: string
  nickname: string
}

export type ClientMessage =
  | Envelope<'create_room', CreateRoomPayload>
  | Envelope<'join_room', JoinRoomPayload>
  | Envelope<'host_enter_ready_phase', HostEnterReadyPhasePayload>
  | Envelope<'player_ready_ok', PlayerReadyPayload>
  | Envelope<'player_input', PlayerInputPayload>
  | Envelope<'request_rejoin', RequestRejoinPayload>
  | Envelope<'heartbeat', { roomCode: string }>

export interface ErrorPayload {
  requestId?: string
  code: ErrorCode
  message: string
}

export type ServerMessage =
  | Envelope<'room_created', { room: RoomSnapshot; playerId: string; rejoinToken: string }>
  | Envelope<
      'room_joined',
      {
        room: RoomSnapshot
        playerId: string
        rejoinToken: string
        rejoined: boolean
        isHost: boolean
      }
    >
  | Envelope<'room_state_updated', { room: RoomSnapshot }>
  | Envelope<'ready_timer_started', { roomCode: string; roundNo: number; readyDeadlineAt: number }>
  | Envelope<'ready_status_updated', { roomCode: string; players: PlayerSnapshot[] }>
  | Envelope<'game_started', { roomCode: string; roundNo: number; startedAt: number }>
  | Envelope<
      'round_started',
      {
        roomCode: string
        roundNo: number
        countdownSec: number
        durationSec: number
        startAt: number
        endAt: number
      }
    >
  | Envelope<
      'round_result',
      {
        roomCode: string
        roundNo: number
        winners: string[]
        ranking: Array<{
          playerId: string
          nickname: string
          tapCount: number
          scoreAfter: number
        }>
        scoreboard: PlayerSnapshot[]
      }
    >
  | Envelope<'error', ErrorPayload>
