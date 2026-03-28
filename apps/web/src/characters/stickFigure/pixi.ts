import type { Graphics } from 'pixi.js'

import type { StickFigurePoint, StickFigurePose } from './model'

export interface StickFigureRenderStyle {
  primaryColor: number
  secondaryColor: number
  outlineColor?: number
  headFillColor?: number
  trailColor?: number
  groundShadowColor?: number
}

const drawLimb = (
  graphics: Graphics,
  start: StickFigurePoint,
  joint: StickFigurePoint,
  end: StickFigurePoint,
  color: number,
  width: number
): void => {
  graphics
    .moveTo(start.x, start.y)
    .lineTo(joint.x, joint.y)
    .lineTo(end.x, end.y)
    .stroke({ color, width, cap: 'round', join: 'round' })
}

const drawJoint = (
  graphics: Graphics,
  point: StickFigurePoint,
  color: number,
  radius: number
): void => {
  graphics.circle(point.x, point.y, radius).fill({ color })
}

const drawFootCap = (graphics: Graphics, point: StickFigurePoint, color: number): void => {
  graphics
    .moveTo(point.x - 8, point.y + 1)
    .lineTo(point.x + 8, point.y + 1)
    .stroke({ color, width: 4, cap: 'round' })
}

export const drawStickFigure = (
  graphics: Graphics,
  pose: StickFigurePose,
  {
    primaryColor,
    secondaryColor,
    outlineColor = 0x1b1714,
    headFillColor = 0xfffcf5,
    trailColor = primaryColor,
    groundShadowColor = 0x000000
  }: StickFigureRenderStyle
): void => {
  const feetCenterX = (pose.leftFoot.point.x + pose.rightFoot.point.x) / 2
  const feetCenterY = Math.max(pose.leftFoot.point.y, pose.rightFoot.point.y) + 8

  if (pose.movingTrailStart && pose.movingTrailEnd) {
    graphics
      .moveTo(pose.movingTrailStart.x, pose.movingTrailStart.y - 2)
      .lineTo(pose.movingTrailEnd.x, pose.movingTrailEnd.y - 2)
      .stroke({ color: trailColor, alpha: 0.18, width: 5, cap: 'round' })
  }

  graphics.ellipse(feetCenterX, feetCenterY, 26, 8).fill({ color: groundShadowColor, alpha: 0.08 })

  drawLimb(graphics, pose.leftShoulder, pose.leftElbow, pose.leftHand, outlineColor, 5)
  drawLimb(graphics, pose.rightShoulder, pose.rightElbow, pose.rightHand, outlineColor, 5)
  drawLimb(graphics, pose.hipCenter, pose.leftKnee, pose.leftFoot.point, outlineColor, 6)
  drawLimb(graphics, pose.hipCenter, pose.rightKnee, pose.rightFoot.point, outlineColor, 6)

  graphics
    .moveTo(pose.leftShoulder.x, pose.leftShoulder.y)
    .lineTo(pose.rightShoulder.x, pose.rightShoulder.y)
    .stroke({ color: secondaryColor, width: 6, cap: 'round' })

  graphics
    .moveTo(pose.neck.x, pose.neck.y)
    .lineTo(pose.hipCenter.x, pose.hipCenter.y)
    .stroke({ color: primaryColor, width: 8, cap: 'round' })

  graphics
    .circle(pose.headCenter.x, pose.headCenter.y, 18)
    .fill({ color: headFillColor })
    .stroke({ color: outlineColor, width: 4 })

  graphics
    .roundRect(pose.headCenter.x - 19, pose.headCenter.y - 20, 38, 10, 8)
    .fill({ color: primaryColor })

  graphics
    .moveTo(pose.headCenter.x - 6, pose.headCenter.y - 2)
    .lineTo(pose.headCenter.x - 2, pose.headCenter.y - 1)
    .stroke({ color: outlineColor, width: 2.5, cap: 'round' })

  graphics
    .moveTo(pose.headCenter.x + 2, pose.headCenter.y - 1)
    .lineTo(pose.headCenter.x + 6, pose.headCenter.y - 2)
    .stroke({ color: outlineColor, width: 2.5, cap: 'round' })

  graphics
    .moveTo(pose.headCenter.x - 6, pose.headCenter.y + 6)
    .lineTo(pose.headCenter.x + 6, pose.headCenter.y + 6)
    .stroke({ color: outlineColor, width: 2.5, cap: 'round' })

  drawJoint(graphics, pose.leftShoulder, primaryColor, 4)
  drawJoint(graphics, pose.rightShoulder, primaryColor, 4)
  drawJoint(graphics, pose.leftElbow, secondaryColor, 3.5)
  drawJoint(graphics, pose.rightElbow, secondaryColor, 3.5)
  drawJoint(graphics, pose.leftKnee, secondaryColor, 4)
  drawJoint(graphics, pose.rightKnee, secondaryColor, 4)
  drawJoint(graphics, pose.hipCenter, primaryColor, 5)
  drawFootCap(graphics, pose.leftFoot.point, primaryColor)
  drawFootCap(graphics, pose.rightFoot.point, primaryColor)
}
