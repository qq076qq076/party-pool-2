export type LimbSide = 'left' | 'right'
export type StickFigurePhase = 'idle' | 'stepping'

export interface StickFigurePoint {
  x: number
  y: number
}

export interface StickFigureFootState {
  point: StickFigurePoint
  step: number
}

export interface StickFigurePose {
  phase: StickFigurePhase
  displayedStep: number
  fromStep: number
  toStep: number
  stepProgress: number
  supportSide: LimbSide
  movingSide: LimbSide | null
  directionX: number
  bodyLean: number
  headCenter: StickFigurePoint
  neck: StickFigurePoint
  hipCenter: StickFigurePoint
  leftShoulder: StickFigurePoint
  rightShoulder: StickFigurePoint
  leftElbow: StickFigurePoint
  rightElbow: StickFigurePoint
  leftHand: StickFigurePoint
  rightHand: StickFigurePoint
  leftKnee: StickFigurePoint
  rightKnee: StickFigurePoint
  leftFoot: StickFigureFootState
  rightFoot: StickFigureFootState
  movingTrailStart: StickFigurePoint | null
  movingTrailEnd: StickFigurePoint | null
}

interface StickFigureMotion {
  fromStep: number
  toStep: number
  progress: number
  movingSide: LimbSide
  movingTrailStart?: StickFigurePoint | null
  movingTrailEnd?: StickFigurePoint | null
}

interface BuildStickFigurePoseOptions {
  leftFoot: StickFigureFootState
  rightFoot: StickFigureFootState
  poseClockMs: number
  displayedStep: number
  supportSide: LimbSide
  motion?: StickFigureMotion | null
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const midpoint = (left: StickFigurePoint, right: StickFigurePoint): StickFigurePoint => ({
  x: (left.x + right.x) / 2,
  y: (left.y + right.y) / 2
})

const buildJointPoint = (
  start: StickFigurePoint,
  end: StickFigurePoint,
  side: LimbSide,
  bendHeight: number,
  bendForward: number
): StickFigurePoint => {
  const mid = midpoint(start, end)
  const sideOffset = side === 'left' ? -4 : 4

  return {
    x: mid.x + sideOffset + bendForward,
    y: mid.y - bendHeight
  }
}

const getDirectionX = (
  leftFoot: StickFigureFootState,
  rightFoot: StickFigureFootState,
  motion: StickFigureMotion | null | undefined
): number => {
  if (motion?.movingTrailStart && motion.movingTrailEnd) {
    const trailDirection = Math.sign(motion.movingTrailEnd.x - motion.movingTrailStart.x)
    if (trailDirection !== 0) {
      return trailDirection
    }
  }

  const footDirection = Math.sign(rightFoot.point.x - leftFoot.point.x)
  if (footDirection !== 0) {
    return footDirection
  }

  if (motion?.movingSide) {
    return motion.movingSide === 'right' ? 1 : -1
  }

  return 1
}

export const buildStickFigurePose = ({
  leftFoot,
  rightFoot,
  poseClockMs,
  displayedStep,
  supportSide,
  motion = null
}: BuildStickFigurePoseOptions): StickFigurePose => {
  const idleWave = Math.sin(poseClockMs / 220)
  const idleLift = Math.sin(poseClockMs / 280) * 2
  const directionX = getDirectionX(leftFoot, rightFoot, motion)

  if (motion) {
    const progress = clamp(motion.progress, 0, 1)
    const lift = Math.sin(progress * Math.PI)
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
    const forwardArmSide = motion.movingSide === 'left' ? 'right' : 'left'
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
      motion.movingSide === 'left' ? 22 + lift * 12 : 10,
      motion.movingSide === 'left' ? directionX * 8 : directionX * 1.6
    )
    const rightKnee = buildJointPoint(
      hipCenter,
      rightFoot.point,
      'right',
      motion.movingSide === 'right' ? 22 + lift * 12 : 10,
      motion.movingSide === 'right' ? directionX * 8 : directionX * 1.6
    )

    return {
      phase: 'stepping',
      displayedStep,
      fromStep: motion.fromStep,
      toStep: motion.toStep,
      stepProgress: progress,
      supportSide,
      movingSide: motion.movingSide,
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
      movingTrailStart: motion.movingTrailStart ?? null,
      movingTrailEnd: motion.movingTrailEnd ?? null
    }
  }

  const highestFoot = leftFoot.step >= rightFoot.step ? leftFoot : rightFoot
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
