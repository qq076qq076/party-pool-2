import { useEffect, useRef } from 'react'

import Matter from 'matter-js'
import { Application, Container, Graphics, Text } from 'pixi.js'

const STEP_RISE = 34
const STEP_WIDTH = 92
const STEP_HEIGHT = 24
const FLOOR_MARGIN = 86
const CAMERA_PADDING = 0.45

const LANE_COLORS = [
  { accent: 0xe76f51, stair: 0xf3d2b2, shadow: 0xb5543d },
  { accent: 0x2a9d8f, stair: 0xd4f0eb, shadow: 0x1c6f64 },
  { accent: 0xe9c46a, stair: 0xfaedc2, shadow: 0xc89f39 },
  { accent: 0x457b9d, stair: 0xd8e8f2, shadow: 0x2d5777 },
  { accent: 0xf28482, stair: 0xfbd9d8, shadow: 0xcc6160 },
  { accent: 0x84a59d, stair: 0xd7e2df, shadow: 0x5d756f }
]

export interface StairClimbPlayer {
  playerId: string
  nickname: string
}

interface StairClimbDisplayProps {
  players: StairClimbPlayer[]
  progress: Record<string, number>
  countdownSeconds: number | null
  remainingSeconds: number | null
}

interface LaneRuntime {
  playerId: string
  nickname: string
  colorIndex: number
  climberBody: Matter.Body
  spring: Matter.Constraint
  targetStep: number
  nameText: Text
}

class StairClimbScene {
  private readonly host: HTMLDivElement
  private readonly engine = Matter.Engine.create({
    gravity: { x: 0, y: 0.9 },
    enableSleeping: false
  })
  private readonly sceneLayer = new Graphics()
  private readonly climberLayer = new Graphics()
  private readonly overlayLayer = new Container()
  private readonly timerText = new Text({
    text: '',
    style: {
      fontFamily: 'Lexend, Noto Sans TC, sans-serif',
      fontSize: 48,
      fontWeight: '700',
      fill: 0x1f1a17
    }
  })
  private readonly lanes = new Map<string, LaneRuntime>()

  private app: Application | null = null
  private players: StairClimbPlayer[] = []
  private progress: Record<string, number> = {}
  private countdownSeconds: number | null = null
  private remainingSeconds: number | null = null
  private destroyed = false

  constructor(host: HTMLDivElement) {
    this.host = host
  }

  async mount(players: StairClimbPlayer[]): Promise<void> {
    const app = new Application()
    await app.init({
      resizeTo: this.host,
      antialias: true,
      autoDensity: true,
      backgroundColor: 0xf8efd8
    })

    if (this.destroyed) {
      app.destroy(true, { children: true })
      return
    }

    this.app = app
    this.timerText.anchor.set(0.5, 0)
    this.overlayLayer.addChild(this.timerText)
    app.stage.addChild(this.sceneLayer, this.climberLayer, this.overlayLayer)
    this.host.appendChild(app.canvas)
    app.ticker.add(this.tick)
    this.setPlayers(players)
    this.render()
  }

  destroy(): void {
    this.destroyed = true

    for (const lane of this.lanes.values()) {
      lane.nameText.destroy()
    }
    this.lanes.clear()

    Matter.World.clear(this.engine.world, false)
    Matter.Engine.clear(this.engine)

    if (this.app) {
      this.app.ticker.remove(this.tick)
      this.app.destroy(true, { children: true })
      this.app = null
    }
  }

  setPlayers(players: StairClimbPlayer[]): void {
    this.players = players
    const nextIds = new Set(players.map((player) => player.playerId))

    for (const [playerId, lane] of this.lanes.entries()) {
      if (nextIds.has(playerId)) {
        continue
      }

      Matter.Composite.remove(this.engine.world, lane.spring)
      Matter.Composite.remove(this.engine.world, lane.climberBody)
      lane.nameText.destroy()
      this.overlayLayer.removeChild(lane.nameText)
      this.lanes.delete(playerId)
    }

    for (const [index, player] of players.entries()) {
      const existing = this.lanes.get(player.playerId)
      if (existing) {
        existing.nickname = player.nickname
        existing.colorIndex = index % LANE_COLORS.length
        existing.nameText.text = player.nickname
        continue
      }

      const climberBody = Matter.Bodies.circle(0, 0, 18, {
        frictionAir: 0.18,
        restitution: 0.2
      })
      const spring = Matter.Constraint.create({
        pointA: { x: 0, y: 0 },
        bodyB: climberBody,
        stiffness: 0.08,
        damping: 0.22,
        length: 0
      })
      const nameText = new Text({
        text: player.nickname,
        style: {
          fontFamily: 'Lexend, Noto Sans TC, sans-serif',
          fontSize: 20,
          fontWeight: '700',
          fill: 0x2a211b
        }
      })

      nameText.anchor.set(0.5, 0.5)
      this.overlayLayer.addChild(nameText)
      Matter.Composite.add(this.engine.world, [climberBody, spring])

      this.lanes.set(player.playerId, {
        playerId: player.playerId,
        nickname: player.nickname,
        colorIndex: index % LANE_COLORS.length,
        climberBody,
        spring,
        targetStep: 0,
        nameText
      })
    }
  }

