import { buildRecommendation, getEffectiveOrderCap } from './recommendation'
import {
  ROLES,
  compactRoleLabels,
  downstreamRole,
  upstreamRole,
  type AuditLog,
  type CreateGameInput,
  type DecisionRecommendation,
  type Game,
  type GameConfig,
  type Role,
  type RoleAssignment,
  type RoleRoundState,
  type Round,
  type SubmitRoundInput,
} from './types'

export const defaultGameConfig: GameConfig = {
  inventoryCostPerUnit: 1,
  backorderCostPerUnit: 2,
  startingInventory: 12,
  startingTransport: 4,
  startingWareneingang: 4,
  targetSafetyStock: 4,
  movingAverageWindow: 3,
  maxOrderQuantity: null,
  maxRounds: 20,
  roundSeconds: 60,
  initialIncomingOrder: 4,
  timeoutFallback: 'previous_order_or_zero',
  demoMode: false,
  demoCustomerDemand: [4, 4, 4, 4, 8, 8, 8, 8, 4, 4, 4, 4],
  simulationMode: false,
}

export const simulationCustomerDemandRange = {
  min: 2,
  max: 8,
}

export const simulationRoundSeconds = 5

export function createGame(input: CreateGameInput): Game {
  const now = new Date().toISOString()
  const id = createId('game')
  const config = normalizeConfig(input.config)
  const game: Game = {
    id,
    code: createGameCode(),
    name: input.name.trim() || 'Beer Game',
    status: 'lobby',
    currentRound: 0,
    maxRounds: config.maxRounds,
    adminPin: 'ADMIN',
    transparencyLevel: 'local_structured',
    config,
    roleAssignments: createDefaultAssignments(id, config.simulationMode, now),
    rounds: [],
    roleRoundStates: [],
    orders: [],
    shipments: [],
    costSnapshots: [],
    decisionRecommendations: [],
    auditLogs: [],
    createdAt: now,
    startedAt: null,
    finishedAt: null,
  }

  return appendAudit(game, 'system', 'create_game', 'game', id, null, {
    code: game.code,
    config: game.config,
  })
}

export function submitSimulationRound(game: Game, random = Math.random): Game {
  if (game.status !== 'active') {
    return game
  }

  const customerDemand = randomInteger(
    simulationCustomerDemandRange.min,
    simulationCustomerDemandRange.max,
    random,
  )
  let nextGame = game

  for (const role of ROLES) {
    const state = getCurrentRoleState(nextGame, role)
    if (!state || state.submitted) {
      continue
    }

    nextGame = submitRoleRound({
      game: nextGame,
      role,
      submittedBy: `Bot ${compactRoleLabels[role]}`,
      incomingOrder: role === 'retailer' ? customerDemand : undefined,
      newOrderToSupplier: role === 'producer' ? 0 : state.recommendedOrderQuantity,
      autoAdvance: false,
    })
  }

  return appendAudit(nextGame, 'simulation', 'submit_bot_round', 'round', String(game.currentRound), null, {
    round: game.currentRound,
    customerDemand,
  })
}

export function synchronizeSimulationRoundClock(game: Game): Game {
  if (!game.config.simulationMode) {
    return game
  }

  const round = getCurrentRound(game)
  const nextConfig = { ...game.config, demoMode: false, roundSeconds: simulationRoundSeconds }
  if (!round || game.status !== 'active') {
    return game.config.roundSeconds === simulationRoundSeconds && !game.config.demoMode
      ? game
      : { ...game, config: nextConfig }
  }

  const deadlineAt = new Date(new Date(round.startsAt).getTime() + simulationRoundSeconds * 1000).toISOString()
  const deadlineMatches = round.deadlineAt === deadlineAt
  if (deadlineMatches && game.config.roundSeconds === simulationRoundSeconds && !game.config.demoMode) {
    return game
  }

  return {
    ...game,
    config: nextConfig,
    rounds: game.rounds.map((candidate) =>
      candidate.roundNumber === round.roundNumber ? { ...candidate, deadlineAt } : candidate,
    ),
  }
}

