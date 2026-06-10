import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  Check,
  ClipboardList,
  Clock3,
  Download,
  Factory,
  Languages,
  Lock,
  LogOut,
  Moon,
  Pause,
  Play,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Shuffle,
  Sun,
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
  submitSimulationRound,
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

type Language = 'en' | 'de'
type ThemeMode = 'light' | 'dark'

const LANGUAGE_KEY = 'beer-game.language'
const THEME_KEY = 'beer-game.theme'

const localizedRoleLabels: Record<Language, Record<Role, string>> = {
  en: roleLabels,
  de: {
    retailer: 'Einzelhandel',
    wholesaler: 'Grosshandel',
    distributor: 'Distribution',
    producer: 'Produktion',
  },
}

const text = {
  en: {
    appEyebrow: 'Digitalization Project Supply Chain',
    appTitle: 'Beer Game Control Room',
    light: 'Light',
    dark: 'Dark',
    language: 'Language',
    leaveSession: 'Leave session',
    localMode: 'Local demo mode',
    supabaseMode: 'Supabase configured',
    createGame: 'Create Game',
    gameName: 'Game name',
    rounds: 'Rounds',
    roundSeconds: 'Round seconds',
    startingInventory: 'Starting inventory',
    startingTransport: 'Starting Transport',
    startingWareneingang: 'Starting Wareneingang',
    initialRoleOrder: 'Initial role order',
    inventoryCost: 'Inventory cost',
    backorderCost: 'Backorder cost',
    safetyStock: 'Safety stock',
    forecastWindow: 'Forecast window',
    demoMode: 'Demo mode with predefined customer demand',
    simulationMode: 'Simulation mode with bot roles and random customer demand',
    createClassroomGame: 'Create classroom game',
    joinGame: 'Join Game',
    gameCode: 'Game code',
    role: 'Role',
    pin: 'PIN',
    displayName: 'Display name',
    join: 'Join',
    adminEvaluator: 'Admin / Evaluator',
    gameCodeMissing: 'Game code not found in this browser.',
    joinFailed: 'Could not join game.',
    invalidJoin: 'Invalid game code, role, or PIN.',
    localGames: 'Local games',
    ruleGuardrails: 'Rule Guardrails',
    retailerPhysicalRule: 'Retailer enters physical customer demand manually each round.',
    structuredRule: 'Roles see only local structured state, history, pipeline, costs, and recommendations.',
    noChatRule: 'No chat, notes, or cross-role free text exists in the app.',
    delayRule: 'Material delay uses Transport, Wareneingang, then usable Lager inventory.',
    resetLocalData: 'Reset local demo data',
    adminPin: 'Admin PIN',
    lobby: 'Lobby',
    active: 'ACTIVE',
    paused: 'PAUSED',
    finished: 'FINISHED',
    roundOf: (round: number, max: number) => `Round ${round} of ${max}`,
    deadline: 'Deadline',
    pause: 'Pause',
    resume: 'Resume',
    advance: 'Advance',
    reset: 'Reset',
    totalCost: 'Total cost',
    chainInventory: 'Chain inventory',
    chainBackorder: 'Chain backorder',
    bullwhipRatio: 'Bullwhip ratio',
    currentRoundState: 'Current Round State',
    submitted: 'Submitted',
    inventory: 'Inventory',
    backorder: 'Backorder',
    incoming: 'Incoming',
    shipped: 'Shipped',
    newOrder: 'New order',
    cost: 'Cost',
    physicalCard: 'Physical card',
    costByRole: 'Cost By Role',
    waiting: 'Waiting',
    joined: 'Joined',
    openRole: 'Open role',
    startRoundOne: 'Start round 1',
    startSimulation: 'Start simulation',
    runBotRound: 'Run bot round',
    roleDashboard: 'Role dashboard',
    transparencyOnly: 'Local structured transparency only.',
    admin: 'Admin',
    usableLager: 'Usable Lager',
    previousBackorder: 'Previous backorder',
    transportMoved: 'Transport moved',
    recommendation: 'Recommendation',
    waitingForStart: 'Waiting for the admin to start the game.',
    noRoundState: 'No active round state is available.',
    workflowTitle: (round: number) => `Round ${round} Workflow`,
    wareneingangToLager: 'Wareneingang to Lager',
    becameUsable: 'units became usable.',
    transportToWareneingang: 'Transport to Wareneingang',
    usableNextRound: 'units will be usable next round.',
    incomingOrder: 'Incoming order',
    enterPhysicalCard: 'Enter the physical customer card.',
    decisionSupport: 'Decision Support',
    suggestedOrder: 'Suggested order',
    forecast: 'Forecast',
    pipeline: 'Pipeline',
    noWarnings: 'No active warning indicators.',
    ownHistory: 'Own History',
    historyAfterSubmit: 'History appears after the first submitted round.',
    totalDemand: 'Total demand',
    endingInventory: 'Ending inventory',
    endingBackorder: 'Ending backorder',
    roundCost: 'Round cost',
    locked: 'Locked',
    timeout: 'Timeout',
    physicalCustomerOrder: 'Physical customer order',
    newOrderToSupplier: 'New order to upstream supplier',
    producerUnlimited: 'Producer uses unlimited upstream stock in v1. No supplier order is required.',
    submitAndLock: 'Submit and lock round',
    submitFailed: 'Could not submit this round.',
    timerLobby: 'Lobby',
    timerFinished: 'Finished',
    timerPaused: 'Paused',
    statisticsPending: 'Statistics appear after submitted rounds.',
  },
  de: {
    appEyebrow: 'Digitalisierungsprojekt Supply Chain',
    appTitle: 'Beer Game Steuerzentrale',
    light: 'Hell',
    dark: 'Dunkel',
    language: 'Sprache',
    leaveSession: 'Sitzung verlassen',
    localMode: 'Lokaler Demo-Modus',
    supabaseMode: 'Supabase verbunden',
    createGame: 'Spiel erstellen',
    gameName: 'Spielname',
    rounds: 'Runden',
    roundSeconds: 'Sekunden pro Runde',
    startingInventory: 'Startbestand',
    startingTransport: 'Start Transport',
    startingWareneingang: 'Start Wareneingang',
    initialRoleOrder: 'Anfangsauftrag',
    inventoryCost: 'Lagerkosten',
    backorderCost: 'Rueckstandskosten',
    safetyStock: 'Sicherheitsbestand',
    forecastWindow: 'Prognosefenster',
    demoMode: 'Demo-Modus mit vorgegebener Kundennachfrage',
    simulationMode: 'Simulationsmodus mit Bot-Rollen und zufaelliger Kundennachfrage',
    createClassroomGame: 'Klassenspiel erstellen',
    joinGame: 'Spiel beitreten',
    gameCode: 'Spielcode',
    role: 'Rolle',
    pin: 'PIN',
    displayName: 'Anzeigename',
    join: 'Beitreten',
    adminEvaluator: 'Admin / Auswertung',
    gameCodeMissing: 'Spielcode wurde in diesem Browser nicht gefunden.',
    joinFailed: 'Beitritt nicht moeglich.',
    invalidJoin: 'Ungueltiger Spielcode, Rolle oder PIN.',
    localGames: 'Lokale Spiele',
    ruleGuardrails: 'Spielregeln',
    retailerPhysicalRule: 'Der Einzelhandel gibt die physische Kundennachfrage jede Runde manuell ein.',
    structuredRule: 'Rollen sehen nur eigene strukturierte Daten, Verlauf, Pipeline, Kosten und Empfehlungen.',
    noChatRule: 'Es gibt keinen Chat, keine Notizen und keine freie Kommunikation zwischen Rollen.',
    delayRule: 'Material laeuft ueber Transport, Wareneingang und danach nutzbares Lager.',
    resetLocalData: 'Lokale Demo-Daten zuruecksetzen',
    adminPin: 'Admin-PIN',
    lobby: 'Lobby',
    active: 'AKTIV',
    paused: 'PAUSIERT',
    finished: 'BEENDET',
    roundOf: (round: number, max: number) => `Runde ${round} von ${max}`,
    deadline: 'Frist',
    pause: 'Pausieren',
    resume: 'Fortsetzen',
    advance: 'Weiter',
    reset: 'Zuruecksetzen',
    totalCost: 'Gesamtkosten',
    chainInventory: 'Bestand der Kette',
    chainBackorder: 'Rueckstand der Kette',
    bullwhipRatio: 'Bullwhip-Faktor',
    currentRoundState: 'Aktueller Rundenstatus',
    submitted: 'Abgegeben',
    inventory: 'Bestand',
    backorder: 'Rueckstand',
    incoming: 'Eingang',
    shipped: 'Geliefert',
    newOrder: 'Neue Bestellung',
    cost: 'Kosten',
    physicalCard: 'Physische Karte',
    costByRole: 'Kosten je Rolle',
    waiting: 'Wartet',
    joined: 'Beigetreten',
    openRole: 'Rolle oeffnen',
    startRoundOne: 'Runde 1 starten',
    startSimulation: 'Simulation starten',
    runBotRound: 'Bot-Runde ausfuehren',
    roleDashboard: 'Rollen-Dashboard',
    transparencyOnly: 'Nur lokale strukturierte Transparenz.',
    admin: 'Admin',
    usableLager: 'Nutzbares Lager',
    previousBackorder: 'Vorheriger Rueckstand',
    transportMoved: 'Transport verschoben',
    recommendation: 'Empfehlung',
    waitingForStart: 'Warten, bis der Admin das Spiel startet.',
    noRoundState: 'Kein aktiver Rundenstatus vorhanden.',
    workflowTitle: (round: number) => `Ablauf Runde ${round}`,
    wareneingangToLager: 'Wareneingang ins Lager',
    becameUsable: 'Einheiten wurden nutzbar.',
    transportToWareneingang: 'Transport in Wareneingang',
    usableNextRound: 'Einheiten werden naechste Runde nutzbar.',
    incomingOrder: 'Eingehender Auftrag',
    enterPhysicalCard: 'Physische Kundenkarte eingeben.',
    decisionSupport: 'Entscheidungsunterstuetzung',
    suggestedOrder: 'Bestellvorschlag',
    forecast: 'Prognose',
    pipeline: 'Pipeline',
    noWarnings: 'Keine aktiven Warnhinweise.',
    ownHistory: 'Eigener Verlauf',
    historyAfterSubmit: 'Der Verlauf erscheint nach der ersten abgegebenen Runde.',
    totalDemand: 'Gesamtnachfrage',
    endingInventory: 'Endbestand',
    endingBackorder: 'End-Rueckstand',
    roundCost: 'Rundenkosten',
    locked: 'Gesperrt',
    timeout: 'Zeitablauf',
    physicalCustomerOrder: 'Physischer Kundenauftrag',
    newOrderToSupplier: 'Neue Bestellung an vorgelagerte Rolle',
    producerUnlimited: 'Produktion nutzt in v1 unbegrenzten vorgelagerten Bestand. Keine Bestellung erforderlich.',
    submitAndLock: 'Runde abgeben und sperren',
    submitFailed: 'Diese Runde konnte nicht abgegeben werden.',
    timerLobby: 'Lobby',
    timerFinished: 'Beendet',
    timerPaused: 'Pausiert',
    statisticsPending: 'Statistiken erscheinen nach abgegebenen Runden.',
  },
} satisfies Record<Language, Record<string, string | ((a: number, b: number) => string) | ((a: number) => string)>>

