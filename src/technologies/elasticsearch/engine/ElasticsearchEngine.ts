import type {
  ESNodeConfig,
  ESNodeState,
  ESIndexConfig,
  ESIndexStats,
  ESClientConfig,
  ESClientState,
  ESMetrics,
  ESSnapshot,
  ESIndexState,
  ESScenarioDefinition,
} from './types'

// ── Constants ─────────────────────────────────────────────────────────────────

const CIRCUIT_BREAKER_HEAP_THRESHOLD = 0.85
const DISK_WATERMARK_BLOCK = 0.9
const GC_PRESSURE_THRESHOLD = 0.7
const BASE_QUERY_LATENCY_MS = 5
const BASE_INDEX_LATENCY_MS = 2

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}

function jitter(base: number, pct = 0.1): number {
  return base * (1 + (Math.random() - 0.5) * 2 * pct)
}

function countDataNodes(nodes: Map<string, ESNodeState>): number {
  let count = 0
  nodes.forEach(n => {
    if (n.isOnline && n.config.roles.includes('data')) count++
  })
  return count
}

function countMasterEligibleNodes(nodes: Map<string, ESNodeState>): number {
  let count = 0
  nodes.forEach(n => {
    if (n.isOnline && n.config.roles.includes('master')) count++
  })
  return count
}

function electMaster(nodes: Map<string, ESNodeState>): void {
  let elected = false
  nodes.forEach(n => {
    n.isMaster = false
  })
  nodes.forEach(n => {
    if (!elected && n.isOnline && n.config.roles.includes('master')) {
      n.isMaster = true
      elected = true
    }
  })
}

function computeIndexHealth(
  cfg: ESIndexConfig,
  dataNodes: number,
): { health: ESIndexState; unassigned: number } {
  const totalShards = cfg.shards * (cfg.replicas + 1)
  const primaryShards = cfg.shards

  if (dataNodes === 0) {
    return { health: 'red', unassigned: totalShards }
  }

  // primaries: can assign if dataNodes >= 1
  const primariesUnassigned = Math.max(0, primaryShards - dataNodes * cfg.shards)

  // replicas: need at least replicas+1 nodes to fully assign all replicas
  const replicaShards = cfg.shards * cfg.replicas
  const replicasUnassigned = dataNodes < cfg.replicas + 1
    ? Math.max(0, replicaShards - cfg.shards * Math.max(0, dataNodes - 1))
    : 0

  if (primariesUnassigned > 0) {
    return { health: 'red', unassigned: primariesUnassigned + replicasUnassigned }
  }
  if (replicasUnassigned > 0) {
    return { health: 'yellow', unassigned: replicasUnassigned }
  }
  return { health: 'green', unassigned: 0 }
}

function computeClusterHealth(indices: Map<string, ESIndexStats>): ESIndexState {
  let hasRed = false
  let hasYellow = false
  indices.forEach(idx => {
    if (idx.health === 'red') hasRed = true
    else if (idx.health === 'yellow') hasYellow = true
  })
  if (hasRed) return 'red'
  if (hasYellow) return 'yellow'
  return 'green'
}

function computeAvgHeapPressure(nodes: Map<string, ESNodeState>): number {
  let sum = 0
  let count = 0
  nodes.forEach(n => {
    if (n.isOnline) {
      sum += n.heapUsedPct
      count++
    }
  })
  return count === 0 ? 0 : sum / count
}

function computeAvgDiskPressure(nodes: Map<string, ESNodeState>): number {
  let sum = 0
  let count = 0
  nodes.forEach(n => {
    if (n.isOnline && n.config.roles.includes('data')) {
      sum += n.diskUsedPct
      count++
    }
  })
  return count === 0 ? 0 : sum / count
}

