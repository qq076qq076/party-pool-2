import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'

class MockWebSocket {
  static instances: MockWebSocket[] = []
  static OPEN = 1
  static CLOSED = 3

  readonly url: string
  readonly OPEN = MockWebSocket.OPEN
  readonly CLOSED = MockWebSocket.CLOSED

  readyState = 0
  onopen: ((event: Event) => void) | null = null
  onclose: ((event: Event) => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  sent: string[] = []

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
    setTimeout(() => {
      this.readyState = this.OPEN
      this.onopen?.(new Event('open'))
    }, 0)
  }

  send(payload: string): void {
    this.sent.push(payload)
  }

  close(): void {
    this.readyState = this.CLOSED
    this.onclose?.(new Event('close'))
  }

  emitMessage(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent)
  }
}

describe('App host UI', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    vi.stubGlobal('WebSocket', MockWebSocket)
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      '00000000-0000-0000-0000-000000000000'
    )
    window.history.replaceState({}, '', '/')
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('shows centered title and create/join actions on landing', async () => {
    render(<App />)

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBe(1)
    })

    expect(screen.getByRole('heading', { name: 'Party Pool' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '開房間' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '加入房間' })).toBeInTheDocument()
  })

  it('shows room code, qrcode, player count and start button after creating room', async () => {
    render(<App />)

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBe(1)
    })
    await waitFor(() => {
      expect(screen.getByText('連線狀態：已連線')).toBeInTheDocument()
    })

    const ws = MockWebSocket.instances[0]

    fireEvent.click(screen.getByRole('button', { name: '開房間' }))

    const sent = ws.sent.at(0)
    expect(sent).toBeTruthy()
    expect(sent).toContain('create_room')

    ws.emitMessage({
      event: 'room_created',
      payload: {
        room: {
          roomId: 'room-1',
          roomCode: 'ABCD',
          status: 'waiting',
          maxPlayers: 8,
          players: [
            {
              playerId: 'host-1',
              nickname: 'Host',
              isConnected: true,
              readyStatus: 'pending',
              score: 0,
              sensorStatus: 'unknown',
              lastSeenAt: Date.now()
            }
          ],
          readyDeadlineAt: null,
          roundNo: 1,
          createdAt: Date.now()
        },
        playerId: 'host-1',
        rejoinToken: 'token-1'
      }
    })

    ws.emitMessage({
      event: 'room_state_updated',
      payload: {
        room: {
          roomId: 'room-1',
          roomCode: 'ABCD',
          status: 'waiting',
          maxPlayers: 8,
          players: [
            {
              playerId: 'host-1',
              nickname: 'Host',
              isConnected: true,
              readyStatus: 'pending',
              score: 0,
              sensorStatus: 'unknown',
              lastSeenAt: Date.now()
            },
            {
              playerId: 'p-2',
              nickname: 'P2',
              isConnected: true,
              readyStatus: 'pending',
              score: 0,
              sensorStatus: 'unknown',
              lastSeenAt: Date.now()
            }
          ],
          readyDeadlineAt: null,
          roundNo: 1,
          createdAt: Date.now()
        }
      }
    })

    expect(await screen.findByText('房間碼')).toBeInTheDocument()
    expect(screen.getByText('ABCD')).toBeInTheDocument()
    expect(screen.getByText('目前加入人數')).toBeInTheDocument()
    expect(screen.getByText('2 人')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '加入房間 QRCode' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '開始遊戲' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '複製QRCode網址' })).toBeInTheDocument()
  })

  it('copies qrcode url by clicking copy button in dev mode', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true
    })

    render(<App />)

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBe(1)
    })
    await waitFor(() => {
      expect(screen.getByText('連線狀態：已連線')).toBeInTheDocument()
    })

    const ws = MockWebSocket.instances[0]
    fireEvent.click(screen.getByRole('button', { name: '開房間' }))

    ws.emitMessage({
      event: 'room_created',
      payload: {
        room: {
          roomId: 'room-1',
          roomCode: 'ABCD',
          status: 'waiting',
          maxPlayers: 8,
          players: [
            {
              playerId: 'host-1',
              nickname: 'Host',
              isConnected: true,
              readyStatus: 'pending',
              score: 0,
              sensorStatus: 'unknown',
              lastSeenAt: Date.now()
            }
          ],
          readyDeadlineAt: null,
          roundNo: 1,
          createdAt: Date.now()
        },
        playerId: 'host-1',
        rejoinToken: 'token-1'
      }
    })

    const copyButton = await screen.findByRole('button', { name: '複製QRCode網址' })
    fireEvent.click(copyButton)

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1)
      expect(writeText.mock.calls[0][0]).toContain('?roomCode=ABCD')
      expect(writeText.mock.calls[0][0]).not.toContain('api.qrserver.com')
    })
  })

  it('sends player_input when tap button is clicked during active round', async () => {
    render(<App />)

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBe(1)
    })
    await waitFor(() => {
      expect(screen.getByText('連線狀態：已連線')).toBeInTheDocument()
    })

    const ws = MockWebSocket.instances[0]
    fireEvent.click(screen.getByRole('button', { name: '開房間' }))

    ws.emitMessage({
      event: 'room_created',
      payload: {
        room: {
          roomId: 'room-1',
          roomCode: 'ABCD',
          status: 'playing',
          maxPlayers: 8,
          players: [
            {
              playerId: 'host-1',
              nickname: 'Host',
              isConnected: true,
              readyStatus: 'ok',
              score: 0,
              sensorStatus: 'unknown',
              lastSeenAt: Date.now()
            }
          ],
          readyDeadlineAt: null,
          roundNo: 1,
          createdAt: Date.now()
        },
        playerId: 'host-1',
        rejoinToken: 'token-1'
      }
    })

    ws.emitMessage({
      event: 'round_started',
      payload: {
        roomCode: 'ABCD',
        roundNo: 1,
        countdownSec: 3,
        durationSec: 20,
        startAt: Date.now() - 100,
        endAt: Date.now() + 20_000
      }
    })

    const tapButton = await screen.findByRole('button', { name: /連打！/ })
    fireEvent.click(tapButton)

    const lastSent = ws.sent.at(-1) ?? ''
    expect(lastSent).toContain('player_input')
    expect(lastSent).toContain('host-1')
  })

  it('does not include rejoin token in manual join_room action', async () => {
    render(<App />)

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBe(1)
    })
    await waitFor(() => {
      expect(screen.getByText('連線狀態：已連線')).toBeInTheDocument()
    })

    localStorage.setItem('rejoin:ABCD', 'stale-token')

    fireEvent.click(screen.getByRole('button', { name: '加入房間' }))
    fireEvent.change(screen.getByLabelText('加入房間碼'), {
      target: { value: 'ABCD' }
    })
    fireEvent.click(screen.getByRole('button', { name: '確認加入' }))

    const ws = MockWebSocket.instances[0]
    const lastSent = ws.sent.at(-1) ?? ''
    expect(lastSent).toContain('join_room')
    expect(lastSent).not.toContain('stale-token')
  })

  it('auto joins room from qrcode roomCode url param', async () => {
    window.history.replaceState({}, '', '/?roomCode=ABCD')

    render(<App />)

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBe(1)
    })
    await waitFor(() => {
      expect(screen.getByText('連線狀態：已連線')).toBeInTheDocument()
    })

    const ws = MockWebSocket.instances[0]

    await waitFor(() => {
      const lastSent = ws.sent.at(-1) ?? ''
      expect(lastSent).toContain('join_room')
      expect(lastSent).toContain('ABCD')
      expect(lastSent).toContain('Display')
    })
  })

  it('auto sends ready confirmation after host enters ready phase', async () => {
    render(<App />)

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBe(1)
    })
    await waitFor(() => {
      expect(screen.getByText('連線狀態：已連線')).toBeInTheDocument()
    })

    const ws = MockWebSocket.instances[0]
    fireEvent.click(screen.getByRole('button', { name: '開房間' }))

    ws.emitMessage({
      event: 'room_created',
      payload: {
        room: {
          roomId: 'room-1',
          roomCode: 'ABCD',
          status: 'waiting',
          maxPlayers: 8,
          players: [
            {
              playerId: 'host-1',
              nickname: 'Host',
              isConnected: true,
              readyStatus: 'pending',
              score: 0,
              sensorStatus: 'unknown',
              lastSeenAt: Date.now()
            }
          ],
          readyDeadlineAt: null,
          roundNo: 1,
          createdAt: Date.now()
        },
        playerId: 'host-1',
        rejoinToken: 'token-1'
      }
    })

    fireEvent.click(await screen.findByRole('button', { name: '開始遊戲' }))

    await waitFor(() => {
      const lastSent = ws.sent.at(-1) ?? ''
      expect(lastSent).toContain('host_enter_ready_phase')
    })

    ws.emitMessage({
      event: 'ready_timer_started',
      payload: {
        roomCode: 'ABCD',
        roundNo: 1,
        readyDeadlineAt: Date.now() + 60_000
      }
    })
    ws.emitMessage({
      event: 'room_state_updated',
      payload: {
        room: {
          roomId: 'room-1',
          roomCode: 'ABCD',
          status: 'readying',
          maxPlayers: 8,
          players: [
            {
              playerId: 'host-1',
              nickname: 'Host',
              isConnected: true,
              readyStatus: 'pending',
              score: 0,
              sensorStatus: 'unknown',
              lastSeenAt: Date.now()
            }
          ],
          readyDeadlineAt: Date.now() + 60_000,
          roundNo: 1,
          createdAt: Date.now()
        }
      }
    })

    await waitFor(() => {
      const lastSent = ws.sent.at(-1) ?? ''
      expect(lastSent).toContain('player_ready_ok')
      expect(lastSent).toContain('host-1')
    })

    ws.emitMessage({
      event: 'game_started',
      payload: {
        roomCode: 'ABCD',
        roundNo: 1,
        startedAt: Date.now()
      }
    })
    ws.emitMessage({
      event: 'round_started',
      payload: {
        roomCode: 'ABCD',
        roundNo: 1,
        countdownSec: 3,
        durationSec: 20,
        startAt: Date.now() - 100,
        endAt: Date.now() + 20_000
      }
    })

    expect(await screen.findByRole('button', { name: /連打！/ })).toBeInTheDocument()
  })

  it('retries start game after rejoin when server returns NOT_ROOM_HOST', async () => {
    render(<App />)

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBe(1)
    })
    await waitFor(() => {
      expect(screen.getByText('連線狀態：已連線')).toBeInTheDocument()
    })

    const ws = MockWebSocket.instances[0]
    fireEvent.click(screen.getByRole('button', { name: '開房間' }))

    ws.emitMessage({
      event: 'room_created',
      payload: {
        room: {
          roomId: 'room-1',
          roomCode: 'ABCD',
          status: 'waiting',
          maxPlayers: 8,
          players: [
            {
              playerId: 'host-1',
              nickname: 'Host',
              isConnected: true,
              readyStatus: 'pending',
              score: 0,
              sensorStatus: 'unknown',
              lastSeenAt: Date.now()
            }
          ],
          readyDeadlineAt: null,
          roundNo: 1,
          createdAt: Date.now()
        },
        playerId: 'host-1',
        rejoinToken: 'token-1'
      }
    })

    await screen.findByText('ABCD')
    fireEvent.click(screen.getByRole('button', { name: '開始遊戲' }))

    await waitFor(() => {
      const hostEnterReadyMessages = ws.sent.filter((item) => item.includes('host_enter_ready_phase'))
      expect(hostEnterReadyMessages).toHaveLength(1)
    })

    ws.emitMessage({
      event: 'error',
      payload: {
        code: 'NOT_ROOM_HOST',
        message: 'Cannot enter ready phase'
      }
    })

    await waitFor(() => {
      const lastSent = ws.sent.at(-1) ?? ''
      expect(lastSent).toContain('request_rejoin')
      expect(lastSent).toContain('ABCD')
      expect(lastSent).toContain('token-1')
    })

    ws.emitMessage({
      event: 'room_joined',
      payload: {
        room: {
          roomId: 'room-1',
          roomCode: 'ABCD',
          status: 'waiting',
          maxPlayers: 8,
          players: [
            {
              playerId: 'host-1',
              nickname: 'Host',
              isConnected: true,
              readyStatus: 'pending',
              score: 0,
              sensorStatus: 'unknown',
              lastSeenAt: Date.now()
            }
          ],
          readyDeadlineAt: null,
          roundNo: 1,
          createdAt: Date.now()
        },
        playerId: 'host-1',
        rejoinToken: 'token-1',
        rejoined: true,
        isHost: true
      }
    })

    await waitFor(() => {
      const hostEnterReadyMessages = ws.sent.filter((item) => item.includes('host_enter_ready_phase'))
      expect(hostEnterReadyMessages).toHaveLength(2)
      const lastSent = ws.sent.at(-1) ?? ''
      expect(lastSent).toContain('host_enter_ready_phase')
    })
  })
})
