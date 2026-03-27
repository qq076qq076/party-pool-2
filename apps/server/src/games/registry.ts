import type { GameId } from '@party-pool/shared'

import { StairClimbRuntime } from './stair-climb/runtime'
import type { ServerGameRuntime, ServerGameRuntimeFactoryOptions } from './types'

export const createServerGameRuntime = (
  gameId: GameId,
  options: ServerGameRuntimeFactoryOptions
): ServerGameRuntime => {
  switch (gameId) {
    case 'stair-climb':
      return new StairClimbRuntime(options)
    default: {
      const exhaustivenessCheck: never = gameId
      throw new Error(`Unsupported game runtime: ${exhaustivenessCheck}`)
    }
  }
}
