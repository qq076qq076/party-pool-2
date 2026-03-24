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

  for (const player of room.players) {
    const socketId = playerToSocket.get(player.playerId)
    if (!socketId) {
      continue
    }

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

const removePlayerSocketBindings = (socketId: string): void => {
  for (const [playerId, mappedSocketId] of playerToSocket.entries()) {
    if (mappedSocketId === socketId) {
      playerToSocket.delete(playerId)
    }
  }
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

      bindPlayerSocket(created.hostPlayerId, socketId)

      send(socket, {
        event: 'room_created',
        requestId: parsed.requestId,
        sentAt: Date.now(),
        payload: {
          room: created.room,
          playerId: created.hostPlayerId,
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

      bindPlayerSocket(joined.player.playerId, socketId)

      send(socket, {
        event: 'room_joined',
        requestId: parsed.requestId,
        sentAt: Date.now(),
        payload: {
          room: joined.room,
          playerId: joined.player.playerId,
          rejoinToken: joined.rejoinToken,
          rejoined: joined.rejoined
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

      for (const player of entered.room.players) {
        const targetSocketId = playerToSocket.get(player.playerId)
        if (!targetSocketId) {
          continue
        }

        const targetSocket = socketsById.get(targetSocketId)
        if (!targetSocket || targetSocket.readyState !== targetSocket.OPEN) {
          continue
        }

        send(targetSocket, message)
      }

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

      for (const player of room.players) {
        const targetSocketId = playerToSocket.get(player.playerId)
        if (!targetSocketId) {
          continue
        }
        const targetSocket = socketsById.get(targetSocketId)
        if (!targetSocket || targetSocket.readyState !== targetSocket.OPEN) {
          continue
        }
        send(targetSocket, readyStatusMessage)
      }

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

        for (const player of room.players) {
          const targetSocketId = playerToSocket.get(player.playerId)
          if (!targetSocketId) {
            continue
          }

          const targetSocket = socketsById.get(targetSocketId)
          if (!targetSocket || targetSocket.readyState !== targetSocket.OPEN) {
            continue
          }

          send(targetSocket, gameStartedMessage)
        }
      }

      emitRoomState(room)
      return
    }
  })

  socket.on('close', () => {
    socketsById.delete(socketId)
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

    for (const player of room.players) {
      const socketId = playerToSocket.get(player.playerId)
      if (!socketId) {
        continue
      }

      const socket = socketsById.get(socketId)
      if (!socket || socket.readyState !== socket.OPEN) {
        continue
      }

      send(socket, startedMessage)
    }

    emitRoomState(room)
  }
}, READY_TIMER_POLL_MS)

console.log(`[server] WebSocket server started on ws://localhost:${PORT}`)
