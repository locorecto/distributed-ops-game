import type { RedisScenarioDefinition, RedisSnapshot, RedisNodeState, RedisClientState, RedisMetrics } from './types'

// ── Action → failure-types fixed mapping ─────────────────────────────────────

const ACTION_FIXES: Record<string, string[]> = {
  'set-ttl':               ['ttl-expiry'],
  'set-eviction-policy':   ['memory-pressure', 'eviction-storm'],
  'change-data-structure': ['slow-query'],
  'rebuild-index':         ['slow-query'],
  'set-max-memory':        ['memory-pressure', 'eviction-storm'],
  'enable-cluster':        ['connection-storm'],
  'add-replica':           ['replication-lag', 'node-down'],
  'scale-read-replicas':   ['hot-key'],
  'enable-pipelining':     ['slow-query'],
  'set-compression':       ['memory-pressure'],
  'flush-cache':           ['ttl-expiry', 'eviction-storm'],
  'configure-sentinel':    ['node-down', 'replication-lag'],
  'set-persistence':       ['aof-pressure'],
  'enable-transactions':   ['race-condition'],
  'set-lua-script':        ['race-condition', 'slow-query'],
  'set-session-timeout':   ['connection-storm'],
  'set-connection-pool':   ['connection-storm'],
  'promote-replica':       ['node-down', 'replication-lag'],
  'add-node':              ['node-down', 'connection-storm'],
  'set-backlog-size':      ['replication-lag'],
  'configure-acl':         ['race-condition'],
  'set-schema':            ['race-condition'],
  'configure-retry':       ['race-condition', 'slow-query'],
  'set-offset-reset':      ['slow-query'],
  'enable-compression':    ['memory-pressure'],
  'set-key-expiry':        ['memory-pressure', 'eviction-storm'],
  'add-consumer':          ['slow-query'],
  'set-maxmemory-policy':  ['memory-pressure', 'eviction-storm'],
  'configure-geo-index':   ['slow-query'],
  'set-bloom-filter':      ['memory-pressure', 'slow-query'],
}

export class RedisEngine {
  private nodes: Map<string, RedisNodeState> = new Map()
  private clients: Map<string, RedisClientState> = new Map()
  private tick = 0
  private interval: ReturnType<typeof setInterval> | null = null
  private scenario: RedisScenarioDefinition | null = null
  private onSnapshot: ((s: RedisSnapshot) => void) | null = null

  // Active failure tracking
  private activeFailures: Set<string> = new Set()
  private failureParams: Map<string, Record<string, unknown>> = new Map()

