import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { ClientMessage, ServerMessage } from '@party-pool/shared'

import { applyServerMessage, initialLobbyState } from './domain/lobby'
import './App.css'

const DEFAULT_WS_URL = 'ws://localhost:8787'
const DEFAULT_NICKNAME = 'Player'

const getWsUrl = (): string => import.meta.env.VITE_WS_URL ?? DEFAULT_WS_URL

function App() {
  const wsRef = useRef<WebSocket | null>(null)
  const [wsConnected, setWsConnected] = useState(false)
  const [lobbyState, setLobbyState] = useState(initialLobbyState)
  const [nickname, setNickname] = useState(DEFAULT_NICKNAME)
  const [roomCodeInput, setRoomCodeInput] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [clock, setClock] = useState(Date.now())

  const wsUrl = useMemo(() => getWsUrl(), [])

  const sendMessage = useCallback((message: ClientMessage): void => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setLocalError('WebSocket 尚未連線，請稍後再試。')
      return
    }

    ws.send(
      JSON.stringify({
        ...message,
        requestId: crypto.randomUUID(),
        sentAt: Date.now()
      })
    )
    setLocalError(null)
  }, [])

  useEffect(() => {
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      setWsConnected(true)
      setLocalError(null)
    }

    ws.onclose = () => {
      setWsConnected(false)
    }

    ws.onerror = () => {
      setLocalError('WebSocket 連線失敗，請確認 server 是否啟動。')
    }

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string) as ServerMessage
        setLobbyState((previous) => applyServerMessage(previous, message))
      } catch {
        setLocalError('收到無法解析的伺服器訊息。')
      }
    }

    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [wsUrl])

  useEffect(() => {
    if (!lobbyState.readyDeadlineAt) {
      return
    }

    const timer = setInterval(() => {
      setClock(Date.now())
    }, 200)

    return () => {
      clearInterval(timer)
    }
  }, [lobbyState.readyDeadlineAt])

  useEffect(() => {
    if (!lobbyState.room || !lobbyState.rejoinToken) {
      return
    }

    const key = `rejoin:${lobbyState.room.roomCode}`
    localStorage.setItem(key, lobbyState.rejoinToken)
  }, [lobbyState.room, lobbyState.rejoinToken])

  const selfPlayer = useMemo(() => {
    if (!lobbyState.room || !lobbyState.selfPlayerId) {
      return null
    }

    return lobbyState.room.players.find((player) => player.playerId === lobbyState.selfPlayerId) ?? null
  }, [lobbyState.room, lobbyState.selfPlayerId])

  const remainingReadySeconds =
    lobbyState.readyDeadlineAt === null ? null : Math.max(0, Math.ceil((lobbyState.readyDeadlineAt - clock) / 1000))

  const startRoom = () => {
    if (!nickname.trim()) {
      setLocalError('請先輸入暱稱。')
      return
    }

    sendMessage({
      event: 'create_room',
      payload: {
        nickname,
        maxPlayers: 8
      }
    })
  }

  const joinRoom = () => {
    if (!nickname.trim()) {
      setLocalError('請先輸入暱稱。')
      return
    }

    const code = roomCodeInput.trim().toUpperCase()
    if (!code) {
      setLocalError('請輸入房間碼。')
      return
    }

    const rejoinToken = localStorage.getItem(`rejoin:${code}`) ?? undefined

    sendMessage({
      event: 'join_room',
      payload: {
        roomCode: code,
        nickname,
        rejoinToken
      }
    })
  }

  const enterReadyPhase = () => {
    if (!lobbyState.room) {
      return
    }

    sendMessage({
      event: 'host_enter_ready_phase',
      payload: {
        roomCode: lobbyState.room.roomCode
      }
    })
  }

  const readyUp = () => {
    if (!lobbyState.room || !lobbyState.selfPlayerId) {
      return
    }

    sendMessage({
      event: 'player_ready_ok',
      payload: {
        roomCode: lobbyState.room.roomCode,
        playerId: lobbyState.selfPlayerId
      }
    })
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <h1>Party Pool MVP</h1>
        <p>開房、加入、準備倒數、自動開局（TDD 版本）</p>
        <p className={wsConnected ? 'ok' : 'warn'}>
          WS: {wsConnected ? '已連線' : '未連線'} ({wsUrl})
        </p>
      </header>

      <section className="panel">
        <h2>Lobby 操作</h2>
        <div className="row">
          <label htmlFor="nickname">暱稱</label>
          <input
            id="nickname"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            maxLength={20}
            placeholder="輸入暱稱"
          />
        </div>

        <div className="row">
          <label htmlFor="roomCode">房間碼</label>
          <input
            id="roomCode"
            value={roomCodeInput}
            onChange={(event) => setRoomCodeInput(event.target.value.toUpperCase())}
            maxLength={6}
            placeholder="ABCD"
          />
        </div>

        <div className="actions">
          <button onClick={startRoom}>開房間</button>
          <button onClick={joinRoom}>加入房間</button>
          <button onClick={enterReadyPhase} disabled={!lobbyState.room || !lobbyState.isHost}>
            房主開始準備
          </button>
          <button
            onClick={readyUp}
            disabled={
              !lobbyState.room ||
              lobbyState.room.status !== 'readying' ||
              !selfPlayer ||
              selfPlayer.readyStatus === 'ok'
            }
          >
            我已準備（OK）
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>房間資訊</h2>
        {!lobbyState.room ? (
          <p>尚未加入房間</p>
        ) : (
          <>
            <p>
              房間碼：<strong>{lobbyState.room.roomCode}</strong>
            </p>
            <p>
              狀態：<strong>{lobbyState.room.status}</strong>
            </p>
            <p>
              人數：<strong>{lobbyState.room.players.length}</strong> / {lobbyState.room.maxPlayers}
            </p>
            {remainingReadySeconds !== null && (
              <p>
                準備倒數：<strong>{remainingReadySeconds}</strong> 秒
              </p>
            )}
            {lobbyState.gameStartedAt && <p className="ok">回合已開始！</p>}

            <ul className="player-list">
              {lobbyState.room.players.map((player) => (
                <li key={player.playerId}>
                  <span>{player.nickname}</span>
                  <span>{player.isConnected ? '連線中' : '斷線'}</span>
                  <span>{player.readyStatus === 'ok' ? 'OK' : '未準備'}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {(localError || lobbyState.error) && (
        <section className="panel error">
          <h2>錯誤訊息</h2>
          <p>{localError ?? lobbyState.error}</p>
        </section>
      )}
    </main>
  )
}

export default App
