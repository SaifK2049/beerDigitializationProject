import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Check,
  ClipboardList,
  Clock3,
  Download,
  Factory,
  Lock,
  LogOut,
  Pause,
  Play,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Truck,
  Users,
} from 'lucide-react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import './App.css'
import {
  advanceRound,
  createGame,
  defaultGameConfig,
  getCurrentRoleState,
  getCurrentRound,
  markRoleJoined,
  maybeAdvanceExpiredRound,
  pauseGame,
  resetGame,
  resumeGame,
  startGame,
  submitRoleRound,
  validateJoin,
} from './domain/engine'
import { getChainSummary, getCostByRole, getRoleHistory, exportGameCsv } from './domain/statistics'
import {
  ROLES,
  compactRoleLabels,
  roleLabels,
  type Game,
  type GameConfig,
  type Role,
  type RoleRoundState,
  type Session,
} from './domain/types'
import { loadPersistedGames, persistGame, subscribeToGames } from './lib/gameRepository'
import { clearLocalData, loadGames, loadSession, replaceGame, saveGames, saveSession } from './lib/localStore'
import { isSupabaseConfigured } from './lib/supabase'

function App() {
  const [games, setGames] = useState<Game[]>(() => loadGames())
  const [session, setSession] = useState<Session | null>(() => loadSession())
  const [now, setNow] = useState(() => Date.now())
  const currentGame = games.find((game) => game.id === session?.gameId) ?? null

  useEffect(() => saveGames(games), [games])
  useEffect(() => saveSession(session), [session])

  useEffect(() => {
    void loadPersistedGames().then(setGames)

    return subscribeToGames((game) => {
      setGames((previous) => replaceGame(previous, game))
    })
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now())
      setGames((previous) => {
        let changedGame: Game | null = null
        const nextGames = previous.map((game) => {
          if (game.id !== session?.gameId) {
            return game
          }

          const nextGame = maybeAdvanceExpiredRound(game, new Date())
          if (nextGame !== game) {
            changedGame = nextGame
          }

          return nextGame
        })

        if (changedGame) {
          void persistGame(changedGame)
        }

        return nextGames
      })
    }, 1000)

    return () => window.clearInterval(interval)
  }, [session?.gameId])

  function upsertGame(game: Game) {
    setGames((previous) => replaceGame(previous, game))
    void persistGame(game)
  }

  function handleCreateGame(name: string, config: GameConfig) {
    const game = createGame({ name, config })
    upsertGame(game)
    setSession({ gameId: game.id, access: 'admin' })
  }

  function handleJoin(game: Game, role: Role | 'admin', pin: string, displayName: string) {
    if (!validateJoin(game, role, pin)) {
      throw new Error('Invalid game code, role, or PIN.')
    }

    if (role === 'admin') {
      setSession({ gameId: game.id, access: 'admin' })
      return
    }

    const joinedGame = markRoleJoined(game, role, displayName)
    upsertGame(joinedGame)
    setSession({ gameId: game.id, access: 'role', role })
  }

  function handleLogout() {
    setSession(null)
  }

  function handleClearLocalData() {
    clearLocalData()
    setGames([])
    setSession(null)
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Digitalisierungsprojekt Supply Chain</p>
          <h1>Beer Game Control Room</h1>
        </div>
        <div className="topbar-actions">
          <StatusPill configured={isSupabaseConfigured} />
          {session ? (
            <button className="icon-button" type="button" onClick={handleLogout} title="Leave session">
              <LogOut size={18} />
            </button>
          ) : null}
        </div>
      </header>

      {!currentGame || !session ? (
        <Home
          games={games}
          onCreate={handleCreateGame}
          onJoin={handleJoin}
          onClearLocalData={handleClearLocalData}
        />
      ) : session.access === 'admin' ? (
        <AdminView
          game={currentGame}
          now={now}
          onUpdate={upsertGame}
          onSwitchSession={setSession}
        />
      ) : session.role ? (
        <RoleView
          game={currentGame}
          role={session.role}
          now={now}
          onUpdate={upsertGame}
          onSwitchSession={setSession}
        />
      ) : null}
    </main>
  )
}

