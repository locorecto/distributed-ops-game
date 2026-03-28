import { nanoid } from 'nanoid'
import type {
  SimulationSnapshot, TopicConfig, ProducerConfig, ConsumerConfig,
  BrokerConfig, BrokerId, TopicName, ProducerId, ConsumerId, GroupId,
  PartitionKey, ActiveFailure,
} from './types'
import { EventBus } from './EventBus'
import {
  createTopicState, addPartitions as addTopicPartitions,
  produceMessages, applyRetention,
} from './KafkaTopic'
import {
  createProducerState, generateMessages, updateProducerMetrics,
  applyProducerConfigPatch,
} from './KafkaProducer'
import {
  createConsumerState, pollAndProcess, initOffsets, manualCommitAll,
} from './KafkaConsumer'
import {
  createConsumerGroupState, addMember, removeMember,
  tickRebalance, triggerRebalance,
} from './ConsumerGroup'
import {
  createBrokerState, updateBrokerMetrics,
  takeBrokerOffline, bringBrokerOnline,
} from './KafkaBroker'
import {
  collectMetrics, computeHealthScore, makeDataPoint,
} from './MetricsCollector'
import { FailureInjector, makeActiveFailure } from './FailureInjector'
import type { ScenarioDefinition, TopologyDefinition } from '../scenarios/types'
import { GAME } from '../constants/game'
import { KAFKA_DEFAULTS } from '../constants/kafka'

export class SimulationEngine {
  readonly eventBus = new EventBus()
  private failureInjector = new FailureInjector()

  private tickNumber = 0
  private tickInterval: ReturnType<typeof setInterval> | null = null
  private speed: 1 | 2 | 4 = 1
  private isRunning = false
  private scenario: ScenarioDefinition | null = null

  // mutable state
  private brokers = new Map<BrokerId, ReturnType<typeof createBrokerState>>()
  private topics = new Map<TopicName, ReturnType<typeof createTopicState>>()
  private producers = new Map<ProducerId, ReturnType<typeof createProducerState>>()
  private consumers = new Map<ConsumerId, ReturnType<typeof createConsumerState>>()
  private consumerGroups = new Map<GroupId, ReturnType<typeof createConsumerGroupState>>()
  private activeFailures: ActiveFailure[] = []
  private prevMetrics = this.emptyMetrics()

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  loadScenario(def: ScenarioDefinition): void {
    this.stop()
    this.reset()
    this.scenario = def
    this.initTopology(def.initialTopology)
    this.failureInjector.load(def.failureScript)
  }

  start(): void {
    if (this.isRunning) return
    this.isRunning = true
    const ms = GAME.TICK_RATE_MS / this.speed
    this.tickInterval = setInterval(() => this.tick(), ms)
  }

  stop(): void {
    if (this.tickInterval) clearInterval(this.tickInterval)
    this.tickInterval = null
    this.isRunning = false
  }

  reset(): void {
    this.stop()
    this.tickNumber = 0
    this.brokers.clear()
    this.topics.clear()
    this.producers.clear()
    this.consumers.clear()
    this.consumerGroups.clear()
    this.activeFailures = []
    this.prevMetrics = this.emptyMetrics()
    this.failureInjector.reset()
    this.eventBus.clear()
  }

  setSpeed(s: 1 | 2 | 4): void {
    this.speed = s
    if (this.isRunning) {
      this.stop()
      this.isRunning = false
      this.start()
    }
  }

  getSnapshot(): SimulationSnapshot {
    const metrics = collectMetrics({
      tickNumber: this.tickNumber,
      wallTime: Date.now(),
      brokers: this.brokers,
      topics: this.topics,
      producers: this.producers,
      consumers: this.consumers,
      consumerGroups: this.consumerGroups,
      streamProcessors: new Map(),
      connectors: new Map(),
      mirrorLinks: new Map(),
      activeFailures: this.activeFailures,
    }, this.prevMetrics)

    const maxLag = this.scenario?.maxLagForHealth ?? 1000
    const healthScore = computeHealthScore(metrics, maxLag)

    return {
      tickNumber: this.tickNumber,
      wallTime: Date.now(),
      brokers: new Map(this.brokers),
      topics: new Map(this.topics),
      producers: new Map(this.producers),
      consumers: new Map(this.consumers),
      consumerGroups: new Map(this.consumerGroups),
      streamProcessors: new Map(),
      connectors: new Map(),
      mirrorLinks: new Map(),
      systemHealthScore: healthScore,
      activeFailures: [...this.activeFailures],
      metrics,
    }
  }

  // ── Tick ────────────────────────────────────────────────────────────────────