function computeQueryLatency(
  heapPressure: number,
  gcPressure: number,
  queryType: ESClientConfig['queryType'],
  circuitBreakerTripped: boolean,
  diskBlocked: boolean,
): number {
  if (circuitBreakerTripped) return 5000 + Math.random() * 5000
  if (diskBlocked && queryType === 'bulk-index') return 10000

  let base = BASE_QUERY_LATENCY_MS
  switch (queryType) {
    case 'aggregation': base = 50; break
    case 'scroll': base = 100; break
    case 'bulk-index': base = BASE_INDEX_LATENCY_MS; break
    case 'match': base = 20; break
    case 'term': base = 5; break
  }

  // heap pressure inflates latency exponentially above 0.7
  if (heapPressure > 0.7) {
    const overflow = heapPressure - 0.7
    base *= 1 + overflow * 20
  }

  // gc pauses inflate latency
  if (gcPressure > GC_PRESSURE_THRESHOLD) {
    base *= 1 + (gcPressure - GC_PRESSURE_THRESHOLD) * 10
  }

  return jitter(base, 0.15)
}

function computeHealthScore(
  metrics: ESMetrics,
  activeFailures: string[],
): number {
  let score = 100

  // cluster health
  if (metrics.clusterHealth === 'red') score -= 40
  else if (metrics.clusterHealth === 'yellow') score -= 15

  // unassigned shards
  const unassignedPenalty = Math.min(30, metrics.unassignedShards * 2)
  score -= unassignedPenalty

  // heap pressure
  if (metrics.heapPressure > 0.85) score -= 20
  else if (metrics.heapPressure > 0.7) score -= 10

  // disk pressure
  if (metrics.diskPressure > 0.9) score -= 20
  else if (metrics.diskPressure > 0.75) score -= 10

  // error rate
  if (metrics.errorRate > 0.1) score -= 20
  else if (metrics.errorRate > 0.01) score -= 10

  // latency
  if (metrics.avgQueryLatencyMs > 5000) score -= 15
  else if (metrics.avgQueryLatencyMs > 1000) score -= 8
  else if (metrics.avgQueryLatencyMs > 200) score -= 4

  // active failures
  score -= activeFailures.length * 5

  return clamp(score, 0, 100)
}

// ── Engine ────────────────────────────────────────────────────────────────────

type TickCallback = (snapshot: ESSnapshot) => void

export class ElasticsearchEngine {
  private tickNumber = 0
  private tickInterval: ReturnType<typeof setInterval> | null = null
  private isRunning = false
  private scenario: ESScenarioDefinition | null = null
  private onTickCallback: TickCallback | null = null

  private nodes = new Map<string, ESNodeState>()
  private indices = new Map<string, ESIndexStats>()
  private clients = new Map<string, ESClientState>()
  private activeFailures: string[] = []

  // failure state flags
  private circuitBreakerTripped = false
  private diskIndexingBlocked = false
  private mappingConflictIndices = new Set<string>()
  private queryFloodActive = false
  private splitBrainActive = false

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  loadScenario(def: ESScenarioDefinition, callback: TickCallback): void {
    this.stop()
    this.reset()
    this.scenario = def
    this.onTickCallback = callback
    this._initTopology(def.initialTopology)
  }

  start(tickMs = 1000): void {
    if (this.isRunning) return
    this.isRunning = true
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
    this.nodes.clear()
    this.indices.clear()
    this.clients.clear()
    this.activeFailures = []
    this.circuitBreakerTripped = false
    this.diskIndexingBlocked = false
    this.mappingConflictIndices.clear()
    this.queryFloodActive = false
    this.splitBrainActive = false
  }

  applyAction(_actionId: string): void {
    this.activeFailures = []
    for (const node of this.nodes.values()) {
      node.isOnline = true
      node.heapUsedPct = 0.4
      node.diskUsedPct = 0.5
      node.cpuPct = 0.2
      node.jvmGcPressure = 0.1
    }
    for (const idx of this.indices.values()) {
      idx.health = 'green'
      idx.unassignedShards = 0
      idx.queryLatencyMs = 5
    }
    for (const client of this.clients.values()) {
      client.errorType = null
      client.avgLatencyMs = 5
    }
  }

  getSnapshot(): ESSnapshot {
    const metrics = this._collectMetrics()
    const healthScore = computeHealthScore(metrics, this.activeFailures)
    return {
      tickNumber: this.tickNumber,
      nodes: new Map(this.nodes),
      indices: new Map(this.indices),
      clients: new Map(this.clients),
      metrics,
      systemHealthScore: healthScore,
      activeFailures: [...this.activeFailures],
    }
  }

