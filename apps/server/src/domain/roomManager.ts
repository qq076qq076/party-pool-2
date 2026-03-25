import { nanoid } from 'nanoid'

import {
  type ErrorCode,
  type PlayerSnapshot,
  type RoomSnapshot,
  isValidRoomCode,
  normalizeRoomCode
} from '@party-pool/shared'

const READY_TIMEOUT_MS = 60_000
const TAP_COUNTDOWN_MS = 3_000
const TAP_ROUND_DURATION_MS = 20_000

interface PlayerRecord extends PlayerSnapshot {
  socketId: string
  rejoinToken: string
}

interface RoomRecord {
  roomId: string
  roomCode: string
  hostPlayerId: string
  status: RoomSnapshot['status']
  maxPlayers: number
  players: PlayerRecord[]
  readyDeadlineAt: number | null
  roundNo: number
  createdAt: number
}

interface ActiveTapRound {
  roomCode: string
  roundNo: number
  startAt: number
  endAt: number
  taps: Map<string, number>
}

interface RoomManagerOptions {
  now?: () => number
  codeGenerator?: () => string
}

interface CreateRoomInput {
  hostSocketId: string
  hostNickname: string
  maxPlayers: number
}

interface JoinRoomInput {
  roomCode: string
  socketId: string
  nickname: string
  rejoinToken?: string
}

interface EnterReadyInput {
  roomCode: string
  requesterSocketId: string
}

interface MarkReadyInput {
  roomCode: string
  playerId: string
}

interface StartTapRoundInput {
  roomCode: string
}

interface SubmitTapInput {
  roomCode: string
  playerId: string
  inputValue: number
}

type ErrorResult = {
  ok: false
  code: ErrorCode
}

type JoinResult =
  | {
      ok: true
      room: RoomSnapshot
      player: PlayerSnapshot
      rejoinToken: string
      rejoined: boolean
    }
  | ErrorResult

type EnterReadyResult =
  | {
      ok: true
      room: RoomSnapshot
      readyDeadlineAt: number
    }
  | ErrorResult

type MarkReadyResult =
  | {
      ok: true
      room: RoomSnapshot
      gameStarted: boolean
    }
  | ErrorResult

interface CreateRoomResult {
  room: RoomSnapshot
  hostPlayerId: string
  rejoinToken: string
}

export interface TapRoundWindow {
  roomCode: string
  roundNo: number
  countdownSec: number
  durationSec: number
  startAt: number
  endAt: number
}

export interface TapRoundRankItem {
  playerId: string
  nickname: string
  tapCount: number
  scoreAfter: number
}

export interface TapRoundProgressItem {
  playerId: string
  tapCount: number
}

export interface TapRoundFinishedEvent {
  roomCode: string
  roundNo: number
  winners: string[]
  ranking: TapRoundRankItem[]
  scoreboard: PlayerSnapshot[]
}

type StartTapRoundResult =
  | {
      ok: true
      round: TapRoundWindow
    }
  | ErrorResult

type SubmitTapInputResult =
  | {
      ok: true
      accepted: boolean
      tapCount: number
      progress: TapRoundProgressItem[]
    }
  | ErrorResult

export class RoomManager {
  private readonly rooms = new Map<string, RoomRecord>()
  private readonly activeTapRounds = new Map<string, ActiveTapRound>()
  private readonly now: () => number
  private readonly codeGenerator: () => string

  constructor(options: RoomManagerOptions = {}) {
    this.now = options.now ?? (() => Date.now())
    this.codeGenerator = options.codeGenerator ?? (() => nanoid(4).toUpperCase())
  }

  createRoom(input: CreateRoomInput): CreateRoomResult {
    const roomCode = this.generateRoomCode()
    const now = this.now()
    const hostPlayerId = nanoid(10)
    const rejoinToken = nanoid(24)

    const host: PlayerRecord = {
      playerId: hostPlayerId,
      nickname: this.normalizeNickname(input.hostNickname),
      socketId: input.hostSocketId,
      isConnected: true,
      readyStatus: 'pending',
      score: 0,
      sensorStatus: 'unknown',
      lastSeenAt: now,
      rejoinToken
    }

    const room: RoomRecord = {
      roomId: nanoid(12),
      roomCode,
      hostPlayerId,
      status: 'waiting',
      maxPlayers: input.maxPlayers,
      players: [host],
      readyDeadlineAt: null,
      roundNo: 1,
      createdAt: now
    }

    this.rooms.set(roomCode, room)

    return {
      room: this.toRoomSnapshot(room),
      hostPlayerId,
      rejoinToken
    }
  }