type TextMap = typeof text.en

const PreferencesContext = createContext<{
  language: Language
  theme: ThemeMode
  t: TextMap
  setLanguage: (language: Language) => void
  setTheme: (theme: ThemeMode) => void
} | null>(null)

function usePreferences() {
  const value = useContext(PreferencesContext)
  if (!value) {
    throw new Error('Preferences context is missing.')
  }

  return value
}

function loadLanguage(): Language {
  return localStorage.getItem(LANGUAGE_KEY) === 'de' ? 'de' : 'en'
}

function loadTheme(): ThemeMode {
  return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'
}

function App() {
  const [games, setGames] = useState<Game[]>(() => loadGames())
  const [session, setSession] = useState<Session | null>(() => loadSession())
  const [language, setLanguageState] = useState<Language>(() => loadLanguage())
  const [theme, setThemeState] = useState<ThemeMode>(() => loadTheme())
  const [now, setNow] = useState(() => Date.now())
  const currentGame = games.find((game) => game.id === session?.gameId) ?? null

  useEffect(() => saveGames(games), [games])
  useEffect(() => saveSession(session), [session])

  function setLanguage(languageValue: Language) {
    setLanguageState(languageValue)
    localStorage.setItem(LANGUAGE_KEY, languageValue)
  }

  function setTheme(themeValue: ThemeMode) {
    setThemeState(themeValue)
    localStorage.setItem(THEME_KEY, themeValue)
  }

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
      throw new Error(text[language].invalidJoin as string)
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
    <PreferencesContext.Provider value={{ language, theme, t: text[language], setLanguage, setTheme }}>
      <main className={`app-shell theme-${theme}`} lang={language}>
        <header className="topbar">
          <div>
            <p className="eyebrow">{text[language].appEyebrow as string}</p>
            <h1>{text[language].appTitle as string}</h1>
          </div>
          <div className="topbar-actions">
            <PreferenceControls />
            <StatusPill configured={isSupabaseConfigured} />
            {session ? (
              <button className="icon-button" type="button" onClick={handleLogout} title={text[language].leaveSession as string}>
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
    </PreferencesContext.Provider>
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
  const { t } = usePreferences()

  return (
    <div className="home-grid">
      <CreateGamePanel onCreate={onCreate} />
      <JoinGamePanel games={games} onJoin={onJoin} />
      <section className="panel project-panel">
        <div className="panel-title">
          <ShieldCheck size={20} />
          <h2>{t.ruleGuardrails}</h2>
        </div>
        <ul className="rule-list">
          <li>{t.retailerPhysicalRule}</li>
          <li>{t.structuredRule}</li>
          <li>{t.noChatRule}</li>
          <li>{t.delayRule}</li>
        </ul>
        <button className="ghost-button danger-text" type="button" onClick={onClearLocalData}>
          <RefreshCcw size={16} />
          {t.resetLocalData}
        </button>
      </section>
    </div>
  )
}

function CreateGamePanel({ onCreate }: { onCreate: (name: string, config: GameConfig) => void }) {
  const { t } = usePreferences()
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
        <h2>{t.createGame}</h2>
      </div>
      <form className="form-grid" onSubmit={handleSubmit}>
        <label>
          {t.gameName}
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <div className="two-col">
          <NumberField label={t.rounds} value={config.maxRounds} onChange={(value) => updateNumber('maxRounds', value)} />
          <NumberField label={t.roundSeconds} value={config.roundSeconds} onChange={(value) => updateNumber('roundSeconds', value)} />
          <NumberField label={t.startingInventory} value={config.startingInventory} onChange={(value) => updateNumber('startingInventory', value)} />
          <NumberField label={t.startingTransport} value={config.startingTransport} onChange={(value) => updateNumber('startingTransport', value)} />
          <NumberField label={t.startingWareneingang} value={config.startingWareneingang} onChange={(value) => updateNumber('startingWareneingang', value)} />
          <NumberField label={t.initialRoleOrder} value={config.initialIncomingOrder} onChange={(value) => updateNumber('initialIncomingOrder', value)} />
          <NumberField label={t.inventoryCost} value={config.inventoryCostPerUnit} onChange={(value) => updateNumber('inventoryCostPerUnit', value)} step="0.5" />
          <NumberField label={t.backorderCost} value={config.backorderCostPerUnit} onChange={(value) => updateNumber('backorderCostPerUnit', value)} step="0.5" />
          <NumberField label={t.safetyStock} value={config.targetSafetyStock} onChange={(value) => updateNumber('targetSafetyStock', value)} />
          <NumberField label={t.forecastWindow} value={config.movingAverageWindow} onChange={(value) => updateNumber('movingAverageWindow', value)} />
        </div>
        <label className="check-row">
          <input
            type="checkbox"
            checked={config.demoMode}
            onChange={(event) => setConfig((previous) => ({
              ...previous,
              demoMode: event.target.checked,
              simulationMode: event.target.checked ? false : previous.simulationMode,
            }))}
          />
          {t.demoMode}
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={config.simulationMode}
            onChange={(event) => setConfig((previous) => ({
              ...previous,
              simulationMode: event.target.checked,
              demoMode: event.target.checked ? false : previous.demoMode,
            }))}
          />
          {t.simulationMode}
        </label>
        <button className="primary-button" type="submit">
          <Plus size={18} />
          {t.createClassroomGame}
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
  const { language, t } = usePreferences()
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
      setError(t.gameCodeMissing)
      return
    }

    try {
      onJoin(game, role, pin, displayName)
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : t.joinFailed)
    }
  }

  return (
    <section className="panel">
      <div className="panel-title">
        <Users size={20} />
        <h2>{t.joinGame}</h2>
      </div>
      <form className="form-grid" onSubmit={handleSubmit}>
        <label>
          {t.gameCode}
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="ABC123"
          />
        </label>
        <label>
          {t.role}
          <select value={role} onChange={(event) => setRole(event.target.value as Role | 'admin')}>
            <option value="admin">{t.adminEvaluator}</option>
            {ROLES.map((candidate) => (
              <option value={candidate} key={candidate}>
                {localizedRoleLabels[language][candidate]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.pin}
          <input value={pin} onChange={(event) => setPin(event.target.value)} placeholder={t.pin} />
        </label>
        {role !== 'admin' ? (
          <label>
            {t.displayName}
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          </label>
        ) : null}
        {error ? <p className="form-error">{error}</p> : null}
        <button className="primary-button" type="submit">
          <Play size={18} />
          {t.join}
        </button>
      </form>
      {games.length > 0 ? (
        <div className="saved-games">
          <h3>{t.localGames}</h3>
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
  const { language, t } = usePreferences()
  const currentRound = getCurrentRound(game)
  const summary = getChainSummary(game)
  const costs = getCostByRole(game)
  const roundStates = ROLES.map((role) => getCurrentRoleState(game, role)).filter(Boolean) as RoleRoundState[]
  const hasPendingRoundState = roundStates.some((state) => !state.submitted)

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
          <p className="eyebrow">{t.adminEvaluator}</p>
          <h2>{game.name}</h2>
          <div className="code-strip">
            <span>{t.gameCode}</span>
            <strong>{game.code}</strong>
            <span>{t.adminPin}</span>
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
              <strong>{t[game.status]}</strong>
              <span>{t.roundOf(game.currentRound, game.maxRounds)}</span>
              {currentRound ? <span>{t.deadline} {formatTime(currentRound.deadlineAt, language)}</span> : null}
            </div>
            <div className="button-row">
              {game.status === 'active' ? (
                <button className="ghost-button" type="button" onClick={() => onUpdate(pauseGame(game))}>
                  <Pause size={16} />
                  {t.pause}
                </button>
              ) : game.status === 'paused' ? (
                <button className="ghost-button" type="button" onClick={() => onUpdate(resumeGame(game))}>
                  <Play size={16} />
                  {t.resume}
                </button>
              ) : null}
              {game.status === 'active' ? (
                <button className="ghost-button" type="button" onClick={() => onUpdate(advanceRound(game, 'admin'))}>
                  <Clock3 size={16} />
                  {t.advance}
                </button>
              ) : null}
              {game.status === 'active' && game.config.simulationMode ? (
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => onUpdate(submitSimulationRound(game))}
                  disabled={!hasPendingRoundState}
                >
                  <Bot size={16} />
                  {t.runBotRound}
                </button>
              ) : null}
              <button className="ghost-button" type="button" onClick={downloadCsv}>
                <Download size={16} />
                CSV
              </button>
              <button className="ghost-button danger-text" type="button" onClick={() => onUpdate(resetGame(game))}>
                <RefreshCcw size={16} />
                {t.reset}
              </button>
            </div>
          </section>

          <section className="metric-grid">
            <MetricCard icon={<BarChart3 size={18} />} label={t.totalCost} value={formatEuro(summary.totalCost, language)} />
            <MetricCard icon={<Truck size={18} />} label={t.chainInventory} value={formatNumber(summary.totalInventory, language)} />
            <MetricCard icon={<AlertTriangle size={18} />} label={t.chainBackorder} value={formatNumber(summary.totalBackorder, language)} />
            <MetricCard icon={<Activity size={18} />} label={t.bullwhipRatio} value={summary.bullwhipRatio.toFixed(2)} />
          </section>

          <section className="panel">
            <div className="panel-title">
              <ClipboardList size={20} />
              <h2>{t.currentRoundState}</h2>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t.role}</th>
                    <th>{t.submitted}</th>
                    <th>{t.inventory}</th>
                    <th>{t.backorder}</th>
                    <th>{t.incoming}</th>
                    <th>{t.shipped}</th>
                    <th>{t.newOrder}</th>
                    <th>{t.cost}</th>
                  </tr>
                </thead>
                <tbody>
                  {roundStates.map((state) => (
                    <tr key={state.id}>
                      <td>{localizedRoleLabels[language][state.role]}</td>
                      <td>{state.submitted ? <Check size={16} /> : <Clock3 size={16} />}</td>
                      <td>{state.endingInventory ?? state.startingInventory}</td>
                      <td>{state.endingBackorder ?? state.previousBackorder}</td>
                      <td>{state.incomingOrder ?? t.physicalCard}</td>
                      <td>{state.shippedQuantity ?? '-'}</td>
                      <td>{state.newOrderToSupplier ?? '-'}</td>
                      <td>{formatEuro(state.totalRoundCost ?? 0, language)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <div className="panel-title">
              <BarChart3 size={20} />
              <h2>{t.costByRole}</h2>
            </div>
            <div className="cost-grid">
              {ROLES.map((role) => (
                <div className="mini-card" key={role}>
                  <span>{localizedRoleLabels[language][role]}</span>
                  <strong>{formatEuro(costs[role], language)}</strong>
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
  const { language, t } = usePreferences()

  return (
    <section className="panel">
      <div className="panel-title">
        <Users size={20} />
        <h2>{t.lobby}</h2>
      </div>
      <div className="role-grid">
        {game.roleAssignments.map((assignment) => (
          <article className="role-card" key={assignment.role}>
            <div>
              <h3>{localizedRoleLabels[language][assignment.role]}</h3>
              <p>{assignment.joinedAt ? assignment.displayName || t.joined : t.waiting}</p>
            </div>
            <div className="pin-box">
              <span>{t.pin}</span>
              <strong>{assignment.pin}</strong>
            </div>
            <button
              className="ghost-button"
              type="button"
              onClick={() => onSwitchSession({ gameId: game.id, access: 'role', role: assignment.role })}
            >
              {t.openRole}
            </button>
          </article>
        ))}
      </div>
      <button className="primary-button" type="button" onClick={onStart}>
        {game.config.simulationMode ? <Shuffle size={18} /> : <Play size={18} />}
        {game.config.simulationMode ? t.startSimulation : t.startRoundOne}
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
  const { language, t } = usePreferences()
  const state = getCurrentRoleState(game, role)
  const history = getRoleHistory(game, role)

  if (game.status === 'lobby') {
    return (
      <section className="panel waiting-panel">
        <h2>{localizedRoleLabels[language][role]}</h2>
        <p>{t.waitingForStart}</p>
      </section>
    )
  }

  if (!state) {
    return (
      <section className="panel waiting-panel">
        <h2>{localizedRoleLabels[language][role]}</h2>
        <p>{t.noRoundState}</p>
      </section>
    )
  }

  return (
    <div className="page-stack">
      <section className="panel role-hero">
        <div>
          <p className="eyebrow">{t.roleDashboard}</p>
          <h2>{localizedRoleLabels[language][role]}</h2>
          <p className="muted">{t.transparencyOnly}</p>
        </div>
        <div className="hero-actions">
          <Timer game={game} now={now} />
          <button className="ghost-button" type="button" onClick={() => onSwitchSession({ gameId: game.id, access: 'admin' })}>
            <ShieldCheck size={16} />
            {t.admin}
          </button>
        </div>
      </section>

      <section className="metric-grid">
        <MetricCard icon={<Factory size={18} />} label={t.usableLager} value={formatNumber(state.startingInventory, language)} />
        <MetricCard icon={<AlertTriangle size={18} />} label={t.previousBackorder} value={formatNumber(state.previousBackorder, language)} />
        <MetricCard icon={<Truck size={18} />} label={t.transportMoved} value={formatNumber(state.materialMovedToWareneingang, language)} />
        <MetricCard icon={<ClipboardList size={18} />} label={t.recommendation} value={formatNumber(state.recommendedOrderQuantity, language)} />
      </section>

      <section className="role-layout">
        <article className="panel">
          <div className="panel-title">
            {state.submitted ? <Lock size={20} /> : <ClipboardList size={20} />}
            <h2>{t.workflowTitle(game.currentRound)}</h2>
          </div>
          <ol className="workflow-list">
            <li>
              <strong>{t.wareneingangToLager}:</strong> {state.materialMovedToInventory} {t.becameUsable}
            </li>
            <li>
              <strong>{t.transportToWareneingang}:</strong> {state.materialMovedToWareneingang} {t.usableNextRound}
            </li>
            <li>
              <strong>{t.incomingOrder}:</strong>{' '}
              {role === 'retailer'
                ? state.submitted
                  ? state.incomingOrder
                  : t.enterPhysicalCard
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
            <h2>{t.decisionSupport}</h2>
          </div>
          <div className="recommendation">
            <span>{t.suggestedOrder}</span>
            <strong>{state.recommendedOrderQuantity}</strong>
            <p>{formatRecommendationReason(state, language)}</p>
          </div>
          <div className="formula-grid">
            <MiniMetric label={t.forecast} value={state.recommendationInputs.forecastDemand.toFixed(1)} />
            <MiniMetric label={t.backorder} value={state.recommendationInputs.previousBackorder} />
            <MiniMetric label={t.safetyStock} value={state.recommendationInputs.targetSafetyStock} />
            <MiniMetric label={t.inventory} value={state.recommendationInputs.currentInventory} />
            <MiniMetric label={t.pipeline} value={state.recommendationInputs.pipelineInventory} />
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
            <p className="muted">{t.noWarnings}</p>
          )}
        </aside>
      </section>

      <section className="panel">
        <div className="panel-title">
          <BarChart3 size={20} />
          <h2>{t.ownHistory}</h2>
        </div>
        {history.length > 0 ? <RoleChart data={history} /> : <p className="muted">{t.historyAfterSubmit}</p>}
      </section>
    </div>
  )
}

function SubmittedState({ state }: { state: RoleRoundState }) {
  const { language, t } = usePreferences()

  return (
    <div className="submitted-grid">
      <MiniMetric label={t.totalDemand} value={formatNumber(state.totalDemand ?? 0, language)} />
      <MiniMetric label={t.shipped} value={formatNumber(state.shippedQuantity ?? 0, language)} />
      <MiniMetric label={t.endingInventory} value={formatNumber(state.endingInventory ?? 0, language)} />
      <MiniMetric label={t.endingBackorder} value={formatNumber(state.endingBackorder ?? 0, language)} />
      <MiniMetric label={t.roundCost} value={formatEuro(state.totalRoundCost ?? 0, language)} />
      <MiniMetric label={t.locked} value={state.timedOut ? t.timeout : t.submitted} />
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
  const { t } = usePreferences()
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
      setError(submitError instanceof Error ? submitError.message : t.submitFailed)
    }
  }

  return (
    <form className="form-grid" onSubmit={handleSubmit}>
      {role === 'retailer' ? (
        <NumberField
          label={t.physicalCustomerOrder}
          value={incomingOrder}
          onChange={setIncomingOrder}
          placeholder={t.enterPhysicalCard}
        />
      ) : null}
      {role === 'producer' ? (
        <div className="info-box">
          {t.producerUnlimited}
        </div>
      ) : (
        <NumberField
          label={t.newOrderToSupplier}
          value={newOrder}
          onChange={setNewOrder}
          placeholder="0"
        />
      )}
      {error ? <p className="form-error">{error}</p> : null}
      <button className="primary-button" type="submit" disabled={game.status !== 'active'}>
        <Check size={18} />
        {t.submitAndLock}
      </button>
    </form>
  )
}

function Timer({ game, now }: { game: Game; now: number }) {
  const { t } = usePreferences()
  const round = getCurrentRound(game)
  if (!round || game.status === 'lobby') {
    return <div className="timer idle">{t.timerLobby}</div>
  }
  if (game.status === 'finished') {
    return <div className="timer idle">{t.timerFinished}</div>
  }
  if (game.status === 'paused') {
    return <div className="timer idle">{t.timerPaused}</div>
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
  const { language } = usePreferences()

  return (
    <div className="chart-frame">
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="round" />
          <YAxis allowDecimals={false} />
          <Tooltip formatter={(value, name) => formatChartValue(Number(value), String(name), language)} />
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
  const { language, t } = usePreferences()
  const data = ROLES.flatMap((role) =>
    getRoleHistory(game, role).map((point) => ({
      ...point,
      role: compactRoleLabels[role],
      roleRound: `${compactRoleLabels[role]} R${point.round}`,
    })),
  )

  if (data.length === 0) {
    return <p className="muted">{t.statisticsPending}</p>
  }

  return (
    <div className="chart-frame">
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="roleRound" hide />
          <YAxis allowDecimals={false} />
          <Tooltip formatter={(value, name) => formatChartValue(Number(value), String(name), language)} />
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
  const { t } = usePreferences()

  return (
    <div className={`status-pill ${configured ? 'configured' : 'local'}`}>
      {configured ? t.supabaseMode : t.localMode}
    </div>
  )
}

function PreferenceControls() {
  const { language, setLanguage, theme, setTheme, t } = usePreferences()

  return (
    <div className="preference-controls">
      <label className="compact-select">
        <Languages size={16} />
        <span className="sr-only">{t.language}</span>
        <select value={language} onChange={(event) => setLanguage(event.target.value as Language)}>
          <option value="en">EN</option>
          <option value="de">DE</option>
        </select>
      </label>
      <div className="theme-toggle" aria-label={t.light}>
        <button
          className={theme === 'light' ? 'active' : ''}
          type="button"
          onClick={() => setTheme('light')}
          title={t.light}
        >
          <Sun size={16} />
          <span>{t.light}</span>
        </button>
        <button
          className={theme === 'dark' ? 'active' : ''}
          type="button"
          onClick={() => setTheme('dark')}
          title={t.dark}
        >
          <Moon size={16} />
          <span>{t.dark}</span>
        </button>
      </div>
    </div>
  )
}

function formatNumber(value: number, language: Language = 'en'): string {
  return new Intl.NumberFormat(language === 'de' ? 'de-DE' : 'en-US', { maximumFractionDigits: 1 }).format(value)
}

function formatEuro(value: number, language: Language = 'de'): string {
  return new Intl.NumberFormat(language === 'de' ? 'de-DE' : 'en-US', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(value)
}

function formatChartValue(value: number, name: string, language: Language): [string, string] {
  const formattedName = name.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase())
  return [name.toLowerCase().includes('cost') ? formatEuro(value, language) : formatNumber(value, language), formattedName]
}

function formatRecommendationReason(state: RoleRoundState, language: Language): string {
  const inputs = state.recommendationInputs
  if (state.role === 'producer') {
    return language === 'de'
      ? 'Produktion nutzt in v1 unbegrenzten vorgelagerten Bestand; keine Bestellung erforderlich.'
      : 'Producer uses unlimited upstream stock in v1; no supplier order is required.'
  }

  if (language === 'de') {
    return `Vorschlag ${state.recommendedOrderQuantity}: Prognose ${formatNumber(inputs.forecastDemand, language)} + Rueckstand ${inputs.previousBackorder} + Sicherheitsbestand ${inputs.targetSafetyStock} - Bestand ${inputs.currentInventory} - Pipeline ${inputs.pipelineInventory}.`
  }

  return state.recommendationReason
}

function formatTime(value: string, language: Language): string {
  return new Intl.DateTimeFormat(language === 'de' ? 'de-DE' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value))
}

export default App
