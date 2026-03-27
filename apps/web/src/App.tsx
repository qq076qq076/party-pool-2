import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { DEFAULT_GAME_ID, type ClientMessage, type ServerMessage } from '@party-pool/shared'

import { applyServerMessage, initialLobbyState } from './domain/lobby'
import { getWebGameModule } from './games/registry'
import './App.css'

const DEFAULT_WS_URL = 'ws://localhost:8787'
const HOST_NICKNAME = 'Host'
const activeGameModule = getWebGameModule(DEFAULT_GAME_ID)

const getWsUrl = (): string => import.meta.env.VITE_WS_URL ?? DEFAULT_WS_URL
const getRoomCodeFromUrl = (): string =>
  new URLSearchParams(window.location.search).get('roomCode')?.trim().toUpperCase() ?? ''

function App() {
  const initialRoomCode = getRoomCodeFromUrl()
  const wsRef = useRef<WebSocket | null>(null)
  const lobbyStateRef = useRef(initialLobbyState)
  const nicknameInputRef = useRef('')
  const autoReadySentRef = useRef<string | null>(null)
  const pendingHostActionRef = useRef<'start_game' | null>(null)
  const [wsConnected, setWsConnected] = useState(false)
  const [lobbyState, setLobbyState] = useState(initialLobbyState)
  const [joinMode, setJoinMode] = useState(initialRoomCode.length > 0)
  const [roomCodeInput, setRoomCodeInput] = useState(initialRoomCode)
  const [nicknameInput, setNicknameInput] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [copyMessage, setCopyMessage] = useState<string | null>(null)
  const [clock, setClock] = useState(Date.now())

  const wsUrl = useMemo(() => getWsUrl(), [])
  const isDevMode = import.meta.env.DEV || import.meta.env.MODE === 'test'

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
    lobbyStateRef.current = lobbyState
  }, [lobbyState])

  useEffect(() => {
    nicknameInputRef.current = nicknameInput
  }, [nicknameInput])

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

        if (
          message.event === 'room_joined' &&
          message.payload.rejoined &&
          message.payload.isHost &&
          pendingHostActionRef.current === 'start_game'
        ) {
          sendMessage({
            event: 'host_enter_ready_phase',
            payload: {
              roomCode: message.payload.room.roomCode
            }
          })
        }

        if (
          message.event === 'ready_timer_started' ||
          message.event === 'game_started' ||
          (message.event === 'room_state_updated' &&
            (message.payload.room.status === 'readying' || message.payload.room.status === 'playing'))
        ) {
          pendingHostActionRef.current = null
        }

        if (message.event === 'error') {
          if (message.payload.code === 'NOT_ROOM_HOST') {
            const current = lobbyStateRef.current
            const currentNickname =
              current.room?.players.find((player) => player.playerId === current.selfPlayerId)?.nickname ||
              nicknameInputRef.current.trim() ||
              'Player'
            if (current.room && current.rejoinToken) {
              sendMessage({
                event: 'request_rejoin',
                payload: {
                  roomCode: current.room.roomCode,
                  rejoinToken: current.rejoinToken,
                  nickname: current.isHost ? HOST_NICKNAME : currentNickname
                }
              })
              setLocalError('房主連線失效，正在自動重連...')
              return
            }
          }

          pendingHostActionRef.current = null

          if (message.payload.code === 'ROOM_NOT_FOUND') {
            setLocalError('房間已不存在，請重新開房間。')
          }
        } else {
          setLocalError(null)
        }

        setLobbyState((previous) => applyServerMessage(previous, message))
      } catch {
        setLocalError('收到無法解析的伺服器訊息。')
      }
    }

    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [sendMessage, wsUrl])

  useEffect(() => {
    if (!lobbyState.room || !lobbyState.rejoinToken) {
      return
    }

    localStorage.setItem(`rejoin:${lobbyState.room.roomCode}`, lobbyState.rejoinToken)
  }, [lobbyState.room, lobbyState.rejoinToken])

  useEffect(() => {
    if (!lobbyState.activeRound) {
      return
    }

    const timer = setInterval(() => {
      setClock(Date.now())
    }, 100)

    return () => {
      clearInterval(timer)
    }
  }, [lobbyState.activeRound])

  const selfPlayer =
    lobbyState.room?.players.find((player) => player.playerId === lobbyState.selfPlayerId) ?? null

  useEffect(() => {
    if (!wsConnected || !lobbyState.room || !selfPlayer) {
      return
    }

    if (lobbyState.room.status !== 'readying' || selfPlayer.readyStatus === 'ok') {
      return
    }

    const autoReadyKey = `${lobbyState.room.roomCode}:${lobbyState.room.roundNo}:${selfPlayer.playerId}`
    if (autoReadySentRef.current === autoReadyKey) {
      return
    }

    autoReadySentRef.current = autoReadyKey
    sendMessage({
      event: 'player_ready_ok',
      payload: {
        roomCode: lobbyState.room.roomCode,
        playerId: selfPlayer.playerId
      }
    })
  }, [lobbyState.room, selfPlayer, sendMessage, wsConnected])

  const startRoom = () => {
    sendMessage({
      event: 'create_room',
      payload: {
        nickname: HOST_NICKNAME,
        maxPlayers: 8
      }
    })
  }

  const joinRoom = () => {
    const code = roomCodeInput.trim().toUpperCase()
    const nickname = nicknameInput.trim()
    if (!code) {
      setLocalError('請輸入房間碼')
      return
    }

    if (!nickname) {
      setLocalError('請輸入暱稱')
      return
    }

    sendMessage({
      event: 'join_room',
      payload: {
        roomCode: code,
        nickname
      }
    })
  }

  const startGame = () => {
    if (!lobbyState.room || !lobbyState.isHost || playerCount === 0) {
      return
    }

    pendingHostActionRef.current = 'start_game'
    sendMessage({
      event: 'host_enter_ready_phase',
      payload: {
        roomCode: lobbyState.room.roomCode
      }
    })
  }

  const tapNow = () => {
    if (!lobbyState.room || !lobbyState.selfPlayerId || !lobbyState.activeRound) {
      return
    }

    sendMessage({
      event: 'player_input',
      payload: {
        roomCode: lobbyState.room.roomCode,
        playerId: lobbyState.selfPlayerId,
        inputType: 'tap',
        inputValue: 1,
        tsClientMs: Date.now()
      }
    })
  }

  const roomCode = lobbyState.room?.roomCode
  const playerCount = lobbyState.room?.players.length ?? 0
  const canStartGame = lobbyState.isHost && playerCount > 0
  const scenePlayers =
    lobbyState.room?.players.map((player) => ({
      playerId: player.playerId,
      nickname: player.nickname
    })) ?? []
  const joinUrl = roomCode
    ? `${window.location.origin}${window.location.pathname}?roomCode=${roomCode}`
    : ''

  const qrCodeUrl = roomCode
    ? `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(joinUrl)}`
    : ''
  const countdownSeconds = lobbyState.activeRound
    ? Math.max(0, Math.ceil((lobbyState.activeRound.startAt - clock) / 1000))
    : null
  const roundRemainingSeconds = lobbyState.activeRound
    ? Math.max(0, Math.ceil((lobbyState.activeRound.endAt - clock) / 1000))
    : null
  const canTap =
    !!lobbyState.activeRound &&
    !!lobbyState.selfPlayerId &&
    clock >= lobbyState.activeRound.startAt &&
    clock <= lobbyState.activeRound.endAt
  const isHostDisplayInRound = !!lobbyState.activeRound && lobbyState.isHost
  const isControllerInRound = !!lobbyState.activeRound && !!lobbyState.room && !lobbyState.isHost

  const copyQrCodeUrl = async () => {
    if (!joinUrl) {
      return
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(joinUrl)
      } else {
        const textArea = document.createElement('textarea')
        textArea.value = joinUrl
        textArea.style.position = 'fixed'
        textArea.style.opacity = '0'
        document.body.appendChild(textArea)
        textArea.select()
        document.execCommand('copy')
        document.body.removeChild(textArea)
      }

      setCopyMessage('QRCode 網址已複製')
      setLocalError(null)
    } catch {
      setLocalError('無法複製 QRCode 網址')
      setCopyMessage(null)
    }
  }

  if (isHostDisplayInRound && lobbyState.activeRound) {
    return (
      <main className="display-mode-shell">
        <activeGameModule.Display
          players={scenePlayers}
          progress={lobbyState.roundProgress}
          countdownSeconds={countdownSeconds}
          remainingSeconds={roundRemainingSeconds}
        />
      </main>
    )
  }

  if (isControllerInRound) {
    return (
      <main className="controller-mode-shell">
        <activeGameModule.Controller canInput={canTap} onPrimaryInput={tapNow} />
      </main>
    )
  }

  return (
    <main className="app-shell">
      <h1 className="title">Party Pool</h1>

      {!lobbyState.room ? (
        <section className="landing-card">
          <div className="landing-actions">
            <button className="primary-btn" onClick={startRoom}>
              開房間
            </button>
            <button className="ghost-btn" onClick={() => setJoinMode((value) => !value)}>
              加入房間
            </button>
          </div>

          {joinMode && (
            <div className="join-box">
              <input
                aria-label="加入房間碼"
                value={roomCodeInput}
                onChange={(event) => setRoomCodeInput(event.target.value.toUpperCase())}
                maxLength={6}
                placeholder="輸入房間碼"
              />
              <input
                aria-label="玩家暱稱"
                value={nicknameInput}
                onChange={(event) => setNicknameInput(event.target.value)}
                maxLength={16}
                placeholder="輸入你的暱稱"
              />
              <button className="primary-btn" onClick={joinRoom}>
                確認加入
              </button>
            </div>
          )}
        </section>
      ) : (
        <>
          {lobbyState.lastRoundResult && (
            <section className="result-card">
              <h2>回合結果（Round {lobbyState.lastRoundResult.roundNo}）</h2>
              <ul>
                {lobbyState.lastRoundResult.ranking.map((item) => (
                  <li key={item.playerId}>
                    {item.nickname}：{item.tapCount} 次（總分 {item.scoreAfter}）
                  </li>
                ))}
              </ul>
            </section>
          )}

          {lobbyState.isHost ? (
            <section className="room-card">
              <div className="room-main">
                <div className="room-code-box">
                  <p className="caption">房間碼</p>
                  <p className="room-code">{roomCode}</p>
                </div>

                <div className="qrcode-box">
                  <img src={qrCodeUrl} alt="加入房間 QRCode" width={220} height={220} />
                </div>
              </div>

              <div className="room-footer">
                <p>
                  目前加入人數 <strong>{playerCount} 人</strong>
                </p>
                <div className="room-actions">
                  <button className="primary-btn" onClick={startGame} disabled={!canStartGame}>
                    開始遊戲
                  </button>
                  {isDevMode && (
                    <button className="ghost-btn" onClick={copyQrCodeUrl}>
                      複製QRCode網址
                    </button>
                  )}
                </div>
              </div>
              {copyMessage && <p className="copy-text">QRCode 網址已複製</p>}
            </section>
          ) : (
            <section className="controller-wait-card">
              <p className="controller-wait-label">已加入房間</p>
              <p className="controller-wait-code">{roomCode}</p>
              <p className="controller-wait-status">等待房主開始遊戲</p>
              <div className="controller-player-list">
                {scenePlayers.map((player) => (
                  <span key={player.playerId} className="controller-player-chip">
                    {player.nickname}
                  </span>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <p className={wsConnected ? 'ws ok' : 'ws warn'}>
        連線狀態：{wsConnected ? '已連線' : '未連線'}
      </p>

      {(localError || lobbyState.error) && <p className="error-text">{localError ?? lobbyState.error}</p>}
    </main>
  )
}

export default App
