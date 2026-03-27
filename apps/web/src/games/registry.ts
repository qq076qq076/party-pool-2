import type { GameId } from '@party-pool/shared'

import { stairClimbGameModule } from './stair-climb'
import type { WebGameModule } from './types'

const webGameModules: Record<GameId, WebGameModule> = {
  'stair-climb': stairClimbGameModule
}

export const getWebGameModule = (gameId: GameId): WebGameModule => webGameModules[gameId]
