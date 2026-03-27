import { useEffect, useMemo, useState } from 'react'

import '../../App.css'
import { StairClimbDisplay } from './StairClimbDisplay'

const COUNTDOWN_MS = 3_000
const ROUND_DURATION_MS = 20_000
const TOTAL_MS = COUNTDOWN_MS + ROUND_DURATION_MS

const DEBUG_PLAYERS = [
  { playerId: 'p1', nickname: 'Aki' },
  { playerId: 'p2', nickname: 'Mina' },
  { playerId: 'p3', nickname: 'Bo' },
  { playerId: 'p4', nickname: 'Rio' }
]

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

const getScriptedClimbSteps = (laneIndex: number, elapsedMs: number): number => {
  const activeMs = clamp(elapsedMs - COUNTDOWN_MS, 0, ROUND_DURATION_MS)
  const activeSeconds = activeMs / 1000
  const baseRate = 1.4 + laneIndex * 0.34
  const wobble = Math.sin(activeSeconds * (laneIndex + 1) * 0.8) * 0.22

  return Math.max(0, Math.floor(activeSeconds * (baseRate + wobble)))
}

export function StairClimbDebugPage() {
  const [elapsedMs, setElapsedMs] = useState(0)
  const [focusedIndex, setFocusedIndex] = useState(0)
  const [manualBoosts, setManualBoosts] = useState<Record<string, number>>({})

  const focusedPlayerId = DEBUG_PLAYERS[focusedIndex]?.playerId ?? DEBUG_PLAYERS[0].playerId
  const activeMs = clamp(elapsedMs - COUNTDOWN_MS, 0, ROUND_DURATION_MS)
  const countdownSeconds =
    elapsedMs < COUNTDOWN_MS ? Math.max(1, Math.ceil((COUNTDOWN_MS - elapsedMs) / 1000)) : null
  const remainingSeconds = Math.max(0, Math.ceil((ROUND_DURATION_MS - activeMs) / 1000))

  const progress = useMemo(() => {
    return Object.fromEntries(
      DEBUG_PLAYERS.map((player, laneIndex) => [
        player.playerId,
        getScriptedClimbSteps(laneIndex, elapsedMs) + (manualBoosts[player.playerId] ?? 0)
      ])
    )
  }, [elapsedMs, manualBoosts])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'ArrowLeft') {
        setFocusedIndex((current) => (current - 1 + DEBUG_PLAYERS.length) % DEBUG_PLAYERS.length)
        return
      }

      if (event.code === 'ArrowRight') {
        setFocusedIndex((current) => (current + 1) % DEBUG_PLAYERS.length)
        return
      }

      if (event.code === 'Space') {
        event.preventDefault()
        setElapsedMs((current) => Math.max(current, COUNTDOWN_MS))
        setManualBoosts((current) => ({
          ...current,
          [focusedPlayerId]: (current[focusedPlayerId] ?? 0) + 1
        }))
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [focusedPlayerId])

  useEffect(() => {
    const advanceTime = async (ms: number): Promise<void> => {
      setElapsedMs((current) => clamp(current + ms, 0, TOTAL_MS))
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve())
      })
    }

    window.advanceTime = advanceTime

    return () => {
      if (window.advanceTime === advanceTime) {
        delete window.advanceTime
      }
    }
  }, [])

  return (
    <main className="display-mode-shell">
      <StairClimbDisplay
        players={DEBUG_PLAYERS}
        progress={progress}
        countdownSeconds={countdownSeconds}
        remainingSeconds={remainingSeconds}
        focusedPlayerId={focusedPlayerId}
      />
    </main>
  )
}