export function markRoleJoined(game: Game, role: Role, displayName: string): Game {
  const existingAssignment = game.roleAssignments.find((assignment) => assignment.role === role)
  if (existingAssignment?.joinedAt) {
    throw new Error(`${compactRoleLabels[role]} is already taken.`)
  }

  const now = new Date().toISOString()
  return {
    ...appendAudit(game, role, 'join_role', 'role_assignment', role, null, { displayName }),
    roleAssignments: game.roleAssignments.map((assignment) =>
      assignment.role === role
        ? {
            ...assignment,
            displayName: displayName.trim() || assignment.displayName,
            joinedAt: assignment.joinedAt ?? now,
          }
        : assignment,
    ),
  }
}

export function startGame(game: Game): Game {
  if (game.status !== 'lobby') {
    return game
  }

  const now = new Date()
  const firstRound = createRound(game.id, 1, now, getRoundSeconds(game.config))
  const states = ROLES.map((role) => createRoleRoundState(game, role, 1))

  return appendAudit(
    {
      ...game,
      status: 'active',
      currentRound: 1,
      startedAt: now.toISOString(),
      rounds: [firstRound],
      roleRoundStates: states,
      decisionRecommendations: states.map(stateToDecisionRecommendation),
    },
    'admin',
    'start_game',
    'game',
    game.id,
    null,
    { round: 1 },
  )
}

export function pauseGame(game: Game): Game {
  if (game.status !== 'active') {
    return game
  }

  return appendAudit({ ...game, status: 'paused' }, 'admin', 'pause_game', 'game', game.id, null, null)
}

export function resumeGame(game: Game): Game {
  if (game.status !== 'paused') {
    return game
  }

  const nextDeadline = new Date(Date.now() + getRoundSeconds(game.config) * 1000).toISOString()
  const rounds = game.rounds.map((round) =>
    round.roundNumber === game.currentRound ? { ...round, deadlineAt: nextDeadline } : round,
  )

  return appendAudit({ ...game, status: 'active', rounds }, 'admin', 'resume_game', 'game', game.id, null, {
    deadlineAt: nextDeadline,
  })
}

export function resetGame(game: Game): Game {
  const now = new Date().toISOString()
  return appendAudit(
    {
      ...game,
      status: 'lobby',
      currentRound: 0,
      rounds: [],
      roleRoundStates: [],
      orders: [],
      shipments: [],
      costSnapshots: [],
      decisionRecommendations: [],
      startedAt: null,
      finishedAt: null,
    },
    'admin',
    'reset_game',
    'game',
    game.id,
    null,
    { resetAt: now },
  )
}

