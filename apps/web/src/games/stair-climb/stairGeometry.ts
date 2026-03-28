import type { LimbSide } from '../../characters/stickFigure/model'

export const STEP_RISE = 34
export const STEP_WIDTH = 92
export const STEP_HEIGHT = 24

export interface StairClimbPoint {
  x: number
  y: number
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
