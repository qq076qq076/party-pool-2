import { describe, expect, it } from 'vitest'

import { applyServerMessage, initialLobbyState } from './lobby'

describe('lobby state reducer', () => {
  it('stores room + self when room is created', () => {
    const next = applyServerMessage(initialLobbyState, {
      event: 'room_created',
      payload: {
        room: {
          roomId: 'r1',
          roomCode: 'ABCD',
          status: 'waiting',
          maxPlayers: 8,
          players: [],
          readyDeadlineAt: null,
          roundNo: 1,
          createdAt: 1000
        },
        playerId: 'p1',
        rejoinToken: 'token-1'
      }
    })

    expect(next.room?.roomCode).toBe('ABCD')
    expect(next.selfPlayerId).toBe('p1')
    expect(next.rejoinToken).toBe('token-1')
    expect(next.isHost).toBe(true)
  })

  it('updates ready deadline when ready timer starts', () => {
    const next = applyServerMessage(initialLobbyState, {
      event: 'ready_timer_started',
      payload: {
        roomCode: 'ABCD',
        roundNo: 1,
        readyDeadlineAt: 80000
      }
    })

    expect(next.readyDeadlineAt).toBe(80000)
  })

  it('records error messages from server', () => {
    const next = applyServerMessage(initialLobbyState, {
      event: 'error',
      payload: {
        code: 'ROOM_NOT_FOUND',
        message: 'Join room failed'
      }
    })

    expect(next.error).toBe('Join room failed')
  })

  it('stores active tap round when round starts', () => {
    const next = applyServerMessage(initialLobbyState, {
      event: 'round_started',
      payload: {
        roomCode: 'ABCD',
        roundNo: 1,
        countdownSec: 3,
        durationSec: 20,
        startAt: 10_000,
        endAt: 30_000
      }
    })

    expect(next.activeRound?.roomCode).toBe('ABCD')
    expect(next.activeRound?.countdownSec).toBe(3)
    expect(next.activeRound?.durationSec).toBe(20)
  })

  it('tracks live round progress updates for stair climbing display', () => {
    const withRoom = applyServerMessage(initialLobbyState, {
      event: 'room_joined',
      payload: {
        room: {
          roomId: 'r1',
          roomCode: 'ABCD',
          status: 'playing',
          maxPlayers: 8,
          players: [
            {
              playerId: 'p1',
              nickname: 'P1',
              isConnected: true,
              readyStatus: 'ok',
              score: 0,
              sensorStatus: 'unknown',
              lastSeenAt: 1000
            },
            {
              playerId: 'p2',
              nickname: 'P2',
              isConnected: true,
              readyStatus: 'ok',
              score: 0,
              sensorStatus: 'unknown',
              lastSeenAt: 1000
            }
          ],
          readyDeadlineAt: null,
          roundNo: 1,
          createdAt: 1000
        },
        playerId: 'p2',
        rejoinToken: 'token-2',
        rejoined: false,
        isHost: false
      }
    })
    const active = applyServerMessage(withRoom, {
      event: 'round_started',
      payload: {
        roomCode: 'ABCD',
        roundNo: 1,
        countdownSec: 3,
        durationSec: 20,
        startAt: 10_000,
        endAt: 30_000
      }
    })
    const next = applyServerMessage(active, {
      event: 'round_progress',
      payload: {
        roomCode: 'ABCD',
        roundNo: 1,
        progress: [
          { playerId: 'p1', tapCount: 2 },
          { playerId: 'p2', tapCount: 5 }
        ]
      }
    })

    expect(next.roundProgress.p1).toBe(2)
    expect(next.roundProgress.p2).toBe(5)
  })

  it('stores last round result when round ends', () => {
    const next = applyServerMessage(initialLobbyState, {
      event: 'round_result',
      payload: {
        roomCode: 'ABCD',
        roundNo: 1,
        winners: ['p1'],
        ranking: [
          { playerId: 'p1', nickname: 'P1', tapCount: 10, scoreAfter: 1 },
          { playerId: 'p2', nickname: 'P2', tapCount: 6, scoreAfter: 0 }
        ],
        scoreboard: []
      }
    })

    expect(next.lastRoundResult?.winners).toEqual(['p1'])
    expect(next.lastRoundResult?.ranking[0].tapCount).toBe(10)
  })
})