export function submitRoleRound(input: SubmitRoundInput): Game {
  const { game, role, submittedBy, timedOut = false } = input
  const state = getCurrentRoleState(game, role)
  if (!state || state.submitted || game.status !== 'active') {
    return game
  }

  const incomingOrder =
    role === 'retailer'
      ? requireNonNegativeInteger(
          input.incomingOrder,
          'Retailer must enter the physical customer order as a non-negative integer.',
        )
      : state.incomingOrder ?? 0
  const newOrderToSupplier =
    role === 'producer'
      ? 0
      : requireValidOrder(input.newOrderToSupplier, getEffectiveOrderCap(game.config))

  const totalDemand = incomingOrder + state.previousBackorder
  const recommendedShipment = Math.min(state.startingInventory, totalDemand)
  const shippedQuantity =
    input.shippedQuantity === undefined
      ? recommendedShipment
      : requireValidShipment(input.shippedQuantity, state.startingInventory, totalDemand)
  const endingBackorder = totalDemand - shippedQuantity
  const endingInventory = state.startingInventory - shippedQuantity
  const inventoryCost = endingInventory * game.config.inventoryCostPerUnit
  const backorderCost = endingBackorder * game.config.backorderCostPerUnit
  const totalRoundCost = inventoryCost + backorderCost
  const submittedAt = new Date().toISOString()

  const nextState: RoleRoundState = {
    ...state,
    incomingOrder,
    totalDemand,
    shippedQuantity,
    endingInventory,
    endingBackorder,
    newOrderToSupplier,
    inventoryCost,
    backorderCost,
    totalRoundCost,
    submittedBy,
    submittedAt,
    submitted: true,
    timedOut,
  }

  const nextOrders = [...game.orders]
  const nextShipments = [...game.shipments]

  if (role !== 'producer') {
    nextOrders.push({
      id: createId('order'),
      gameId: game.id,
      roundNumber: game.currentRound,
      fromRole: role,
      toRole: upstreamRole[role] ?? 'source',
      quantity: newOrderToSupplier,
      becomesVisibleRound: game.currentRound + 1,
    })
  }

  nextShipments.push({
    id: createId('shipment'),
    gameId: game.id,
    roundNumber: game.currentRound,
    fromRole: role,
    toRole: downstreamRole[role] ?? 'customer',
    quantity: shippedQuantity,
    entersTransportRound: game.currentRound + 1,
  })

  const cumulativeCost =
    game.costSnapshots
      .filter((snapshot) => snapshot.role === role)
      .reduce((sum, snapshot) => sum + snapshot.totalRoundCost, 0) + totalRoundCost

  const nextGame = appendAudit(
    {
      ...game,
      roleRoundStates: game.roleRoundStates.map((candidate) =>
        candidate.id === state.id ? nextState : candidate,
      ),
      orders: nextOrders,
      shipments: nextShipments,
      costSnapshots: [
        ...game.costSnapshots,
        {
          id: createId('cost'),
          gameId: game.id,
          roundNumber: game.currentRound,
          role,
          inventoryCost,
          backorderCost,
          totalRoundCost,
          cumulativeCost,
        },
      ],
    },
    submittedBy,
    timedOut ? 'timeout_submit_role_round' : 'submit_role_round',
    'role_round_state',
    state.id,
    state,
    nextState,
  )

  return input.autoAdvance !== false && shouldAutoAdvance(nextGame)
    ? advanceRound(nextGame, 'auto')
    : nextGame
}

export function advanceRound(game: Game, advancedBy: string): Game {
  if (game.status !== 'active') {
    return game
  }

  let nextGame = game
  for (const role of ROLES) {
    const state = getCurrentRoleState(nextGame, role)
    if (!state || state.submitted) {
      continue
    }

    nextGame = submitRoleRound({
      game: nextGame,
      role,
      submittedBy: 'timer',
      incomingOrder: role === 'retailer' ? getDemoOrFallbackCustomerDemand(nextGame) : undefined,
      newOrderToSupplier: getCappedPreviousOutgoingOrder(nextGame, role),
      timedOut: true,
      autoAdvance: false,
    })
  }

  const lockedAt = new Date().toISOString()
  const rounds = nextGame.rounds.map((round) =>
    round.roundNumber === nextGame.currentRound
      ? { ...round, status: 'locked' as const, lockedAt, advancedBy }
      : round,
  )

  if (nextGame.currentRound >= nextGame.maxRounds) {
    return appendAudit(
      {
        ...nextGame,
        status: 'finished',
        rounds,
        finishedAt: lockedAt,
      },
      advancedBy,
      'finish_game',
      'game',
      nextGame.id,
      null,
      { finishedRound: nextGame.currentRound },
    )
  }

  const nextRoundNumber = nextGame.currentRound + 1
  const nextRound = createRound(nextGame.id, nextRoundNumber, new Date(), getRoundSeconds(nextGame.config))
  const nextStates = ROLES.map((role) => createRoleRoundState({ ...nextGame, rounds }, role, nextRoundNumber))

  return appendAudit(
    {
      ...nextGame,
      currentRound: nextRoundNumber,
      rounds: [...rounds, nextRound],
      roleRoundStates: [...nextGame.roleRoundStates, ...nextStates],
      decisionRecommendations: [
        ...nextGame.decisionRecommendations,
        ...nextStates.map(stateToDecisionRecommendation),
      ],
    },
    advancedBy,
    'advance_round',
    'round',
    String(nextRoundNumber),
    null,
    { round: nextRoundNumber },
  )
}

