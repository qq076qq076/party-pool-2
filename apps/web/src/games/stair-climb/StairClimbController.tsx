import type { GameControllerProps } from '../types'

export function StairClimbController({ canInput, onPrimaryInput }: GameControllerProps) {
  return (
    <section className="controller-button-block" data-testid="controller-button-block">
      <button className="controller-tap-btn" onClick={onPrimaryInput} disabled={!canInput}>
        踏上階梯
      </button>
    </section>
  )
}
