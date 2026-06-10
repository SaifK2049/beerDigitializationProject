import { describe, expect, it } from 'vitest'
import {
  advanceRound,
  createGame,
  defaultGameConfig,
  getCurrentRoleState,
  markRoleJoined,
  startGame,
  submitSimulationRound,
  submitRoleRound,
  synchronizeSimulationRoundClock,
  validateJoin,
} from './engine'
import { buildRecommendation, getEffectiveOrderCap } from './recommendation'
import type { RoleRoundState } from './types'

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

  it('charges producer inventory costs for unsold planned output', () => {
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
    expect(producer?.endingInventory).toBe(0)
    expect(producer?.totalRoundCost).toBe(0)
  })

  it('leaves producer inventory when downstream orders less than planned output', () => {
    let game = startGame(
      createGame({
        name: 'Producer inventory',
        config: { ...defaultGameConfig, startingInventory: 0, startingTransport: 0, startingWareneingang: 0 },
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
    game = submitRoleRound({
      game,
      role: 'producer',
      submittedBy: 'test',
      newOrderToSupplier: 0,
      autoAdvance: false,
    })
    const producer = getCurrentRoleState(game, 'producer')

    expect(producer?.startingInventory).toBe(4)
    expect(producer?.incomingOrder).toBe(0)
    expect(producer?.endingInventory).toBe(4)
    expect(producer?.inventoryCost).toBe(4)
  })

  it('stops producer planned output when existing inventory is already high', () => {
    let game = startGame(
      createGame({
        name: 'Producer throttle',
        config: { ...defaultGameConfig, startingTransport: 0, startingWareneingang: 0 },
      }),
    )

    for (let round = 1; round <= 4; round += 1) {
      game = submitRoleRound({
        game,
        role: 'producer',
        submittedBy: 'test',
        newOrderToSupplier: 0,
        autoAdvance: false,
      })
      const producer = getCurrentRoleState(game, 'producer')
      expect(producer?.startingInventory).toBeLessThanOrEqual(12)

      for (const role of ['distributor', 'wholesaler', 'retailer'] as const) {
        game = submitRoleRound({
          game,
          role,
          submittedBy: 'test',
          incomingOrder: role === 'retailer' ? 0 : undefined,
          newOrderToSupplier: 0,
          autoAdvance: false,
        })
      }

      if (round < 4) {
        game = advanceRound(game, 'test')
      }
    }
  })

  it('ramps producer planned output above baseline when backlog is high', () => {
    let game = startGame(
      createGame({
        name: 'Producer ramp',
        config: { ...defaultGameConfig, startingInventory: 0, startingTransport: 0, startingWareneingang: 0 },
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
      newOrderToSupplier: 16,
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
    game = submitRoleRound({
      game,
      role: 'producer',
      submittedBy: 'test',
      newOrderToSupplier: 0,
      autoAdvance: false,
    })
    game = advanceRound(game, 'test')

    const producerRound3 = getCurrentRoleState(game, 'producer')
    expect(producerRound3?.startingInventory).toBeGreaterThan(defaultGameConfig.initialIncomingOrder)
    expect(producerRound3?.startingInventory).toBeLessThanOrEqual(getEffectiveOrderCap(defaultGameConfig))
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

  it('makes a player role unavailable immediately after it is joined', () => {
    const game = createGame({ name: 'Join lock', config: defaultGameConfig })

    expect(validateJoin(game, 'retailer', '1111')).toBe(true)

    const joined = markRoleJoined(game, 'retailer', 'Player One')

    expect(validateJoin(joined, 'retailer', '1111')).toBe(false)
    expect(joined.roleAssignments.find((assignment) => assignment.role === 'retailer')?.displayName).toBe('Player One')
    expect(() => markRoleJoined(joined, 'retailer', 'Player Two')).toThrow('Retailer is already taken.')
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

  it('recommends nonzero early replenishment for JIT flow', () => {
    const game = startGame(createGame({ name: 'JIT', config: defaultGameConfig }))
    const retailer = getCurrentRoleState(game, 'retailer')

    expect(retailer?.recommendedOrderQuantity).toBeGreaterThan(0)
    expect(retailer?.recommendationInputs.inventoryPosition).toBeDefined()
    expect(retailer?.recommendationInputs.targetInventoryPosition).toBeDefined()
  })

  it('caps JIT recommendations with automatic and explicit caps', () => {
    const uncappedRecommendation = buildRecommendation(
      'wholesaler',
      { ...defaultGameConfig, maxOrderQuantity: null },
      {
        startingInventory: 0,
        materialMovedToWareneingang: 0,
        previousBackorder: 100,
        roundNumber: 8,
      },
      submittedHistory('wholesaler', [8, 8, 8]),
    )
    const explicitRecommendation = buildRecommendation(
      'wholesaler',
      { ...defaultGameConfig, maxOrderQuantity: 6 },
      {
        startingInventory: 0,
        materialMovedToWareneingang: 0,
        previousBackorder: 100,
        roundNumber: 8,
      },
      submittedHistory('wholesaler', [8, 8, 8]),
    )

    expect(getEffectiveOrderCap(defaultGameConfig)).toBe(16)
    expect(uncappedRecommendation.quantity).toBe(16)
    expect(uncappedRecommendation.inputs.capApplied).toBe(true)
    expect(explicitRecommendation.quantity).toBe(6)
    expect(explicitRecommendation.inputs.orderCap).toBe(6)
  })

  it('reduces recommendations quickly when inventory position is above target', () => {
    const recommendation = buildRecommendation(
      'retailer',
      defaultGameConfig,
      {
        startingInventory: 30,
        materialMovedToWareneingang: 0,
        previousBackorder: 0,
        roundNumber: 8,
      },
      submittedHistory('retailer', [4, 4, 4]),
    )

    expect(recommendation.inputs.inventoryPosition).toBeGreaterThan(recommendation.inputs.targetInventoryPosition)
    expect(recommendation.quantity).toBe(0)
  })

  it('enforces order caps for manual submissions', () => {
    const game = startGame(
      createGame({
        name: 'Cap',
        config: { ...defaultGameConfig, maxOrderQuantity: 5 },
      }),
    )

    expect(() =>
      submitRoleRound({
        game,
        role: 'retailer',
        submittedBy: 'test',
        incomingOrder: 4,
        newOrderToSupplier: 6,
        autoAdvance: false,
      }),
    ).toThrow('Order quantity must be 5 or lower.')

    const submittedAtCap = submitRoleRound({
      game,
      role: 'retailer',
      submittedBy: 'test',
      incomingOrder: 4,
      newOrderToSupplier: 5,
      autoAdvance: false,
    })

    expect(getCurrentRoleState(submittedAtCap, 'retailer')?.newOrderToSupplier).toBe(5)
  })

  it('allows upstream roles to choose a valid delivery quantity', () => {
    const game = startGame(
      createGame({
        name: 'Manual delivery',
        config: { ...defaultGameConfig, startingInventory: 10, startingTransport: 0, startingWareneingang: 0 },
      }),
    )

    const submitted = submitRoleRound({
      game,
      role: 'wholesaler',
      submittedBy: 'test',
      shippedQuantity: 2,
      newOrderToSupplier: 4,
      autoAdvance: false,
    })
    const wholesaler = getCurrentRoleState(submitted, 'wholesaler')

    expect(wholesaler?.incomingOrder).toBe(4)
    expect(wholesaler?.shippedQuantity).toBe(2)
    expect(wholesaler?.endingBackorder).toBe(2)
    expect(wholesaler?.endingInventory).toBe(8)
  })

  it('rejects delivery quantities above inventory or downstream demand', () => {
    const game = startGame(
      createGame({
        name: 'Delivery validation',
        config: { ...defaultGameConfig, startingInventory: 3, startingTransport: 0, startingWareneingang: 0 },
      }),
    )

    expect(() =>
      submitRoleRound({
        game,
        role: 'wholesaler',
        submittedBy: 'test',
        shippedQuantity: 4,
        newOrderToSupplier: 0,
        autoAdvance: false,
      }),
    ).toThrow('Delivery quantity must be 3 or lower because that is the usable Lager.')

    const enoughInventory = startGame(
      createGame({
        name: 'Demand validation',
        config: { ...defaultGameConfig, startingInventory: 10, startingTransport: 0, startingWareneingang: 0 },
      }),
    )

    expect(() =>
      submitRoleRound({
        game: enoughInventory,
        role: 'wholesaler',
        submittedBy: 'test',
        shippedQuantity: 5,
        newOrderToSupplier: 0,
        autoAdvance: false,
      }),
    ).toThrow('Delivery quantity must be 4 or lower because that is the downstream order plus backorder.')
  })

  it('caps timeout fallback orders from older saved state', () => {
    let game = startGame(createGame({ name: 'Timeout cap', config: defaultGameConfig }))
    game = submitRoleRound({
      game,
      role: 'retailer',
      submittedBy: 'test',
      incomingOrder: 4,
      newOrderToSupplier: 12,
      autoAdvance: false,
    })
    game = advanceRound(game, 'test')
    game = { ...game, config: { ...game.config, maxOrderQuantity: 5 } }

    const advanced = advanceRound(game, 'timer')
    const timedOutRetailer = advanced.roleRoundStates.find(
      (state) => state.role === 'retailer' && state.roundNumber === 2,
    )

    expect(timedOutRetailer?.timedOut).toBe(true)
    expect(timedOutRetailer?.newOrderToSupplier).toBe(5)
  })

  it('caps simulation bot orders', () => {
    const game = startGame(
      createGame({
        name: 'Simulation cap',
        config: { ...defaultGameConfig, simulationMode: true, maxOrderQuantity: 3 },
      }),
    )
    const submitted = submitSimulationRound(game, () => 0.95)

    for (const state of submitted.roleRoundStates.filter((state) => state.role !== 'producer')) {
      expect(state.newOrderToSupplier).toBeLessThanOrEqual(3)
    }
  })

  it('keeps KUTFA0-style low-demand simulation orders bounded', () => {
    const demands = [4, 3, 4, 4, 3, 7, 6, 7, 6, 6, 8, 5, 5, 6, 4, 2, 2, 7, 2, 8]
    let demandIndex = 0
    let game = startGame(createGame({ name: 'KUTFA0 Regression', config: { ...defaultGameConfig, simulationMode: true } }))

    for (let round = 1; round <= 20 && game.status === 'active'; round += 1) {
      const demand = demands[demandIndex++] ?? 4
      const randomForDemand = (demand - 2) / 7
      game = submitSimulationRound(game, () => randomForDemand)
      const nonProducerStates = game.roleRoundStates.filter(
        (state) => state.roundNumber === round && state.role !== 'producer',
      )

      expect(nonProducerStates.every((state) => (state.newOrderToSupplier ?? 0) <= 16)).toBe(true)
      game = advanceRound(game, 'test')
    }

    const totalCost = game.costSnapshots.reduce((sum, snapshot) => sum + snapshot.totalRoundCost, 0)
    expect(totalCost).toBeLessThan(4856)
  })
})

function submittedHistory(role: RoleRoundState['role'], incomingOrders: number[]): RoleRoundState[] {
  return incomingOrders.map((incomingOrder, index) => ({
    id: `history-${index}`,
    gameId: 'game-test',
    roundNumber: index + 1,
    role,
    startingInventory: 0,
    transportBufferBefore: 0,
    wareneingangBufferBefore: 0,
    materialMovedToInventory: 0,
    materialMovedToWareneingang: 0,
    incomingOrder,
    incomingOrderSource: 'downstream_previous_order',
    previousBackorder: 0,
    totalDemand: incomingOrder,
    shippedQuantity: incomingOrder,
    endingInventory: 0,
    endingBackorder: 0,
    newOrderToSupplier: incomingOrder,
    recommendedOrderQuantity: incomingOrder,
    recommendationReason: '',
    recommendationInputs: {
      forecastDemand: incomingOrder,
      previousBackorder: 0,
      targetSafetyStock: 0,
      currentInventory: 0,
      pipelineInventory: 0,
      movingAverageWindow: 3,
      inventoryPosition: 0,
      targetInventoryPosition: 0,
      uncappedOrder: incomingOrder,
      orderCap: 16,
      capApplied: false,
    },
    warnings: [],
    inventoryCost: 0,
    backorderCost: 0,
    totalRoundCost: 0,
    submittedBy: 'test',
    submittedAt: new Date(0).toISOString(),
    submitted: true,
    timedOut: false,
  }))
}
