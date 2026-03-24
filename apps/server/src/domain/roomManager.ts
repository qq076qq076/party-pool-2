import { nanoid } from 'nanoid'

import {
  type ErrorCode,
  type PlayerSnapshot,
  type RoomSnapshot,
  isValidRoomCode,
  normalizeRoomCode
} from '@party-pool/shared'

const READY_TIMEOUT_MS = 60_000

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

export class RoomManager {
  private readonly rooms = new Map<string, RoomRecord>()
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
}
