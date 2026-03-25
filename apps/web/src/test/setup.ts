import '@testing-library/jest-dom/vitest'

const canvasContextStub = {
  fillStyle: '#000',
  strokeStyle: '#000',
  globalCompositeOperation: 'source-over',
  lineWidth: 1,
  save: () => undefined,
  restore: () => undefined,
  scale: () => undefined,
  rotate: () => undefined,
  translate: () => undefined,
  transform: () => undefined,
  setTransform: () => undefined,
  resetTransform: () => undefined,
  clearRect: () => undefined,
  fillRect: () => undefined,
  strokeRect: () => undefined,
  beginPath: () => undefined,
  closePath: () => undefined,
  moveTo: () => undefined,
  lineTo: () => undefined,
  quadraticCurveTo: () => undefined,
  bezierCurveTo: () => undefined,
  arc: () => undefined,
  rect: () => undefined,
  fill: () => undefined,
  stroke: () => undefined,
  clip: () => undefined,
  drawImage: () => undefined,
  createImageData: (width = 1, height = 1) => ({
    data: new Uint8ClampedArray(width * height * 4),
    width,
    height
  }),
  getImageData: (x = 0, y = 0, width = 1, height = 1) => {
    void x
    void y

    return {
      data: new Uint8ClampedArray(width * height * 4),
      width,
      height
    }
  },
  putImageData: () => undefined,
  createPattern: () => ({
    setTransform: () => undefined
  }),
  createLinearGradient: () => ({
    addColorStop: () => undefined
  }),
  measureText: () => ({
    width: 120,
    actualBoundingBoxAscent: 12,
    actualBoundingBoxDescent: 4
  })
}

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value: () => canvasContextStub,
  configurable: true
})