  private tick(): void {
    this.tickNumber++
    const tick = this.tickNumber
    const tickRateMs = GAME.TICK_RATE_MS

    // 1. failure injection
    const dueEvents = this.failureInjector.getDueEvents(tick)
    for (const event of dueEvents) {
      this.applyFailureEvent(event)
      this.activeFailures.push(makeActiveFailure(event, tick))
    }

    // 2. producer step
    this.producers.forEach(producer => {
      const msgs = generateMessages(producer, tick, tickRateMs)
      if (msgs.length === 0) return
      const topic = this.topics.get(producer.config.targetTopic)
      if (!topic) return
      const result = produceMessages(
        topic, msgs,
        producer.config.acks,
        producer.producerEpoch,
        topic.config.partitionCount,
        { index: producer.roundRobinIndex },
        producer.config.compressionType,
      )
      if (result.success) {
        updateProducerMetrics(producer, result.messagesWritten, tickRateMs)
      } else {
        producer.totalFailed += msgs.length
        producer.isHealthy = false
        this.eventBus.emit('producer:error', { producerId: producer.config.id, reason: result.reason })
      }
    })

    // 3. consumer group rebalance ticks
    this.consumerGroups.forEach(group => {
      tickRebalance(group, this.consumers, this.topics)
    })

    // 4. consumer step
    this.consumers.forEach(consumer => {
      if (!consumer.isActive) return
      // check if was active before — detect crash
      const wasActive = consumer.isActive
      pollAndProcess(consumer, this.topics, tick, tickRateMs, this.scenario?.slaMs)
      if (wasActive && !consumer.isActive) {
        // consumer crashed — trigger rebalance
        const group = this.consumerGroups.get(consumer.config.groupId)
        if (group) triggerRebalance(group)
        this.eventBus.emit('consumer:crash', { consumerId: consumer.config.id })
      }
    })

    // 5. retention
    if (tick % 10 === 0) {
      this.topics.forEach(topic => applyRetention(topic, tick, tickRateMs))
    }

    // 6. broker metrics
    this.brokers.forEach(broker => updateBrokerMetrics(broker, this.topics))

    // 7. collect metrics + emit snapshot
    const metrics = collectMetrics({
      tickNumber: tick,
      wallTime: Date.now(),
      brokers: this.brokers,
      topics: this.topics,
      producers: this.producers,
      consumers: this.consumers,
      consumerGroups: this.consumerGroups,
      streamProcessors: new Map(),
      connectors: new Map(),
      mirrorLinks: new Map(),
      activeFailures: this.activeFailures,
    }, this.prevMetrics)
    this.prevMetrics = metrics

    const healthScore = computeHealthScore(metrics, this.scenario?.maxLagForHealth ?? 1000)
    const dataPoint = makeDataPoint(tick, metrics, healthScore)
    this.eventBus.emit('tick', dataPoint)
  }

  // ── Config Mutations ─────────────────────────────────────────────────────────

  applyTopicConfig(topicName: TopicName, patch: Partial<TopicConfig>): void {
    const topic = this.topics.get(topicName)
    if (!topic) return
    const newPartitionCount = patch.partitionCount
    Object.assign(topic.config, patch)
    if (newPartitionCount && newPartitionCount > topic.partitions.size) {
      const toAdd = newPartitionCount - topic.partitions.size
      topic.config.partitionCount = topic.partitions.size // reset so addTopicPartitions adds the delta
      const brokerIds = Array.from(this.brokers.keys())
      addTopicPartitions(topic, toAdd, brokerIds)
      // trigger rebalance for all groups subscribed to this topic
      this.consumerGroups.forEach(group => {
        const members = group.members
        const subscribes = members.some(id => {
          const c = this.consumers.get(id)
          return c?.config.subscribedTopics.includes(topicName)
        })
        if (subscribes) triggerRebalance(group)
      })
    }
    if (patch.replicationFactor) {
      this.updateReplicationFactor(topicName, patch.replicationFactor)
    }
  }

  private updateReplicationFactor(topicName: TopicName, rf: number): void {
    const topic = this.topics.get(topicName)
    if (!topic) return
    const brokerIds = Array.from(this.brokers.keys()).filter(id => this.brokers.get(id)?.isOnline)
    topic.partitions.forEach(partition => {
      const newReplicas = brokerIds.slice(0, Math.min(rf, brokerIds.length))
      partition.replicaIds = newReplicas
      partition.isrIds = newReplicas.filter(id => this.brokers.get(id)?.isOnline)
    })
  }

