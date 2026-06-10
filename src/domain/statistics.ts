import { ROLES, type Game, type Role, type RoleStatisticsPoint } from './types'

export function getRoleHistory(game: Game, role: Role): RoleStatisticsPoint[] {
  let cumulativeCost = 0

  return game.roleRoundStates
    .filter((state) => state.role === role && state.submitted)
    .sort((a, b) => a.roundNumber - b.roundNumber)
    .map((state) => {
      const roundCost = state.totalRoundCost ?? 0
      cumulativeCost += roundCost

      return {
        round: state.roundNumber,
        incomingOrder: state.incomingOrder ?? 0,
        outgoingOrder: state.newOrderToSupplier ?? 0,
        inventory: state.endingInventory ?? 0,
        backorder: state.endingBackorder ?? 0,
        shipped: state.shippedQuantity ?? 0,
        inventoryCost: state.inventoryCost ?? 0,
        backorderCost: state.backorderCost ?? 0,
        roundCost,
        cumulativeCost,
      }
    })
}

export function getTotalCost(game: Game): number {
  return game.roleRoundStates.reduce((sum, state) => sum + (state.totalRoundCost ?? 0), 0)
}

export function getCostByRole(game: Game): Record<Role, number> {
  return ROLES.reduce(
    (acc, role) => {
      acc[role] = getRoleHistory(game, role).reduce((sum, point) => sum + point.roundCost, 0)
      return acc
    },
    {} as Record<Role, number>,
  )
}

export function getChainSummary(game: Game) {
  const submitted = game.roleRoundStates.filter((state) => state.submitted)
  const latestRound = Math.max(0, ...submitted.map((state) => state.roundNumber))
  const latestStates = submitted.filter((state) => state.roundNumber === latestRound)
  const totalInventory = latestStates.reduce((sum, state) => sum + (state.endingInventory ?? 0), 0)
  const totalBackorder = latestStates.reduce((sum, state) => sum + (state.endingBackorder ?? 0), 0)

  const customerDemand = game.roleRoundStates
    .filter((state) => state.role === 'retailer' && state.submitted)
    .reduce((sum, state) => sum + (state.incomingOrder ?? 0), 0)
  const upstreamOrders = game.roleRoundStates
    .filter((state) => state.role === 'distributor' && state.submitted)
    .reduce((sum, state) => sum + (state.newOrderToSupplier ?? 0), 0)

  return {
    latestRound,
    totalInventory,
    totalBackorder,
    totalCost: getTotalCost(game),
    bullwhipRatio: customerDemand > 0 ? upstreamOrders / customerDemand : 0,
  }
}

export function exportGameCsv(game: Game): string {
  const rows = [
    [
      'game_code',
      'round',
      'role',
      'incoming_order',
      'previous_backorder',
      'total_demand',
      'shipped_quantity',
      'ending_inventory',
      'ending_backorder',
      'new_order_to_supplier',
      'recommended_order',
      'inventory_cost',
      'backorder_cost',
      'total_round_cost',
      'timed_out',
    ],
  ]

  for (const state of [...game.roleRoundStates].sort(
    (a, b) => a.roundNumber - b.roundNumber || a.role.localeCompare(b.role),
  )) {
    rows.push([
      game.code,
      String(state.roundNumber),
      state.role,
      String(state.incomingOrder ?? ''),
      String(state.previousBackorder),
      String(state.totalDemand ?? ''),
      String(state.shippedQuantity ?? ''),
      String(state.endingInventory ?? ''),
      String(state.endingBackorder ?? ''),
      String(state.newOrderToSupplier ?? ''),
      String(state.recommendedOrderQuantity),
      String(state.inventoryCost ?? ''),
      String(state.backorderCost ?? ''),
      String(state.totalRoundCost ?? ''),
      String(state.timedOut),
    ])
  }

  return rows.map((row) => row.map(escapeCsv).join(',')).join('\n')
}

function escapeCsv(value: string): string {
  if (!/[",\n]/.test(value)) {
    return value
  }

  return `"${value.replaceAll('"', '""')}"`
}
