import type { GameDisplayPlayer } from '../types'

export const STEP_RISE = 34
export const STEP_WIDTH = 92
export const STEP_HEIGHT = 24
export const FLOOR_MARGIN = 86
export const CAMERA_PADDING = 0.45

export const LANE_COLORS = [
  { accent: 0xe76f51, stair: 0xf3d2b2, shadow: 0xb5543d },
  { accent: 0x2a9d8f, stair: 0xd4f0eb, shadow: 0x1c6f64 },
  { accent: 0xe9c46a, stair: 0xfaedc2, shadow: 0xc89f39 },
  { accent: 0x457b9d, stair: 0xd8e8f2, shadow: 0x2d5777 },
  { accent: 0xf28482, stair: 0xfbd9d8, shadow: 0xcc6160 },
  { accent: 0x84a59d, stair: 0xd7e2df, shadow: 0x5d756f }
] as const

export type LimbSide = 'left' | 'right'
export type PosePhase = 'idle' | 'stepping'

export interface StairClimbPoint {
  x: number
  y: number
}

export interface StairClimbFootState {
  point: StairClimbPoint
  step: number
}

export interface StairClimbStickFigurePose {
  phase: PosePhase
  displayedStep: number
  fromStep: number
  toStep: number
  stepProgress: number
  supportSide: LimbSide
  movingSide: LimbSide | null
  directionX: number
  bodyLean: number
  headCenter: StairClimbPoint
  neck: StairClimbPoint
  hipCenter: StairClimbPoint
  leftShoulder: StairClimbPoint
  rightShoulder: StairClimbPoint
  leftElbow: StairClimbPoint
  rightElbow: StairClimbPoint
  leftHand: StairClimbPoint
  rightHand: StairClimbPoint
  leftKnee: StairClimbPoint
  rightKnee: StairClimbPoint
  leftFoot: StairClimbFootState
  rightFoot: StairClimbFootState
  movingTrailStart: StairClimbPoint | null
  movingTrailEnd: StairClimbPoint | null
}

export interface StairClimbRuntimeSnapshot {
  x: number
  y: number
  vx: number
  vy: number
  screenX: number
  screenY: number
  displayedStep: number
  fromStep: number
  toStep: number
  stepProgress: number
  phase: PosePhase
  movingSide: LimbSide | null
}

export interface StairClimbLaneModel {
  playerId: string
  nickname: string
  laneIndex: number
  colorIndex: number
  colors: (typeof LANE_COLORS)[number]
  rank: number
  tapCount: number
  laneLeft: number
  laneWidth: number
  laneCenter: number
  laneGuideX: number
  nameX: number
  nameY: number
  targetAnchor: StairClimbPoint
  targetScreenY: number
  progressRatio: number
  isLeader: boolean
  isFocused: boolean
  nameplateText: string
}

export interface StairClimbSceneModel {
  width: number
  height: number
  floorY: number
  laneCount: number
  highestStep: number
  cameraOffset: number
  minVisibleStep: number
  maxVisibleStep: number
  timerLabel: string
  lanes: StairClimbLaneModel[]
}

export interface StairClimbTextSnapshot {
  mode: 'countdown' | 'climbing'
  coordinateSystem: {
    origin: string
    x: string
    y: string
    worldStepY: string
  }
  timerLabel: string
  floorY: number
  cameraOffset: number
  visibleSteps: {
    min: number
    max: number
  }
  leaderStep: number
  lanes: Array<{
    playerId: string
    nickname: string
    rank: number
    tapCount: number
    isLeader: boolean
    isFocused: boolean
    targetAnchor: StairClimbPoint
    targetScreenY: number
    climber: StairClimbRuntimeSnapshot | null
  }>
}

declare global {
  interface Window {
    render_game_to_text?: () => string
    advanceTime?: (ms: number) => void | Promise<void>
    __stairClimbSnapshot?: StairClimbTextSnapshot | null
  }
}

interface BuildSceneModelOptions {
  players: GameDisplayPlayer[]
  progress: Record<string, number>
  countdownSeconds: number | null
  remainingSeconds: number | null
  width: number
  height: number
  focusedPlayerId?: string | null
}

