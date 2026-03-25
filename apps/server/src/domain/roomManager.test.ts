import { describe, expect, it } from 'vitest'

import { RoomManager } from './roomManager'

describe('RoomManager', () => {
  it('creates room with host and rejoin token', () => {
    const manager = new RoomManager({
      now: () => 1_000,
      codeGenerator: () => 'ABCD'
    })

    const created = manager.createRoom({
      hostSocketId: 'socket-host',
      hostNickname: 'Host',
      maxPlayers: 8
    })

    expect(created.room.roomCode).toBe('ABCD')
    expect(created.room.players).toHaveLength(1)
    expect(created.rejoinToken.length).toBeGreaterThan(10)
    expect(created.room.players[0].nickname).toBe('Host')
  })

  it('joins room with new player and prevents duplicate nickname', () => {
    const manager = new RoomManager({
      now: () => 2_000,
      codeGenerator: () => 'ROOM'
    })

    manager.createRoom({
      hostSocketId: 'host-socket',
      hostNickname: 'Host',
      maxPlayers: 2
    })

    const joinResult = manager.joinRoom({
      roomCode: 'ROOM',
      socketId: 'p2-socket',
      nickname: 'Player2'
    })

    expect(joinResult.ok).toBe(true)
    if (joinResult.ok) {
      expect(joinResult.room.players).toHaveLength(2)
      expect(joinResult.rejoined).toBe(false)
    }

    const duplicate = manager.joinRoom({
      roomCode: 'ROOM',
      socketId: 'p3-socket',
      nickname: 'Player2'
    })

    expect(duplicate.ok).toBe(false)
    if (!duplicate.ok) {
      expect(duplicate.code).toBe('DUPLICATE_NICKNAME')
    }
  })

  it('rejoins with token and keeps same player slot', () => {
    const manager = new RoomManager({
      now: () => 3_000,
      codeGenerator: () => 'REJ1'
    })

    const created = manager.createRoom({
      hostSocketId: 'host-socket',
      hostNickname: 'Host',
      maxPlayers: 8
    })

    const rejoin = manager.joinRoom({
      roomCode: 'REJ1',
      socketId: 'host-new-socket',
      nickname: 'Host',
      rejoinToken: created.rejoinToken
    })

    expect(rejoin.ok).toBe(true)
    if (rejoin.ok) {
      expect(rejoin.rejoined).toBe(true)
      expect(rejoin.player.playerId).toBe(created.hostPlayerId)
      expect(rejoin.room.players).toHaveLength(1)
      expect(rejoin.player.isConnected).toBe(true)
    }
  })

  it('starts game early when all players are ready', () => {
    let nowMs = 10_000
    const manager = new RoomManager({
      now: () => nowMs,
      codeGenerator: () => 'RDY1'
    })

    const created = manager.createRoom({
      hostSocketId: 'host-socket',
      hostNickname: 'Host',
      maxPlayers: 8
    })

    const joinResult = manager.joinRoom({
      roomCode: 'RDY1',
      socketId: 'p2-socket',
      nickname: 'P2'
    })

    expect(joinResult.ok).toBe(true)
    if (!joinResult.ok) {
      return
    }

    const enterReady = manager.enterReadyPhase({
      roomCode: 'RDY1',
      requesterSocketId: 'host-socket'
    })

    expect(enterReady.ok).toBe(true)
    if (!enterReady.ok) {
      return
    }
    expect(enterReady.readyDeadlineAt).toBe(70_000)

    const hostReady = manager.markPlayerReady({
      roomCode: 'RDY1',
      playerId: created.hostPlayerId
    })
    expect(hostReady.ok).toBe(true)
    if (hostReady.ok) {
      expect(hostReady.gameStarted).toBe(false)
    }

    const p2Ready = manager.markPlayerReady({
      roomCode: 'RDY1',
      playerId: joinResult.player.playerId
    })
    expect(p2Ready.ok).toBe(true)
    if (p2Ready.ok) {
      expect(p2Ready.gameStarted).toBe(true)
      expect(p2Ready.room.status).toBe('playing')
    }

    nowMs = 80_000
    const startedByTimeout = manager.startReadyTimeoutRooms()
    expect(startedByTimeout).toHaveLength(0)
  })

  it('auto starts by ready timeout when not all players confirm', () => {
    let nowMs = 100_000
    const manager = new RoomManager({
      now: () => nowMs,
      codeGenerator: () => 'RDY2'
    })

    manager.createRoom({
      hostSocketId: 'host-socket',
      hostNickname: 'Host',
      maxPlayers: 8
    })

    manager.joinRoom({
      roomCode: 'RDY2',
      socketId: 'p2-socket',
      nickname: 'P2'
    })

    const enterReady = manager.enterReadyPhase({
      roomCode: 'RDY2',
      requesterSocketId: 'host-socket'
    })

    expect(enterReady.ok).toBe(true)

    nowMs = 160_001
    const started = manager.startReadyTimeoutRooms()
    expect(started).toEqual(['RDY2'])

    const snapshot = manager.getRoomByCode('RDY2')
    expect(snapshot?.status).toBe('playing')
  })

  it('marks player disconnected by socket id', () => {
    const manager = new RoomManager({
      now: () => 200_000,
      codeGenerator: () => 'DISC'
    })

    manager.createRoom({
      hostSocketId: 'host-socket',
      hostNickname: 'Host',
      maxPlayers: 8
    })

    const join = manager.joinRoom({
      roomCode: 'DISC',
      socketId: 'p2-socket',
      nickname: 'P2'
    })

    expect(join.ok).toBe(true)
    if (!join.ok) {
      return
    }

    const changed = manager.disconnectSocket('p2-socket')
    expect(changed).toEqual(['DISC'])

    const snapshot = manager.getRoomByCode('DISC')
    const player = snapshot?.players.find((item) => item.playerId === join.player.playerId)
    expect(player?.isConnected).toBe(false)
  })

  it('counts tap input during running window only', () => {
    let nowMs = 300_000
    const manager = new RoomManager({
      now: () => nowMs,
      codeGenerator: () => 'TAP1'
    })

    const created = manager.createRoom({
      hostSocketId: 'host-socket',
      hostNickname: 'Host',
      maxPlayers: 8
    })

    const join = manager.joinRoom({
      roomCode: 'TAP1',
      socketId: 'p2-socket',
      nickname: 'P2'
    })
    expect(join.ok).toBe(true)
    if (!join.ok) {
      return
    }

    manager.enterReadyPhase({
      roomCode: 'TAP1',
      requesterSocketId: 'host-socket'
    })
    manager.markPlayerReady({
      roomCode: 'TAP1',
      playerId: created.hostPlayerId
    })
    manager.markPlayerReady({
      roomCode: 'TAP1',
      playerId: join.player.playerId
    })

    const roundStart = manager.startTapRound({ roomCode: 'TAP1' })
    expect(roundStart.ok).toBe(true)
    if (!roundStart.ok) {
      return
    }

    const beforeStart = manager.submitTapInput({
      roomCode: 'TAP1',
      playerId: created.hostPlayerId,
      inputValue: 1
    })
    expect(beforeStart.ok).toBe(true)
    if (beforeStart.ok) {
      expect(beforeStart.accepted).toBe(false)
    }

    nowMs = roundStart.round.startAt + 20
    const duringRound = manager.submitTapInput({
      roomCode: 'TAP1',
      playerId: created.hostPlayerId,
      inputValue: 1
    })
    expect(duringRound.ok).toBe(true)
    if (duringRound.ok) {
      expect(duringRound.accepted).toBe(true)
      expect(duringRound.tapCount).toBe(1)
      expect(duringRound.progress).toEqual([
        { playerId: created.hostPlayerId, tapCount: 1 },
        { playerId: join.player.playerId, tapCount: 0 }
      ])
    }
  })

  it('finishes tap round and grants +1 to winners', () => {
    let nowMs = 400_000
    const manager = new RoomManager({
      now: () => nowMs,
      codeGenerator: () => 'TAP2'
    })

    const created = manager.createRoom({
      hostSocketId: 'host-socket',
      hostNickname: 'Host',
      maxPlayers: 8
    })

    const join = manager.joinRoom({
      roomCode: 'TAP2',
      socketId: 'p2-socket',
      nickname: 'P2'
    })
    expect(join.ok).toBe(true)
    if (!join.ok) {
      return
    }

    manager.enterReadyPhase({
      roomCode: 'TAP2',
      requesterSocketId: 'host-socket'
    })
    manager.markPlayerReady({
      roomCode: 'TAP2',
      playerId: created.hostPlayerId
    })
    manager.markPlayerReady({
      roomCode: 'TAP2',
      playerId: join.player.playerId
    })

    const start = manager.startTapRound({ roomCode: 'TAP2' })
    expect(start.ok).toBe(true)
    if (!start.ok) {
      return
    }

    nowMs = start.round.startAt + 10
    manager.submitTapInput({
      roomCode: 'TAP2',
      playerId: created.hostPlayerId,
      inputValue: 1
    })
    manager.submitTapInput({
      roomCode: 'TAP2',
      playerId: created.hostPlayerId,
      inputValue: 1
    })
    manager.submitTapInput({
      roomCode: 'TAP2',
      playerId: join.player.playerId,
      inputValue: 1
    })

    nowMs = start.round.endAt + 1
    const events = manager.tickTapRounds()
    expect(events).toHaveLength(1)
    expect(events[0].roomCode).toBe('TAP2')
    expect(events[0].winners).toEqual([created.hostPlayerId])

    const host = events[0].ranking.find((item) => item.playerId === created.hostPlayerId)
    const p2 = events[0].ranking.find((item) => item.playerId === join.player.playerId)

    expect(host?.tapCount).toBe(2)
    expect(host?.scoreAfter).toBe(1)
    expect(p2?.tapCount).toBe(1)
    expect(p2?.scoreAfter).toBe(0)
  })
})