function Home({
  games,
  onCreate,
  onJoin,
  onClearLocalData,
}: {
  games: Game[]
  onCreate: (name: string, config: GameConfig) => void
  onJoin: (game: Game, role: Role | 'admin', pin: string, displayName: string) => void
  onClearLocalData: () => void
}) {
  return (
    <div className="home-grid">
      <CreateGamePanel onCreate={onCreate} />
      <JoinGamePanel games={games} onJoin={onJoin} />
      <section className="panel project-panel">
        <div className="panel-title">
          <ShieldCheck size={20} />
          <h2>Rule Guardrails</h2>
        </div>
        <ul className="rule-list">
          <li>Retailer enters physical customer demand manually each round.</li>
          <li>Roles see only local structured state, history, pipeline, costs, and recommendations.</li>
          <li>No chat, notes, or cross-role free text exists in the app.</li>
          <li>Material delay uses Transport, Wareneingang, then usable Lager inventory.</li>
        </ul>
        <button className="ghost-button danger-text" type="button" onClick={onClearLocalData}>
          <RefreshCcw size={16} />
          Reset local demo data
        </button>
      </section>
    </div>
  )
}

function CreateGamePanel({ onCreate }: { onCreate: (name: string, config: GameConfig) => void }) {
  const [name, setName] = useState('Beer Game Classroom')
  const [config, setConfig] = useState<GameConfig>(defaultGameConfig)

  function updateNumber(key: keyof GameConfig, value: string) {
    const parsed = value === '' ? 0 : Number(value)
    setConfig((previous) => ({ ...previous, [key]: parsed }))
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onCreate(name, config)
  }

  return (
    <section className="panel">
      <div className="panel-title">
        <Plus size={20} />
        <h2>Create Game</h2>
      </div>
      <form className="form-grid" onSubmit={handleSubmit}>
        <label>
          Game name
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <div className="two-col">
          <NumberField label="Rounds" value={config.maxRounds} onChange={(value) => updateNumber('maxRounds', value)} />
          <NumberField label="Round seconds" value={config.roundSeconds} onChange={(value) => updateNumber('roundSeconds', value)} />
          <NumberField label="Starting inventory" value={config.startingInventory} onChange={(value) => updateNumber('startingInventory', value)} />
          <NumberField label="Starting Transport" value={config.startingTransport} onChange={(value) => updateNumber('startingTransport', value)} />
          <NumberField label="Starting Wareneingang" value={config.startingWareneingang} onChange={(value) => updateNumber('startingWareneingang', value)} />
          <NumberField label="Initial role order" value={config.initialIncomingOrder} onChange={(value) => updateNumber('initialIncomingOrder', value)} />
          <NumberField label="Inventory cost" value={config.inventoryCostPerUnit} onChange={(value) => updateNumber('inventoryCostPerUnit', value)} step="0.5" />
          <NumberField label="Backorder cost" value={config.backorderCostPerUnit} onChange={(value) => updateNumber('backorderCostPerUnit', value)} step="0.5" />
          <NumberField label="Safety stock" value={config.targetSafetyStock} onChange={(value) => updateNumber('targetSafetyStock', value)} />
          <NumberField label="Forecast window" value={config.movingAverageWindow} onChange={(value) => updateNumber('movingAverageWindow', value)} />
        </div>
        <label className="check-row">
          <input
            type="checkbox"
            checked={config.demoMode}
            onChange={(event) => setConfig((previous) => ({ ...previous, demoMode: event.target.checked }))}
          />
          Demo mode with predefined customer demand
        </label>
        <button className="primary-button" type="submit">
          <Plus size={18} />
          Create classroom game
        </button>
      </form>
    </section>
  )
}