  setRoundState(
    progress: Record<string, number>,
    countdownSeconds: number | null,
    remainingSeconds: number | null
  ): void {
    this.progress = progress
    this.countdownSeconds = countdownSeconds
    this.remainingSeconds = remainingSeconds

    for (const lane of this.lanes.values()) {
      const nextStep = progress[lane.playerId] ?? 0
      if (nextStep > lane.targetStep) {
        Matter.Body.setVelocity(lane.climberBody, {
          x: 2.8,
          y: -8.4
        })
      }
      lane.targetStep = nextStep
    }
  }

  private readonly tick = (): void => {
    Matter.Engine.update(this.engine, 1000 / 60)
    this.render()
  }

  private render(): void {
    if (!this.app) {
      return
    }

    const width = this.app.renderer.width
    const height = this.app.renderer.height
    const laneCount = Math.max(1, this.players.length)
    const floorY = height - FLOOR_MARGIN
    const highestStep = this.players.reduce((highest, player) => {
      return Math.max(highest, this.progress[player.playerId] ?? 0)
    }, 0)
    const cameraOffset = Math.max(0, highestStep * STEP_RISE - height * CAMERA_PADDING)
    const minVisibleStep = Math.max(0, Math.floor((floorY + cameraOffset - height - 60) / STEP_RISE))
    const maxVisibleStep = Math.ceil((floorY + cameraOffset + 60) / STEP_RISE)

    this.timerText.text =
      this.countdownSeconds !== null && this.countdownSeconds > 0
        ? `${this.countdownSeconds}`
        : `${Math.max(0, this.remainingSeconds ?? 0)}s`
    this.timerText.x = width / 2
    this.timerText.y = 24

    this.sceneLayer.clear()
    this.climberLayer.clear()
    this.drawBackground(width, height, floorY)

    for (const [index, player] of this.players.entries()) {
      const lane = this.lanes.get(player.playerId)
      if (!lane) {
        continue
      }

      const laneColor = LANE_COLORS[lane.colorIndex]
      const laneWidth = width / laneCount
      const laneLeft = laneWidth * index
      const laneCenter = laneLeft + laneWidth / 2

      lane.nameText.x = laneCenter
      lane.nameText.y = height - 30

      this.drawVisibleSteps(
        laneLeft,
        laneWidth,
        laneColor.stair,
        laneColor.shadow,
        floorY,
        cameraOffset,
        minVisibleStep,
        maxVisibleStep
      )

      const target = this.getStepAnchor(lane.targetStep, index, laneCount)
      lane.spring.pointA = target

      const climberX = lane.climberBody.position.x
      const climberY = floorY + lane.climberBody.position.y + cameraOffset
      this.drawClimber(climberX, climberY, laneColor.accent, lane.targetStep % 2 === 0)
    }
  }

  private drawBackground(width: number, height: number, floorY: number): void {
    this.sceneLayer
      .roundRect(24, 24, width - 48, height - 48, 32)
      .fill({ color: 0xfff7e8 })

    this.sceneLayer
      .circle(width - 120, 92, 54)
      .fill({ color: 0xf4d58d, alpha: 0.9 })

    this.sceneLayer
      .ellipse(width * 0.22, floorY + 40, 220, 110)
      .fill({ color: 0xc8ddb8 })

    this.sceneLayer
      .ellipse(width * 0.62, floorY + 68, 300, 130)
      .fill({ color: 0xaec5a0 })

    this.sceneLayer
      .rect(0, floorY + 38, width, height - floorY)
      .fill({ color: 0xe2caa8 })
  }

