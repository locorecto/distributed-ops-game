import type {
  FlinkScenarioDefinition,
  FlinkSnapshot,
  FlinkMetrics,
  OperatorState,
  OperatorConfig,
  TaskManagerState,
  CheckpointState,
  JobStatus,
} from './types'

// ── Constants ─────────────────────────────────────────────────────────────────

const TICK_RATE_MS = 500
const CHECKPOINT_WINDOW = 20       // ticks to compute failure rate over
const HEALTH_DECAY_PER_FAILURE = 8 // health points lost per active failure
const MAX_CHECKPOINTS_RETAINED = 50
const BACKPRESSURE_THRESHOLD = 0.7
const OOM_HEAP_THRESHOLD = 0.95
const RESTART_DELAY_TICKS = 6      // ticks between restart attempts
const MAX_RESTART_ATTEMPTS = 3

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1)
}

// ── Engine ────────────────────────────────────────────────────────────────────

export class FlinkEngine {
  private scenario: FlinkScenarioDefinition | null = null
  private tickNumber = 0
  private tickInterval: ReturnType<typeof setInterval> | null = null
  private isRunning = false
  private onTickCallback: ((snapshot: FlinkSnapshot) => void) | null = null

  // Mutable state
  private operators = new Map<string, OperatorState>()
  private taskManagers = new Map<string, TaskManagerState>()
  private checkpoints: CheckpointState[] = []
  private activeFailures: string[] = []

  // Job lifecycle
  private jobStatus: JobStatus = 'created'
  private restartCount = 0
  private restartTicksRemaining = 0
  private checkpointIdCounter = 0

  // Injected failure state
  private injectedFailures = new Map<string, Record<string, unknown>>()

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  loadScenario(
    def: FlinkScenarioDefinition,
    callback: (snapshot: FlinkSnapshot) => void,
  ): void {
    this.stop()
    this.reset()
    this.scenario = def
    this.onTickCallback = callback
    this._initTopology(def)
  }

  start(tickMs = TICK_RATE_MS): void {
    if (this.isRunning) return
    this.isRunning = true
    this.jobStatus = 'running'
    this.tickInterval = setInterval(() => this._tick(), tickMs)
  }

  stop(): void {
    if (this.tickInterval) clearInterval(this.tickInterval)
    this.tickInterval = null
    this.isRunning = false
  }

  reset(): void {
    this.stop()
    this.tickNumber = 0
    this.operators.clear()
    this.taskManagers.clear()
    this.checkpoints = []
    this.activeFailures = []
    this.jobStatus = 'created'
    this.restartCount = 0
    this.restartTicksRemaining = 0
    this.checkpointIdCounter = 0
    this.injectedFailures.clear()
  }

  applyAction(_actionId: string): void {
    this.injectedFailures.clear()
    for (const op of this.operators.values()) {
      op.status = 'running'
      op.backpressureRatio = 0
      op.latencyMs = 10
    }
    for (const tm of this.taskManagers.values()) {
      tm.isOnline = true
      tm.heapUsedMb = tm.maxHeapMb * 0.4
      tm.networkBuffersUsed = Math.floor(tm.networkBuffersTotal * 0.3)
    }
  }

  getSnapshot(): FlinkSnapshot {
    return {
      tickNumber: this.tickNumber,
      operators: new Map(this.operators),
      taskManagers: new Map(this.taskManagers),
      checkpoints: [...this.checkpoints],
      metrics: this._computeMetrics(),
      systemHealthScore: this._computeHealthScore(),
      activeFailures: [...this.activeFailures],
    }
  }

  // ── Operator / Config Mutations ───────────────────────────────────────────

  applyOperatorConfig(id: string, patch: Partial<OperatorConfig>): void {
    const op = this.operators.get(id)
    if (!op) return
    op.config = { ...op.config, ...patch }
  }

  applyCheckpointConfig(patch: { intervalMs?: number; timeoutMs?: number; incremental?: boolean }): void {
    if (!this.scenario) return
    if (patch.intervalMs !== undefined) {
      this.scenario.initialTopology.checkpointIntervalMs = patch.intervalMs
    }
    // timeoutMs and incremental stored in injectedFailures as config overrides
    if (patch.timeoutMs !== undefined) {
      this.injectedFailures.set('__checkpoint_timeout__', { timeoutMs: patch.timeoutMs })
    }
    if (patch.incremental !== undefined) {
      this.injectedFailures.set('__incremental__', { enabled: patch.incremental })
    }
  }