  joinRoom(input: JoinRoomInput): JoinResult {
    const room = this.getRoomRecord(input.roomCode)
    if (!room) {
      return this.error('ROOM_NOT_FOUND')
    }

    if (room.status === 'playing' || room.status === 'ended') {
      return this.error('ROOM_NOT_JOINABLE')
    }

    const nickname = this.normalizeNickname(input.nickname)
    if (!nickname) {
      return this.error('INVALID_NICKNAME')
    }

    if (input.rejoinToken) {
      const rejoinPlayer = room.players.find(
        (player) => player.rejoinToken === input.rejoinToken
      )

      if (!rejoinPlayer) {
        return this.error('REJOIN_TOKEN_INVALID')
      }

      rejoinPlayer.socketId = input.socketId
      rejoinPlayer.isConnected = true
      rejoinPlayer.lastSeenAt = this.now()

      return {
        ok: true,
        room: this.toRoomSnapshot(room),
        player: this.toPlayerSnapshot(rejoinPlayer),
        rejoinToken: rejoinPlayer.rejoinToken,
        rejoined: true
      }
    }

    const duplicated = room.players.some(
      (player) => player.nickname.toLowerCase() === nickname.toLowerCase()
    )
    if (duplicated) {
      return this.error('DUPLICATE_NICKNAME')
    }

    if (room.players.length >= room.maxPlayers) {
      return this.error('ROOM_FULL')
    }

    const player: PlayerRecord = {
      playerId: nanoid(10),
      nickname,
      socketId: input.socketId,
      isConnected: true,
      readyStatus: 'pending',
      score: 0,
      sensorStatus: 'unknown',
      lastSeenAt: this.now(),
      rejoinToken: nanoid(24)
    }

    room.players.push(player)

    return {
      ok: true,
      room: this.toRoomSnapshot(room),
      player: this.toPlayerSnapshot(player),
      rejoinToken: player.rejoinToken,
      rejoined: false
    }
  }

  enterReadyPhase(input: EnterReadyInput): EnterReadyResult {
    const room = this.getRoomRecord(input.roomCode)
    if (!room) {
      return this.error('ROOM_NOT_FOUND')
    }

    const hostPlayer = room.players.find((player) => player.playerId === room.hostPlayerId)

    if (!hostPlayer || !hostPlayer.isConnected || hostPlayer.socketId !== input.requesterSocketId) {
      return this.error('NOT_ROOM_HOST')
    }

    room.status = 'readying'
    room.readyDeadlineAt = this.now() + READY_TIMEOUT_MS

    for (const player of room.players) {
      player.readyStatus = 'pending'
    }

    return {
      ok: true,
      room: this.toRoomSnapshot(room),
      readyDeadlineAt: room.readyDeadlineAt
    }
  }

  markPlayerReady(input: MarkReadyInput): MarkReadyResult {
    const room = this.getRoomRecord(input.roomCode)
    if (!room) {
      return this.error('ROOM_NOT_FOUND')
    }

    if (room.status !== 'readying') {
      return this.error('ROUND_NOT_READY')
    }

    const player = room.players.find((item) => item.playerId === input.playerId)
    if (!player) {
      return this.error('ROUND_NOT_READY')
    }

    player.readyStatus = 'ok'
    player.lastSeenAt = this.now()

    const activePlayers = room.players.filter((item) => item.isConnected)
    const everyoneReady = activePlayers.every((item) => item.readyStatus === 'ok')

    if (everyoneReady) {
      room.status = 'playing'
      room.readyDeadlineAt = null
    }

    return {
      ok: true,
      room: this.toRoomSnapshot(room),
      gameStarted: everyoneReady
    }
  }

  startReadyTimeoutRooms(): string[] {
    const now = this.now()
    const startedRooms: string[] = []

    for (const room of this.rooms.values()) {
      if (room.status !== 'readying' || room.readyDeadlineAt === null) {
        continue
      }

      if (room.readyDeadlineAt <= now) {
        room.status = 'playing'
        room.readyDeadlineAt = null
        startedRooms.push(room.roomCode)
      }
    }

    return startedRooms
  }

  startTapRound(input: StartTapRoundInput): StartTapRoundResult {
    const room = this.getRoomRecord(input.roomCode)
    if (!room) {
      return this.error('ROOM_NOT_FOUND')
    }

    if (room.status !== 'playing') {
      return this.error('ROUND_NOT_READY')
    }

    if (this.activeTapRounds.has(room.roomCode)) {
      return this.error('ROUND_NOT_READY')
    }

    const now = this.now()
    const startAt = now + TAP_COUNTDOWN_MS
    const endAt = startAt + TAP_ROUND_DURATION_MS
    const taps = new Map<string, number>()

    for (const player of room.players) {
      taps.set(player.playerId, 0)
    }

    this.activeTapRounds.set(room.roomCode, {
      roomCode: room.roomCode,
      roundNo: room.roundNo,
      startAt,
      endAt,
      taps
    })

    return {
      ok: true,
      round: {
        roomCode: room.roomCode,
        roundNo: room.roundNo,
        countdownSec: TAP_COUNTDOWN_MS / 1000,
        durationSec: TAP_ROUND_DURATION_MS / 1000,
        startAt,
        endAt
      }
    }
  }

