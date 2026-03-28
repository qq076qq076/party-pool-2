import type { LimbSide, StickFigurePhase } from '../../characters/stickFigure/model'
import type { GameDisplayPlayer } from '../types'
import { STEP_RISE, getStepAnchorByLane } from './stairGeometry'
import type { StairClimbPoint } from './stairGeometry'

export { STEP_HEIGHT, STEP_RISE, STEP_WIDTH, getFootSideForStep, getStepAnchorByLane, getStepFootPoint } from './stairGeometry'
export type { StairClimbPoint } from './stairGeometry'

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
  phase: StickFigurePhase
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

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const roundTo = (value: number): number => Math.round(value * 100) / 100

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
