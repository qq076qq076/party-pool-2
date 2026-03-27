import { describe, expect, it } from 'vitest'

import { RoomManager } from './roomManager'

describe('RoomManager', () => {
  it('creates room without counting host as a player', () => {
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
    expect(created.room.players).toHaveLength(0)
    expect(created.rejoinToken.length).toBeGreaterThan(10)
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
      expect(joinResult.room.players).toHaveLength(1)
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

  it('allows two joined players when maxPlayers is 2 because host is not counted', () => {
    const manager = new RoomManager({
      now: () => 2_500,
      codeGenerator: () => 'MAX2'
    })

    manager.createRoom({
      hostSocketId: 'host-socket',
      hostNickname: 'Host',
      maxPlayers: 2
    })

    const joinA = manager.joinRoom({
      roomCode: 'MAX2',
      socketId: 'p1-socket',
      nickname: 'Alice'
    })
    const joinB = manager.joinRoom({
      roomCode: 'MAX2',
      socketId: 'p2-socket',
      nickname: 'Bob'
    })
    const joinC = manager.joinRoom({
      roomCode: 'MAX2',
      socketId: 'p3-socket',
      nickname: 'Carol'
    })

    expect(joinA.ok).toBe(true)
    expect(joinB.ok).toBe(true)
    expect(joinC.ok).toBe(false)
    if (!joinC.ok) {
      expect(joinC.code).toBe('ROOM_FULL')
    }
  })

  it('rejoins host display with token without creating a player slot', () => {
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
      expect(rejoin.isHost).toBe(true)
      expect(rejoin.player).toBeNull()
      expect(rejoin.room.players).toHaveLength(0)
    }
  })

  it('starts game early when all players are ready', () => {
    let nowMs = 10_000
    const manager = new RoomManager({
      now: () => nowMs,
      codeGenerator: () => 'RDY1'
    })

    manager.createRoom({
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
    expect(joinResult.player).not.toBeNull()
    if (!joinResult.player) {
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

  it('does not enter ready phase when no joined players exist', () => {
    const manager = new RoomManager({
      now: () => 50_000,
      codeGenerator: () => 'ZERO'
    })

    manager.createRoom({
      hostSocketId: 'host-socket',
      hostNickname: 'Host',
      maxPlayers: 8
    })

    const enterReady = manager.enterReadyPhase({
      roomCode: 'ZERO',
      requesterSocketId: 'host-socket'
    })

    expect(enterReady.ok).toBe(false)
    if (!enterReady.ok) {
      expect(enterReady.code).toBe('ROUND_NOT_READY')
    }
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
    expect(join.player).not.toBeNull()
    if (!join.player) {
      return
    }
    const joinedPlayer = join.player

    const changed = manager.disconnectSocket('p2-socket')
    expect(changed).toEqual(['DISC'])

    const snapshot = manager.getRoomByCode('DISC')
    const player = snapshot?.players.find((item) => item.playerId === joinedPlayer.playerId)
    expect(player?.isConnected).toBe(false)
  })

  it('counts tap input during running window only', () => {
    let nowMs = 300_000
    const manager = new RoomManager({
      now: () => nowMs,
      codeGenerator: () => 'TAP1'
    })

    manager.createRoom({
      hostSocketId: 'host-socket',
      hostNickname: 'Host',
      maxPlayers: 8
    })

    const joinA = manager.joinRoom({
      roomCode: 'TAP1',
      socketId: 'p1-socket',
      nickname: 'P1'
    })
    expect(joinA.ok).toBe(true)
    if (!joinA.ok) {
      return
    }
    expect(joinA.player).not.toBeNull()
    if (!joinA.player) {
      return
    }
    const joinAPlayer = joinA.player

    const joinB = manager.joinRoom({
      roomCode: 'TAP1',
      socketId: 'p2-socket',
      nickname: 'P2'
    })
    expect(joinB.ok).toBe(true)
    if (!joinB.ok) {
      return
    }
    expect(joinB.player).not.toBeNull()
    if (!joinB.player) {
      return
    }
    const joinBPlayer = joinB.player

    manager.enterReadyPhase({
      roomCode: 'TAP1',
      requesterSocketId: 'host-socket'
    })
    manager.markPlayerReady({
      roomCode: 'TAP1',
      playerId: joinAPlayer.playerId
    })
    manager.markPlayerReady({
      roomCode: 'TAP1',
      playerId: joinBPlayer.playerId
    })

    const roundStart = manager.startGameRound({ roomCode: 'TAP1' })
    expect(roundStart.ok).toBe(true)
    if (!roundStart.ok) {
      return
    }

    const beforeStart = manager.submitPlayerInput({
      roomCode: 'TAP1',
      playerId: joinAPlayer.playerId,
      inputValue: 1
    })
    expect(beforeStart.ok).toBe(true)
    if (beforeStart.ok) {
      expect(beforeStart.accepted).toBe(false)
    }

    nowMs = roundStart.round.startAt + 20
    const duringRound = manager.submitPlayerInput({
      roomCode: 'TAP1',
      playerId: joinAPlayer.playerId,
      inputValue: 1
    })
    expect(duringRound.ok).toBe(true)
    if (duringRound.ok) {
      expect(duringRound.accepted).toBe(true)
      expect(duringRound.tapCount).toBe(1)
      expect(duringRound.progress).toEqual([
        { playerId: joinAPlayer.playerId, tapCount: 1 },
        { playerId: joinBPlayer.playerId, tapCount: 0 }
      ])
    }
  })

  it('finishes tap round and grants +1 to winners', () => {
    let nowMs = 400_000
    const manager = new RoomManager({
      now: () => nowMs,
      codeGenerator: () => 'TAP2'
    })

    manager.createRoom({
      hostSocketId: 'host-socket',
      hostNickname: 'Host',
      maxPlayers: 8
    })

    const joinA = manager.joinRoom({
      roomCode: 'TAP2',
      socketId: 'p1-socket',
      nickname: 'P1'
    })
    expect(joinA.ok).toBe(true)
    if (!joinA.ok) {
      return
    }
    expect(joinA.player).not.toBeNull()
    if (!joinA.player) {
      return
    }
    const joinAPlayer = joinA.player

    const joinB = manager.joinRoom({
      roomCode: 'TAP2',
      socketId: 'p2-socket',
      nickname: 'P2'
    })
    expect(joinB.ok).toBe(true)
    if (!joinB.ok) {
      return
    }
    expect(joinB.player).not.toBeNull()
    if (!joinB.player) {
      return
    }
    const joinBPlayer = joinB.player

    manager.enterReadyPhase({
      roomCode: 'TAP2',
      requesterSocketId: 'host-socket'
    })
    manager.markPlayerReady({
      roomCode: 'TAP2',
      playerId: joinAPlayer.playerId
    })
    manager.markPlayerReady({
      roomCode: 'TAP2',
      playerId: joinBPlayer.playerId
    })

    const start = manager.startGameRound({ roomCode: 'TAP2' })
    expect(start.ok).toBe(true)
    if (!start.ok) {
      return
    }

    nowMs = start.round.startAt + 10
    manager.submitPlayerInput({
      roomCode: 'TAP2',
      playerId: joinAPlayer.playerId,
      inputValue: 1
    })
    manager.submitPlayerInput({
      roomCode: 'TAP2',
      playerId: joinAPlayer.playerId,
      inputValue: 1
    })
    manager.submitPlayerInput({
      roomCode: 'TAP2',
      playerId: joinBPlayer.playerId,
      inputValue: 1
    })

    nowMs = start.round.endAt + 1
    const events = manager.tickGameRounds()
    expect(events).toHaveLength(1)
    expect(events[0].roomCode).toBe('TAP2')
    expect(events[0].winners).toEqual([joinAPlayer.playerId])

    const p1 = events[0].ranking.find((item) => item.playerId === joinAPlayer.playerId)
    const p2 = events[0].ranking.find((item) => item.playerId === joinBPlayer.playerId)

    expect(p1?.tapCount).toBe(2)
    expect(p1?.scoreAfter).toBe(1)
    expect(p2?.tapCount).toBe(1)
    expect(p2?.scoreAfter).toBe(0)
  })
})
