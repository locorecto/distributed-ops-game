import type {
  RMQScenarioDefinition,
  RMQSnapshot,
  RMQMetrics,
  RabbitMQNodeState,
  QueueState,
  PublisherState,
  ConsumerState,
  QueueConfig,
  PublisherConfig,
  ConsumerConfig,
  ExchangeConfig,
  BindingConfig,
} from './types'

// ── Routing helpers ──────────────────────────────────────────────────────────

/**
 * Returns true if the RabbitMQ topic-exchange pattern matches the given routing key.
 * '*' matches exactly one word (dot-separated segment).
 * '#' matches zero or more words.
 */
function topicPatternMatches(pattern: string, routingKey: string): boolean {
  // Build a regex from the pattern
  const regexStr = pattern
    .split('.')
    .map(seg => {
      if (seg === '#') return '(?:[^.]+(?:\\.[^.]+)*)?'
      if (seg === '*') return '[^.]+'
      // Escape regex metacharacters in literal segments
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
    .join('\\.')

  // Collapse patterns where '#' at start/end can absorb a leading/trailing dot
  const cleaned = regexStr
    .replace(/\\\.\(\?:\[/g, '(?:\\.[^')  // fix edge artifacts (best effort)

  try {
    // Use a simplified but correct join approach
    const parts = pattern.split('.')
    let rx = '^'
    for (let i = 0; i < parts.length; i++) {
      const seg = parts[i]
      if (seg === '#') {
        // '#' at the start: can match nothing or words followed by dot
        // '#' in middle: consumes dot + words around it
        // '#' at end: matches remaining words
        if (i === 0) {
          rx += '(?:[^.]+\\.)*'
        } else if (i === parts.length - 1) {
          // Remove trailing \. added by previous segment join and replace with optional rest
          rx = rx.replace(/\\\.$/, '')
          rx += '(?:\\.[^.]+)*'
        } else {
          rx += '(?:[^.]+\\.)*'
        }
      } else {
        if (i > 0) rx += '\\.'
        if (seg === '*') {
          rx += '[^.]+'
        } else {
          rx += seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        }
      }
    }
    rx += '$'
    return new RegExp(rx).test(routingKey)
  } catch {
    return false
  }
}

/** Resolve which queues receive a message given exchange type, routing key, and bindings */
function resolveQueues(
  exchangeName: string,
  routingKey: string,
  exchanges: Map<string, ExchangeConfig>,
  bindings: BindingConfig[],
): string[] {
  const exchange = exchanges.get(exchangeName)
  if (!exchange) return []

  const relevant = bindings.filter(b => b.exchange === exchangeName)

  switch (exchange.type) {
    case 'fanout':
      return relevant.map(b => b.queue)

    case 'direct':
      return relevant
        .filter(b => b.routingKey === routingKey)
        .map(b => b.queue)

    case 'topic':
      return relevant
        .filter(b => topicPatternMatches(b.routingKey, routingKey))
        .map(b => b.queue)

    case 'headers': {
      // Headers exchange: routingKey encodes 'x-match' mode ('any' or 'all').
      // In the simulation, each binding's routingKey stores the x-match mode.
      // 'any'  → messages are always routed (simplified: partial match always succeeds)
      // 'all'  → messages only route when all required headers present
      //          We simulate "all" failure by checking if routingKey contains "partial"
      const queues: string[] = []
      for (const binding of relevant) {
        const mode = binding.routingKey === 'any' ? 'any' : 'all'
        if (mode === 'any') {
          queues.push(binding.queue)
        } else {
          // 'all' mode — only route if the message key does NOT contain "partial"
          if (!routingKey.includes('partial')) {
            queues.push(binding.queue)
          }
        }
      }
      return queues
    }

    default:
      return []
  }
}

// ── Memory estimation ────────────────────────────────────────────────────────

const BYTES_PER_MB = 1024 * 1024

function estimateQueueMemoryMb(
  depth: number,
  unacked: number,
  msgSizeBytes: number,
  lazy: boolean,
): number {
  // Lazy queues keep only minimal messages in RAM
  const inMemory = lazy ? Math.min(depth + unacked, 100) : (depth + unacked)
  return (inMemory * msgSizeBytes) / BYTES_PER_MB
}

// ── Health score ─────────────────────────────────────────────────────────────

function computeHealthScore(
  nodes: Map<string, RabbitMQNodeState>,
  queues: Map<string, QueueState>,
  metrics: RMQMetrics,
  activeFailures: string[],
): number {
  let score = 100

  // Node penalties
  nodes.forEach(node => {
    if (!node.isOnline) score -= 30
    if (node.isMemoryAlarm) score -= 20
    if (node.isDiskAlarm) score -= 20
  })

  // Error rate penalty
  if (metrics.errorRate > 0.1) score -= 20
  else if (metrics.errorRate > 0.05) score -= 10
  else if (metrics.errorRate > 0.01) score -= 5

  // Blocked publishers penalty
  if (metrics.blockedPublishers > 0) score -= 15

  // Large DLQ penalty
  if (metrics.dlqDepth > 10_000) score -= 20
  else if (metrics.dlqDepth > 1_000) score -= 10
  else if (metrics.dlqDepth > 100) score -= 3

  // Deep queue penalty
  queues.forEach(q => {
    if (q.depth > 1_000_000) score -= 15
    else if (q.depth > 100_000) score -= 8
    else if (q.depth > 10_000) score -= 3
  })

  // Active failures penalty
  score -= activeFailures.length * 5

  return Math.max(0, Math.min(100, score))
}

// ── Engine ───────────────────────────────────────────────────────────────────

type TickCallback = (snapshot: RMQSnapshot) => void

export class RabbitMQEngine {
  private tickNumber = 0
  private tickInterval: ReturnType<typeof setInterval> | null = null
  private isRunning = false
  private scenario: RMQScenarioDefinition | null = null
  private onTick: TickCallback | null = null

  // Mutable topology state
  private nodes = new Map<string, RabbitMQNodeState>()
  private exchanges = new Map<string, ExchangeConfig>()
  private queues = new Map<string, QueueState>()
  private bindings: BindingConfig[] = []
  private publishers = new Map<string, PublisherState>()
  private consumers = new Map<string, ConsumerState>()
  private activeFailures: string[] = []

  // Per-tick accumulators (reset each tick)
  private tickPublished = new Map<string, number>()
  private tickConsumed = new Map<string, number>()

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  loadScenario(def: RMQScenarioDefinition, callback?: TickCallback): void {
    this.stop()
    this.reset()
    this.scenario = def
    if (callback) this.onTick = callback
    this.initTopology(def)
  }

  start(tickMs = 1000): void {
    if (this.isRunning) return
    this.isRunning = true
    this.tickInterval = setInterval(() => this.tick(), tickMs)
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
    this.exchanges.clear()
    this.queues.clear()
    this.bindings = []
    this.publishers.clear()
    this.consumers.clear()
    this.activeFailures = []
    this.tickPublished.clear()
    this.tickConsumed.clear()
  }

  applyAction(actionId: string): void {
    switch (actionId) {
      case 'add-consumer': {
        // Increase consumer processing: reduce queue depth by allowing faster drain
        for (const consumer of this.consumers.values()) {
          consumer.isActive = true
          consumer.config = { ...consumer.config, prefetchCount: Math.max(10, consumer.config.prefetchCount) }
        }
        this.activeFailures = this.activeFailures.filter(f => !f.startsWith('consumer-crash:'))
        break
      }
      case 'set-prefetch': {
        // Fix consumer throughput by setting prefetch
        for (const consumer of this.consumers.values()) {
          consumer.config = { ...consumer.config, prefetchCount: 100 }
        }
        break
      }
      case 'configure-dlx': {
        // DLX is a config change; just clear unroutable failures
        this.activeFailures = this.activeFailures.filter(f => f !== 'unroutable-messages')
        break
      }
      case 'enable-publisher-confirms': {
        // Clear unacked messages backlog by resolving confirms
        for (const pub of this.publishers.values()) {
          pub.totalUnconfirmed = 0
        }
        break
      }
      case 'set-queue-ttl': {
        // Clear memory alarm by reducing queue depth via TTL expiry simulation
        for (const queue of this.queues.values()) {
          queue.depth = Math.min(queue.depth, 100)
        }
        for (const node of this.nodes.values()) {
          node.isMemoryAlarm = false
          node.memoryUsedMb = Math.min(node.memoryUsedMb, node.maxMemoryMb * 0.3)
        }
        this.activeFailures = this.activeFailures.filter(f => !f.startsWith('memory-alarm:'))
        break
      }
      case 'increase-memory-limit': {
        // Clear memory alarm by raising the effective limit
        for (const node of this.nodes.values()) {
          node.isMemoryAlarm = false
          node.memoryUsedMb = Math.min(node.memoryUsedMb, node.maxMemoryMb * 0.3)
        }
        this.activeFailures = this.activeFailures.filter(f => !f.startsWith('memory-alarm:'))
        for (const pub of this.publishers.values()) {
          pub.blocked = false
        }
        break
      }
      case 'create-quorum-queue': {
        // Fix split brain — bring all nodes back online
        for (const node of this.nodes.values()) {
          if (!node.isOnline) node.isOnline = true
        }
        this.activeFailures = this.activeFailures.filter(
          f => !f.startsWith('network-partition:') && !f.startsWith('node-down:')
        )
        for (const consumer of this.consumers.values()) {
          consumer.isActive = true
        }
        break
      }
      default: {
        // Fallback: full reset
        this.activeFailures = []
        for (const node of this.nodes.values()) {
          node.isOnline = true
          node.isMemoryAlarm = false
          node.isDiskAlarm = false
          node.memoryUsedMb = node.maxMemoryMb * 0.3
          node.diskFreeMb = node.minDiskFreeMb * 10
        }
        for (const queue of this.queues.values()) {
          queue.depth = Math.min(queue.depth, 50)
          queue.dlqDepth = 0
        }
        for (const pub of this.publishers.values()) {
          pub.blocked = false
        }
        break
      }
    }
  }

  getSnapshot(): RMQSnapshot {
    const metrics = this.collectMetrics()
    const healthScore = computeHealthScore(this.nodes, this.queues, metrics, this.activeFailures)
    return {
      tickNumber: this.tickNumber,
      nodes: new Map(this.nodes),
      queues: new Map(this.queues),
      publishers: new Map(this.publishers),
      consumers: new Map(this.consumers),
      metrics,
      systemHealthScore: healthScore,
      activeFailures: [...this.activeFailures],
    }
  }

  // ── Config mutations ───────────────────────────────────────────────────────

  applyQueueConfig(name: string, patch: Partial<QueueConfig>): void {
    const q = this.queues.get(name)
    if (!q) return
    Object.assign(q.config, patch)
  }

  applyConsumerConfig(id: string, patch: Partial<ConsumerConfig>): void {
    const c = this.consumers.get(id)
    if (!c) return
    Object.assign(c.config, patch)
  }

  applyPublisherConfig(id: string, patch: Partial<PublisherConfig>): void {
    const p = this.publishers.get(id)
    if (!p) return
    Object.assign(p.config, patch)
  }

  toggleNode(id: string): void {
    const node = this.nodes.get(id)
    if (!node) return
    node.isOnline = !node.isOnline
    if (!node.isOnline) {
      if (!this.activeFailures.includes(`node-down:${id}`)) {
        this.activeFailures.push(`node-down:${id}`)
      }
      // If single-node cluster, consumers can't operate
      if (this.nodes.size === 1) {
        this.consumers.forEach(c => { c.isActive = false })
      }
    } else {
      this.activeFailures = this.activeFailures.filter(f => f !== `node-down:${id}`)
      this.consumers.forEach(c => { c.isActive = true })
    }
  }

  addBinding(binding: BindingConfig): void {
    this.bindings.push(binding)
  }

  removeBinding(exchange: string, queue: string, routingKey: string): void {
    this.bindings = this.bindings.filter(
      b => !(b.exchange === exchange && b.queue === queue && b.routingKey === routingKey)
    )
  }

  addQueue(config: QueueConfig): void {
    if (this.queues.has(config.name)) return
    this.queues.set(config.name, {
      config: { ...config },
      depth: 0,
      unacked: 0,
      dlqDepth: 0,
      consumersCount: 0,
      enqueueRate: 0,
      dequeueRate: 0,
      memoryUsedMb: 0,
    })
  }

  purgeQueue(name: string): void {
    const q = this.queues.get(name)
    if (!q) return
    q.depth = 0
    q.unacked = 0
  }

  // ── Tick ───────────────────────────────────────────────────────────────────

  private tick(): void {
    this.tickNumber++
    const tick = this.tickNumber

    // Step 1: inject scheduled failures
    this.applyScheduledFailures(tick)

    // Step 2: update alarm states based on current memory / disk
    this.updateNodeAlarms()

    // Step 3: check if any broker alarm is active (blocks publishers)
    const alarmActive = this.anyAlarmActive()

    // Step 4: publisher step — route messages into queues
    this.tickPublished.clear()
    this.publishers.forEach(pub => {
      if (!pub.isActive) return

      pub.blocked = alarmActive
      if (pub.blocked) return

      const msgsThisTick = pub.config.messagesPerSecond
      const targetQueues = resolveQueues(
        pub.config.targetExchange,
        pub.config.routingKey,
        this.exchanges,
        this.bindings,
      )

      if (targetQueues.length === 0) {
        // Unroutable — message dropped
        pub.totalFailed += msgsThisTick
        if (!this.activeFailures.includes('unroutable-messages')) {
          this.activeFailures.push('unroutable-messages')
        }
        return
      }

      for (const queueName of targetQueues) {
        const q = this.queues.get(queueName)
        if (!q) continue

        let enqueued = msgsThisTick

        // Apply max-length overflow
        if (q.config.maxLength !== null && q.depth + enqueued > q.config.maxLength) {
          const overflow = (q.depth + enqueued) - q.config.maxLength
          this.routeToDLX(q, queueName, overflow)
          pub.totalFailed += overflow
          enqueued = Math.max(0, q.config.maxLength - q.depth)
        }

        q.depth += enqueued
        this.tickPublished.set(queueName, (this.tickPublished.get(queueName) ?? 0) + enqueued)
        pub.totalSent += enqueued

        if (pub.config.confirmMode) {
          pub.totalUnconfirmed += enqueued
        }
      }
    })

    // Step 5: consumer step — process messages from queues
    this.tickConsumed.clear()
    this.consumers.forEach(consumer => {
      if (!consumer.isActive) return

      const q = this.queues.get(consumer.config.queue)
      if (!q) return

      // Throughput capacity: messages processable per second
      const processingCapacity = Math.max(
        1,
        Math.floor(1000 / Math.max(1, consumer.config.processingTimeMs)),
      )

      // Prefetch limit: 0 means unlimited
      const maxInFlight = consumer.config.prefetchCount === 0
        ? Number.MAX_SAFE_INTEGER
        : consumer.config.prefetchCount

      const canFetch = Math.max(0, maxInFlight - q.unacked)
      const toProcess = Math.min(processingCapacity, canFetch, q.depth)
      if (toProcess <= 0) return

      // Move messages from ready → in-flight
      q.depth = Math.max(0, q.depth - toProcess)
      q.unacked += toProcess

      // Determine outcomes
      const errors = Math.min(toProcess, Math.floor(toProcess * consumer.config.errorRate))
      const successes = toProcess - errors

      // Acknowledge successes (both auto and manual ack modes)
      if (consumer.config.ackMode !== 'none') {
        q.unacked = Math.max(0, q.unacked - successes)
        consumer.totalAcked += successes
        // Resolve publisher confirms for successful acks
        if (!alarmActive) {
          this.publishers.forEach(pub => {
            if (pub.config.confirmMode && pub.totalUnconfirmed > 0) {
              pub.totalUnconfirmed = Math.max(0, pub.totalUnconfirmed - successes)
            }
          })
        }
      }

      // Handle errors: nack → DLX or requeue
      if (errors > 0) {
        consumer.totalErrors += errors
        consumer.totalNacked += errors
        q.unacked = Math.max(0, q.unacked - errors)

        if (q.config.deadLetterExchange) {
          // Route to DLX
          this.routeToDLX(q, consumer.config.queue, errors)
        } else {
          // Default: requeue (infinite loop)
          q.depth += errors
        }
      }

      this.tickConsumed.set(
        consumer.config.queue,
        (this.tickConsumed.get(consumer.config.queue) ?? 0) + successes,
      )
      consumer.avgProcessingMs = consumer.config.processingTimeMs
    })

    // Step 6: TTL expiry — expire messages from queues with messageTtlMs set
    this.queues.forEach((q, queueName) => {
      if (q.config.messageTtlMs === null || q.depth === 0) return
      // Per tick (1s), fraction of messages that expire
      const expiryFraction = Math.min(1, 1000 / q.config.messageTtlMs)
      const expired = Math.floor(q.depth * expiryFraction)
      if (expired <= 0) return

      q.depth = Math.max(0, q.depth - expired)
      if (q.config.deadLetterExchange) {
        this.routeToDLX(q, queueName, expired)
      }
    })

    // Step 7: Update per-queue derived state
    this.queues.forEach((q, queueName) => {
      q.enqueueRate = this.tickPublished.get(queueName) ?? 0
      q.dequeueRate = this.tickConsumed.get(queueName) ?? 0

      // Estimate average message size from publishers sending to this queue
      let avgMsgSize = 1024
      this.publishers.forEach(pub => {
        const targets = resolveQueues(
          pub.config.targetExchange,
          pub.config.routingKey,
          this.exchanges,
          this.bindings,
        )
        if (targets.includes(queueName)) {
          avgMsgSize = pub.config.messageSizeBytes
        }
      })

      q.memoryUsedMb = estimateQueueMemoryMb(q.depth, q.unacked, avgMsgSize, q.config.lazyMode)

      // Count active consumers for this queue
      let consumerCount = 0
      this.consumers.forEach(c => {
        if (c.config.queue === queueName && c.isActive) consumerCount++
      })
      q.consumersCount = consumerCount
    })

    // Step 8: Update node memory usage
    this.nodes.forEach(node => {
      if (!node.isOnline) return
      let totalQueueMemMb = 0
      this.queues.forEach(q => { totalQueueMemMb += q.memoryUsedMb })
      node.memoryUsedMb = 200 + totalQueueMemMb  // 200 MB base RabbitMQ overhead
      node.isMemoryAlarm = node.memoryUsedMb > node.maxMemoryMb * 0.4
      // Disk: shrink as queues grow (each message stored on disk too)
      const diskUsed = totalQueueMemMb * 2  // rough estimate: 2x memory for disk
      node.diskFreeMb = Math.max(0, (node.minDiskFreeMb * 10) - diskUsed)
      node.isDiskAlarm = node.diskFreeMb < node.minDiskFreeMb
    })

    // Step 9: Emit snapshot to callback
    const snapshot = this.getSnapshot()
    if (this.onTick) this.onTick(snapshot)
  }

  // ── Failure injection ──────────────────────────────────────────────────────

  private applyScheduledFailures(tick: number): void {
    if (!this.scenario) return
    for (const event of this.scenario.failureScript) {
      if (event.atTick !== tick) continue
      this.applyFailureEvent(event)
    }
  }

  private applyFailureEvent(event: { type: string; target: string; params: Record<string, unknown> }): void {
    switch (event.type) {
      case 'node-down': {
        const node = this.nodes.get(event.target)
        if (node) {
          node.isOnline = false
          if (!this.activeFailures.includes(`node-down:${event.target}`)) {
            this.activeFailures.push(`node-down:${event.target}`)
          }
        }
        break
      }
      case 'memory-alarm': {
        const node = this.nodes.get(event.target)
        if (node) {
          // Simulate memory spike above 40% watermark
          node.memoryUsedMb = node.maxMemoryMb * 0.45
          node.isMemoryAlarm = true
          if (!this.activeFailures.includes(`memory-alarm:${event.target}`)) {
            this.activeFailures.push(`memory-alarm:${event.target}`)
          }
        }
        break
      }
      case 'disk-alarm': {
        const node = this.nodes.get(event.target)
        if (node) {
          node.diskFreeMb = Math.floor(node.minDiskFreeMb * 0.5)
          node.isDiskAlarm = true
          if (!this.activeFailures.includes(`disk-alarm:${event.target}`)) {
            this.activeFailures.push(`disk-alarm:${event.target}`)
          }
        }
        break
      }
      case 'consumer-crash': {
        const consumer = this.consumers.get(event.target)
        if (consumer) {
          consumer.isActive = false
          if (!this.activeFailures.includes(`consumer-crash:${event.target}`)) {
            this.activeFailures.push(`consumer-crash:${event.target}`)
          }
        }
        break
      }
      case 'publisher-flood': {
        const pub = this.publishers.get(event.target)
        if (pub) {
          pub.config.messagesPerSecond = event.params.rate as number
          if (!this.activeFailures.includes(`publisher-flood:${event.target}`)) {
            this.activeFailures.push(`publisher-flood:${event.target}`)
          }
        }
        break
      }
      case 'queue-overflow': {
        const q = this.queues.get(event.target)
        if (q) {
          q.depth += (event.params.messages as number) ?? 0
          if (!this.activeFailures.includes(`queue-overflow:${event.target}`)) {
            this.activeFailures.push(`queue-overflow:${event.target}`)
          }
        }
        break
      }
      case 'network-partition': {
        // Bring down all nodes except the primary (event.target = surviving node)
        this.nodes.forEach((node, id) => {
          if (id !== event.target) {
            node.isOnline = false
            if (!this.activeFailures.includes(`network-partition:${id}`)) {
              this.activeFailures.push(`network-partition:${id}`)
            }
          }
        })
        break
      }
      case 'dlx-flood': {
        const q = this.queues.get(event.target)
        if (q) {
          const msgs = (event.params.messages as number) ?? 0
          q.dlqDepth += msgs
          q.depth += msgs
          if (!this.activeFailures.includes(`dlx-flood:${event.target}`)) {
            this.activeFailures.push(`dlx-flood:${event.target}`)
          }
        }
        break
      }
      case 'consumer-slow': {
        const consumer = this.consumers.get(event.target)
        if (consumer) {
          consumer.config.processingTimeMs = (event.params.processingTimeMs as number) ?? 500
        }
        break
      }
      case 'consumer-error-rate': {
        const consumer = this.consumers.get(event.target)
        if (consumer) {
          consumer.config.errorRate = (event.params.errorRate as number) ?? 0.5
        }
        break
      }
    }
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  /** Route messages to DLX from a queue */
  private routeToDLX(sourceQueue: QueueState, sourceQueueName: string, count: number): void {
    if (!sourceQueue.config.deadLetterExchange || count <= 0) return
    const dlxQueues = resolveQueues(
      sourceQueue.config.deadLetterExchange,
      sourceQueue.config.deadLetterRoutingKey ?? sourceQueueName,
      this.exchanges,
      this.bindings,
    )
    for (const dlqName of dlxQueues) {
      const dlq = this.queues.get(dlqName)
      if (dlq) {
        dlq.depth += count
        dlq.dlqDepth += count
      }
    }
  }

  private updateNodeAlarms(): void {
    this.nodes.forEach(node => {
      if (!node.isOnline) return
      node.isMemoryAlarm = node.memoryUsedMb > node.maxMemoryMb * 0.4
      node.isDiskAlarm = node.diskFreeMb < node.minDiskFreeMb
    })
  }

  private anyAlarmActive(): boolean {
    for (const node of this.nodes.values()) {
      if (node.isOnline && (node.isMemoryAlarm || node.isDiskAlarm)) return true
    }
    return false
  }

  private collectMetrics(): RMQMetrics {
    let totalReady = 0
    let totalUnacked = 0
    let totalDlq = 0
    let totalEnqueue = 0
    let totalDequeue = 0

    this.queues.forEach(q => {
      totalReady += q.depth
      totalUnacked += q.unacked
      totalDlq += q.dlqDepth
      totalEnqueue += q.enqueueRate
      totalDequeue += q.dequeueRate
    })

    let totalErrors = 0
    let totalAcked = 0
    this.consumers.forEach(c => {
      totalErrors += c.totalErrors
      totalAcked += c.totalAcked
    })
    const errorRate = (totalAcked + totalErrors) > 0
      ? totalErrors / (totalAcked + totalErrors)
      : 0

    let blockedPublishers = 0
    this.publishers.forEach(p => { if (p.blocked) blockedPublishers++ })

    // Aggregate node memory and disk ratios
    let memRatioSum = 0
    let diskRatioSum = 0
    let onlineNodes = 0
    this.nodes.forEach(node => {
      if (!node.isOnline) return
      onlineNodes++
      memRatioSum += node.memoryUsedMb / Math.max(1, node.maxMemoryMb)
      // Disk ratio: used vs estimated total (minDiskFreeMb * 10 = initial free space)
      const estimatedTotal = node.minDiskFreeMb * 10
      const used = estimatedTotal - node.diskFreeMb
      diskRatioSum += Math.min(1, used / Math.max(1, estimatedTotal))
    })
    const memRatio = onlineNodes > 0 ? memRatioSum / onlineNodes : 0
    const diskRatio = onlineNodes > 0 ? diskRatioSum / onlineNodes : 0

    return {
      totalMessagesReady: totalReady,
      totalMessagesUnacked: totalUnacked,
      totalPublishRate: totalEnqueue,
      totalConsumeRate: totalDequeue,
      errorRate,
      memoryUsageRatio: Math.min(1, memRatio),
      diskUsageRatio: Math.min(1, diskRatio),
      blockedPublishers,
      dlqDepth: totalDlq,
    }
  }

  // ── Topology initialization ─────────────────────────────────────────────────

  private initTopology(def: RMQScenarioDefinition): void {
    // Nodes
    for (const nc of def.initialTopology.nodes) {
      this.nodes.set(nc.id, {
        id: nc.id,
        isOnline: true,
        memoryUsedMb: 200,
        maxMemoryMb: nc.maxMemoryMb,
        diskFreeMb: nc.minDiskFreeMb * 10,
        minDiskFreeMb: nc.minDiskFreeMb,
        connectionsCount: 0,
        maxConnections: nc.maxConnections,
        isMemoryAlarm: false,
        isDiskAlarm: false,
      })
    }

    // Exchanges
    for (const ec of def.initialTopology.exchanges) {
      this.exchanges.set(ec.name, { ...ec })
    }

    // Queues
    for (const qc of def.initialTopology.queues) {
      this.queues.set(qc.name, {
        config: { ...qc },
        depth: 0,
        unacked: 0,
        dlqDepth: 0,
        consumersCount: 0,
        enqueueRate: 0,
        dequeueRate: 0,
        memoryUsedMb: 0,
      })
    }

    // Bindings
    this.bindings = [...def.initialTopology.bindings]

    // Publishers
    for (const pc of def.initialTopology.publishers) {
      this.publishers.set(pc.id, {
        config: { ...pc },
        isActive: true,
        totalSent: 0,
        totalUnconfirmed: 0,
        totalFailed: 0,
        blocked: false,
      })
    }

    // Consumers
    for (const cc of def.initialTopology.consumers) {
      this.consumers.set(cc.id, {
        config: { ...cc },
        isActive: true,
        totalAcked: 0,
        totalNacked: 0,
        totalErrors: 0,
        avgProcessingMs: cc.processingTimeMs,
      })
    }
  }
}