  // ── Config Mutations ────────────────────────────────────────────────────────

  applyIndexConfig(indexName: string, patch: Partial<ESIndexConfig>): void {
    const idx = this.indices.get(indexName)
    if (!idx) return
    Object.assign(idx.config, patch)
    // recompute health immediately after config change
    const dataNodes = countDataNodes(this.nodes)
    const { health, unassigned } = computeIndexHealth(idx.config, dataNodes)
    idx.health = health
    idx.unassignedShards = unassigned

    // clear mapping conflict if operator fixed it
    if (patch.ilmPolicy !== undefined || patch.shards !== undefined || patch.replicas !== undefined) {
      this.mappingConflictIndices.delete(indexName)
      // clear circuit breaker if heap has come down
      this._checkAndClearCircuitBreaker()
    }
  }

  applyNodeConfig(nodeId: string, patch: Partial<ESNodeConfig>): void {
    const node = this.nodes.get(nodeId)
    if (!node) return
    Object.assign(node.config, patch)
    // if heap increased, check if circuit breaker can clear
    if (patch.heapGb !== undefined) {
      node.heapUsedPct = clamp(node.heapUsedPct * (node.config.heapGb / (patch.heapGb || node.config.heapGb)), 0, 1)
      this._checkAndClearCircuitBreaker()
    }
  }

  toggleNode(nodeId: string): void {
    const node = this.nodes.get(nodeId)
    if (!node) return
    node.isOnline = !node.isOnline
    if (node.isMaster && !node.isOnline) {
      node.isMaster = false
      electMaster(this.nodes)
    }
    if (node.isOnline) {
      // node coming back — reset some pressure
      node.heapUsedPct = 0.3
      node.diskUsedPct = node.diskUsedPct
      node.cpuPct = 0.2
      node.jvmGcPressure = 0.1
      this._checkAndClearCircuitBreaker()
    }
    // recompute index health
    this._recomputeAllIndexHealth()
  }

  addNode(config: ESNodeConfig): void {
    const state: ESNodeState = {
      config,
      isOnline: true,
      heapUsedPct: 0.2,
      diskUsedPct: 0.1,
      cpuPct: 0.1,
      jvmGcPressure: 0.05,
      isMaster: false,
    }
    this.nodes.set(config.id, state)
    // elect master if none
    const hasMaster = Array.from(this.nodes.values()).some(n => n.isMaster)
    if (!hasMaster) electMaster(this.nodes)
    this._recomputeAllIndexHealth()
  }

  // ── Failure Handling ────────────────────────────────────────────────────────

