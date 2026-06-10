import { describe, expect, it } from 'vitest'
import {
  advanceRound,
  createGame,
  defaultGameConfig,
  getCurrentRoleState,
  startGame,
  submitSimulationRound,
  submitRoleRound,
  synchronizeSimulationRoundClock,
} from './engine'

describe('Beer Game round engine', () => {
  it('keeps customer demand physical until retailer submits it', () => {
    const game = startGame(createGame({ name: 'Test', config: defaultGameConfig }))
    const retailer = getCurrentRoleState(game, 'retailer')

    expect(retailer?.incomingOrder).toBeNull()
    expect(retailer?.incomingOrderSource).toBe('physical_customer_card')
  })

  it('applies cumulative backorder and never leaves inventory and backorder positive together', () => {
    const lowInventoryGame = startGame(
      createGame({
        name: 'Backorder',
        config: { ...defaultGameConfig, startingInventory: 0, startingTransport: 0, startingWareneingang: 0 },
      }),
    )

    const submitted = submitRoleRound({
      game: lowInventoryGame,
      role: 'retailer',
      submittedBy: 'test',
      incomingOrder: 8,
      newOrderToSupplier: 4,
      autoAdvance: false,
    })
    const retailer = getCurrentRoleState(submitted, 'retailer')

    expect(retailer?.totalDemand).toBe(8)
    expect(retailer?.shippedQuantity).toBe(0)
    expect(retailer?.endingInventory).toBe(0)
    expect(retailer?.endingBackorder).toBe(8)
  })

  it('moves material through Transport and Wareneingang before it becomes usable', () => {
    let game = startGame(
      createGame({
        name: 'Delay',
        config: { ...defaultGameConfig, startingInventory: 20, startingTransport: 0, startingWareneingang: 0 },
      }),
    )

    game = submitRoleRound({
      game,
      role: 'producer',
      submittedBy: 'test',
      newOrderToSupplier: 0,
      autoAdvance: false,
    })
    game = submitRoleRound({
      game,
      role: 'distributor',
      submittedBy: 'test',
      newOrderToSupplier: 0,
      autoAdvance: false,
    })
    game = submitRoleRound({
      game,
      role: 'wholesaler',
      submittedBy: 'test',
      newOrderToSupplier: 0,
      autoAdvance: false,
    })
    game = submitRoleRound({
      game,
      role: 'retailer',
      submittedBy: 'test',
      incomingOrder: 4,
      newOrderToSupplier: 0,
      autoAdvance: false,
    })
    game = advanceRound(game, 'test')

    const distributorRound2 = getCurrentRoleState(game, 'distributor')
    expect(distributorRound2?.transportBufferBefore).toBe(4)
    expect(distributorRound2?.materialMovedToWareneingang).toBe(4)
    expect(distributorRound2?.materialMovedToInventory).toBe(0)

    for (const role of ['producer', 'distributor', 'wholesaler', 'retailer'] as const) {
      const state = getCurrentRoleState(game, role)
      game = submitRoleRound({
        game,
        role,
        submittedBy: 'test',
        incomingOrder: role === 'retailer' ? 4 : undefined,
        newOrderToSupplier: 0,
        autoAdvance: false,
      })
      expect(state).toBeDefined()
    }
    game = advanceRound(game, 'test')

    const distributorRound3 = getCurrentRoleState(game, 'distributor')
    expect(distributorRound3?.wareneingangBufferBefore).toBe(4)
    expect(distributorRound3?.materialMovedToInventory).toBe(4)
  })

  it('treats producer as unlimited upstream stock in v1', () => {
    const game = startGame(
      createGame({
        name: 'Producer',
        config: { ...defaultGameConfig, startingInventory: 0, startingTransport: 0, startingWareneingang: 0 },
      }),
    )

    const submitted = submitRoleRound({
      game,
      role: 'producer',
      submittedBy: 'test',
      newOrderToSupplier: 0,
      autoAdvance: false,
    })
    const producer = getCurrentRoleState(submitted, 'producer')

    expect(producer?.incomingOrder).toBe(4)
    expect(producer?.shippedQuantity).toBe(4)
    expect(producer?.endingBackorder).toBe(0)
    expect(producer?.totalRoundCost).toBe(0)
  })

  it('uses previous order on timeout for unsubmitted role orders', () => {
    let game = startGame(createGame({ name: 'Timeout', config: { ...defaultGameConfig, roundSeconds: 10 } }))
    game = submitRoleRound({
      game,
      role: 'retailer',
      submittedBy: 'test',
      incomingOrder: 4,
      newOrderToSupplier: 7,
      autoAdvance: false,
    })

    game = advanceRound(game, 'timer')
    const round2Retailer = getCurrentRoleState(game, 'retailer')

    game = advanceRound(game, 'timer')
    const timedOutRound = game.roleRoundStates.find(
      (state) => state.role === 'retailer' && state.roundNumber === 2,
    )

    expect(round2Retailer?.submitted).toBe(false)
    expect(timedOutRound?.timedOut).toBe(true)
    expect(timedOutRound?.newOrderToSupplier).toBe(7)
  })

  it('marks simulation game roles as joined bots', () => {
    const game = createGame({
      name: 'Simulation',
      config: { ...defaultGameConfig, simulationMode: true },
    })

    expect(game.config.simulationMode).toBe(true)
    expect(game.config.roundSeconds).toBe(5)
    expect(game.roleAssignments.every((assignment) => assignment.joinedAt)).toBe(true)
    expect(game.roleAssignments.map((assignment) => assignment.displayName)).toEqual([
      'Bot Retailer',
      'Bot Wholesaler',
      'Bot Distributor',
      'Bot Producer',
    ])
  })

  it('fills the current simulation round with bot decisions and random customer demand', () => {
    const game = startGame(
      createGame({
        name: 'Simulation',
        config: { ...defaultGameConfig, simulationMode: true },
      }),
    )

    const submitted = submitSimulationRound(game, () => 0.5)
    const retailer = getCurrentRoleState(submitted, 'retailer')

    expect(submitted.currentRound).toBe(1)
    expect(submitted.roleRoundStates.filter((state) => state.roundNumber === 1).every((state) => state.submitted)).toBe(true)
    expect(retailer?.incomingOrder).toBe(5)
    expect(retailer?.submittedBy).toBe('Bot Retailer')
  })

  it('keeps simulation round deadlines at five seconds for saved games', () => {
    const game = startGame(
      createGame({
        name: 'Simulation',
        config: { ...defaultGameConfig, simulationMode: true, roundSeconds: 60 },
      }),
    )
    const currentRound = game.rounds[0]
    const stretchedGame = {
      ...game,
      config: { ...game.config, roundSeconds: 60 },
      rounds: [
        {
          ...currentRound,
          deadlineAt: new Date(new Date(currentRound.startsAt).getTime() + 60_000).toISOString(),
        },
      ],
    }

    const synced = synchronizeSimulationRoundClock(stretchedGame)
    const syncedRound = synced.rounds[0]
    const durationMs = new Date(syncedRound.deadlineAt).getTime() - new Date(syncedRound.startsAt).getTime()

    expect(synced.config.roundSeconds).toBe(5)
    expect(durationMs).toBe(5_000)
  })
})
