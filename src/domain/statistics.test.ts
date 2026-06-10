import { describe, expect, it } from 'vitest'
import { createGame, defaultGameConfig, startGame, submitRoleRound } from './engine'
import { exportGameCsv } from './statistics'

describe('statistics exports', () => {
  it('exports all roles or one selected role to CSV', () => {
    let game = startGame(createGame({ name: 'CSV', config: defaultGameConfig }))
    game = submitRoleRound({
      game,
      role: 'retailer',
      submittedBy: 'test',
      incomingOrder: 4,
      newOrderToSupplier: 4,
      autoAdvance: false,
    })
    game = submitRoleRound({
      game,
      role: 'wholesaler',
      submittedBy: 'test',
      shippedQuantity: 4,
      newOrderToSupplier: 4,
      autoAdvance: false,
    })

    const allCsv = exportGameCsv(game, 'all')
    const wholesalerCsv = exportGameCsv(game, 'wholesaler')

    expect(allCsv).toContain(',retailer,')
    expect(allCsv).toContain(',wholesaler,')
    expect(wholesalerCsv).not.toContain(',retailer,')
    expect(wholesalerCsv).toContain(',wholesaler,')
  })
})
