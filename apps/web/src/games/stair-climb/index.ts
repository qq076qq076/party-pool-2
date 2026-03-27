import type { WebGameModule } from '../types'

import { StairClimbController } from './StairClimbController'
import { StairClimbDisplay } from './StairClimbDisplay'

export const stairClimbGameModule: WebGameModule = {
  id: 'stair-climb',
  Display: StairClimbDisplay,
  Controller: StairClimbController
}