export function maybeAdvanceExpiredRound(game: Game, now = new Date()): Game {
  const round = getCurrentRound(game)
  if (!round || game.status !== 'active') {
    return game
  }

  return now.getTime() >= new Date(round.deadlineAt).getTime() ? advanceRound(game, 'timer') : game
}

export function getCurrentRound(game: Game): Round | undefined {
  return game.rounds.find((round) => round.roundNumber === game.currentRound)
}

export function getCurrentRoleState(game: Game, role: Role): RoleRoundState | undefined {
  return game.roleRoundStates.find(
    (state) => state.roundNumber === game.currentRound && state.role === role,
  )
}

export function validateJoin(game: Game, role: Role | 'admin', pin: string): boolean {
  if (role === 'admin') {
    return pin.trim() === game.adminPin
  }

  return game.roleAssignments.some(
    (assignment) => assignment.role === role && !assignment.joinedAt && assignment.pin === pin.trim(),
  )
}

function createRoleRoundState(game: Game, role: Role, roundNumber: number): RoleRoundState {
  const previous = game.roleRoundStates.find(
    (state) => state.role === role && state.roundNumber === roundNumber - 1,
  )
  const previousInventory = previous?.endingInventory ?? game.config.startingInventory
  const previousBackorder = previous?.endingBackorder ?? 0
  const transportBufferBefore =
    roundNumber === 1
      ? game.config.startingTransport
      : getShipmentsEnteringTransport(game, role, roundNumber)
  const wareneingangBufferBefore =
    roundNumber === 1 ? game.config.startingWareneingang : previous?.materialMovedToWareneingang ?? 0
  const materialMovedToInventory = wareneingangBufferBefore
  const materialMovedToWareneingang = transportBufferBefore
  const availableBeforePlannedOutput = previousInventory + materialMovedToInventory
  const incomingOrder =
    role === 'retailer'
      ? getConfiguredCustomerDemand(game, roundNumber)
      : getIncomingOrderFromDownstream(game, role, roundNumber)
  const producerPlannedOutput =
    role === 'producer'
      ? getProducerPlannedOutput(game, availableBeforePlannedOutput, incomingOrder ?? 0, previousBackorder)
      : 0
  const startingInventory = availableBeforePlannedOutput + producerPlannedOutput
  const recommendation = buildRecommendation(
    role,
    game.config,
    {
      startingInventory,
      materialMovedToWareneingang,
      previousBackorder,
      roundNumber,
    },
    game.roleRoundStates,
  )

  return {
    id: createId('state'),
    gameId: game.id,
    roundNumber,
    role,
    startingInventory,
    transportBufferBefore,
    wareneingangBufferBefore,
    materialMovedToInventory,
    materialMovedToWareneingang,
    incomingOrder,
    incomingOrderSource: role === 'retailer' ? 'physical_customer_card' : 'downstream_previous_order',
    previousBackorder,
    totalDemand: null,
    shippedQuantity: null,
    endingInventory: null,
    endingBackorder: null,
    newOrderToSupplier: role === 'producer' ? 0 : null,
    recommendedOrderQuantity: recommendation.quantity,
    recommendationReason: recommendation.reason,
    recommendationInputs: recommendation.inputs,
    warnings: recommendation.warnings,
    inventoryCost: null,
    backorderCost: null,
    totalRoundCost: null,
    submittedBy: null,
    submittedAt: null,
    submitted: false,
    timedOut: false,
  }
}