  applyProducerConfig(producerId: ProducerId, patch: Partial<ProducerConfig>): void {
    const producer = this.producers.get(producerId)
    if (!producer) return
    applyProducerConfigPatch(producer, patch)
    producer.isHealthy = true
  }

  applyConsumerConfig(consumerId: ConsumerId, patch: Partial<ConsumerConfig>): void {
    const consumer = this.consumers.get(consumerId)
    if (!consumer) return
    Object.assign(consumer.config, patch)
    consumer.lastHeartbeatTick = this.tickNumber
    consumer.lastPollTick = this.tickNumber
  }

  addPartitions(topicName: TopicName, count: number): void {
    this.applyTopicConfig(topicName, {
      partitionCount: (this.topics.get(topicName)?.config.partitionCount ?? 1) + count
    })
  }

  addConsumer(groupId: GroupId, config: Omit<ConsumerConfig, 'id'>, suggestedId?: string): ConsumerId {
    const id = suggestedId ?? `consumer-${nanoid(6)}`
    const fullConfig: ConsumerConfig = { ...config, id }
    const state = createConsumerState(fullConfig)
    this.consumers.set(id, state)

    let group = this.consumerGroups.get(groupId)
    if (!group) {
      const coordinatorId = Array.from(this.brokers.keys())[0] ?? 0
      group = createConsumerGroupState(groupId, coordinatorId)
      this.consumerGroups.set(groupId, group)
    }
    addMember(group, id)
    state.lastHeartbeatTick = this.tickNumber
    state.lastPollTick = this.tickNumber
    return id
  }

  removeConsumer(consumerId: ConsumerId): void {
    const consumer = this.consumers.get(consumerId)
    if (!consumer) return
    consumer.isActive = false
    const group = this.consumerGroups.get(consumer.config.groupId)
    if (group) removeMember(group, consumerId)
    this.consumers.delete(consumerId)
  }

  toggleBroker(brokerId: BrokerId): void {
    const broker = this.brokers.get(brokerId)
    if (!broker) return
    if (broker.isOnline) {
      takeBrokerOffline(brokerId, this.brokers, this.topics)
    } else {
      bringBrokerOnline(brokerId, this.brokers, this.topics)
    }
  }

  triggerManualCommit(consumerId: ConsumerId): void {
    const consumer = this.consumers.get(consumerId)
    if (!consumer) return
    manualCommitAll(consumer)
  }

  resetConsumerGroupOffset(groupId: GroupId, topicName: TopicName, to: 'earliest' | 'latest'): void {
    const group = this.consumerGroups.get(groupId)
    if (!group) return
    group.members.forEach(cid => {
      const consumer = this.consumers.get(cid)
      if (!consumer) return
      const topic = this.topics.get(topicName)
      if (!topic) return
      topic.partitions.forEach((partition, pid) => {
        const key: PartitionKey = `${topicName}:${pid}`
        const offset = to === 'earliest' ? partition.logStartOffset - 1 : partition.logEndOffset - 1
        consumer.committedOffsets.set(key, Math.max(-1, offset))
        consumer.currentOffsets.set(key, Math.max(-1, offset))
      })
      // reset missed messages counter
    })
    group.missedMessages = 0
    triggerRebalance(group)
  }

  addDLQForTopic(topicName: TopicName): void {
    this.consumers.forEach(consumer => {
      if (consumer.config.subscribedTopics.includes(topicName)) {
        consumer.config.dlqEnabled = true
      }
    })
  }

  // ── Failure Application ──────────────────────────────────────────────────────

  private applyFailureEvent(event: ReturnType<typeof this.failureInjector.getDueEvents>[0]): void {
    switch (event.type) {
      case 'broker-down': {
        const brokerId = parseInt(event.target.split('-').pop() ?? '0')
        takeBrokerOffline(brokerId, this.brokers, this.topics)
        break
      }
      case 'consumer-lag-spike': {
        const rate = event.params.producerRateMultiplier as number ?? 5
        this.producers.forEach(p => {
          if (event.target === 'all' || p.config.id === event.target) {
            p.config.messagesPerSecond *= rate
          }
        })
        break
      }
      case 'producer-rate-spike': {
        const producer = this.producers.get(event.target)
        if (producer) producer.config.messagesPerSecond = event.params.rate as number
        break
      }
      case 'consumer-slow': {
        const consumer = this.consumers.get(event.target)
        if (consumer) consumer.config.processingTimeMs = event.params.processingTimeMs as number
        break
      }
      case 'consumer-crash': {
        const consumer = this.consumers.get(event.target)
        if (consumer) {
          consumer.isActive = false
          const group = this.consumerGroups.get(consumer.config.groupId)
          if (group) triggerRebalance(group)
        }
        break
      }
      case 'duplicate-messages': {
        const producer = this.producers.get(event.target)
        if (producer) producer.config.idempotent = false
        break
      }
      case 'no-key-hot-partition': {
        const producer = this.producers.get(event.target)
        if (producer) producer.config.keyStrategy = 'null'
        break
      }
      case 'record-too-large': {
        const producer = this.producers.get(event.target)
        if (producer) producer.config.messageSizeBytes = event.params.sizeBytes as number
        break
      }
      case 'sla-breach': {
        const consumer = this.consumers.get(event.target)
        if (consumer) consumer.config.processingTimeMs = event.params.processingTimeMs as number
        break
      }
      case 'schema-incompatibility': {
        const producer = this.producers.get(event.target)
        if (producer) producer.config.schemaVersion = event.params.schemaVersion as number
        break
      }
    }
  }

