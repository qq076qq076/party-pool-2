import { DEFAULT_GAME_ID } from '@party-pool/shared'

import type {
  GameRoundFinishedEvent,
  GameRoundProgressItem,
  MutableGameRoom,
  ServerGameRuntime,
  ServerGameRuntimeFactoryOptions,
  StartGameRoundResult,
  SubmitPlayerInput,
  SubmitPlayerInputResult
} from '../types'

const COUNTDOWN_MS = 3_000
const ROUND_DURATION_MS = 20_000

interface ActiveStairClimbRound {
  roomCode: string
  roundNo: number
  startAt: number
  endAt: number
  taps: Map<string, number>
}

interface GameErrorResult {
  ok: false
  code: 'ROUND_NOT_READY'
}

export class StairClimbRuntime implements ServerGameRuntime {
  readonly gameId = DEFAULT_GAME_ID

  private readonly activeRounds = new Map<string, ActiveStairClimbRound>()
  private readonly now: () => number

  constructor(options: ServerGameRuntimeFactoryOptions) {
    this.now = options.now
  }

  startRound(room: MutableGameRoom): StartGameRoundResult {
    if (room.status !== 'playing') {
      return this.error('ROUND_NOT_READY')
    }

    if (this.activeRounds.has(room.roomCode) || room.players.length === 0) {
      return this.error('ROUND_NOT_READY')
    }

    const now = this.now()
    const startAt = now + COUNTDOWN_MS
    const endAt = startAt + ROUND_DURATION_MS
    const taps = new Map<string, number>()

    for (const player of room.players) {
      taps.set(player.playerId, 0)
    }

    this.activeRounds.set(room.roomCode, {
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
        countdownSec: COUNTDOWN_MS / 1000,
        durationSec: ROUND_DURATION_MS / 1000,
        startAt,
        endAt
      }
    }
  }

  submitInput(room: MutableGameRoom, input: SubmitPlayerInput): SubmitPlayerInputResult {
    const round = this.activeRounds.get(room.roomCode)
    if (!round) {
      return this.error('ROUND_NOT_READY')
    }

    const player = room.players.find((item) => item.playerId === input.playerId)
    if (!player || !player.isConnected) {
      return {
        ok: true,
        accepted: false,
        tapCount: round.taps.get(input.playerId) ?? 0,
        progress: this.toProgress(round)
      }
    }

    const now = this.now()
    if (now < round.startAt || now > round.endAt) {
      return {
        ok: true,
        accepted: false,
        tapCount: round.taps.get(player.playerId) ?? 0,
        progress: this.toProgress(round)
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
      progress: this.toProgress(round)
    }
  }

  tick(getRoomByCode: (roomCode: string) => MutableGameRoom | undefined): GameRoundFinishedEvent[] {
    const now = this.now()
    const finished: GameRoundFinishedEvent[] = []

    for (const round of this.activeRounds.values()) {
      if (now < round.endAt) {
        continue
      }

      const room = getRoomByCode(round.roomCode)
      if (!room) {
        this.activeRounds.delete(round.roomCode)
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
        scoreboard: room.players.map((player) => ({ ...player }))
      })

      this.activeRounds.delete(room.roomCode)
    }

    return finished
  }

  private error(code: 'ROUND_NOT_READY'): GameErrorResult {
    return {
      ok: false,
      code
    }
  }

  private toProgress(round: ActiveStairClimbRound): GameRoundProgressItem[] {
    return Array.from(round.taps.entries()).map(([playerId, tapCount]) => ({
      playerId,
      tapCount
    }))
  }
}
