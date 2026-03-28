import { describe, expect, it } from 'vitest'

import { buildStairClimbStickFigurePose } from './climberModel'

describe('stair climb climber model', () => {
  it('adapts stair-step animation into the shared character model', () => {
    const pose = buildStairClimbStickFigurePose({
      laneLeft: 0,
      laneWidth: 280,
      floorY: 640,
      cameraOffset: 0,
      displayedStep: 3,
      poseClockMs: 300,
      animation: {
        fromStep: 3,
        toStep: 4,
        progress: 0.5
      }
    })

    expect(pose.phase).toBe('stepping')
    expect(pose.movingSide).toBe('left')
    expect(pose.leftFoot.step).toBe(4)
    expect(pose.rightFoot.step).toBe(3)
    expect(pose.leftFoot.point.y).toBeLessThan(pose.rightFoot.point.y)
    expect(pose.leftKnee.y).toBeLessThan(pose.leftFoot.point.y)
    expect(pose.movingTrailStart).not.toBeNull()
  })
})