function createRound(gameId: string, roundNumber: number, startsAt: Date, roundSeconds: number): Round {
  return {
    gameId,
    roundNumber,
    status: 'active',
    startsAt: startsAt.toISOString(),
    deadlineAt: new Date(startsAt.getTime() + roundSeconds * 1000).toISOString(),
    lockedAt: null,
    advancedBy: null,
  }
}

function createDefaultAssignments(gameId: string, simulationMode: boolean, joinedAt: string): RoleAssignment[] {
  const pins: Record<Role, string> = {
    retailer: '1111',
    wholesaler: '2222',
    distributor: '3333',
    producer: '4444',
  }

  return ROLES.map((role) => ({
    gameId,
    role,
    displayName: simulationMode ? `Bot ${compactRoleLabels[role]}` : '',
    pin: pins[role],
    joinedAt: simulationMode ? joinedAt : null,
  }))
}

function getIncomingOrderFromDownstream(game: Game, role: Role, roundNumber: number): number {
  if (roundNumber === 1) {
    return game.config.initialIncomingOrder
  }

  const directDownstream = downstreamRole[role]
  if (!directDownstream) {
    return 0
  }

  const order = game.orders.find(
    (candidate) =>
      candidate.fromRole === directDownstream &&
      candidate.toRole === role &&
      candidate.becomesVisibleRound === roundNumber,
  )

  return order?.quantity ?? 0
}

function getShipmentsEnteringTransport(game: Game, role: Role, roundNumber: number): number {
  return game.shipments
    .filter(
      (shipment) => shipment.toRole === role && shipment.entersTransportRound === roundNumber,
    )
    .reduce((sum, shipment) => sum + shipment.quantity, 0)
}

function getConfiguredCustomerDemand(game: Game, roundNumber: number): number | null {
  if (!game.config.demoMode) {
    return null
  }

  return game.config.demoCustomerDemand[roundNumber - 1] ?? 0
}

function getDemoOrFallbackCustomerDemand(game: Game): number {
  return getConfiguredCustomerDemand(game, game.currentRound) ?? 0
}

function getProducerPlannedOutput(
  game: Game,
  availableInventory: number,
  incomingOrder: number,
  previousBackorder: number,
): number {
  const recentSubmittedStates = game.roleRoundStates
    .filter((state) => state.role === 'producer' && state.submitted && state.incomingOrder !== null)
    .slice(-game.config.movingAverageWindow)
  const recentIncomingOrders = recentSubmittedStates.map((state) => state.incomingOrder ?? 0)
  const forecastDemand =
    recentIncomingOrders.length === 0
      ? game.config.initialIncomingOrder
      : recentIncomingOrders.reduce((sum, value) => sum + value, 0) / recentIncomingOrders.length
  const targetInventory = Math.max(game.config.initialIncomingOrder * 2, forecastDemand * 2)
  const productionCapacity = Math.max(getEffectiveOrderCap(game.config), game.config.initialIncomingOrder * 4)
  const inventorySurplus = Math.max(0, availableInventory - targetInventory)
  const totalDemandPressure = incomingOrder + previousBackorder
  if (totalDemandPressure === 0 && availableInventory >= targetInventory) {
    return 0
  }

  const backorderRecovery = previousBackorder * 0.5
  const demandDrivenOutput =
    totalDemandPressure > 0 ? Math.max(incomingOrder, forecastDemand) + backorderRecovery : forecastDemand
  const plannedOutput = Math.round(Math.max(0, demandDrivenOutput - inventorySurplus))

  return Math.max(0, Math.min(productionCapacity, plannedOutput))
}

function getPreviousOutgoingOrder(game: Game, role: Role): number {
  const latestSubmitted = game.roleRoundStates
    .filter((state) => state.role === role && state.submitted && state.newOrderToSupplier !== null)
    .sort((a, b) => b.roundNumber - a.roundNumber)[0]

  return latestSubmitted?.newOrderToSupplier ?? 0
}