  scaleOperator(id: string, parallelism: number): void {
    const op = this.operators.get(id)
    if (!op) return
    op.config = { ...op.config, parallelism: Math.max(1, parallelism) }
  }

  // ── Internal: topology init ───────────────────────────────────────────────

  private _initTopology(def: FlinkScenarioDefinition): void {
    // Init task managers
    for (const tm of def.initialTopology.taskManagers) {
      this.taskManagers.set(tm.id, {
        id: tm.id,
        isOnline: true,
        slots: tm.slots,
        usedSlots: 0,
        heapUsedMb: 0,
        maxHeapMb: tm.maxHeapMb,
        networkBuffersUsed: 0,
        networkBuffersTotal: 64,
      })
    }

    // Init operators
    for (const cfg of def.initialTopology.operators) {
      this.operators.set(cfg.id, {
        config: { ...cfg },
        status: 'running',
        inputRate: cfg.type === 'source' ? 1000 : 0,
        outputRate: cfg.type === 'source' ? 1000 : 0,
        backpressureRatio: 0,
        stateSize: 0,
        latencyMs: 5,
        watermarkMs: cfg.type === 'source' ? Date.now() : null,
        checkpointsCompleted: 0,
        checkpointsFailed: 0,
      })
    }

    // Distribute slots
    this._redistributeSlots()
  }

  private _redistributeSlots(): void {
    const tms = [...this.taskManagers.values()].filter(t => t.isOnline)
    if (tms.length === 0) return
    let totalParallelism = 0
    for (const op of this.operators.values()) totalParallelism += op.config.parallelism
    const perTm = Math.ceil(totalParallelism / tms.length)
    for (const tm of tms) tm.usedSlots = Math.min(perTm, tm.slots)
  }

  // ── Internal: tick ────────────────────────────────────────────────────────

  private _tick(): void {
    this.tickNumber++
    if (!this.scenario) return

    // Inject scheduled failures
    this._injectFailures()

    // Handle restart delay
    if (this.jobStatus === 'restarting') {
      this.restartTicksRemaining--
      if (this.restartTicksRemaining <= 0) {
        this._recoverJob()
      }
      this.onTickCallback?.(this.getSnapshot())
      return
    }

    // Simulate operator pipeline
    this._simulateOperators()

    // Simulate task manager heap
    this._simulateTaskManagers()

    // Simulate checkpoints
    this._simulateCheckpoints()

    // Check for OOM / critical failures
    this._checkCriticalFailures()

    // Emit snapshot
    this.onTickCallback?.(this.getSnapshot())
  }

  // ── Failure injection ─────────────────────────────────────────────────────

  private _injectFailures(): void {
    if (!this.scenario) return
    for (const event of this.scenario.failureScript) {
      if (event.atTick === this.tickNumber) {
        this._applyFailureEvent(event)
      }
    }
  }

  private _applyFailureEvent(event: { type: string; target: string; params: Record<string, unknown> }): void {
    const key = `${event.type}:${event.target}`
    this.injectedFailures.set(key, event.params)
    if (!this.activeFailures.includes(key)) {
      this.activeFailures.push(key)
    }

    switch (event.type) {
      case 'task-manager-down': {
        const tm = this.taskManagers.get(event.target)
        if (tm) {
          tm.isOnline = false
          this._triggerRestart('task manager offline')
        }
        break
      }
      case 'backpressure-spike': {
        const op = this.operators.get(event.target)
        if (op) {
          op.backpressureRatio = (event.params.ratio as number) ?? 0.9
          op.status = 'backpressured'
        }
        break
      }
      case 'checkpoint-timeout': {
        // Mark checkpoint params so simulation uses timeout
        break
      }
      case 'watermark-stall': {
        const op = this.operators.get(event.target)
        if (op && op.watermarkMs !== null) {
          op.watermarkMs -= (event.params.lagMs as number) ?? 30000
        }
        break
      }
      case 'state-backend-oom': {
        const op = this.operators.get(event.target)
        if (op) {
          op.stateSize = (event.params.stateSizeMb as number) ?? 50000
        }
        break
      }
      case 'source-lag': {
        const op = this.operators.get(event.target)
        if (op) {
          op.inputRate = (event.params.rate as number) ?? 100
          op.outputRate = (event.params.rate as number) ?? 100
        }
        break
      }
      case 'slow-operator': {
        const op = this.operators.get(event.target)
        if (op) {
          op.latencyMs = (event.params.latencyMs as number) ?? 5000
          op.status = 'backpressured'
        }
        break
      }
    }
  }