  private _applyFailure(event: { atTick: number; type: string; target: string; params: Record<string, unknown> }): void {
    const { type, target, params } = event

    switch (type) {
      case 'node-down': {
        const node = this.nodes.get(target)
        if (node) {
          node.isOnline = false
          if (node.isMaster) {
            node.isMaster = false
            electMaster(this.nodes)
          }
          this.activeFailures.push(`node-down:${target}`)
          this._recomputeAllIndexHealth()
        }
        break
      }

      case 'heap-pressure': {
        const node = this.nodes.get(target)
        if (node) {
          node.heapUsedPct = clamp((params.heapPct as number) ?? 0.8, 0, 1)
          node.jvmGcPressure = clamp(node.heapUsedPct * 0.9, 0, 1)
          this.activeFailures.push(`heap-pressure:${target}`)
        }
        break
      }

      case 'circuit-breaker': {
        this.circuitBreakerTripped = true
        this.activeFailures.push('circuit-breaker')
        this.clients.forEach(c => {
          c.errorType = 'CircuitBreakerException'
          c.totalErrors += Math.floor(c.config.requestsPerSec * 10)
        })
        break
      }

      case 'disk-watermark': {
        const node = this.nodes.get(target)
        if (node && node.config.roles.includes('data')) {
          node.diskUsedPct = clamp((params.diskPct as number) ?? 0.92, 0, 1)
          if (node.diskUsedPct >= DISK_WATERMARK_BLOCK) {
            this.diskIndexingBlocked = true
            this.activeFailures.push(`disk-watermark:${target}`)
            this.indices.forEach(idx => {
              idx.indexRate = 0
            })
          }
        }
        break
      }

      case 'unassigned-shards': {
        const idx = this.indices.get(target)
        if (idx) {
          idx.unassignedShards = (params.count as number) ?? idx.config.shards
          idx.health = idx.unassignedShards >= idx.config.shards ? 'red' : 'yellow'
          this.activeFailures.push(`unassigned-shards:${target}`)
        }
        break
      }

      case 'mapping-conflict': {
        this.mappingConflictIndices.add(target)
        this.activeFailures.push(`mapping-conflict:${target}`)
        this.clients.forEach(c => {
          if (c.config.targetIndex === target) {
            c.errorType = 'MapperParsingException'
          }
        })
        break
      }

      case 'query-flood': {
        this.queryFloodActive = true
        this.activeFailures.push('query-flood')
        this.nodes.forEach(n => {
          if (n.isOnline) {
            n.cpuPct = clamp(n.cpuPct + 0.4, 0, 1)
            n.heapUsedPct = clamp(n.heapUsedPct + 0.2, 0, 1)
          }
        })
        break
      }

      case 'split-brain': {
        this.splitBrainActive = true
        this.activeFailures.push('split-brain')
        // take minority nodes offline
        let count = 0
        this.nodes.forEach(n => {
          if (count < (params.minorityCount as number ?? 2)) {
            n.isOnline = false
            count++
          }
        })
        this._recomputeAllIndexHealth()
        break
      }
    }
  }

  private _checkAndClearCircuitBreaker(): void {
    const avgHeap = computeAvgHeapPressure(this.nodes)
    if (avgHeap < CIRCUIT_BREAKER_HEAP_THRESHOLD && this.circuitBreakerTripped) {
      this.circuitBreakerTripped = false
      this.activeFailures = this.activeFailures.filter(f => f !== 'circuit-breaker')
      this.clients.forEach(c => {
        if (c.errorType === 'CircuitBreakerException') c.errorType = null
      })
    }
  }

  private _recomputeAllIndexHealth(): void {
    const dataNodes = countDataNodes(this.nodes)
    this.indices.forEach(idx => {
      const { health, unassigned } = computeIndexHealth(idx.config, dataNodes)
      idx.health = health
      idx.unassignedShards = unassigned
    })
  }

  // ── Tick ────────────────────────────────────────────────────────────────────

  private _tick(): void {
    this.tickNumber++
    const tick = this.tickNumber

    // 1. Fire failure script events
    if (this.scenario) {
      for (const event of this.scenario.failureScript) {
        if (event.atTick === tick) {
          this._applyFailure(event)
        }
      }
    }

    // 2. Simulate node resource usage
    this._simulateNodes()

    // 3. Simulate index stats
    this._simulateIndices()

    // 4. Simulate client requests
    this._simulateClients()

    // 5. Auto-check circuit breaker
    this._checkAndClearCircuitBreaker()

    // 6. Emit snapshot
    if (this.onTickCallback) {
      this.onTickCallback(this.getSnapshot())
    }
  }

