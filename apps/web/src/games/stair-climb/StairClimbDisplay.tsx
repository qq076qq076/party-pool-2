import { useEffect, useRef } from 'react'

import { Application, Container, Graphics, Text } from 'pixi.js'

import type { GameDisplayPlayer, GameDisplayProps } from '../types'
import {
  FLOOR_MARGIN,
  STEP_HEIGHT,
  STEP_WIDTH,
  buildStairClimbSceneModel,
  buildStairClimbTextSnapshot,
  buildStickFigurePose,
  getStepAnchorByLane,
  type StairClimbLaneModel,
  type StairClimbRuntimeSnapshot,
  type StairClimbSceneModel,
  type StairClimbStickFigurePose
} from './sceneModel'

interface StairClimbDisplayProps extends GameDisplayProps {
  focusedPlayerId?: string | null
}

interface StepAnimationState {
  fromStep: number
  toStep: number
  elapsedMs: number
  durationMs: number
}

interface LaneRuntime {
  playerId: string
  nickname: string
  targetStep: number
  displayedStep: number
  poseClockMs: number
  stepAnimation: StepAnimationState | null
  latestSnapshot: StairClimbRuntimeSnapshot | null
  nameText: Text
}

const FIXED_TICK_MS = 1000 / 60

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

class StairClimbScene {
  private readonly host: HTMLDivElement
  private readonly sceneLayer = new Graphics()
  private readonly climberLayer = new Graphics()
  private readonly overlayLayer = new Container()
  private readonly timerText = new Text({
    text: '',
    style: {
      fontFamily: 'Lexend, Noto Sans TC, sans-serif',
      fontSize: 48,
      fontWeight: '700',
      fill: 0x1f1a17,
      padding: 10
    }
  })
  private readonly lanes = new Map<string, LaneRuntime>()
  private readonly renderGameToText = (): string => JSON.stringify(window.__stairClimbSnapshot ?? null)

  private app: Application | null = null
  private players: GameDisplayPlayer[] = []
  private progress: Record<string, number> = {}
  private countdownSeconds: number | null = null
  private remainingSeconds: number | null = null
  private focusedPlayerId: string | null = null
  private destroyed = false

  constructor(host: HTMLDivElement) {
    this.host = host
  }