  private drawVisibleSteps(
    laneLeft: number,
    laneWidth: number,
    stairColor: number,
    shadowColor: number,
    floorY: number,
    cameraOffset: number,
    minVisibleStep: number,
    maxVisibleStep: number
  ): void {
    for (let stepIndex = minVisibleStep; stepIndex <= maxVisibleStep; stepIndex += 1) {
      const anchor = this.getStepAnchorByLane(stepIndex, laneLeft, laneWidth)
      const screenY = floorY + anchor.y + cameraOffset

      this.sceneLayer
        .roundRect(anchor.x - STEP_WIDTH / 2, screenY - STEP_HEIGHT / 2, STEP_WIDTH, STEP_HEIGHT, 10)
        .fill({ color: stairColor })
        .stroke({ color: shadowColor, width: 3 })

      this.sceneLayer
        .rect(
          anchor.x - STEP_WIDTH / 2 + 8,
          screenY + STEP_HEIGHT / 2 - 2,
          STEP_WIDTH - 16,
          10
        )
        .fill({ color: shadowColor, alpha: 0.3 })
    }
  }

  private drawClimber(x: number, y: number, accentColor: number, leftLead: boolean): void {
    this.climberLayer
      .circle(x, y - 58, 20)
      .fill({ color: 0xfffbf4 })
      .stroke({ color: 0x16110d, width: 5 })

    this.climberLayer
      .moveTo(x, y - 36)
      .lineTo(x, y - 4)
      .stroke({ color: accentColor, width: 6, cap: 'round' })

    if (leftLead) {
      this.climberLayer
        .moveTo(x, y - 28)
        .lineTo(x + 26, y - 18)
        .stroke({ color: 0x16110d, width: 5, cap: 'round' })
      this.climberLayer
        .moveTo(x, y - 26)
        .lineTo(x - 22, y - 6)
        .stroke({ color: 0x16110d, width: 5, cap: 'round' })
      this.climberLayer
        .moveTo(x, y - 4)
        .lineTo(x + 22, y - 28)
        .stroke({ color: 0x16110d, width: 5, cap: 'round' })
      this.climberLayer
        .moveTo(x, y - 4)
        .lineTo(x - 18, y + 18)
        .stroke({ color: 0x16110d, width: 5, cap: 'round' })
    } else {
      this.climberLayer
        .moveTo(x, y - 28)
        .lineTo(x + 20, y - 2)
        .stroke({ color: 0x16110d, width: 5, cap: 'round' })
      this.climberLayer
        .moveTo(x, y - 26)
        .lineTo(x - 24, y - 12)
        .stroke({ color: 0x16110d, width: 5, cap: 'round' })
      this.climberLayer
        .moveTo(x, y - 4)
        .lineTo(x + 18, y + 18)
        .stroke({ color: 0x16110d, width: 5, cap: 'round' })
      this.climberLayer
        .moveTo(x, y - 4)
        .lineTo(x - 22, y - 24)
        .stroke({ color: 0x16110d, width: 5, cap: 'round' })
    }
  }

  private getStepAnchor(stepIndex: number, laneIndex: number, laneCount: number): Matter.Vector {
    const laneWidth = this.app ? this.app.renderer.width / Math.max(1, laneCount) : 320
    const laneLeft = laneWidth * laneIndex

    return this.getStepAnchorByLane(stepIndex, laneLeft, laneWidth)
  }

  private getStepAnchorByLane(stepIndex: number, laneLeft: number, laneWidth: number): Matter.Vector {
    const laneBaseX = laneLeft + laneWidth * 0.36
    const stairOffsetX = (stepIndex % 2) * 30

    return {
      x: laneBaseX + stairOffsetX,
      y: -stepIndex * STEP_RISE
    }
  }
}

export function StairClimbDisplay({
  players,
  progress,
  countdownSeconds,
  remainingSeconds
}: StairClimbDisplayProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const sceneRef = useRef<StairClimbScene | null>(null)

  useEffect(() => {
    if (import.meta.env.MODE === 'test') {
      return
    }

    const host = hostRef.current
    if (!host) {
      return
    }

    const scene = new StairClimbScene(host)
    sceneRef.current = scene
    void scene.mount(players)

    return () => {
      scene.destroy()
      sceneRef.current = null
    }
  }, [])

  useEffect(() => {
    sceneRef.current?.setPlayers(players)
  }, [players])

  useEffect(() => {
    sceneRef.current?.setRoundState(progress, countdownSeconds, remainingSeconds)
  }, [countdownSeconds, progress, remainingSeconds])

  return <div ref={hostRef} className="stair-climb-display" data-testid="stair-climb-display" />
}