  private _simulateNodes(): void {
    const dataNodeCount = countDataNodes(this.nodes)
    const masterCount = countMasterEligibleNodes(this.nodes)

    this.nodes.forEach(node => {
      if (!node.isOnline) return

      // Gradually normalize heap unless under pressure
      if (!this.queryFloodActive) {
        node.heapUsedPct = clamp(node.heapUsedPct + (Math.random() - 0.52) * 0.01, 0.1, 0.99)
      } else {
        node.heapUsedPct = clamp(node.heapUsedPct + 0.005, 0.1, 0.99)
      }

      // Circuit breaker trips at threshold
      if (node.heapUsedPct > CIRCUIT_BREAKER_HEAP_THRESHOLD && !this.circuitBreakerTripped) {
        this.circuitBreakerTripped = true
        if (!this.activeFailures.includes('circuit-breaker')) {
          this.activeFailures.push('circuit-breaker')
        }
      }

      // GC pressure correlates with heap
      node.jvmGcPressure = clamp(
        node.heapUsedPct > 0.7
          ? (node.heapUsedPct - 0.7) * 3
          : node.heapUsedPct * 0.1,
        0, 1
      )

      // CPU: base + indexing/search load
      const baseLoad = this.queryFloodActive ? 0.6 : 0.2
      node.cpuPct = clamp(node.cpuPct * 0.9 + baseLoad * 0.1 + (Math.random() * 0.05), 0, 1)

      // Disk: slowly grows with indexing (if data node)
      if (node.config.roles.includes('data')) {
        const diskGrowthRate = 0.0001 // per tick
        if (!this.diskIndexingBlocked) {
          node.diskUsedPct = clamp(node.diskUsedPct + diskGrowthRate, 0, 1)
        }
        if (node.diskUsedPct >= DISK_WATERMARK_BLOCK) {
          this.diskIndexingBlocked = true
          if (!this.activeFailures.some(f => f.startsWith('disk-watermark'))) {
            this.activeFailures.push(`disk-watermark:${node.config.id}`)
          }
        }
      }

      // Split brain: if only 1 master-eligible node, cluster is unstable
      if (masterCount < 2 && this.splitBrainActive) {
        node.heapUsedPct = clamp(node.heapUsedPct + 0.01, 0, 1)
      }
    })
  }

  private _simulateIndices(): void {
    const dataNodes = countDataNodes(this.nodes)
    const avgHeap = computeAvgHeapPressure(this.nodes)
    const avgDisk = computeAvgDiskPressure(this.nodes)

    this.indices.forEach(idx => {
      // Recompute shard assignment health
      const { health, unassigned } = computeIndexHealth(idx.config, dataNodes)
      idx.health = health
      idx.unassignedShards = unassigned

      // Indexing blocked by disk watermark
      if (this.diskIndexingBlocked || avgDisk > DISK_WATERMARK_BLOCK) {
        idx.indexRate = 0
      } else {
        idx.indexRate = jitter(idx.indexRate > 0 ? idx.indexRate : 100, 0.05)
      }

      // Docs grow from indexing
      idx.docsCount += Math.floor(idx.indexRate)
      idx.storeSizeGb = idx.docsCount * 0.0000005 // ~500 bytes/doc average

      // Query latency from heap / gc
      if (health === 'red') {
        idx.queryLatencyMs = 30000 // unavailable
      } else {
        const baseLatency = 10 + avgHeap * 200 + (this.circuitBreakerTripped ? 5000 : 0)
        const gcPenalty = this.nodes.size > 0
          ? Array.from(this.nodes.values()).reduce((s, n) => s + n.jvmGcPressure, 0) / this.nodes.size * 500
          : 0
        idx.queryLatencyMs = jitter(baseLatency + gcPenalty, 0.1)
      }

      // Mapping conflict → errors on the client, not on the index directly
      if (this.mappingConflictIndices.has(idx.config.name)) {
        idx.indexRate = 0
      }
    })
  }

  private _simulateClients(): void {
    const avgHeap = computeAvgHeapPressure(this.nodes)
    const dataNodes = countDataNodes(this.nodes)

    this.clients.forEach(client => {
      if (!client.isActive) return

      const idx = this.indices.get(client.config.targetIndex)
      const isIndexAvailable = idx && idx.health !== 'red'

      client.totalRequests += client.config.requestsPerSec

      // Determine error condition
      let errorRate = 0

      if (this.circuitBreakerTripped) {
        errorRate = 0.95
        client.errorType = 'CircuitBreakerException'
      } else if (this.diskIndexingBlocked && client.config.queryType === 'bulk-index') {
        errorRate = 1.0
        client.errorType = 'ClusterBlockException[blocked by: [FORBIDDEN/8/index write (api)]]'
      } else if (this.mappingConflictIndices.has(client.config.targetIndex)) {
        errorRate = 0.8
        client.errorType = 'MapperParsingException'
      } else if (!isIndexAvailable) {
        errorRate = 1.0
        client.errorType = 'IndexNotFoundException'
      } else if (dataNodes === 0) {
        errorRate = 1.0
        client.errorType = 'NoShardAvailableActionException'
      } else if (this.queryFloodActive) {
        errorRate = 0.3
        client.errorType = 'EsRejectedExecutionException'
      } else {
        errorRate = 0
        client.errorType = null
      }

      const errors = Math.floor(client.config.requestsPerSec * errorRate)
      client.totalErrors += errors

      // Compute latency
      const gcPressure = Array.from(this.nodes.values())
        .filter(n => n.isOnline)
        .reduce((s, n) => s + n.jvmGcPressure, 0) / Math.max(1, this.nodes.size)

      const latency = computeQueryLatency(
        avgHeap,
        gcPressure,
        client.config.queryType,
        this.circuitBreakerTripped,
        this.diskIndexingBlocked,
      )
      // rolling average
      client.avgLatencyMs = client.avgLatencyMs * 0.8 + latency * 0.2
    })
  }

