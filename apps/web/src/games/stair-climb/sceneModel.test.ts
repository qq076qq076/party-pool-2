import { describe, expect, it } from 'vitest'

import { buildStairClimbSceneModel, buildStairClimbTextSnapshot } from './sceneModel'

const players = [
  { playerId: 'p1', nickname: 'Aki' },
  { playerId: 'p2', nickname: 'Mina' },
  { playerId: 'p3', nickname: 'Bo' }
]

describe('stair climb scene model', () => {
  it('derives ranking, focus state and camera from player progress', () => {
    const model = buildStairClimbSceneModel({
      players,
      progress: {
        p1: 4,
        p2: 12,
        p3: 12
      },
      countdownSeconds: null,
      remainingSeconds: 12,
      width: 960,
      height: 640,
      focusedPlayerId: 'p1'
    })

    expect(model.timerLabel).toBe('12s')
    expect(model.highestStep).toBe(12)
    expect(model.cameraOffset).toBeGreaterThan(0)
    expect(model.lanes.map((lane) => [lane.playerId, lane.rank])).toEqual([
      ['p1', 3],
      ['p2', 1],
      ['p3', 1]
    ])
    expect(model.lanes[0]?.isFocused).toBe(true)
    expect(model.lanes[1]?.isLeader).toBe(true)
    expect(model.lanes[2]?.isLeader).toBe(true)
  })

  it('produces a compact text snapshot that mirrors the rendered scene state', () => {
    const model = buildStairClimbSceneModel({
      players,
      progress: {
        p1: 1,
        p2: 2,
        p3: 0
      },
      countdownSeconds: 2,
      remainingSeconds: 20,
      width: 900,
      height: 600,
      focusedPlayerId: 'p2'
    })

    const snapshot = buildStairClimbTextSnapshot(model, {
      p1: {
        x: 120,
        y: -20,
        vx: 1.2,
        vy: -3.8,
        screenX: 120,
        screenY: 494,
        displayedStep: 1,
        fromStep: 1,
        toStep: 1,
        stepProgress: 1,
        phase: 'idle',
        movingSide: null
      },
      p2: {
        x: 420,
        y: -68,
        vx: 2.4,
        vy: -8.1,
        screenX: 420,
        screenY: 446,
        displayedStep: 1,
        fromStep: 1,
        toStep: 2,
        stepProgress: 0.5,
        phase: 'stepping',
        movingSide: 'right'
      },
      p3: null
    })

    expect(snapshot.mode).toBe('countdown')
    expect(snapshot.coordinateSystem.origin).toBe('canvas top-left')
    expect(snapshot.lanes[1]).toMatchObject({
      playerId: 'p2',
      isFocused: true,
      tapCount: 2
    })
    expect(snapshot.lanes[1]?.climber?.vy).toBe(-8.1)
    expect(snapshot.lanes[1]?.climber?.phase).toBe('stepping')
    expect(snapshot.lanes[2]?.climber).toBeNull()
  })
})
