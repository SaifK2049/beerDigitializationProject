export const ROLES = ['retailer', 'wholesaler', 'distributor', 'producer'] as const

export type Role = (typeof ROLES)[number]
export type Endpoint = Role | 'customer' | 'source'
export type GameStatus = 'lobby' | 'active' | 'paused' | 'finished'
export type RoundStatus = 'pending' | 'active' | 'locked'
export type TransparencyLevel = 'local_structured'
export type IncomingOrderSource = 'physical_customer_card' | 'downstream_previous_order'

export const roleLabels: Record<Role, string> = {
  retailer: 'Einzelhandel / Retailer',
  wholesaler: 'Grosshandel / Wholesaler',
  distributor: 'Distribution / Distributor',
  producer: 'Produktion / Producer',
}

export const compactRoleLabels: Record<Role, string> = {
  retailer: 'Retailer',
  wholesaler: 'Wholesaler',
  distributor: 'Distributor',
  producer: 'Producer',
}

export const upstreamRole: Record<Role, Role | null> = {
  retailer: 'wholesaler',
  wholesaler: 'distributor',
  distributor: 'producer',
  producer: null,
}

export const downstreamRole: Record<Role, Role | null> = {
  retailer: null,
  wholesaler: 'retailer',
  distributor: 'wholesaler',
  producer: 'distributor',
}

export interface GameConfig {
  inventoryCostPerUnit: number
  backorderCostPerUnit: number
  startingInventory: number
  startingTransport: number
  startingWareneingang: number
  targetSafetyStock: number
  movingAverageWindow: number
  maxOrderQuantity: number | null
  maxRounds: number
  roundSeconds: number
  initialIncomingOrder: number
  timeoutFallback: 'previous_order_or_zero'
  demoMode: boolean
  demoCustomerDemand: number[]
  simulationMode: boolean
}

export interface RoleAssignment {
  gameId: string
  role: Role
  displayName: string
  pin: string
  joinedAt: string | null
}

export interface Round {
  gameId: string
  roundNumber: number
  status: RoundStatus
  startsAt: string
  deadlineAt: string
  lockedAt: string | null
  advancedBy: string | null
}

export interface RoleRoundState {
  id: string
  gameId: string
  roundNumber: number
  role: Role
  startingInventory: number
  transportBufferBefore: number
  wareneingangBufferBefore: number
  materialMovedToInventory: number
  materialMovedToWareneingang: number
  incomingOrder: number | null
  incomingOrderSource: IncomingOrderSource
  previousBackorder: number
  totalDemand: number | null
  shippedQuantity: number | null
  endingInventory: number | null
  endingBackorder: number | null
  newOrderToSupplier: number | null
  recommendedOrderQuantity: number
  recommendationReason: string
  recommendationInputs: RecommendationInputs
  warnings: DecisionWarning[]
  inventoryCost: number | null
  backorderCost: number | null
  totalRoundCost: number | null
  submittedBy: string | null
  submittedAt: string | null
  submitted: boolean
  timedOut: boolean
}

export interface RecommendationInputs {
  forecastDemand: number
  previousBackorder: number
  targetSafetyStock: number
  currentInventory: number
  pipelineInventory: number
  movingAverageWindow: number
  inventoryPosition: number
  targetInventoryPosition: number
  uncappedOrder: number
  orderCap: number
  capApplied: boolean
}

export interface DecisionWarning {
  code:
    | 'low_inventory_risk'
    | 'high_backorder_risk'
    | 'excess_inventory_risk'
    | 'sudden_demand_increase'
    | 'order_amplification'
    | 'order_cap_applied'
  label: string
  severity: 'info' | 'warning' | 'danger'
  detail: string
}

export interface Order {
  id: string
  gameId: string
  roundNumber: number
  fromRole: Endpoint
  toRole: Endpoint
  quantity: number
  becomesVisibleRound: number
}

export interface Shipment {
  id: string
  gameId: string
  roundNumber: number
  fromRole: Endpoint
  toRole: Endpoint
  quantity: number
  entersTransportRound: number
}

export interface CostSnapshot {
  id: string
  gameId: string
  roundNumber: number
  role: Role
  inventoryCost: number
  backorderCost: number
  totalRoundCost: number
  cumulativeCost: number
}

export interface DecisionRecommendation {
  id: string
  gameId: string
  roundNumber: number
  role: Role
  recommendedQuantity: number
  formulaInputs: RecommendationInputs
  explanation: string
}

export interface AuditLog {
  id: string
  gameId: string
  actor: string
  action: string
  entityType: string
  entityId: string
  before: unknown
  after: unknown
  createdAt: string
}

export interface Game {
  id: string
  code: string
  name: string
  status: GameStatus
  currentRound: number
  maxRounds: number
  adminPin: string
  transparencyLevel: TransparencyLevel
  config: GameConfig
  roleAssignments: RoleAssignment[]
  rounds: Round[]
  roleRoundStates: RoleRoundState[]
  orders: Order[]
  shipments: Shipment[]
  costSnapshots: CostSnapshot[]
  decisionRecommendations: DecisionRecommendation[]
  auditLogs: AuditLog[]
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}

export interface Session {
  gameId: string
  access: 'admin' | 'role'
  role?: Role
}

export interface CreateGameInput {
  name: string
  config: GameConfig
}

export interface SubmitRoundInput {
  game: Game
  role: Role
  submittedBy: string
  incomingOrder?: number
  newOrderToSupplier?: number
  timedOut?: boolean
  autoAdvance?: boolean
}

export interface RoleStatisticsPoint {
  round: number
  incomingOrder: number
  outgoingOrder: number
  inventory: number
  backorder: number
  shipped: number
  inventoryCost: number
  backorderCost: number
  roundCost: number
  cumulativeCost: number
}
