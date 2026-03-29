import type { RedisScenarioDefinition, RedisSnapshot, RedisNodeState, RedisClientState, RedisMetrics } from './types'

export class RedisEngine {
  private nodes: Map<string, RedisNodeState> = new Map()
  private clients: Map<string, RedisClientState> = new Map()
  private tick = 0
  private interval: ReturnType<typeof setInterval> | null = null
  private scenario: RedisScenarioDefinition | null = null
  private onSnapshot: ((s: RedisSnapshot) => void) | null = null

  loadScenario(def: RedisScenarioDefinition, callback: (s: RedisSnapshot) => void): void {
    this.scenario = def
    this.onSnapshot = callback
    this.tick = 0
    this.nodes.clear()
    this.clients.clear()
    // Initialize nodes
    for (const nc of def.initialTopology.nodes) {
      this.nodes.set(nc.id, {
        config: nc,
        isOnline: true,
        usedMemoryMb: nc.maxMemoryMb * 0.3,
        keyCount: 10000,
        connectedClients: 5,
        replicationLagMs: 0,
        hitRate: 0.85,
        opsPerSec: 0,
        evictedKeys: 0,
        expiredKeys: 0,
      })
    }
    // Initialize clients
    for (const cc of def.initialTopology.clients) {
      this.clients.set(cc.id, {
        config: cc,
        isActive: true,
        totalOps: 0,
        totalErrors: 0,
        avgLatencyMs: 1,
        errorType: null,
      })
    }
  }

  start(tickIntervalMs = 100): void {
    if (this.interval) clearInterval(this.interval)
    this.interval = setInterval(() => this.stepTick(), tickIntervalMs)
  }

  stop(): void {
    if (this.interval) { clearInterval(this.interval); this.interval = null }
  }

  reset(): void {
    this.stop()
    this.nodes.clear()
    this.clients.clear()
    this.tick = 0
    this.scenario = null
  }

  private stepTick(): void {
    this.tick++
    if (!this.scenario) return

    // Run failure injector
    for (const event of this.scenario.failureScript) {
      if (event.atTick === this.tick) this.applyFailure(event)
    }

    // Simulate node state changes
    for (const [, node] of this.nodes) {
      if (!node.isOnline) continue
      // Memory grows under load
      const memGrowRate = 0.001
      node.usedMemoryMb = Math.min(node.config.maxMemoryMb, node.usedMemoryMb + memGrowRate)
      node.opsPerSec = 0
    }

    // Simulate client operations
    for (const [, client] of this.clients) {
      if (!client.isActive) continue
      const node = this.nodes.get(client.config.targetNode)
      if (!node || !node.isOnline) {
        client.errorType = 'CONNECTION_REFUSED'
        client.avgLatencyMs = 5000
        client.totalErrors++
        continue
      }
      const memRatio = node.usedMemoryMb / node.config.maxMemoryMb
      const latencyMultiplier = memRatio > 0.9 ? 10 : memRatio > 0.75 ? 3 : 1
      client.avgLatencyMs = latencyMultiplier * (client.config.keyPattern === 'hot-key' ? 5 : 1)
      client.totalOps += client.config.opsPerSecond / 10
      node.opsPerSec += client.config.opsPerSecond
    }

    const snapshot = this.getSnapshot()
    this.onSnapshot?.(snapshot)
  }

  private applyFailure(event: { type: string; target: string; params: Record<string, unknown> }): void {
    const node = this.nodes.get(event.target)
    if (!node) return
    switch (event.type) {
      case 'node-down': node.isOnline = false; break
      case 'memory-pressure': node.usedMemoryMb = node.config.maxMemoryMb * 0.95; break
      case 'connection-storm': node.connectedClients = node.config.maxClients * 1.2; break
      case 'replication-lag': node.replicationLagMs = 5000; break
      case 'hot-key': {
        const client = [...this.clients.values()].find(c => c.config.targetNode === node.config.id)
        if (client) { client.config = { ...client.config, keyPattern: 'hot-key' }; client.avgLatencyMs = 50 }
        break
      }
    }
  }

  applyNodeConfig(nodeId: string, patch: Partial<RedisNodeState['config']>): void {
    const node = this.nodes.get(nodeId)
    if (node) node.config = { ...node.config, ...patch }
  }

  applyClientConfig(clientId: string, patch: Partial<RedisClientState['config']>): void {
    const client = this.clients.get(clientId)
    if (client) client.config = { ...client.config, ...patch }
  }

  toggleNode(nodeId: string): void {
    const node = this.nodes.get(nodeId)
    if (node) {
      node.isOnline = !node.isOnline
      if (node.isOnline) { node.replicationLagMs = 0 }
    }
  }

  applyAction(_actionId: string): void {
    for (const node of this.nodes.values()) {
      node.isOnline = true
      node.usedMemoryMb = node.config.maxMemoryMb * 0.3
      node.hitRate = 0.85
      node.replicationLagMs = 0
      node.connectedClients = Math.floor(node.config.maxClients * 0.3)
      node.evictedKeys = 0
    }
    for (const client of this.clients.values()) {
      client.errorType = null
      client.avgLatencyMs = 1
    }
  }

  getSnapshot(): RedisSnapshot {
    const clientArr = [...this.clients.values()]
    const activeClients = clientArr.filter(c => c.isActive)
    const totalOps = activeClients.reduce((s, c) => s + c.config.opsPerSecond, 0)
    const avgLatency = activeClients.length > 0
      ? activeClients.reduce((s, c) => s + c.avgLatencyMs, 0) / activeClients.length : 0
    const errorClients = clientArr.filter(c => c.errorType != null).length
    const errorRate = clientArr.length > 0 ? errorClients / clientArr.length : 0
    const nodeArr = [...this.nodes.values()]
    const onlineNodes = nodeArr.filter(n => n.isOnline)
    const avgMem = onlineNodes.length > 0
      ? onlineNodes.reduce((s, n) => s + n.usedMemoryMb / n.config.maxMemoryMb, 0) / onlineNodes.length : 1
    const avgHitRate = onlineNodes.length > 0
      ? onlineNodes.reduce((s, n) => s + n.hitRate, 0) / onlineNodes.length : 0
    const maxLag = Math.max(0, ...nodeArr.map(n => n.replicationLagMs))

    const metrics: RedisMetrics = {
      totalOpsPerSec: totalOps,
      avgLatencyMs: avgLatency,
      errorRate,
      cacheHitRate: avgHitRate,
      memoryUsageRatio: avgMem,
      replicationLag: maxLag,
      connectedClients: nodeArr.reduce((s, n) => s + n.connectedClients, 0),
      evictedKeysPerSec: nodeArr.reduce((s, n) => s + n.evictedKeys, 0),
    }

    const healthFactors = [
      onlineNodes.length / Math.max(1, nodeArr.length),
      Math.max(0, 1 - errorRate),
      Math.max(0, 1 - avgMem),
      avgHitRate,
      Math.max(0, 1 - avgLatency / 1000),
    ]
    const systemHealthScore = Math.round(
      healthFactors.reduce((a, b) => a + b, 0) / healthFactors.length * 100
    )

    return {
      tickNumber: this.tick,
      nodes: new Map(this.nodes),
      clients: new Map(this.clients),
      metrics,
      systemHealthScore: Math.max(0, Math.min(100, systemHealthScore)),
      activeFailures: [],
    }
  }
}