  async mount(players: GameDisplayPlayer[]): Promise<void> {
    const app = new Application()
    await app.init({
      resizeTo: this.host,
      antialias: true,
      autoDensity: true,
      backgroundColor: 0xf8efd8,
      preference: 'webgl',
      preserveDrawingBuffer: true
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
    window.render_game_to_text = this.renderGameToText
    this.setPlayers(players)
    this.render()
  }

  destroy(): void {
    this.destroyed = true

    for (const lane of this.lanes.values()) {
      lane.nameText.destroy()
    }
    this.lanes.clear()

    if (window.render_game_to_text === this.renderGameToText) {
      delete window.render_game_to_text
    }
    if (window.__stairClimbSnapshot) {
      window.__stairClimbSnapshot = null
    }

    if (this.app) {
      this.app.ticker.remove(this.tick)
      this.app.destroy(true, { children: true })
      this.app = null
    }
  }

  setPlayers(players: GameDisplayPlayer[]): void {
    this.players = players
    const nextIds = new Set(players.map((player) => player.playerId))

    for (const [playerId, lane] of this.lanes.entries()) {
      if (nextIds.has(playerId)) {
        continue
      }

      lane.nameText.destroy()
      this.overlayLayer.removeChild(lane.nameText)
      this.lanes.delete(playerId)
    }

    for (const player of players) {
      const existing = this.lanes.get(player.playerId)
      if (existing) {
        existing.nickname = player.nickname
        continue
      }

      const initialStep = this.progress[player.playerId] ?? 0
      const nameText = new Text({
        text: player.nickname,
        style: {
          fontFamily: 'Lexend, Noto Sans TC, sans-serif',
          fontSize: 20,
          fontWeight: '700',
          fill: 0x2a211b,
          padding: 8
        }
      })

      nameText.anchor.set(0.5, 0.5)
      this.overlayLayer.addChild(nameText)

      this.lanes.set(player.playerId, {
        playerId: player.playerId,
        nickname: player.nickname,
        targetStep: initialStep,
        displayedStep: initialStep,
        poseClockMs: 0,
        stepAnimation: null,
        latestSnapshot: null,
        nameText
      })
    }
  }

  setRoundState(
    progress: Record<string, number>,
    countdownSeconds: number | null,
    remainingSeconds: number | null,
    focusedPlayerId: string | null = null
  ): void {
    this.progress = progress
    this.countdownSeconds = countdownSeconds
    this.remainingSeconds = remainingSeconds
    this.focusedPlayerId = focusedPlayerId

    for (const lane of this.lanes.values()) {
      const nextStep = progress[lane.playerId] ?? 0

      if (nextStep < lane.targetStep || nextStep < lane.displayedStep) {
        lane.targetStep = nextStep
        lane.displayedStep = nextStep
        lane.stepAnimation = null
        lane.latestSnapshot = null
        continue
      }

      lane.targetStep = nextStep
    }
  }

  private readonly tick = (): void => {
    this.advanceAnimations(FIXED_TICK_MS)
    this.render()
  }

  private advanceAnimations(deltaMs: number): void {
    for (const lane of this.lanes.values()) {
      lane.poseClockMs += deltaMs
      let remainingMs = deltaMs

      while (remainingMs > 0) {
        if (!lane.stepAnimation) {
          if (lane.displayedStep >= lane.targetStep) {
            break
          }

          const backlog = lane.targetStep - lane.displayedStep
          lane.stepAnimation = {
            fromStep: lane.displayedStep,
            toStep: lane.displayedStep + 1,
            elapsedMs: 0,
            durationMs: clamp(220 - (backlog - 1) * 18, 90, 220)
          }
        }

        const animation = lane.stepAnimation
        if (!animation) {
          break
        }

        const sliceMs = Math.min(remainingMs, animation.durationMs - animation.elapsedMs)
        animation.elapsedMs += sliceMs
        remainingMs -= sliceMs

        if (animation.elapsedMs >= animation.durationMs) {
          lane.displayedStep = animation.toStep
          lane.stepAnimation = null
        }
      }
    }
  }

  private render(): void {
    if (!this.app) {
      return
    }

    const sceneModel = buildStairClimbSceneModel({
      players: this.players,
      progress: this.progress,
      countdownSeconds: this.countdownSeconds,
      remainingSeconds: this.remainingSeconds,
      width: this.app.renderer.width,
      height: this.app.renderer.height,
      focusedPlayerId: this.focusedPlayerId
    })

    this.timerText.text = sceneModel.timerLabel
    this.timerText.x = sceneModel.width / 2
    this.timerText.y = 24

    this.sceneLayer.clear()
    this.climberLayer.clear()
    this.drawBackground(sceneModel)

    const runtimeByPlayerId: Record<string, StairClimbRuntimeSnapshot | null> = {}

    for (const laneModel of sceneModel.lanes) {
      const laneRuntime = this.lanes.get(laneModel.playerId)
      if (!laneRuntime) {
        runtimeByPlayerId[laneModel.playerId] = null
        continue
      }

      laneRuntime.nameText.text = laneModel.nameplateText
      laneRuntime.nameText.x = laneModel.nameX
      laneRuntime.nameText.y = laneModel.nameY

      const stepAnimation = laneRuntime.stepAnimation
      const pose = buildStickFigurePose({
        laneLeft: laneModel.laneLeft,
        laneWidth: laneModel.laneWidth,
        floorY: sceneModel.floorY,
        cameraOffset: sceneModel.cameraOffset,
        displayedStep: laneRuntime.displayedStep,
        poseClockMs: laneRuntime.poseClockMs,
        animation: stepAnimation
          ? {
              fromStep: stepAnimation.fromStep,
              toStep: stepAnimation.toStep,
              progress: stepAnimation.elapsedMs / stepAnimation.durationMs
            }
          : null
      })

      this.drawLaneBackdrop(laneModel, sceneModel)
      this.drawVisibleSteps(laneModel, sceneModel)
      this.drawProgressMarker(laneModel, sceneModel, pose)
      this.drawClimber(pose, laneModel)

      runtimeByPlayerId[laneModel.playerId] = this.buildRuntimeSnapshot(
        sceneModel,
        laneRuntime,
        pose,
        stepAnimation
      )
    }

    this.updateTextSnapshot(sceneModel, runtimeByPlayerId)
  }

  private drawBackground(sceneModel: StairClimbSceneModel): void {
    const { width, height, floorY } = sceneModel

    this.sceneLayer
      .roundRect(24, 24, width - 48, height - 48, 32)
      .fill({ color: 0xfff7e8 })

    this.sceneLayer
      .rect(32, 32, width - 64, height * 0.48)
      .fill({ color: 0xfef6df })

    this.sceneLayer
      .circle(width - 120, 92, 54)
      .fill({ color: 0xf4d58d, alpha: 0.9 })

    this.sceneLayer
      .ellipse(width * 0.2, floorY + 12, 250, 120)
      .fill({ color: 0xc8ddb8 })

    this.sceneLayer
      .ellipse(width * 0.58, floorY + 36, 320, 144)
      .fill({ color: 0xaec5a0 })

    this.sceneLayer
      .ellipse(width * 0.9, floorY + 40, 240, 126)
      .fill({ color: 0xc1d5af })

    this.sceneLayer
      .rect(0, floorY + 38, width, height - floorY)
      .fill({ color: 0xe2caa8 })
  }

  private drawLaneBackdrop(lane: StairClimbLaneModel, sceneModel: StairClimbSceneModel): void {
    const trackTop = 56
    const trackHeight = sceneModel.height - trackTop - FLOOR_MARGIN + 24
    const trackLeft = lane.laneLeft + lane.laneWidth * 0.1
    const trackWidth = lane.laneWidth * 0.68
    const laneAlpha = lane.isFocused ? 0.28 : 0.16

    this.sceneLayer
      .roundRect(trackLeft, trackTop, trackWidth, trackHeight, 26)
      .fill({ color: 0xffffff, alpha: laneAlpha })
      .stroke({
        color: lane.isLeader ? lane.colors.accent : lane.colors.shadow,
        width: lane.isFocused ? 4 : 2,
        alpha: lane.isFocused ? 0.9 : 0.38
      })

    this.sceneLayer
      .roundRect(lane.laneGuideX - 6, trackTop + 18, 12, trackHeight - 46, 8)
      .fill({ color: lane.colors.shadow, alpha: 0.12 })

    const meterHeight = (trackHeight - 40) * lane.progressRatio
    if (meterHeight > 0) {
      this.sceneLayer
        .roundRect(trackLeft + trackWidth - 16, trackTop + trackHeight - 22 - meterHeight, 8, meterHeight, 6)
        .fill({ color: lane.colors.accent, alpha: 0.72 })
    }
  }

  private drawVisibleSteps(lane: StairClimbLaneModel, sceneModel: StairClimbSceneModel): void {
    for (
      let stepIndex = sceneModel.minVisibleStep;
      stepIndex <= sceneModel.maxVisibleStep;
      stepIndex += 1
    ) {
      const anchor = getStepAnchorByLane(stepIndex, lane.laneLeft, lane.laneWidth)
      const screenY = sceneModel.floorY + anchor.y + sceneModel.cameraOffset

      this.sceneLayer
        .roundRect(anchor.x - STEP_WIDTH / 2, screenY - STEP_HEIGHT / 2, STEP_WIDTH, STEP_HEIGHT, 10)
        .fill({ color: lane.colors.stair })
        .stroke({ color: lane.colors.shadow, width: 3 })

      this.sceneLayer
        .rect(
          anchor.x - STEP_WIDTH / 2 + 8,
          screenY + STEP_HEIGHT / 2 - 2,
          STEP_WIDTH - 16,
          10
        )
        .fill({ color: lane.colors.shadow, alpha: 0.26 })
    }
  }

  private drawProgressMarker(
    lane: StairClimbLaneModel,
    sceneModel: StairClimbSceneModel,
    pose: StairClimbStickFigurePose
  ): void {
    const markerFoot = pose.leftFoot.step >= pose.rightFoot.step ? pose.leftFoot : pose.rightFoot
    const markerX = markerFoot.point.x + 52
    const markerY = markerFoot.point.y - 18

    if (markerY < 48 || markerY > sceneModel.height - 72) {
      return
    }

    this.sceneLayer
      .moveTo(markerX, markerY + 8)
      .lineTo(markerX, markerY - 20)
      .stroke({ color: lane.colors.shadow, width: 4, cap: 'round' })

    this.sceneLayer
      .poly([
        markerX,
        markerY - 20,
        markerX + 24,
        markerY - 12,
        markerX,
        markerY - 4
      ])
      .fill({ color: lane.colors.accent })
  }

  private drawClimber(pose: StairClimbStickFigurePose, lane: StairClimbLaneModel): void {
    const feetCenterX = (pose.leftFoot.point.x + pose.rightFoot.point.x) / 2
    const feetCenterY = Math.max(pose.leftFoot.point.y, pose.rightFoot.point.y) + 8

    if (pose.movingTrailStart && pose.movingTrailEnd) {
      this.climberLayer
        .moveTo(pose.movingTrailStart.x, pose.movingTrailStart.y - 2)
        .lineTo(pose.movingTrailEnd.x, pose.movingTrailEnd.y - 2)
        .stroke({ color: lane.colors.accent, alpha: 0.18, width: 5, cap: 'round' })
    }

    this.climberLayer
      .ellipse(feetCenterX, feetCenterY, 26, 8)
      .fill({ color: 0x000000, alpha: 0.08 })

    this.drawLimb(pose.leftShoulder, pose.leftElbow, pose.leftHand, 0x1b1714, 5)
    this.drawLimb(pose.rightShoulder, pose.rightElbow, pose.rightHand, 0x1b1714, 5)
    this.drawLimb(pose.hipCenter, pose.leftKnee, pose.leftFoot.point, 0x1b1714, 6)
    this.drawLimb(pose.hipCenter, pose.rightKnee, pose.rightFoot.point, 0x1b1714, 6)

    this.climberLayer
      .moveTo(pose.leftShoulder.x, pose.leftShoulder.y)
      .lineTo(pose.rightShoulder.x, pose.rightShoulder.y)
      .stroke({ color: lane.colors.shadow, width: 6, cap: 'round' })

    this.climberLayer
      .moveTo(pose.neck.x, pose.neck.y)
      .lineTo(pose.hipCenter.x, pose.hipCenter.y)
      .stroke({ color: lane.colors.accent, width: 8, cap: 'round' })

    this.climberLayer
      .circle(pose.headCenter.x, pose.headCenter.y, 18)
      .fill({ color: 0xfffcf5 })
      .stroke({ color: 0x1b1714, width: 4 })

    this.climberLayer
      .roundRect(pose.headCenter.x - 19, pose.headCenter.y - 20, 38, 10, 8)
      .fill({ color: lane.colors.accent })

    this.climberLayer
      .moveTo(pose.headCenter.x - 6, pose.headCenter.y - 2)
      .lineTo(pose.headCenter.x - 2, pose.headCenter.y - 1)
      .stroke({ color: 0x1b1714, width: 2.5, cap: 'round' })

    this.climberLayer
      .moveTo(pose.headCenter.x + 2, pose.headCenter.y - 1)
      .lineTo(pose.headCenter.x + 6, pose.headCenter.y - 2)
      .stroke({ color: 0x1b1714, width: 2.5, cap: 'round' })

    this.climberLayer
      .moveTo(pose.headCenter.x - 6, pose.headCenter.y + 6)
      .lineTo(pose.headCenter.x + 6, pose.headCenter.y + 6)
      .stroke({ color: 0x1b1714, width: 2.5, cap: 'round' })

    this.drawJoint(pose.leftShoulder, lane.colors.accent, 4)
    this.drawJoint(pose.rightShoulder, lane.colors.accent, 4)
    this.drawJoint(pose.leftElbow, lane.colors.shadow, 3.5)
    this.drawJoint(pose.rightElbow, lane.colors.shadow, 3.5)
    this.drawJoint(pose.leftKnee, lane.colors.shadow, 4)
    this.drawJoint(pose.rightKnee, lane.colors.shadow, 4)
    this.drawJoint(pose.hipCenter, lane.colors.accent, 5)
    this.drawFootCap(pose.leftFoot.point, lane.colors.accent)
    this.drawFootCap(pose.rightFoot.point, lane.colors.accent)
  }

  private drawLimb(
    start: { x: number; y: number },
    joint: { x: number; y: number },
    end: { x: number; y: number },
    color: number,
    width: number
  ): void {
    this.climberLayer
      .moveTo(start.x, start.y)
      .lineTo(joint.x, joint.y)
      .lineTo(end.x, end.y)
      .stroke({ color, width, cap: 'round', join: 'round' })
  }

  private drawJoint(point: { x: number; y: number }, color: number, radius: number): void {
    this.climberLayer.circle(point.x, point.y, radius).fill({ color })
  }

  private drawFootCap(point: { x: number; y: number }, color: number): void {
    this.climberLayer
      .moveTo(point.x - 8, point.y + 1)
      .lineTo(point.x + 8, point.y + 1)
      .stroke({ color, width: 4, cap: 'round' })
  }

  private buildRuntimeSnapshot(
    sceneModel: StairClimbSceneModel,
    laneRuntime: LaneRuntime,
    pose: StairClimbStickFigurePose,
    stepAnimation: StepAnimationState | null
  ): StairClimbRuntimeSnapshot {
    const previousSnapshot = laneRuntime.latestSnapshot
    const screenX = pose.hipCenter.x
    const screenY = pose.hipCenter.y

    const snapshot: StairClimbRuntimeSnapshot = {
      x: screenX,
      y: screenY - sceneModel.floorY - sceneModel.cameraOffset,
      vx: previousSnapshot ? screenX - previousSnapshot.screenX : 0,
      vy: previousSnapshot ? screenY - previousSnapshot.screenY : 0,
      screenX,
      screenY,
      displayedStep: laneRuntime.displayedStep,
      fromStep: stepAnimation?.fromStep ?? laneRuntime.displayedStep,
      toStep: stepAnimation?.toStep ?? laneRuntime.displayedStep,
      stepProgress: stepAnimation ? stepAnimation.elapsedMs / stepAnimation.durationMs : 1,
      phase: pose.phase,
      movingSide: pose.movingSide
    }

    laneRuntime.latestSnapshot = snapshot

    return snapshot
  }

  private updateTextSnapshot(
    sceneModel: StairClimbSceneModel,
    runtimeByPlayerId: Record<string, StairClimbRuntimeSnapshot | null>
  ): void {
    window.__stairClimbSnapshot = buildStairClimbTextSnapshot(sceneModel, runtimeByPlayerId)
  }
}

export function StairClimbDisplay({
  players,
  progress,
  countdownSeconds,
  remainingSeconds,
  focusedPlayerId = null
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
    sceneRef.current?.setRoundState(progress, countdownSeconds, remainingSeconds, focusedPlayerId)
  }, [countdownSeconds, focusedPlayerId, progress, remainingSeconds])

  return <div ref={hostRef} className="stair-climb-display" data-testid="stair-climb-display" />
}