  // ── Operator simulation ───────────────────────────────────────────────────

  private _simulateOperators(): void {
    const ops = [...this.operators.values()]
    const sorted = this._topologicalOrder(ops)

    let upstreamBackpressure = 0

    for (const op of sorted) {
      if (op.status === 'failed') continue

      const params = this.injectedFailures.get(`backpressure-spike:${op.config.id}`) ?? {}
      const slowParams = this.injectedFailures.get(`slow-operator:${op.config.id}`) ?? {}

      // Base throughput relative to parallelism
      const baseThroughput = op.config.parallelism * 1000

      // Slow operator reduces output rate
      const slowFactor = slowParams.latencyMs
        ? clamp(200 / (slowParams.latencyMs as number), 0.01, 1)
        : 1

      // Compute effective input/output
      if (op.config.type === 'source') {
        const sourceRate = (params.rate as number) ?? (this.injectedFailures.get(`source-lag:${op.config.id}`)?.rate as number) ?? baseThroughput
        op.inputRate = sourceRate
        op.outputRate = clamp(sourceRate * slowFactor, 0, baseThroughput)
        op.watermarkMs = (op.watermarkMs ?? Date.now()) + 500  // advance watermark
      } else {
        const upstreamOp = this._getUpstreamOperator(op.config.id, sorted)
        const upstream = upstreamOp?.outputRate ?? baseThroughput
        op.inputRate = upstream
        op.outputRate = clamp(upstream * slowFactor * (1 - upstreamBackpressure * 0.5), 0, baseThroughput)
      }

      // Backpressure from injected spike or downstream pressure
      const injectedBP = params.ratio as number | undefined
      const naturalBP = upstreamBackpressure > BACKPRESSURE_THRESHOLD
        ? upstreamBackpressure * 0.8
        : 0

      op.backpressureRatio = clamp(injectedBP ?? naturalBP, 0, 1)

      if (op.backpressureRatio > BACKPRESSURE_THRESHOLD) {
        op.status = 'backpressured'
        upstreamBackpressure = op.backpressureRatio
      } else {
        op.status = 'running'
        upstreamBackpressure = 0
      }

      // State size grows for stateful operators
      if (op.config.type === 'window' || op.config.type === 'aggregate' || op.config.type === 'map') {
        const stateSizeParams = this.injectedFailures.get(`state-backend-oom:${op.config.id}`)
        if (stateSizeParams) {
          op.stateSize = (stateSizeParams.stateSizeMb as number)
        } else {
          // Natural growth if no TTL
          const hasTtl = this.injectedFailures.get(`__ttl__:${op.config.id}`)
          if (!hasTtl) {
            op.stateSize = Math.min(op.stateSize + op.inputRate * 0.001, 100000)
          } else {
            op.stateSize = Math.max(0, op.stateSize - 10)
          }
        }
      }

      // Latency
      const injectedLatency = slowParams.latencyMs as number | undefined
      if (injectedLatency) {
        op.latencyMs = injectedLatency
      } else {
        op.latencyMs = lerp(op.latencyMs, 5 + op.backpressureRatio * 500, 0.1)
      }

      // Watermark lag for non-source
      if (op.config.type !== 'source' && op.watermarkMs !== null) {
        const upstreamOp = this._getUpstreamOperator(op.config.id, sorted)
        if (upstreamOp?.watermarkMs !== null && upstreamOp?.watermarkMs !== undefined) {
          op.watermarkMs = upstreamOp.watermarkMs
        }
      }
    }
  }