function getCappedPreviousOutgoingOrder(game: Game, role: Role): number {
  return Math.min(getPreviousOutgoingOrder(game, role), getEffectiveOrderCap(game.config))
}

function shouldAutoAdvance(game: Game): boolean {
  return ROLES.every((role) => getCurrentRoleState(game, role)?.submitted)
}

function requireValidOrder(value: number | undefined, maxOrderQuantity: number): number {
  const quantity = requireNonNegativeInteger(value, 'Order quantity must be a non-negative integer.')
  if (quantity > maxOrderQuantity) {
    throw new Error(`Order quantity must be ${maxOrderQuantity} or lower.`)
  }

  return quantity
}

function requireValidShipment(value: number, availableInventory: number, totalDemand: number): number {
  const quantity = requireNonNegativeInteger(value, 'Delivery quantity must be a non-negative integer.')
  if (quantity > availableInventory) {
    throw new Error(`Delivery quantity must be ${availableInventory} or lower because that is the usable Lager.`)
  }
  if (quantity > totalDemand) {
    throw new Error(`Delivery quantity must be ${totalDemand} or lower because that is the downstream order plus backorder.`)
  }

  return quantity
}

function requireNonNegativeInteger(value: number | undefined, message: string): number {
  if (value === undefined || !Number.isInteger(value) || value < 0) {
    throw new Error(message)
  }

  return value
}

function normalizeConfig(config: GameConfig): GameConfig {
  const simulationMode = Boolean(config.simulationMode)

  return {
    ...config,
    inventoryCostPerUnit: Math.max(0, config.inventoryCostPerUnit),
    backorderCostPerUnit: Math.max(0, config.backorderCostPerUnit),
    startingInventory: Math.max(0, Math.round(config.startingInventory)),
    startingTransport: Math.max(0, Math.round(config.startingTransport)),
    startingWareneingang: Math.max(0, Math.round(config.startingWareneingang)),
    targetSafetyStock: Math.max(0, Math.round(config.targetSafetyStock)),
    movingAverageWindow: Math.max(1, Math.round(config.movingAverageWindow)),
    maxRounds: Math.max(1, Math.round(config.maxRounds)),
    roundSeconds: simulationMode ? simulationRoundSeconds : Math.max(10, Math.round(config.roundSeconds)),
    initialIncomingOrder: Math.max(0, Math.round(config.initialIncomingOrder)),
    maxOrderQuantity:
      config.maxOrderQuantity === null ? null : Math.max(0, Math.round(config.maxOrderQuantity)),
    demoMode: simulationMode ? false : Boolean(config.demoMode),
    demoCustomerDemand: config.demoCustomerDemand.map((value) => Math.max(0, Math.round(value))),
    simulationMode,
  }
}

function getRoundSeconds(config: GameConfig): number {
  return config.simulationMode ? simulationRoundSeconds : config.roundSeconds
}

function randomInteger(min: number, max: number, random: () => number): number {
  return Math.floor(random() * (max - min + 1)) + min
}

function appendAudit(
  game: Game,
  actor: string,
  action: string,
  entityType: string,
  entityId: string,
  before: unknown,
  after: unknown,
): Game {
  const auditLog: AuditLog = {
    id: createId('audit'),
    gameId: game.id,
    actor,
    action,
    entityType,
    entityId,
    before,
    after,
    createdAt: new Date().toISOString(),
  }

  return {
    ...game,
    auditLogs: [...game.auditLogs, auditLog],
  }
}

function stateToDecisionRecommendation(state: RoleRoundState): DecisionRecommendation {
  return {
    id: createId('recommendation'),
    gameId: state.gameId,
    roundNumber: state.roundNumber,
    role: state.role,
    recommendedQuantity: state.recommendedOrderQuantity,
    formulaInputs: state.recommendationInputs,
    explanation: state.recommendationReason,
  }
}

function createGameCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

function createId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`
}
