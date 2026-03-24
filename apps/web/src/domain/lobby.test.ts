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
})