  private _topologicalOrder(ops: OperatorState[]): OperatorState[] {
    const order: OperatorState[] = []
    const typeOrder = ['source', 'filter', 'map', 'keyBy', 'window', 'aggregate', 'sink']
    return [...ops].sort((a, b) =>
      typeOrder.indexOf(a.config.type) - typeOrder.indexOf(b.config.type)
    )
  }

  private _getUpstreamOperator(id: string, sorted: OperatorState[]): OperatorState | undefined {
    const idx = sorted.findIndex(o => o.config.id === id)
    return idx > 0 ? sorted[idx - 1] : undefined
  }

  // ── Task manager heap simulation ──────────────────────────────────────────

  private _simulateTaskManagers(): void {
    const onlineTms = [...this.taskManagers.values()].filter(t => t.isOnline)
    if (onlineTms.length === 0) return

    // Sum total state across all operators
    let totalStateMb = 0
    for (const op of this.operators.values()) {
      totalStateMb += op.stateSize
    }

    // Distribute heap pressure across task managers
    const perTm = totalStateMb / onlineTms.length
    for (const tm of onlineTms) {
      tm.heapUsedMb = clamp(perTm + 512, 0, tm.maxHeapMb * 1.1)
      // Network buffers pressure from backpressure
      const maxBP = Math.max(...[...this.operators.values()].map(o => o.backpressureRatio))
      tm.networkBuffersUsed = Math.round(tm.networkBuffersTotal * clamp(0.3 + maxBP * 0.6, 0, 1))
    }
  }

  // ── Checkpoint simulation ─────────────────────────────────────────────────

  private _simulateCheckpoints(): void {
    if (!this.scenario) return
    const intervalTicks = Math.ceil(this.scenario.initialTopology.checkpointIntervalMs / TICK_RATE_MS)
    if (this.tickNumber % intervalTicks !== 0) return

    const heapPressure = this._computeHeapPressure()
    const totalState = [...this.operators.values()].reduce((s, o) => s + o.stateSize, 0)

    const timeoutMs = (this.injectedFailures.get('__checkpoint_timeout__')?.timeoutMs as number) ?? 60000
    const incremental = (this.injectedFailures.get('__incremental__')?.enabled as boolean) ?? false
    const effectiveState = incremental ? totalState * 0.05 : totalState

    // Checkpoint fails if heap pressure > 80% or state too large for timeout
    const stateTooLarge = effectiveState > 1000 && (effectiveState / 100) * 1000 > timeoutMs
    const oomFail = heapPressure > 0.8

    const checkpointTimeout = this.injectedFailures.has('checkpoint-timeout:__global__')
    const failed = stateTooLarge || oomFail || checkpointTimeout

    const cp: CheckpointState = {
      id: ++this.checkpointIdCounter,
      status: failed ? 'failed' : 'completed',
      duration: failed ? timeoutMs + 1000 : clamp(effectiveState * 10 + 200, 200, timeoutMs),
      stateSize: totalState,
      triggeredAt: this.tickNumber,
      completedAt: failed ? null : this.tickNumber,
    }
    this.checkpoints.push(cp)

    // Trim history
    if (this.checkpoints.length > MAX_CHECKPOINTS_RETAINED) {
      this.checkpoints = this.checkpoints.slice(-MAX_CHECKPOINTS_RETAINED)
    }

    // Update operator checkpoint counters
    for (const op of this.operators.values()) {
      if (failed) op.checkpointsFailed++
      else op.checkpointsCompleted++
    }

    if (failed && !this.activeFailures.includes('checkpoint-timeout:__global__')) {
      this.activeFailures.push('checkpoint-failed')
    }
  }

  // ── Critical failure checks ───────────────────────────────────────────────

  private _checkCriticalFailures(): void {
    for (const tm of this.taskManagers.values()) {
      if (tm.isOnline && tm.heapUsedMb > tm.maxHeapMb * OOM_HEAP_THRESHOLD) {
        tm.isOnline = false
        this.activeFailures.push(`oom:${tm.id}`)
        this._triggerRestart(`TaskManager ${tm.id} OOM`)
      }
    }
  }

