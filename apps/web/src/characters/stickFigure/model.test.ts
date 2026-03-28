import { describe, expect, it } from 'vitest'

import { buildStickFigurePose } from './model'

describe('stick figure model', () => {
  it('supports reusable stepping poses from externally supplied foot placements', () => {
    const pose = buildStickFigurePose({
      leftFoot: {
        point: { x: 118, y: 392 },
        step: 4
      },
      rightFoot: {
        point: { x: 92, y: 432 },
        step: 3
      },
      poseClockMs: 300,
      displayedStep: 3,
      supportSide: 'right',
      motion: {
        fromStep: 3,
        toStep: 4,
        progress: 0.5,
        movingSide: 'left',
        movingTrailStart: { x: 82, y: 442 },
        movingTrailEnd: { x: 118, y: 392 }
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
