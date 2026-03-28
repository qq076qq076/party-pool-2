import {
  buildStickFigurePose,
  type LimbSide,
  type StickFigureFootState,
  type StickFigurePoint,
  type StickFigurePose
} from '../../characters/stickFigure/model'
import { STEP_RISE, getFootSideForStep, getStepFootPoint } from './stairGeometry'

export type StairClimbStickFigurePose = StickFigurePose

interface BuildStairClimbStickFigurePoseOptions {
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

const easeInOut = (progress: number): number => progress * progress * (3 - 2 * progress)

const getOppositeSide = (side: LimbSide): LimbSide => (side === 'left' ? 'right' : 'left')

const buildScreenPoint = (
  point: StickFigurePoint,
  floorY: number,
  cameraOffset: number
): StickFigurePoint => ({
  x: point.x,
  y: floorY + point.y + cameraOffset
})

const buildRestingFeet = (
  displayedStep: number,
  laneLeft: number,
  laneWidth: number,
  floorY: number,
  cameraOffset: number
): { leftFoot: StickFigureFootState; rightFoot: StickFigureFootState; supportSide: LimbSide } => {
  const highestStep = Math.max(0, displayedStep)
  const supportSide = getFootSideForStep(highestStep)
  const trailingSide = getOppositeSide(supportSide)
  const supportStep = highestStep
  const trailingStep = highestStep === 0 ? 0 : highestStep - 1

  const supportFoot: StickFigureFootState = {
    step: supportStep,
    point: buildScreenPoint(
      getStepFootPoint(supportStep, laneLeft, laneWidth, supportSide),
      floorY,
      cameraOffset
    )
  }
  const trailingFoot: StickFigureFootState = {
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

export const buildStairClimbStickFigurePose = ({
  laneLeft,
  laneWidth,
  floorY,
  cameraOffset,
  displayedStep,
  poseClockMs,
  animation = null
}: BuildStairClimbStickFigurePoseOptions): StairClimbStickFigurePose => {
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

    return buildStickFigurePose({
      leftFoot,
      rightFoot,
      poseClockMs,
      displayedStep,
      supportSide,
      motion: {
        fromStep: animation.fromStep,
        toStep: animation.toStep,
        progress,
        movingSide,
        movingTrailStart: buildScreenPoint(movingStartWorld, floorY, cameraOffset),
        movingTrailEnd: movingFootScreen
      }
    })
  }

  const { leftFoot, rightFoot, supportSide } = buildRestingFeet(
    displayedStep,
    laneLeft,
    laneWidth,
    floorY,
    cameraOffset
  )

  return buildStickFigurePose({
    leftFoot,
    rightFoot,
    poseClockMs,
    displayedStep,
    supportSide
  })
}