  private _triggerRestart(reason: string): void {
    if (this.jobStatus === 'restarting') return
    if (this.restartCount >= MAX_RESTART_ATTEMPTS) {
      this.jobStatus = 'failing'
      return
    }
    this.jobStatus = 'restarting'
    this.restartCount++
    this.restartTicksRemaining = RESTART_DELAY_TICKS
    if (!this.activeFailures.includes('job-restarting')) {
      this.activeFailures.push('job-restarting')
    }
  }

  private _recoverJob(): void {
    this.jobStatus = 'running'
    // Bring task managers back online
    for (const tm of this.taskManagers.values()) {
      if (!tm.isOnline) {
        tm.isOnline = true
        tm.heapUsedMb = tm.maxHeapMb * 0.3
      }
    }
    // Reset operator state sizes
    for (const op of this.operators.values()) {
      if (op.status === 'failed') op.status = 'running'
      op.stateSize = Math.min(op.stateSize, 100)
    }
    this.activeFailures = this.activeFailures.filter(f => f !== 'job-restarting')
    this._redistributeSlots()
  }

  // ── Metrics ───────────────────────────────────────────────────────────────

  private _computeMetrics(): FlinkMetrics {
    const ops = [...this.operators.values()]
    const sources = ops.filter(o => o.config.type === 'source')
    const sinks = ops.filter(o => o.config.type === 'sink')

    const recordsPerSecond = sinks.length > 0
      ? sinks.reduce((s, o) => s + o.outputRate, 0) / sinks.length
      : sources.reduce((s, o) => s + o.outputRate, 0)

    const latencyMs = ops.reduce((s, o) => s + o.latencyMs, 0)

    const backpressureRatio = Math.max(0, ...ops.map(o => o.backpressureRatio))

    // Checkpoint failure rate over recent window
    const recent = this.checkpoints.slice(-CHECKPOINT_WINDOW)
    const checkpointFailureRate = recent.length === 0
      ? 0
      : recent.filter(c => c.status === 'failed').length / recent.length

    const lastCompleted = [...this.checkpoints].reverse().find(c => c.status === 'completed')
    const checkpointDurationMs = lastCompleted?.duration ?? 0

    // Watermark lag: difference between wall-clock sim and min source watermark
    const sourceWatermarks = sources.map(o => o.watermarkMs).filter((w): w is number => w !== null)
    const minWatermark = sourceWatermarks.length > 0 ? Math.min(...sourceWatermarks) : null
    const watermarkLag = minWatermark !== null
      ? clamp(Date.now() - minWatermark, 0, 600000)
      : 0

    const heapPressure = this._computeHeapPressure()

    // Error rate from checkpoint failures and restarts
    const errorRate = clamp(
      checkpointFailureRate * 0.5 + (this.restartCount / (MAX_RESTART_ATTEMPTS + 1)) * 0.5,
      0, 1,
    )

    return {
      jobStatus: this.jobStatus,
      recordsPerSecond,
      latencyMs,
      backpressureRatio,
      checkpointDurationMs,
      checkpointFailureRate,
      restartCount: this.restartCount,
      watermarkLag,
      heapPressure,
      errorRate,
    }
  }

  private _computeHeapPressure(): number {
    const tms = [...this.taskManagers.values()].filter(t => t.isOnline)
    if (tms.length === 0) return 1
    const maxRatio = Math.max(...tms.map(tm => tm.heapUsedMb / tm.maxHeapMb))
    return clamp(maxRatio, 0, 1)
  }

  private _computeHealthScore(): number {
    const metrics = this._computeMetrics()
    let score = 100

    // Job status penalties
    if (metrics.jobStatus === 'restarting') score -= 30
    if (metrics.jobStatus === 'failing') score -= 60
    if (metrics.jobStatus === 'canceled') score -= 80

    // Backpressure
    score -= metrics.backpressureRatio * 40

    // Checkpoint failures
    score -= metrics.checkpointFailureRate * 25

    // Heap pressure
    if (metrics.heapPressure > 0.85) score -= 20
    else if (metrics.heapPressure > 0.7) score -= 10

    // Watermark lag (over 30s is bad)
    if (metrics.watermarkLag > 30000) score -= 15

    // Error rate
    score -= metrics.errorRate * 20

    // Active failures
    score -= this.activeFailures.length * HEALTH_DECAY_PER_FAILURE

    return clamp(Math.round(score), 0, 100)
  }
}
