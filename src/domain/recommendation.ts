import type {
  DecisionWarning,
  GameConfig,
  RecommendationInputs,
  Role,
  RoleRoundState,
} from './types'

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
  if (role === 'producer') {
    const inputs: RecommendationInputs = {
      forecastDemand: 0,
      previousBackorder: 0,
      targetSafetyStock: 0,
      currentInventory: 0,
      pipelineInventory: 0,
      movingAverageWindow: config.movingAverageWindow,
    }

    return {
      quantity: 0,
      inputs,
      warnings: [],
      reason: 'Producer uses unlimited upstream stock in v1; no supplier order is required.',
    }
  }

  const recentIncomingOrders = history
    .filter((state) => state.role === role && state.submitted && state.incomingOrder !== null)
    .slice(-config.movingAverageWindow)
    .map((state) => state.incomingOrder ?? 0)

  const forecastDemand =
    recentIncomingOrders.length > 0
      ? average(recentIncomingOrders)
      : config.initialIncomingOrder
  const pipelineInventory = currentState.materialMovedToWareneingang
  const inputs: RecommendationInputs = {
    forecastDemand,
    previousBackorder: currentState.previousBackorder,
    targetSafetyStock: config.targetSafetyStock,
    currentInventory: currentState.startingInventory,
    pipelineInventory,
    movingAverageWindow: config.movingAverageWindow,
  }

  const raw =
    inputs.forecastDemand +
    inputs.previousBackorder +
    inputs.targetSafetyStock -
    inputs.currentInventory -
    inputs.pipelineInventory

  const uncappedQuantity = Math.max(0, Math.round(raw))
  const quantity =
    config.maxOrderQuantity === null
      ? uncappedQuantity
      : Math.min(uncappedQuantity, config.maxOrderQuantity)

  return {
    quantity,
    inputs,
    warnings: buildWarnings(role, quantity, inputs, history),
    reason:
      `Recommended ${quantity}: forecast ${roundOne(inputs.forecastDemand)} + backorder ` +
      `${inputs.previousBackorder} + safety stock ${inputs.targetSafetyStock} - inventory ` +
      `${inputs.currentInventory} - pipeline ${inputs.pipelineInventory}.`,
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

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10
}
