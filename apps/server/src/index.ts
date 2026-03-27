import { nanoid } from 'nanoid'
import { WebSocketServer, type WebSocket } from 'ws'

import {
  type ClientMessage,
  type ErrorCode,
  type ErrorPayload,
  type ServerMessage,
  type RoomSnapshot
} from '@party-pool/shared'

import { RoomManager } from './domain/roomManager'

const PORT = Number(process.env.PORT ?? 8787)
const READY_TIMER_POLL_MS = 300

const roomManager = new RoomManager()
const wss = new WebSocketServer({ port: PORT })

const socketsById = new Map<string, WebSocket>()
const playerToSocket = new Map<string, string>()
const roomToHostSocket = new Map<string, string>()
const hostSocketToRoom = new Map<string, string>()

const send = (socket: WebSocket, message: ServerMessage): void => {
  socket.send(JSON.stringify(message))
}

const emitError = (
  socket: WebSocket,
  code: ErrorCode,
  requestId: string | undefined,
  message: string
): void => {
  const payload: ErrorPayload = {
    requestId,
    code,
    message
  }

  send(socket, {
    event: 'error',
    requestId,
    sentAt: Date.now(),
    payload
  })
}

const emitRoomState = (room: RoomSnapshot): void => {
  const message: ServerMessage = {
    event: 'room_state_updated',
    sentAt: Date.now(),
    payload: {
      room
    }
  }

  broadcastToRoom(room, message)
}

const broadcastToRoom = (room: RoomSnapshot, message: ServerMessage): void => {
  const targetSocketIds = new Set<string>()

  for (const player of room.players) {
    const socketId = playerToSocket.get(player.playerId)
    if (!socketId) {
      continue
    }
    targetSocketIds.add(socketId)
  }

  const hostSocketId = roomToHostSocket.get(room.roomCode)
  if (hostSocketId) {
    targetSocketIds.add(hostSocketId)
  }

  for (const socketId of targetSocketIds) {
    const socket = socketsById.get(socketId)
    if (!socket || socket.readyState !== socket.OPEN) {
      continue
    }
    send(socket, message)
  }
}

const emitRoomStateByCode = (roomCode: string): void => {
  const room = roomManager.getRoomByCode(roomCode)
  if (!room) {
    return
  }
  emitRoomState(room)
}

const parseMessage = (raw: string): ClientMessage | null => {
  try {
    return JSON.parse(raw) as ClientMessage
  } catch {
    return null
  }
}

const bindPlayerSocket = (playerId: string, socketId: string): void => {
  playerToSocket.set(playerId, socketId)
}

const bindHostSocket = (roomCode: string, socketId: string): void => {
  const previousSocketId = roomToHostSocket.get(roomCode)
  if (previousSocketId) {
    hostSocketToRoom.delete(previousSocketId)
  }

  roomToHostSocket.set(roomCode, socketId)
  hostSocketToRoom.set(socketId, roomCode)
}

const removePlayerSocketBindings = (socketId: string): void => {
  for (const [playerId, mappedSocketId] of playerToSocket.entries()) {
    if (mappedSocketId === socketId) {
      playerToSocket.delete(playerId)
    }
  }
}

const removeHostSocketBinding = (socketId: string): void => {
  const roomCode = hostSocketToRoom.get(socketId)
  if (!roomCode) {
    return
  }

  if (roomToHostSocket.get(roomCode) === socketId) {
    roomToHostSocket.delete(roomCode)
  }

  hostSocketToRoom.delete(socketId)
}