  // ── Topology Init ────────────────────────────────────────────────────────────

  private initTopology(topology: TopologyDefinition): void {
    // brokers
    topology.brokers.forEach((bc, idx) => {
      const state = createBrokerState(
        { id: bc.id, diskCapacityBytes: bc.diskCapacityBytes ?? KAFKA_DEFAULTS.broker.diskCapacityBytes },
        idx === 0,
      )
      this.brokers.set(bc.id, state)
    })

    const brokerIds = Array.from(this.brokers.keys())

    // topics
    topology.topics.forEach(tc => {
      const state = createTopicState(tc, brokerIds)
      this.topics.set(tc.name, state)
    })

    // producers
    topology.producers.forEach(pc => {
      const state = createProducerState({
        retries: KAFKA_DEFAULTS.producer.retries,
        retryBackoffMs: KAFKA_DEFAULTS.producer.retryBackoffMs,
        idempotent: false,
        transactional: false,
        batchSizeBytes: KAFKA_DEFAULTS.producer.batchSizeBytes,
        lingerMs: KAFKA_DEFAULTS.producer.lingerMs,
        messageSizeBytes: 256,
        maxRequestSizeBytes: KAFKA_DEFAULTS.producer.maxRequestSizeBytes,
        ...pc,
        compressionType: (pc.compressionType ?? 'none') as import('./types').CompressionType,
      })
      this.producers.set(pc.id, state)
    })

    // consumers + groups
    topology.consumers.forEach(cc => {
      const fullConfig: ConsumerConfig = {
        autoCommitIntervalMs: KAFKA_DEFAULTS.consumer.autoCommitIntervalMs,
        sessionTimeoutMs: KAFKA_DEFAULTS.consumer.sessionTimeoutMs,
        heartbeatIntervalMs: KAFKA_DEFAULTS.consumer.heartbeatIntervalMs,
        fetchMinBytes: KAFKA_DEFAULTS.consumer.fetchMinBytes,
        fetchMaxWaitMs: KAFKA_DEFAULTS.consumer.fetchMaxWaitMs,
        fetchMaxBytes: KAFKA_DEFAULTS.consumer.fetchMaxBytes,
        maxPartitionFetchBytes: KAFKA_DEFAULTS.consumer.maxPartitionFetchBytes,
        errorRate: 0,
        isolationLevel: 'read_uncommitted',
        dlqEnabled: false,
        maxRetries: 3,
        maxPollIntervalMs: KAFKA_DEFAULTS.consumer.maxPollIntervalMs,
        ...cc,
      }
      const state = createConsumerState(fullConfig)
      state.lastHeartbeatTick = 0
      state.lastPollTick = 0
      this.consumers.set(cc.id, state)

      // ensure group exists
      let group = this.consumerGroups.get(cc.groupId)
      if (!group) {
        group = createConsumerGroupState(cc.groupId, brokerIds[0] ?? 0)
        this.consumerGroups.set(cc.groupId, group)
      }
      if (!group.members.includes(cc.id)) group.members.push(cc.id)
    })

    // initial partition assignment (no rebalance delay at start)
    this.consumerGroups.forEach(group => {
      triggerRebalance(group)
      group.rebalancingTicksLeft = 1 // immediate
    })

    // init offsets
    this.consumers.forEach(consumer => initOffsets(consumer, this.topics))
  }

  private emptyMetrics() {
    return {
      messagesPerSecIn: 0, messagesPerSecOut: 0, totalLag: 0,
      errorRate: 0, underReplicatedPartitions: 0, offlinePartitions: 0,
      activeBrokers: 0, dlqDepth: 0, duplicateCount: 0,
      orderingViolations: 0, batchEfficiency: 1, compressionRatio: 0,
      slaBreaches: 0, deserializationErrors: 0,
    }
  }
}