interface BuildStickFigurePoseOptions {
  laneLeft: number
  laneWidth: number
  floorY: number
  cameraOffset: number
  displayedStep: number
  poseClockMs: number
  animation?:
    | {
        fromStep: number
        toStep: number
        progress: number
      }
    | null
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const lerp = (start: number, end: number, progress: number): number => start + (end - start) * progress

const midpoint = (left: StairClimbPoint, right: StairClimbPoint): StairClimbPoint => ({
  x: (left.x + right.x) / 2,
  y: (left.y + right.y) / 2
})

const roundTo = (value: number): number => Math.round(value * 100) / 100

const easeInOut = (progress: number): number => progress * progress * (3 - 2 * progress)

const getOppositeSide = (side: LimbSide): LimbSide => (side === 'left' ? 'right' : 'left')

const getRankByPlayerId = (
  players: GameDisplayPlayer[],
  progress: Record<string, number>
): Map<string, number> => {
  const ordered = players
    .map((player, laneIndex) => ({
      playerId: player.playerId,
      laneIndex,
      tapCount: progress[player.playerId] ?? 0
    }))
    .sort((left, right) => right.tapCount - left.tapCount || left.laneIndex - right.laneIndex)

  const rankByPlayerId = new Map<string, number>()
  let previousTapCount: number | null = null
  let previousRank = 1

  for (const [index, item] of ordered.entries()) {
    const rank = item.tapCount === previousTapCount ? previousRank : index + 1
    rankByPlayerId.set(item.playerId, rank)
    previousTapCount = item.tapCount
    previousRank = rank
  }

  return rankByPlayerId
}

export const getFootSideForStep = (stepIndex: number): LimbSide =>
  stepIndex % 2 === 0 ? 'left' : 'right'

export const getStepAnchorByLane = (
  stepIndex: number,
  laneLeft: number,
  laneWidth: number
): StairClimbPoint => {
  const laneBaseX = laneLeft + laneWidth * 0.36
  const stairOffsetX = (stepIndex % 2) * 30

  return {
    x: laneBaseX + stairOffsetX,
    y: -stepIndex * STEP_RISE
  }
}

export const getStepFootPoint = (
  stepIndex: number,
  laneLeft: number,
  laneWidth: number,
  side: LimbSide
): StairClimbPoint => {
  const anchor = getStepAnchorByLane(stepIndex, laneLeft, laneWidth)

  return {
    x: anchor.x + (side === 'left' ? -12 : 12),
    y: anchor.y - STEP_HEIGHT / 2 + 2
  }
}

const buildScreenPoint = (
  point: StairClimbPoint,
  floorY: number,
  cameraOffset: number
): StairClimbPoint => ({
  x: point.x,
  y: floorY + point.y + cameraOffset
})

const buildRestingFeet = (
  displayedStep: number,
  laneLeft: number,
  laneWidth: number,
  floorY: number,
  cameraOffset: number
): { leftFoot: StairClimbFootState; rightFoot: StairClimbFootState; supportSide: LimbSide } => {
  const highestStep = Math.max(0, displayedStep)
  const supportSide = getFootSideForStep(highestStep)
  const trailingSide = getOppositeSide(supportSide)
  const supportStep = highestStep
  const trailingStep = highestStep === 0 ? 0 : highestStep - 1

  const supportFoot: StairClimbFootState = {
    step: supportStep,
    point: buildScreenPoint(
      getStepFootPoint(supportStep, laneLeft, laneWidth, supportSide),
      floorY,
      cameraOffset
    )
  }
  const trailingFoot: StairClimbFootState = {
    step: trailingStep,
    point: buildScreenPoint(
      getStepFootPoint(trailingStep, laneLeft, laneWidth, trailingSide),
      floorY,
      cameraOffset
    )
  }

  return supportSide === 'left'
    ? {
        leftFoot: supportFoot,
        rightFoot: trailingFoot,
        supportSide
      }
    : {
        leftFoot: trailingFoot,
        rightFoot: supportFoot,
        supportSide
      }
}

const buildJointPoint = (
  start: StairClimbPoint,
  end: StairClimbPoint,
  side: LimbSide,
  bendHeight: number,
  bendForward: number
): StairClimbPoint => {
  const mid = midpoint(start, end)
  const sideOffset = side === 'left' ? -4 : 4

  return {
    x: mid.x + sideOffset + bendForward,
    y: mid.y - bendHeight
  }
}

export const buildStickFigurePose = ({
  laneLeft,
  laneWidth,
  floorY,
  cameraOffset,
  displayedStep,
  poseClockMs,
  animation = null
}: BuildStickFigurePoseOptions): StairClimbStickFigurePose => {
  const idleWave = Math.sin(poseClockMs / 220)
  const idleLift = Math.sin(poseClockMs / 280) * 2

  if (animation && animation.toStep > animation.fromStep) {
    const progress = clamp(animation.progress, 0, 1)
    const eased = easeInOut(progress)
    const lift = Math.sin(progress * Math.PI)
    const supportSide = getFootSideForStep(animation.fromStep)
    const movingSide = getFootSideForStep(animation.toStep)
    const movingStartStep = Math.max(0, animation.fromStep - 1)
    const supportFootWorld = getStepFootPoint(animation.fromStep, laneLeft, laneWidth, supportSide)
    const movingStartWorld = getStepFootPoint(movingStartStep, laneLeft, laneWidth, movingSide)
    const movingEndWorld = getStepFootPoint(animation.toStep, laneLeft, laneWidth, movingSide)
    const directionX =
      Math.sign(movingEndWorld.x - supportFootWorld.x) || (movingSide === 'right' ? 1 : -1)
    const movingFootWorld = {
      x: lerp(movingStartWorld.x, movingEndWorld.x, eased),
      y: lerp(movingStartWorld.y, movingEndWorld.y, eased) - lift * (STEP_RISE * 0.72 + 9)
    }
    const supportFootScreen = buildScreenPoint(
      {
        x: supportFootWorld.x - directionX * lift * 2.4,
        y: supportFootWorld.y - lift * 3.2
      },
      floorY,
      cameraOffset
    )
    const movingFootScreen = buildScreenPoint(movingFootWorld, floorY, cameraOffset)
    const leftFoot =
      movingSide === 'left'
        ? { point: movingFootScreen, step: animation.toStep }
        : { point: supportFootScreen, step: animation.fromStep }
    const rightFoot =
      movingSide === 'right'
        ? { point: movingFootScreen, step: animation.toStep }
        : { point: supportFootScreen, step: animation.fromStep }
    const stanceMid = midpoint(leftFoot.point, rightFoot.point)
    const stairGap = Math.abs(leftFoot.point.y - rightFoot.point.y)
    const bodyLean = directionX * (8 + lift * 10)
    const hipCenter = {
      x: stanceMid.x + bodyLean * 0.28,
      y: stanceMid.y - 42 - stairGap * 0.18 - lift * 10 + idleLift * 0.3
    }
    const neck = {
      x: hipCenter.x + bodyLean * 0.2,
      y: hipCenter.y - 36
    }
    const headCenter = {
      x: neck.x + bodyLean * 0.1,
      y: neck.y - 22
    }
    const leftShoulder = {
      x: neck.x - 10,
      y: neck.y + 3
    }
    const rightShoulder = {
      x: neck.x + 10,
      y: neck.y + 3
    }
    const forwardArmSide = movingSide === 'left' ? 'right' : 'left'
    const leftArmSwing =
      forwardArmSide === 'left' ? directionX * (16 + lift * 8) : -directionX * (10 + lift * 6)
    const rightArmSwing =
      forwardArmSide === 'right' ? directionX * (16 + lift * 8) : -directionX * (10 + lift * 6)
    const leftHand = {
      x: leftShoulder.x + leftArmSwing,
      y: leftShoulder.y + 28 + (forwardArmSide === 'left' ? -lift * 12 : lift * 4)
    }
    const rightHand = {
      x: rightShoulder.x + rightArmSwing,
      y: rightShoulder.y + 28 + (forwardArmSide === 'right' ? -lift * 12 : lift * 4)
    }
    const leftElbow = buildJointPoint(
      leftShoulder,
      leftHand,
      'left',
      forwardArmSide === 'left' ? 10 + lift * 5 : 6,
      leftArmSwing * 0.12
    )
    const rightElbow = buildJointPoint(
      rightShoulder,
      rightHand,
      'right',
      forwardArmSide === 'right' ? 10 + lift * 5 : 6,
      rightArmSwing * 0.12
    )
    const leftKnee = buildJointPoint(
      hipCenter,
      leftFoot.point,
      'left',
      movingSide === 'left' ? 22 + lift * 12 : 10,
      movingSide === 'left' ? directionX * 8 : directionX * 1.6
    )
    const rightKnee = buildJointPoint(
      hipCenter,
      rightFoot.point,
      'right',
      movingSide === 'right' ? 22 + lift * 12 : 10,
      movingSide === 'right' ? directionX * 8 : directionX * 1.6
    )

    return {
      phase: 'stepping',
      displayedStep,
      fromStep: animation.fromStep,
      toStep: animation.toStep,
      stepProgress: progress,
      supportSide,
      movingSide,
      directionX,
      bodyLean,
      headCenter,
      neck,
      hipCenter,
      leftShoulder,
      rightShoulder,
      leftElbow,
      rightElbow,
      leftHand,
      rightHand,
      leftKnee,
      rightKnee,
      leftFoot,
      rightFoot,
      movingTrailStart: buildScreenPoint(movingStartWorld, floorY, cameraOffset),
      movingTrailEnd: movingFootScreen
    }
  }

  const { leftFoot, rightFoot, supportSide } = buildRestingFeet(
    displayedStep,
    laneLeft,
    laneWidth,
    floorY,
    cameraOffset
  )
  const highestFoot = leftFoot.step >= rightFoot.step ? leftFoot : rightFoot
  const directionX = Math.sign(rightFoot.point.x - leftFoot.point.x) || 1
  const stanceMid = midpoint(leftFoot.point, rightFoot.point)
  const stairGap = Math.abs(leftFoot.point.y - rightFoot.point.y)
  const bodyLean = idleWave * 2.8 + (supportSide === 'right' ? 1.8 : -1.8)
  const hipCenter = {
    x: stanceMid.x + bodyLean * 0.32,
    y: stanceMid.y - 42 - stairGap * 0.16 - idleLift
  }
  const neck = {
    x: hipCenter.x + bodyLean * 0.14,
    y: hipCenter.y - 35
  }
  const headCenter = {
    x: neck.x + bodyLean * 0.08,
    y: neck.y - 22
  }
  const leftShoulder = {
    x: neck.x - 10,
    y: neck.y + 3
  }
  const rightShoulder = {
    x: neck.x + 10,
    y: neck.y + 3
  }
  const leftHand = {
    x: leftShoulder.x + idleWave * 8,
    y: leftShoulder.y + 29 - idleLift * 0.4
  }
  const rightHand = {
    x: rightShoulder.x - idleWave * 8,
    y: rightShoulder.y + 29 + idleLift * 0.4
  }
  const leftElbow = buildJointPoint(leftShoulder, leftHand, 'left', 6, idleWave * 1.4)
  const rightElbow = buildJointPoint(rightShoulder, rightHand, 'right', 6, -idleWave * 1.4)
  const leftKnee = buildJointPoint(
    hipCenter,
    leftFoot.point,
    'left',
    leftFoot.step === highestFoot.step ? 11 : 8,
    idleWave * 0.8
  )
  const rightKnee = buildJointPoint(
    hipCenter,
    rightFoot.point,
    'right',
    rightFoot.step === highestFoot.step ? 11 : 8,
    -idleWave * 0.8
  )

  return {
    phase: 'idle',
    displayedStep,
    fromStep: displayedStep,
    toStep: displayedStep,
    stepProgress: 1,
    supportSide,
    movingSide: null,
    directionX,
    bodyLean,
    headCenter,
    neck,
    hipCenter,
    leftShoulder,
    rightShoulder,
    leftElbow,
    rightElbow,
    leftHand,
    rightHand,
    leftKnee,
    rightKnee,
    leftFoot,
    rightFoot,
    movingTrailStart: null,
    movingTrailEnd: null
  }
}

export const buildStairClimbSceneModel = ({
  players,
  progress,
  countdownSeconds,
  remainingSeconds,
  width,
  height,
  focusedPlayerId = null
}: BuildSceneModelOptions): StairClimbSceneModel => {
  const laneCount = Math.max(1, players.length)
  const floorY = height - FLOOR_MARGIN
  const highestStep = players.reduce((highest, player) => {
    return Math.max(highest, progress[player.playerId] ?? 0)
  }, 0)
  const cameraOffset = Math.max(0, highestStep * STEP_RISE - height * CAMERA_PADDING)
  const minVisibleStep = Math.max(0, Math.floor((floorY + cameraOffset - height - 60) / STEP_RISE))
  const maxVisibleStep = Math.ceil((floorY + cameraOffset + 60) / STEP_RISE)
  const rankByPlayerId = getRankByPlayerId(players, progress)

  const lanes = players.map((player, laneIndex) => {
    const tapCount = progress[player.playerId] ?? 0
    const laneWidth = width / laneCount
    const laneLeft = laneWidth * laneIndex
    const laneCenter = laneLeft + laneWidth / 2
    const targetAnchor = getStepAnchorByLane(tapCount, laneLeft, laneWidth)
    const rank = rankByPlayerId.get(player.playerId) ?? laneIndex + 1
    const isLeader = tapCount === highestStep && highestStep > 0
    const isFocused = focusedPlayerId === player.playerId
    const progressRatio = highestStep === 0 ? 0 : clamp(tapCount / highestStep, 0, 1)
    const colors = LANE_COLORS[laneIndex % LANE_COLORS.length]
    const prefix = isFocused ? '> ' : ''

    return {
      playerId: player.playerId,
      nickname: player.nickname,
      laneIndex,
      colorIndex: laneIndex % LANE_COLORS.length,
      colors,
      rank,
      tapCount,
      laneLeft,
      laneWidth,
      laneCenter,
      laneGuideX: laneLeft + laneWidth * 0.24,
      nameX: laneCenter,
      nameY: height - 56,
      targetAnchor,
      targetScreenY: floorY + targetAnchor.y + cameraOffset,
      progressRatio,
      isLeader,
      isFocused,
      nameplateText: `${prefix}#${rank} ${player.nickname} ${tapCount}`
    } satisfies StairClimbLaneModel
  })

  return {
    width,
    height,
    floorY,
    laneCount,
    highestStep,
    cameraOffset,
    minVisibleStep,
    maxVisibleStep,
    timerLabel:
      countdownSeconds !== null && countdownSeconds > 0
        ? `${countdownSeconds}`
        : `${Math.max(0, remainingSeconds ?? 0)}s`,
    lanes
  }
}

export const buildStairClimbTextSnapshot = (
  model: StairClimbSceneModel,
  runtimeByPlayerId: Record<string, StairClimbRuntimeSnapshot | null>
): StairClimbTextSnapshot => ({
  mode: model.timerLabel.endsWith('s') ? 'climbing' : 'countdown',
  coordinateSystem: {
    origin: 'canvas top-left',
    x: 'positive values move right',
    y: 'positive values move down',
    worldStepY: 'negative values move upward by stair index'
  },
  timerLabel: model.timerLabel,
  floorY: roundTo(model.floorY),
  cameraOffset: roundTo(model.cameraOffset),
  visibleSteps: {
    min: model.minVisibleStep,
    max: model.maxVisibleStep
  },
  leaderStep: model.highestStep,
  lanes: model.lanes.map((lane) => ({
    playerId: lane.playerId,
    nickname: lane.nickname,
    rank: lane.rank,
    tapCount: lane.tapCount,
    isLeader: lane.isLeader,
    isFocused: lane.isFocused,
    targetAnchor: {
      x: roundTo(lane.targetAnchor.x),
      y: roundTo(lane.targetAnchor.y)
    },
    targetScreenY: roundTo(lane.targetScreenY),
    climber: runtimeByPlayerId[lane.playerId]
      ? {
          x: roundTo(runtimeByPlayerId[lane.playerId]!.x),
          y: roundTo(runtimeByPlayerId[lane.playerId]!.y),
          vx: roundTo(runtimeByPlayerId[lane.playerId]!.vx),
          vy: roundTo(runtimeByPlayerId[lane.playerId]!.vy),
          screenX: roundTo(runtimeByPlayerId[lane.playerId]!.screenX),
          screenY: roundTo(runtimeByPlayerId[lane.playerId]!.screenY),
          displayedStep: runtimeByPlayerId[lane.playerId]!.displayedStep,
          fromStep: runtimeByPlayerId[lane.playerId]!.fromStep,
          toStep: runtimeByPlayerId[lane.playerId]!.toStep,
          stepProgress: roundTo(runtimeByPlayerId[lane.playerId]!.stepProgress),
          phase: runtimeByPlayerId[lane.playerId]!.phase,
          movingSide: runtimeByPlayerId[lane.playerId]!.movingSide
        }
      : null
  }))
})