  loadScenario(def: RedisScenarioDefinition, callback: (s: RedisSnapshot) => void): void {
    this.scenario = def
    this.onSnapshot = callback
    this.tick = 0
    this.nodes.clear()
    this.clients.clear()
    this.activeFailures.clear()
    this.failureParams.clear()
    // Initialize nodes
    for (const nc of def.initialTopology.nodes) {
      this.nodes.set(nc.id, {
        config: nc,
        isOnline: true,
        usedMemoryMb: nc.maxMemoryMb * 0.3,
        keyCount: 10000,
        connectedClients: Math.floor(nc.maxClients * 0.1),
        replicationLagMs: 0,
        hitRate: 0.92,
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
    this.activeFailures.clear()
    this.failureParams.clear()
  }

  private stepTick(): void {
    this.tick++
    if (!this.scenario) return

    // Run failure injector
    for (const event of this.scenario.failureScript) {
      if (event.atTick === this.tick) this.applyFailure(event)
    }

    // Apply per-tick effects of active failures
    for (const [, node] of this.nodes) {
      if (!node.isOnline) continue

      let failureApplied = false

      for (const failureKey of this.activeFailures) {
        const failureType = failureKey.includes(':') ? failureKey.split(':')[0] : failureKey
        const params = this.failureParams.get(failureKey) ?? {}

        switch (failureType) {
          case 'ttl-expiry': {
            node.hitRate = 0.03 + Math.random() * 0.02
            node.evictedKeys = 50
            failureApplied = true
            // Set client error for clients targeting this node
            for (const [, client] of this.clients) {
              if (client.config.targetNode === node.config.id) {
                client.errorType = 'CACHE_MISS'
                client.avgLatencyMs = 200 + Math.random() * 50
              }
            }
            break
          }
          case 'slow-query': {
            for (const [, client] of this.clients) {
              if (client.config.targetNode === node.config.id) {
                client.avgLatencyMs = (params.latencyMs as number) ?? 5000
              }
            }
            failureApplied = true
            break
          }
          case 'memory-pressure': {
            node.usedMemoryMb = node.config.maxMemoryMb * 0.95
            node.hitRate = Math.max(0.4, node.hitRate - 0.001)
            node.evictedKeys = 100
            failureApplied = true
            break
          }
          case 'eviction-storm': {
            node.usedMemoryMb = node.config.maxMemoryMb * 0.92
            node.hitRate = 0.3 + Math.random() * 0.05
            node.evictedKeys = 500
            failureApplied = true
            break
          }
          case 'hot-key': {
            for (const [, client] of this.clients) {
              if (client.config.targetNode === node.config.id) {
                client.avgLatencyMs = 80 + Math.random() * 20
              }
            }
            failureApplied = true
            break
          }
          case 'connection-storm': {
            node.connectedClients = Math.floor(node.config.maxClients * 1.2)
            for (const [, client] of this.clients) {
              if (client.config.targetNode === node.config.id) {
                client.avgLatencyMs = 300 + Math.random() * 100
                client.errorType = 'CONNECTION_LIMIT'
              }
            }
            failureApplied = true
            break
          }
          case 'replication-lag':
          case 'network-partition': {
            node.replicationLagMs = (params.lagMs as number) ?? 8000
            failureApplied = true
            break
          }
          case 'aof-pressure': {
            for (const [, client] of this.clients) {
              if (client.config.targetNode === node.config.id) {
                client.avgLatencyMs = (params.latencyMs as number) ?? 100
              }
            }
            failureApplied = true
            break
          }
          case 'race-condition':
          case 'replication-conflict': {
            for (const [, client] of this.clients) {
              if (client.config.targetNode === node.config.id) {
                client.errorType = 'DIRTY_READ'
                client.avgLatencyMs = 30
              }
            }
            failureApplied = true
            break
          }
          // node-down is applied once at inject time, not every tick
        }
      }

      if (!failureApplied) {
        // Normal tick: no active failure affecting this node
        node.usedMemoryMb = Math.min(node.config.maxMemoryMb * 0.5, node.usedMemoryMb + 0.001)
        if (node.hitRate < 0.85) {
          node.hitRate = Math.min(0.92, node.hitRate + 0.001)
        } else {
          node.hitRate = 0.92
        }
        node.connectedClients = Math.floor(node.config.maxClients * 0.1)
      }

      node.opsPerSec = 0
    }

    // Normal client recovery when no failure is active for that node
    for (const [, client] of this.clients) {
      if (!client.isActive) continue
      const node = this.nodes.get(client.config.targetNode)
      if (!node || !node.isOnline) {
        client.errorType = 'CONNECTION_REFUSED'
        client.avgLatencyMs = 5000
        client.totalErrors++
        continue
      }

      // Check if any active failure covers this client's node
      let clientFailureActive = false
      for (const failureKey of this.activeFailures) {
        const failureType = failureKey.includes(':') ? failureKey.split(':')[0] : failureKey
        if (failureType !== 'node-down') {
          clientFailureActive = true
          break
        }
      }

      if (!clientFailureActive) {
        // Recover to healthy state
        client.errorType = null
        client.avgLatencyMs = 1
      }

      client.totalOps += client.config.opsPerSecond / 10
      node.opsPerSec += client.config.opsPerSecond
    }

    const snapshot = this.getSnapshot()
    this.onSnapshot?.(snapshot)
  }

  private applyFailure(event: { type: string; target: string; params: Record<string, unknown> }): void {
    const node = this.nodes.get(event.target)
    const failureKey = `${event.type}:${event.target}`

    this.activeFailures.add(failureKey)
    this.failureParams.set(failureKey, event.params)

    // Immediately degrade metrics on injection
    switch (event.type) {
      case 'node-down': {
        if (node) node.isOnline = false
        break
      }
      case 'ttl-expiry': {
        if (node) {
          node.hitRate = 0.03 + Math.random() * 0.02
          node.evictedKeys = 50
          for (const [, client] of this.clients) {
            if (client.config.targetNode === node.config.id) {
              client.errorType = 'CACHE_MISS'
              client.avgLatencyMs = 200 + Math.random() * 50
            }
          }
        }
        break
      }
      case 'slow-query': {
        if (node) {
          for (const [, client] of this.clients) {
            if (client.config.targetNode === node.config.id) {
              client.avgLatencyMs = (event.params.latencyMs as number) ?? 5000
            }
          }
        }
        break
      }
      case 'memory-pressure': {
        if (node) {
          node.usedMemoryMb = node.config.maxMemoryMb * 0.95
          node.hitRate = Math.max(0.4, node.hitRate - 0.001)
          node.evictedKeys = 100
        }
        break
      }
      case 'eviction-storm': {
        if (node) {
          node.usedMemoryMb = node.config.maxMemoryMb * 0.92
          node.hitRate = 0.3 + Math.random() * 0.05
          node.evictedKeys = 500
        }
        break
      }
      case 'hot-key': {
        if (node) {
          const client = [...this.clients.values()].find(c => c.config.targetNode === node.config.id)
          if (client) {
            client.config = { ...client.config, keyPattern: 'hot-key' }
            client.avgLatencyMs = 80 + Math.random() * 20
          }
        }
        break
      }
      case 'connection-storm': {
        if (node) {
          node.connectedClients = Math.floor(node.config.maxClients * 1.2)
          for (const [, client] of this.clients) {
            if (client.config.targetNode === node.config.id) {
              client.avgLatencyMs = 300 + Math.random() * 100
              client.errorType = 'CONNECTION_LIMIT'
            }
          }
        }
        break
      }
      case 'replication-lag': {
        if (node) node.replicationLagMs = (event.params.lagMs as number) ?? 8000
        break
      }
      case 'network-partition': {
        if (node) node.replicationLagMs = (event.params.lagMs as number) ?? 30000
        break
      }
      case 'aof-pressure': {
        if (node) {
          for (const [, client] of this.clients) {
            if (client.config.targetNode === node.config.id) {
              client.avgLatencyMs = (event.params.latencyMs as number) ?? 100
            }
          }
        }
        break
      }
      case 'race-condition':
      case 'replication-conflict': {
        if (node) {
          for (const [, client] of this.clients) {
            if (client.config.targetNode === node.config.id) {
              client.errorType = 'DIRTY_READ'
              client.avgLatencyMs = 30
            }
          }
        }
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

  applyAction(actionId: string): void {
    const fixedTypes = ACTION_FIXES[actionId] ?? []

    if (fixedTypes.length === 0) {
      // Unknown action: fall back to full reset
      for (const node of this.nodes.values()) {
        node.isOnline = true
        node.usedMemoryMb = node.config.maxMemoryMb * 0.3
        node.hitRate = 0.92
        node.replicationLagMs = 0
        node.connectedClients = Math.floor(node.config.maxClients * 0.1)
        node.evictedKeys = 0
      }
      for (const client of this.clients.values()) {
        client.errorType = null
        client.avgLatencyMs = 1
      }
      this.activeFailures.clear()
      this.failureParams.clear()
      return
    }

    // Remove active failures that this action fixes
    const keysToRemove: string[] = []
    for (const key of this.activeFailures) {
      const fType = key.includes(':') ? key.split(':')[0] : key
      if (fixedTypes.includes(fType)) {
        keysToRemove.push(key)
      }
    }

    for (const key of keysToRemove) {
      this.activeFailures.delete(key)
      this.failureParams.delete(key)
      // Determine failure type for recovery
      const fType = key.includes(':') ? key.split(':')[0] : key
      // Determine target node from key
      const targetNodeId = key.includes(':') ? key.substring(key.indexOf(':') + 1) : null
      const targetNode = targetNodeId ? this.nodes.get(targetNodeId) : null

      switch (fType) {
        case 'ttl-expiry': {
          if (targetNode) {
            targetNode.hitRate = 0.92
          }
          for (const client of this.clients.values()) {
            if (!targetNodeId || client.config.targetNode === targetNodeId) {
              if (client.errorType === 'CACHE_MISS') client.errorType = null
              client.avgLatencyMs = 1
            }
          }
          break
        }
        case 'slow-query': {
          for (const client of this.clients.values()) {
            if (!targetNodeId || client.config.targetNode === targetNodeId) {
              client.avgLatencyMs = 1
              client.errorType = null
            }
          }
          break
        }
        case 'memory-pressure':
        case 'eviction-storm': {
          if (targetNode) {
            targetNode.usedMemoryMb = targetNode.config.maxMemoryMb * 0.3
            targetNode.evictedKeys = 0
            targetNode.hitRate = Math.max(targetNode.hitRate, 0.85)
          }
          break
        }
        case 'hot-key': {
          for (const client of this.clients.values()) {
            if (!targetNodeId || client.config.targetNode === targetNodeId) {
              client.avgLatencyMs = 1
              client.config = { ...client.config, keyPattern: 'random' }
            }
          }
          break
        }
        case 'connection-storm': {
          if (targetNode) {
            targetNode.connectedClients = Math.floor(targetNode.config.maxClients * 0.1)
          }
          for (const client of this.clients.values()) {
            if (!targetNodeId || client.config.targetNode === targetNodeId) {
              if (client.errorType === 'CONNECTION_LIMIT') client.errorType = null
              client.avgLatencyMs = 1
            }
          }
          break
        }
        case 'replication-lag':
        case 'network-partition': {
          if (targetNode) {
            targetNode.replicationLagMs = 0
          } else {
            for (const node of this.nodes.values()) {
              node.replicationLagMs = 0
            }
          }
          break
        }
        case 'aof-pressure': {
          for (const client of this.clients.values()) {
            if (!targetNodeId || client.config.targetNode === targetNodeId) {
              client.avgLatencyMs = 1
            }
          }
          break
        }
        case 'race-condition':
        case 'replication-conflict': {
          for (const client of this.clients.values()) {
            if (!targetNodeId || client.config.targetNode === targetNodeId) {
              if (client.errorType === 'DIRTY_READ') client.errorType = null
              client.avgLatencyMs = 1
            }
          }
          break
        }
        case 'node-down': {
          // Bring all offline nodes back
          for (const node of this.nodes.values()) {
            if (!node.isOnline) {
              node.isOnline = true
              node.replicationLagMs = 0
            }
          }
          break
        }
      }
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
      activeFailures: [...this.activeFailures],
    }
  }
}
