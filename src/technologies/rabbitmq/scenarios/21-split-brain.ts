import type { RMQScenarioDefinition } from '../engine/types'

const scenario: RMQScenarioDefinition = {
  id: 'rmq-21-split-brain',
  index: 21,
  title: 'Network Partition Brain-Split',
  subtitle: 'Hard · Cluster Partitions',
  difficulty: 'hard',
  estimatedMinutes: 35,
  coverConcepts: ['network-partition', 'cluster-partition-handling', 'autoheal', 'pause-minority', 'split-brain'],

  briefing: {
    story:
      "A 3-node RabbitMQ cluster experienced a network partition isolating node-3. With partition_handling: ignore (default), all three nodes continued operating. Node-3 accepted 40K writes independently. When the network healed, RabbitMQ detected conflicting state and suspended node-3. You need to choose between autoheal (data loss) or manual merge (complex but safe).",
    symptom:
      "cluster_partition_handling is set to 'ignore'. During the partition, node-3 diverged with 40,000 writes that are not present on node-1 and node-2. After healing, rabbitmqctl cluster_status shows a partition warning. Node-3 is suspended and its queues are unavailable. The partition cannot be transparently merged.",
    goal:
      "Resolve the partition: either set partition_handling to autoheal and restart node-3 (losing the 40K diverged messages) or manually rejoin node-3 after backing up its state. Configure pause-minority going forward to prevent future split-brains. Restore full cluster health.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 70,
        text: "First, understand what data is at risk. Inspect node-3's queues via rabbitmqctl -n rabbit@node-3 list_queues. Decide whether the 40K messages on node-3 are recoverable from the source system before choosing autoheal (which will lose them).",
        relatedConcept: 'split-brain',
      },
      {
        order: 2,
        triggerOnHealthBelow: 55,
        text: "To use autoheal: set {cluster_partition_handling, autoheal} in rabbitmq.conf, then restart node-3. RabbitMQ will automatically choose the majority partition (node-1 + node-2) as the winner and reset node-3 to match their state — discarding node-3's 40K diverged writes.",
        relatedConcept: 'autoheal',
      },
      {
        order: 3,
        triggerOnHealthBelow: 40,
        text: "Going forward, set partition_handling to pause-minority. In a 3-node cluster, if any node loses contact with the majority, it pauses itself — refusing publishes and consuming. This prevents split-brain entirely at the cost of reduced availability during partitions.",
        relatedConcept: 'pause-minority',
      },
    ],
  },

  initialTopology: {
    nodes: [
      { id: 'rabbit@node-1', maxMemoryMb: 8192, minDiskFreeMb: 2000, maxConnections: 1000 },
      { id: 'rabbit@node-2', maxMemoryMb: 8192, minDiskFreeMb: 2000, maxConnections: 1000 },
      { id: 'rabbit@node-3', maxMemoryMb: 8192, minDiskFreeMb: 2000, maxConnections: 1000 },
    ],
    exchanges: [
      { name: 'events', type: 'topic', durable: true, autoDelete: false },
    ],
    queues: [
      {
        name: 'events.primary',
        type: 'classic',
        durable: true,
        exclusive: false,
        autoDelete: false,
        maxLength: null,
        messageTtlMs: null,
        deadLetterExchange: null,
        deadLetterRoutingKey: null,
        maxPriority: null,
        lazyMode: false,
      },
      {
        name: 'events.node3',
        type: 'classic',
        durable: true,
        exclusive: false,
        autoDelete: false,
        maxLength: null,
        messageTtlMs: null,
        deadLetterExchange: null,
        deadLetterRoutingKey: null,
        maxPriority: null,
        lazyMode: false,
      },
    ],
    bindings: [
      { exchange: 'events', queue: 'events.primary', routingKey: 'event.#' },
      { exchange: 'events', queue: 'events.node3', routingKey: 'event.#' },
    ],
    publishers: [
      {
        id: 'publisher-main',
        targetExchange: 'events',
        routingKey: 'event.created',
        messagesPerSecond: 500,
        messageSizeBytes: 1024,
        confirmMode: true,
        persistent: true,
      },
    ],
    consumers: [
      {
        id: 'consumer-primary',
        queue: 'events.primary',
        prefetchCount: 100,
        ackMode: 'manual',
        processingTimeMs: 5,
        errorRate: 0,
      },
    ],
  },

  failureScript: [
    { atTick: 3, type: 'network-partition', target: 'rabbit@node-3', params: { isolatedFrom: ['rabbit@node-1', 'rabbit@node-2'], divergedWrites: 40000 } },
    { atTick: 10, type: 'partition-healed', target: 'rabbit@node-3', params: {} },
    { atTick: 11, type: 'node-suspended', target: 'rabbit@node-3', params: { reason: 'partition-conflict' } },
  ],

  victoryConditions: [
    {
      id: 'partition-resolved',
      description: 'Network partition conflict resolved',
      required: true,
      check: s => !s.activeFailures.includes('node-suspended'),
    },
    {
      id: 'cluster-healthy',
      description: 'All 3 nodes in cluster and operational',
      required: true,
      check: s => {
        let onlineCount = 0
        for (const [, node] of s.nodes) {
          if (node.isOnline) onlineCount++
        }
        return onlineCount === 3
      },
    },
    {
      id: 'health-good',
      description: 'System health score above 80',
      required: true,
      check: s => s.systemHealthScore > 80,
    },
  ],

  conceptCards: [
    {
      concept: 'split-brain',
      title: 'Split-Brain in RabbitMQ Clusters',
      body: "A split-brain occurs when a network partition causes cluster nodes to operate independently, each accepting writes that the other cannot see. RabbitMQ's default partition_handling: ignore allows this to happen silently. When the partition heals, the conflicting states cannot be automatically merged — one side must be discarded. The 'winning' side is chosen by majority vote or manual intervention.",
      showWhenFixed: true,
    },
    {
      concept: 'autoheal',
      title: 'Autoheal Partition Handling',
      body: "With partition_handling: autoheal, when a partition heals RabbitMQ automatically restarts the minority partition nodes and syncs them from the majority. This is hands-off but sacrifices all writes made on the minority side. Suitable for idempotent workloads where occasional message loss is acceptable. NOT suitable for financial systems or any use case requiring exactly-once delivery.",
      showWhenFixed: false,
    },
    {
      concept: 'pause-minority',
      title: 'Pause-Minority Partition Handling',
      body: "With partition_handling: pause-minority, any node that is in the minority side of a partition pauses itself — it refuses to accept publishes and serve consumers. This prevents split-brain entirely. In a 3-node cluster, a partition isolating 1 node causes that single node to pause while the 2-node majority continues operating normally. This is the recommended setting for most production clusters.",
      showWhenFixed: false,
    },
  ],

  availableActions: [
    'set-partition-handling-autoheal',
    'set-partition-handling-pause-minority',
    'manually-rejoin-node',
  ],
}

export default scenario
