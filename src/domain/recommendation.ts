import type {
  DecisionWarning,
  GameConfig,
  RecommendationInputs,
  Role,
  RoleRoundState,
} from './types'

const JIT_LEAD_TIME_ROUNDS = 3
const JIT_CORRECTION_RATE = 0.35
const JIT_OVERSTOCK_DRAWDOWN_RATE = 0.75

export function getEffectiveOrderCap(config: GameConfig): number {
  return config.maxOrderQuantity ?? Math.max(8, Math.round(config.initialIncomingOrder * 4))
}

export function buildRecommendation(
  role: Role,
  config: GameConfig,
  currentState: Pick<
    RoleRoundState,
    | 'startingInventory'
    | 'materialMovedToWareneingang'
    | 'previousBackorder'
    | 'roundNumber'
  >,
  history: RoleRoundState[],
): {
  quantity: number
  reason: string
  inputs: RecommendationInputs
  warnings: DecisionWarning[]
} {
  const recentIncomingOrders = history
    .filter((state) => state.role === role && state.submitted && state.incomingOrder !== null)
    .slice(-config.movingAverageWindow)
    .map((state) => state.incomingOrder ?? 0)

  const forecastDemand = forecastRecentDemand(recentIncomingOrders, config.initialIncomingOrder)
  const pipelineInventory = currentState.materialMovedToWareneingang
  const inventoryPosition =
    currentState.startingInventory + pipelineInventory - currentState.previousBackorder
  const targetInventoryPosition = forecastDemand * JIT_LEAD_TIME_ROUNDS
  const positionGap = targetInventoryPosition - inventoryPosition
  const correction =
    recentIncomingOrders.length === 0
      ? 0
      :
    positionGap >= 0
      ? positionGap * JIT_CORRECTION_RATE
      : positionGap * JIT_OVERSTOCK_DRAWDOWN_RATE
  const uncappedQuantity =
    role === 'producer' ? 0 : Math.max(0, Math.round(forecastDemand + correction))
  const orderCap = getEffectiveOrderCap(config)
  const quantity = Math.min(uncappedQuantity, orderCap)
  const capApplied = quantity < uncappedQuantity
  const inputs: RecommendationInputs = {
    forecastDemand,
    previousBackorder: currentState.previousBackorder,
    targetSafetyStock: config.targetSafetyStock,
    currentInventory: currentState.startingInventory,
    pipelineInventory,
    movingAverageWindow: config.movingAverageWindow,
    inventoryPosition,
    targetInventoryPosition,
    uncappedOrder: uncappedQuantity,
    orderCap,
    capApplied,
  }

  return {
    quantity,
    inputs,
    warnings: buildWarnings(role, quantity, inputs, history),
    reason:
      role === 'producer'
        ? `Recommended 0: producer has no upstream supplier; inventory cost is based on unsold production stock.`
        : `Recommended ${quantity}: forecast ${roundOne(inputs.forecastDemand)} plus JIT correction ` +
      `toward target position ${roundOne(inputs.targetInventoryPosition)} from current position ` +
      `${roundOne(inputs.inventoryPosition)}.${capApplied ? ` Capped from ${uncappedQuantity} at ${orderCap}.` : ''}`,
  }
}

function buildWarnings(
  role: Role,
  recommendedQuantity: number,
  inputs: RecommendationInputs,
  history: RoleRoundState[],
): DecisionWarning[] {
  const warnings: DecisionWarning[] = []
  const recentSubmitted = history
    .filter((state) => state.role === role && state.submitted)
    .slice(-Math.max(2, inputs.movingAverageWindow))

  if (inputs.currentInventory + inputs.pipelineInventory < inputs.forecastDemand) {
    warnings.push({
      code: 'low_inventory_risk',
      label: 'Low inventory risk',
      severity: 'warning',
      detail: 'Inventory plus visible pipeline is below forecast demand.',
    })
  }

  if (inputs.capApplied) {
    warnings.push({
      code: 'order_cap_applied',
      label: 'Order cap applied',
      severity: 'info',
      detail: `The raw JIT order was ${inputs.uncappedOrder}, capped at ${inputs.orderCap} to limit bullwhip risk.`,
    })
  }

  if (inputs.previousBackorder > 0) {
    warnings.push({
      code: 'high_backorder_risk',
      label: 'Backorder pressure',
      severity: inputs.previousBackorder >= inputs.forecastDemand ? 'danger' : 'warning',
      detail: 'Existing backorders are carried into this round and increase total demand.',
    })
  }

  if (inputs.currentInventory > inputs.forecastDemand + inputs.targetSafetyStock * 2) {
    warnings.push({
      code: 'excess_inventory_risk',
      label: 'Excess inventory risk',
      severity: 'info',
      detail: 'Current inventory is high relative to forecast demand and safety stock.',
    })
  }

  if (recentSubmitted.length >= 2) {
    const previousIncoming = recentSubmitted.at(-1)?.incomingOrder ?? 0
    const beforePreviousIncoming = recentSubmitted.at(-2)?.incomingOrder ?? 0

    if (previousIncoming >= beforePreviousIncoming * 1.75 && previousIncoming - beforePreviousIncoming >= 3) {
      warnings.push({
        code: 'sudden_demand_increase',
        label: 'Sudden demand increase',
        severity: 'warning',
        detail: 'The most recent incoming order is sharply higher than the prior one.',
      })
    }

    const previousOutgoing = recentSubmitted.at(-1)?.newOrderToSupplier ?? 0
    if (recommendedQuantity > Math.max(inputs.forecastDemand * 2, previousOutgoing * 1.5, 6)) {
      warnings.push({
        code: 'order_amplification',
        label: 'Order amplification',
        severity: 'warning',
        detail: 'The suggested order is much higher than recent demand; check bullwhip risk.',
      })
    }
  }

  return warnings
}

function forecastRecentDemand(values: number[], fallback: number): number {
  if (values.length === 0) {
    return fallback
  }

  const sorted = [...values].sort((a, b) => a - b)
  const median =
    sorted.length % 2 === 1
      ? sorted[(sorted.length - 1) / 2]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
  const recent = values.at(-1) ?? median
  const average = values.reduce((sum, value) => sum + value, 0) / values.length

  return Math.max(0, roundOne(median * 0.5 + average * 0.3 + recent * 0.2))
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10
}