  // ── Metrics Collection ──────────────────────────────────────────────────────

  private _collectMetrics(): ESMetrics {
    let totalShards = 0
    let activeShards = 0
    let unassignedShards = 0
    let totalLatency = 0
    let latencyCount = 0
    let indexingRate = 0
    let searchRate = 0
    let totalRequests = 0
    let totalErrors = 0

    this.indices.forEach(idx => {
      const shards = idx.config.shards * (idx.config.replicas + 1)
      totalShards += shards
      unassignedShards += idx.unassignedShards
      activeShards += shards - idx.unassignedShards
      if (idx.health !== 'red') {
        totalLatency += idx.queryLatencyMs
        latencyCount++
      }
      indexingRate += idx.indexRate
      searchRate += idx.searchRate
    })

    this.clients.forEach(c => {
      if (c.isActive) {
        totalRequests += c.totalRequests
        totalErrors += c.totalErrors
        totalLatency += c.avgLatencyMs
        latencyCount++
      }
    })

    const clusterHealth = computeClusterHealth(this.indices)
    const avgHeap = computeAvgHeapPressure(this.nodes)
    const avgDisk = computeAvgDiskPressure(this.nodes)
    const errorRate = totalRequests > 0 ? totalErrors / totalRequests : 0

    return {
      clusterHealth,
      totalShards,
      activeShards,
      unassignedShards,
      avgQueryLatencyMs: latencyCount > 0 ? totalLatency / latencyCount : 0,
      indexingRate,
      searchRate,
      errorRate: clamp(errorRate, 0, 1),
      heapPressure: avgHeap,
      diskPressure: avgDisk,
    }
  }

  // ── Topology Init ───────────────────────────────────────────────────────────

  private _initTopology(topology: ESScenarioDefinition['initialTopology']): void {
    // Nodes
    topology.nodes.forEach((cfg, idx) => {
      const state: ESNodeState = {
        config: cfg,
        isOnline: true,
        heapUsedPct: 0.3 + Math.random() * 0.1,
        diskUsedPct: 0.2 + Math.random() * 0.05,
        cpuPct: 0.15 + Math.random() * 0.05,
        jvmGcPressure: 0.05,
        isMaster: false,
      }
      this.nodes.set(cfg.id, state)
    })
    electMaster(this.nodes)

    const dataNodes = countDataNodes(this.nodes)

    // Indices
    topology.indices.forEach(cfg => {
      const { health, unassigned } = computeIndexHealth(cfg, dataNodes)
      const stats: ESIndexStats = {
        config: { ...cfg },
        health,
        docsCount: 0,
        storeSizeGb: 0,
        searchRate: 0,
        indexRate: 0,
        queryLatencyMs: BASE_QUERY_LATENCY_MS,
        unassignedShards: unassigned,
      }
      this.indices.set(cfg.name, stats)
    })

    // Clients
    topology.clients.forEach(cfg => {
      const state: ESClientState = {
        config: { ...cfg },
        isActive: true,
        totalRequests: 0,
        totalErrors: 0,
        avgLatencyMs: BASE_QUERY_LATENCY_MS,
        errorType: null,
      }
      this.clients.set(cfg.id, state)
    })
  }
}