function JoinGamePanel({
  games,
  onJoin,
}: {
  games: Game[]
  onJoin: (game: Game, role: Role | 'admin', pin: string, displayName: string) => void
}) {
  const [code, setCode] = useState(games[0]?.code ?? '')
  const [role, setRole] = useState<Role | 'admin'>('retailer')
  const [pin, setPin] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    const game = games.find((candidate) => candidate.code === code.trim().toUpperCase())
    if (!game) {
      setError('Game code not found in this browser.')
      return
    }

    try {
      onJoin(game, role, pin, displayName)
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : 'Could not join game.')
    }
  }

  return (
    <section className="panel">
      <div className="panel-title">
        <Users size={20} />
        <h2>Join Game</h2>
      </div>
      <form className="form-grid" onSubmit={handleSubmit}>
        <label>
          Game code
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="ABC123"
          />
        </label>
        <label>
          Role
          <select value={role} onChange={(event) => setRole(event.target.value as Role | 'admin')}>
            <option value="admin">Admin / Evaluator</option>
            {ROLES.map((candidate) => (
              <option value={candidate} key={candidate}>
                {roleLabels[candidate]}
              </option>
            ))}
          </select>
        </label>
        <label>
          PIN
          <input value={pin} onChange={(event) => setPin(event.target.value)} placeholder="Role PIN" />
        </label>
        {role !== 'admin' ? (
          <label>
            Display name
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          </label>
        ) : null}
        {error ? <p className="form-error">{error}</p> : null}
        <button className="primary-button" type="submit">
          <Play size={18} />
          Join
        </button>
      </form>
      {games.length > 0 ? (
        <div className="saved-games">
          <h3>Local games</h3>
          {games.map((game) => (
            <button className="saved-game" type="button" key={game.id} onClick={() => setCode(game.code)}>
              <span>{game.name}</span>
              <strong>{game.code}</strong>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function AdminView({
  game,
  now,
  onUpdate,
  onSwitchSession,
}: {
  game: Game
  now: number
  onUpdate: (game: Game) => void
  onSwitchSession: (session: Session) => void
}) {
  const currentRound = getCurrentRound(game)
  const summary = getChainSummary(game)
  const costs = getCostByRole(game)
  const roundStates = ROLES.map((role) => getCurrentRoleState(game, role)).filter(Boolean) as RoleRoundState[]

  function downloadCsv() {
    const blob = new Blob([exportGameCsv(game)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${game.code}-beer-game-results.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="page-stack">
      <section className="panel admin-hero">
        <div>
          <p className="eyebrow">Admin / Evaluator</p>
          <h2>{game.name}</h2>
          <div className="code-strip">
            <span>Game code</span>
            <strong>{game.code}</strong>
            <span>Admin PIN</span>
            <strong>{game.adminPin}</strong>
          </div>
        </div>
        <Timer game={game} now={now} />
      </section>

      {game.status === 'lobby' ? (
        <LobbyPanel game={game} onStart={() => onUpdate(startGame(game))} onSwitchSession={onSwitchSession} />
      ) : (
        <>
          <section className="toolbar panel">
            <div className="round-meta">
              <span className={`status-dot ${game.status}`}></span>
              <strong>{game.status.toUpperCase()}</strong>
              <span>Round {game.currentRound} of {game.maxRounds}</span>
              {currentRound ? <span>Deadline {formatTime(currentRound.deadlineAt)}</span> : null}
            </div>
            <div className="button-row">
              {game.status === 'active' ? (
                <button className="ghost-button" type="button" onClick={() => onUpdate(pauseGame(game))}>
                  <Pause size={16} />
                  Pause
                </button>
              ) : game.status === 'paused' ? (
                <button className="ghost-button" type="button" onClick={() => onUpdate(resumeGame(game))}>
                  <Play size={16} />
                  Resume
                </button>
              ) : null}
              {game.status === 'active' ? (
                <button className="ghost-button" type="button" onClick={() => onUpdate(advanceRound(game, 'admin'))}>
                  <Clock3 size={16} />
                  Advance
                </button>
              ) : null}
              <button className="ghost-button" type="button" onClick={downloadCsv}>
                <Download size={16} />
                CSV
              </button>
              <button className="ghost-button danger-text" type="button" onClick={() => onUpdate(resetGame(game))}>
                <RefreshCcw size={16} />
                Reset
              </button>
            </div>
          </section>

          <section className="metric-grid">
            <MetricCard icon={<BarChart3 size={18} />} label="Total cost" value={formatNumber(summary.totalCost)} />
            <MetricCard icon={<Truck size={18} />} label="Chain inventory" value={formatNumber(summary.totalInventory)} />
            <MetricCard icon={<AlertTriangle size={18} />} label="Chain backorder" value={formatNumber(summary.totalBackorder)} />
            <MetricCard icon={<Activity size={18} />} label="Bullwhip ratio" value={summary.bullwhipRatio.toFixed(2)} />
          </section>

          <section className="panel">
            <div className="panel-title">
              <ClipboardList size={20} />
              <h2>Current Round State</h2>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Role</th>
                    <th>Submitted</th>
                    <th>Inventory</th>
                    <th>Backorder</th>
                    <th>Incoming</th>
                    <th>Shipped</th>
                    <th>New order</th>
                    <th>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {roundStates.map((state) => (
                    <tr key={state.id}>
                      <td>{compactRoleLabels[state.role]}</td>
                      <td>{state.submitted ? <Check size={16} /> : <Clock3 size={16} />}</td>
                      <td>{state.endingInventory ?? state.startingInventory}</td>
                      <td>{state.endingBackorder ?? state.previousBackorder}</td>
                      <td>{state.incomingOrder ?? 'Physical card'}</td>
                      <td>{state.shippedQuantity ?? '-'}</td>
                      <td>{state.newOrderToSupplier ?? '-'}</td>
                      <td>{formatNumber(state.totalRoundCost ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <div className="panel-title">
              <BarChart3 size={20} />
              <h2>Cost By Role</h2>
            </div>
            <div className="cost-grid">
              {ROLES.map((role) => (
                <div className="mini-card" key={role}>
                  <span>{compactRoleLabels[role]}</span>
                  <strong>{formatNumber(costs[role])}</strong>
                </div>
              ))}
            </div>
            <AdminChart game={game} />
          </section>
        </>
      )}
    </div>
  )
}

function LobbyPanel({
  game,
  onStart,
  onSwitchSession,
}: {
  game: Game
  onStart: () => void
  onSwitchSession: (session: Session) => void
}) {
  return (
    <section className="panel">
      <div className="panel-title">
        <Users size={20} />
        <h2>Lobby</h2>
      </div>
      <div className="role-grid">
        {game.roleAssignments.map((assignment) => (
          <article className="role-card" key={assignment.role}>
            <div>
              <h3>{compactRoleLabels[assignment.role]}</h3>
              <p>{assignment.joinedAt ? assignment.displayName || 'Joined' : 'Waiting'}</p>
            </div>
            <div className="pin-box">
              <span>PIN</span>
              <strong>{assignment.pin}</strong>
            </div>
            <button
              className="ghost-button"
              type="button"
              onClick={() => onSwitchSession({ gameId: game.id, access: 'role', role: assignment.role })}
            >
              Open role
            </button>
          </article>
        ))}
      </div>
      <button className="primary-button" type="button" onClick={onStart}>
        <Play size={18} />
        Start round 1
      </button>
    </section>
  )
}

function RoleView({
  game,
  role,
  now,
  onUpdate,
  onSwitchSession,
}: {
  game: Game
  role: Role
  now: number
  onUpdate: (game: Game) => void
  onSwitchSession: (session: Session) => void
}) {
  const state = getCurrentRoleState(game, role)
  const history = getRoleHistory(game, role)

  if (game.status === 'lobby') {
    return (
      <section className="panel waiting-panel">
        <h2>{roleLabels[role]}</h2>
        <p>Waiting for the admin to start the game.</p>
      </section>
    )
  }

  if (!state) {
    return (
      <section className="panel waiting-panel">
        <h2>{roleLabels[role]}</h2>
        <p>No active round state is available.</p>
      </section>
    )
  }

  return (
    <div className="page-stack">
      <section className="panel role-hero">
        <div>
          <p className="eyebrow">Role dashboard</p>
          <h2>{roleLabels[role]}</h2>
          <p className="muted">Local structured transparency only.</p>
        </div>
        <div className="hero-actions">
          <Timer game={game} now={now} />
          <button className="ghost-button" type="button" onClick={() => onSwitchSession({ gameId: game.id, access: 'admin' })}>
            <ShieldCheck size={16} />
            Admin
          </button>
        </div>
      </section>

      <section className="metric-grid">
        <MetricCard icon={<Factory size={18} />} label="Usable Lager" value={formatNumber(state.startingInventory)} />
        <MetricCard icon={<AlertTriangle size={18} />} label="Previous backorder" value={formatNumber(state.previousBackorder)} />
        <MetricCard icon={<Truck size={18} />} label="Transport moved" value={formatNumber(state.materialMovedToWareneingang)} />
        <MetricCard icon={<ClipboardList size={18} />} label="Recommendation" value={formatNumber(state.recommendedOrderQuantity)} />
      </section>

      <section className="role-layout">
        <article className="panel">
          <div className="panel-title">
            {state.submitted ? <Lock size={20} /> : <ClipboardList size={20} />}
            <h2>Round {game.currentRound} Workflow</h2>
          </div>
          <ol className="workflow-list">
            <li>
              <strong>Wareneingang to Lager:</strong> {state.materialMovedToInventory} units became usable.
            </li>
            <li>
              <strong>Transport to Wareneingang:</strong> {state.materialMovedToWareneingang} units will be usable next round.
            </li>
            <li>
              <strong>Incoming order:</strong>{' '}
              {role === 'retailer'
                ? state.submitted
                  ? state.incomingOrder
                  : 'Enter the physical customer card.'
                : state.incomingOrder}
            </li>
          </ol>

          {state.submitted ? (
            <SubmittedState state={state} />
          ) : (
            <RoleSubmissionForm key={state.id} game={game} role={role} state={state} onUpdate={onUpdate} />
          )}
        </article>

        <aside className="panel">
          <div className="panel-title">
            <Activity size={20} />
            <h2>Decision Support</h2>
          </div>
          <div className="recommendation">
            <span>Suggested order</span>
            <strong>{state.recommendedOrderQuantity}</strong>
            <p>{state.recommendationReason}</p>
          </div>
          <div className="formula-grid">
            <MiniMetric label="Forecast" value={state.recommendationInputs.forecastDemand.toFixed(1)} />
            <MiniMetric label="Backorder" value={state.recommendationInputs.previousBackorder} />
            <MiniMetric label="Safety stock" value={state.recommendationInputs.targetSafetyStock} />
            <MiniMetric label="Inventory" value={state.recommendationInputs.currentInventory} />
            <MiniMetric label="Pipeline" value={state.recommendationInputs.pipelineInventory} />
          </div>
          {state.warnings.length > 0 ? (
            <div className="warning-list">
              {state.warnings.map((warning) => (
                <div className={`warning ${warning.severity}`} key={warning.code}>
                  <AlertTriangle size={16} />
                  <div>
                    <strong>{warning.label}</strong>
                    <p>{warning.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No active warning indicators.</p>
          )}
        </aside>
      </section>

      <section className="panel">
        <div className="panel-title">
          <BarChart3 size={20} />
          <h2>Own History</h2>
        </div>
        {history.length > 0 ? <RoleChart data={history} /> : <p className="muted">History appears after the first submitted round.</p>}
      </section>
    </div>
  )
}

function SubmittedState({ state }: { state: RoleRoundState }) {
  return (
    <div className="submitted-grid">
      <MiniMetric label="Total demand" value={state.totalDemand ?? 0} />
      <MiniMetric label="Shipped" value={state.shippedQuantity ?? 0} />
      <MiniMetric label="Ending inventory" value={state.endingInventory ?? 0} />
      <MiniMetric label="Ending backorder" value={state.endingBackorder ?? 0} />
      <MiniMetric label="Round cost" value={formatNumber(state.totalRoundCost ?? 0)} />
      <MiniMetric label="Locked" value={state.timedOut ? 'Timeout' : 'Submitted'} />
    </div>
  )
}

function RoleSubmissionForm({
  game,
  role,
  state,
  onUpdate,
}: {
  game: Game
  role: Role
  state: RoleRoundState
  onUpdate: (game: Game) => void
}) {
  const [incomingOrder, setIncomingOrder] = useState('')
  const [newOrder, setNewOrder] = useState(
    role === 'producer' ? '0' : String(state.recommendedOrderQuantity),
  )
  const [error, setError] = useState('')

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')

    try {
      const updated = submitRoleRound({
        game,
        role,
        submittedBy: compactRoleLabels[role],
        incomingOrder: role === 'retailer' ? Number(incomingOrder) : undefined,
        newOrderToSupplier: role === 'producer' ? 0 : Number(newOrder),
      })
      onUpdate(updated)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not submit this round.')
    }
  }

  return (
    <form className="form-grid" onSubmit={handleSubmit}>
      {role === 'retailer' ? (
        <NumberField
          label="Physical customer order"
          value={incomingOrder}
          onChange={setIncomingOrder}
          placeholder="Enter card value"
        />
      ) : null}
      {role === 'producer' ? (
        <div className="info-box">
          Producer uses unlimited upstream stock in v1. No supplier order is required.
        </div>
      ) : (
        <NumberField
          label="New order to upstream supplier"
          value={newOrder}
          onChange={setNewOrder}
          placeholder="0"
        />
      )}
      {error ? <p className="form-error">{error}</p> : null}
      <button className="primary-button" type="submit" disabled={game.status !== 'active'}>
        <Check size={18} />
        Submit and lock round
      </button>
    </form>
  )
}

function Timer({ game, now }: { game: Game; now: number }) {
  const round = getCurrentRound(game)
  if (!round || game.status === 'lobby') {
    return <div className="timer idle">Lobby</div>
  }
  if (game.status === 'finished') {
    return <div className="timer idle">Finished</div>
  }
  if (game.status === 'paused') {
    return <div className="timer idle">Paused</div>
  }

  const remaining = Math.max(0, Math.ceil((new Date(round.deadlineAt).getTime() - now) / 1000))
  return (
    <div className={`timer ${remaining <= 10 ? 'urgent' : ''}`}>
      <Clock3 size={18} />
      {remaining}s
    </div>
  )
}

function RoleChart({ data }: { data: ReturnType<typeof getRoleHistory> }) {
  return (
    <div className="chart-frame">
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="round" />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Line type="monotone" dataKey="inventory" stroke="#2563eb" strokeWidth={2} />
          <Line type="monotone" dataKey="backorder" stroke="#dc2626" strokeWidth={2} />
          <Line type="monotone" dataKey="outgoingOrder" stroke="#0f766e" strokeWidth={2} />
          <Line type="monotone" dataKey="cumulativeCost" stroke="#7c3aed" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function AdminChart({ game }: { game: Game }) {
  const data = ROLES.flatMap((role) =>
    getRoleHistory(game, role).map((point) => ({
      ...point,
      role: compactRoleLabels[role],
      roleRound: `${compactRoleLabels[role]} R${point.round}`,
    })),
  )

  if (data.length === 0) {
    return <p className="muted">Statistics appear after submitted rounds.</p>
  }

  return (
    <div className="chart-frame">
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="roleRound" hide />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Line type="monotone" dataKey="cumulativeCost" stroke="#7c3aed" strokeWidth={2} />
          <Line type="monotone" dataKey="inventory" stroke="#2563eb" strokeWidth={2} />
          <Line type="monotone" dataKey="backorder" stroke="#dc2626" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function MetricCard({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) {
  return (
    <article className="metric-card">
      <div className="metric-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function MiniMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="mini-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function NumberField({
  label,
  value,
  onChange,
  step = '1',
  placeholder,
}: {
  label: string
  value: string | number
  onChange: (value: string) => void
  step?: string
  placeholder?: string
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        min="0"
        step={step}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function StatusPill({ configured }: { configured: boolean }) {
  return (
    <div className={`status-pill ${configured ? 'configured' : 'local'}`}>
      {configured ? 'Supabase configured' : 'Local demo mode'}
    </div>
  )
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value)
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value))
}

export default App