  submitTapInput(input: SubmitTapInput): SubmitTapInputResult {
    const room = this.getRoomRecord(input.roomCode)
    if (!room) {
      return this.error('ROOM_NOT_FOUND')
    }

    const round = this.activeTapRounds.get(room.roomCode)
    if (!round) {
      return this.error('ROUND_NOT_READY')
    }

    const player = room.players.find((item) => item.playerId === input.playerId)
    if (!player || !player.isConnected) {
      return {
        ok: true,
        accepted: false,
        tapCount: round.taps.get(input.playerId) ?? 0,
        progress: this.toTapRoundProgress(round)
      }
    }

    const now = this.now()
    if (now < round.startAt || now > round.endAt) {
      return {
        ok: true,
        accepted: false,
        tapCount: round.taps.get(player.playerId) ?? 0,
        progress: this.toTapRoundProgress(round)
      }
    }

    const add = Math.max(1, Math.floor(input.inputValue))
    const current = round.taps.get(player.playerId) ?? 0
    const next = current + add
    round.taps.set(player.playerId, next)

    return {
      ok: true,
      accepted: true,
      tapCount: next,
      progress: this.toTapRoundProgress(round)
    }
  }

  tickTapRounds(): TapRoundFinishedEvent[] {
    const now = this.now()
    const finished: TapRoundFinishedEvent[] = []

    for (const round of this.activeTapRounds.values()) {
      if (now < round.endAt) {
        continue
      }

      const room = this.getRoomRecord(round.roomCode)
      if (!room) {
        this.activeTapRounds.delete(round.roomCode)
        continue
      }

      const ranking = room.players
        .map((player) => ({
          player,
          tapCount: round.taps.get(player.playerId) ?? 0
        }))
        .sort((a, b) => b.tapCount - a.tapCount)

      const topScore = ranking[0]?.tapCount ?? 0
      const winners = ranking
        .filter((item) => item.tapCount === topScore)
        .map((item) => item.player.playerId)

      for (const winnerId of winners) {
        const winner = room.players.find((player) => player.playerId === winnerId)
        if (winner) {
          winner.score += 1
        }
      }

      room.status = 'waiting'
      room.readyDeadlineAt = null
      room.roundNo += 1
      for (const player of room.players) {
        player.readyStatus = 'pending'
      }

      finished.push({
        roomCode: room.roomCode,
        roundNo: round.roundNo,
        winners,
        ranking: ranking.map((item) => ({
          playerId: item.player.playerId,
          nickname: item.player.nickname,
          tapCount: item.tapCount,
          scoreAfter: item.player.score
        })),
        scoreboard: this.toRoomSnapshot(room).players
      })

      this.activeTapRounds.delete(room.roomCode)
    }

    return finished
  }

  disconnectSocket(socketId: string): string[] {
    const changedRoomCodes: string[] = []

    for (const room of this.rooms.values()) {
      const player = room.players.find((item) => item.socketId === socketId)
      if (!player || !player.isConnected) {
        continue
      }

      player.isConnected = false
      player.readyStatus = 'pending'
      player.lastSeenAt = this.now()
      changedRoomCodes.push(room.roomCode)
    }

    return changedRoomCodes
  }

  getRoomByCode(roomCode: string): RoomSnapshot | undefined {
    const room = this.getRoomRecord(roomCode)
    return room ? this.toRoomSnapshot(room) : undefined
  }

  private error(code: ErrorCode): ErrorResult {
    return {
      ok: false,
      code
    }
  }

  private getRoomRecord(roomCode: string): RoomRecord | undefined {
    return this.rooms.get(normalizeRoomCode(roomCode))
  }

  private toRoomSnapshot(room: RoomRecord): RoomSnapshot {
    return {
      roomId: room.roomId,
      roomCode: room.roomCode,
      status: room.status,
      maxPlayers: room.maxPlayers,
      players: room.players.map((player) => this.toPlayerSnapshot(player)),
      readyDeadlineAt: room.readyDeadlineAt,
      roundNo: room.roundNo,
      createdAt: room.createdAt
    }
  }

  private toPlayerSnapshot(player: PlayerRecord): PlayerSnapshot {
    return {
      playerId: player.playerId,
      nickname: player.nickname,
      isConnected: player.isConnected,
      readyStatus: player.readyStatus,
      score: player.score,
      sensorStatus: player.sensorStatus,
      lastSeenAt: player.lastSeenAt
    }
  }

  private generateRoomCode(): string {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const code = normalizeRoomCode(this.codeGenerator())
      if (isValidRoomCode(code) && !this.rooms.has(code)) {
        return code
      }
    }

    throw new Error('Unable to allocate room code')
  }

  private normalizeNickname(nickname: string): string {
    const trimmed = nickname.trim()
    if (!trimmed || trimmed.length > 20) {
      return ''
    }
    return trimmed
  }

  private toTapRoundProgress(round: ActiveTapRound): TapRoundProgressItem[] {
    return Array.from(round.taps.entries()).map(([playerId, tapCount]) => ({
      playerId,
      tapCount
    }))
  }
}