wss.on('connection', (socket) => {
  const socketId = nanoid(12)
  socketsById.set(socketId, socket)

  socket.on('message', (raw) => {
    const parsed = parseMessage(raw.toString())

    if (!parsed) {
      emitError(socket, 'INVALID_ROOM_CODE', undefined, 'Invalid message format')
      return
    }

    if (parsed.event === 'create_room') {
      const maxPlayers = Math.min(8, Math.max(2, parsed.payload.maxPlayers ?? 8))
      const created = roomManager.createRoom({
        hostSocketId: socketId,
        hostNickname: parsed.payload.nickname,
        maxPlayers
      })

      bindHostSocket(created.room.roomCode, socketId)

      send(socket, {
        event: 'room_created',
        requestId: parsed.requestId,
        sentAt: Date.now(),
        payload: {
          room: created.room,
          playerId: null,
          rejoinToken: created.rejoinToken
        }
      })

      emitRoomState(created.room)
      return
    }

    if (parsed.event === 'join_room' || parsed.event === 'request_rejoin') {
      const joinPayload =
        parsed.event === 'join_room'
          ? parsed.payload
          : {
              roomCode: parsed.payload.roomCode,
              nickname: parsed.payload.nickname,
              rejoinToken: parsed.payload.rejoinToken
            }

      const joined = roomManager.joinRoom({
        roomCode: joinPayload.roomCode,
        socketId,
        nickname: joinPayload.nickname,
        rejoinToken: joinPayload.rejoinToken
      })

      if (!joined.ok) {
        emitError(socket, joined.code, parsed.requestId, 'Join room failed')
        return
      }

      if (joined.isHost) {
        bindHostSocket(joined.room.roomCode, socketId)
      } else if (joined.player) {
        bindPlayerSocket(joined.player.playerId, socketId)
      }

      send(socket, {
        event: 'room_joined',
        requestId: parsed.requestId,
        sentAt: Date.now(),
        payload: {
          room: joined.room,
          playerId: joined.player?.playerId ?? null,
          rejoinToken: joined.rejoinToken,
          rejoined: joined.rejoined,
          isHost: joined.isHost
        }
      })

      emitRoomState(joined.room)
      return
    }

    if (parsed.event === 'host_enter_ready_phase') {
      const entered = roomManager.enterReadyPhase({
        roomCode: parsed.payload.roomCode,
        requesterSocketId: socketId
      })

      if (!entered.ok) {
        emitError(socket, entered.code, parsed.requestId, 'Cannot enter ready phase')
        return
      }

      const message: ServerMessage = {
        event: 'ready_timer_started',
        requestId: parsed.requestId,
        sentAt: Date.now(),
        payload: {
          roomCode: entered.room.roomCode,
          roundNo: entered.room.roundNo,
          readyDeadlineAt: entered.readyDeadlineAt
        }
      }

      broadcastToRoom(entered.room, message)

      emitRoomState(entered.room)
      return
    }

    if (parsed.event === 'player_ready_ok') {
      const marked = roomManager.markPlayerReady({
        roomCode: parsed.payload.roomCode,
        playerId: parsed.payload.playerId
      })

      if (!marked.ok) {
        emitError(socket, marked.code, parsed.requestId, 'Cannot update ready status')
        return
      }

      const room = marked.room

      const readyStatusMessage: ServerMessage = {
        event: 'ready_status_updated',
        requestId: parsed.requestId,
        sentAt: Date.now(),
        payload: {
          roomCode: room.roomCode,
          players: room.players
        }
      }

      broadcastToRoom(room, readyStatusMessage)

      if (marked.gameStarted) {
        const gameStartedMessage: ServerMessage = {
          event: 'game_started',
          requestId: parsed.requestId,
          sentAt: Date.now(),
          payload: {
            roomCode: room.roomCode,
            roundNo: room.roundNo,
            startedAt: Date.now()
          }
        }

        broadcastToRoom(room, gameStartedMessage)

        const startedRound = roomManager.startGameRound({ roomCode: room.roomCode })
        if (startedRound.ok) {
          const roundStartedMessage: ServerMessage = {
            event: 'round_started',
            requestId: parsed.requestId,
            sentAt: Date.now(),
            payload: {
              roomCode: startedRound.round.roomCode,
              roundNo: startedRound.round.roundNo,
              countdownSec: startedRound.round.countdownSec,
              durationSec: startedRound.round.durationSec,
              startAt: startedRound.round.startAt,
              endAt: startedRound.round.endAt
            }
          }
          broadcastToRoom(room, roundStartedMessage)
        }
      }

      emitRoomState(room)
      return
    }

    if (parsed.event === 'player_input') {
      const submitted = roomManager.submitPlayerInput({
        roomCode: parsed.payload.roomCode,
        playerId: parsed.payload.playerId,
        inputValue: parsed.payload.inputValue
      })

      if (!submitted.ok) {
        emitError(socket, submitted.code, parsed.requestId, 'Cannot accept player input')
        return
      }

      if (submitted.accepted) {
        const room = roomManager.getRoomByCode(parsed.payload.roomCode)
        if (room) {
          const progressMessage: ServerMessage = {
            event: 'round_progress',
            requestId: parsed.requestId,
            sentAt: Date.now(),
            payload: {
              roomCode: room.roomCode,
              roundNo: room.roundNo,
              progress: submitted.progress
            }
          }

          broadcastToRoom(room, progressMessage)
        }
      }
      return
    }
  })

  socket.on('close', () => {
    socketsById.delete(socketId)
    removeHostSocketBinding(socketId)
    removePlayerSocketBindings(socketId)

    const changedRooms = roomManager.disconnectSocket(socketId)
    for (const roomCode of changedRooms) {
      emitRoomStateByCode(roomCode)
    }
  })
})

setInterval(() => {
  const startedRooms = roomManager.startReadyTimeoutRooms()
  for (const roomCode of startedRooms) {
    const room = roomManager.getRoomByCode(roomCode)
    if (!room) {
      continue
    }

    const startedMessage: ServerMessage = {
      event: 'game_started',
      sentAt: Date.now(),
      payload: {
        roomCode: room.roomCode,
        roundNo: room.roundNo,
        startedAt: Date.now()
      }
    }

    broadcastToRoom(room, startedMessage)

    const startedRound = roomManager.startGameRound({ roomCode: room.roomCode })
    if (startedRound.ok) {
      const roundStartedMessage: ServerMessage = {
        event: 'round_started',
        sentAt: Date.now(),
        payload: {
          roomCode: startedRound.round.roomCode,
          roundNo: startedRound.round.roundNo,
          countdownSec: startedRound.round.countdownSec,
          durationSec: startedRound.round.durationSec,
          startAt: startedRound.round.startAt,
          endAt: startedRound.round.endAt
        }
      }
      broadcastToRoom(room, roundStartedMessage)
    }

    emitRoomState(room)
  }

  const finishedRounds = roomManager.tickGameRounds()
  for (const finished of finishedRounds) {
    const room = roomManager.getRoomByCode(finished.roomCode)
    if (!room) {
      continue
    }

    const roundResultMessage: ServerMessage = {
      event: 'round_result',
      sentAt: Date.now(),
      payload: {
        roomCode: finished.roomCode,
        roundNo: finished.roundNo,
        winners: finished.winners,
        ranking: finished.ranking,
        scoreboard: finished.scoreboard
      }
    }

    broadcastToRoom(room, roundResultMessage)
    emitRoomState(room)
  }
}, READY_TIMER_POLL_MS)

console.log(`[server] WebSocket server started on ws://localhost:${PORT}`)
