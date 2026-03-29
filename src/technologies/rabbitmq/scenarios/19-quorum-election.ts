import type { RMQScenarioDefinition } from '../engine/types'

const scenario: RMQScenarioDefinition = {
  id: 'rmq-19-quorum-election',
  index: 19,
  title: 'Quorum Queue Leader Election',
  subtitle: 'Hard · Raft Consensus',
  difficulty: 'hard',
  estimatedMinutes: 30,
  coverConcepts: ['quorum-queues', 'raft-consensus', 'leader-election', 'replica-count', 'quorum-size'],

  briefing: {
    story:
      "A 5-node RabbitMQ cluster running quorum queues lost 3 nodes simultaneously during a network switch failure. With only 2 nodes remaining, quorum queues can't elect a leader (need majority: 3 of 5). All quorum queue operations are blocked. Classic queues still work. Consumer applications are stuck.",
    symptom:
      "Nodes rabbit@node-3, rabbit@node-4, and rabbit@node-5 are offline. Quorum queues require ⌈5/2⌉+1 = 3 nodes for a majority. With only 2 nodes alive, no leader election can succeed. All quorum queue declares, publishes, and consumes block indefinitely. Consumer services are timing out.",
    goal:
      'Restore at least one of the failed nodes to re-establish quorum (3 of 5), or reconfigure the queue to use 3 replicas total on the surviving infrastructure. Get quorum queues operational and consumers processing messages again.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 70,
        text: "The fastest path to recovery is restoring any one of the 3 failed nodes. Once a third node rejoins, the Raft group has a majority again and can elect a leader. Check whether the network switch is recoverable before taking more drastic action.",
        relatedConcept: 'raft-consensus',
      },
      {
        order: 2,
        triggerOnHealthBelow: 55,
        text: "If the failed nodes can't be recovered quickly, you can reduce the quorum size to 3 replicas (on the 2 surviving nodes plus one recovered node). Use: rabbitmq-queues grow or reconfigure the queue policy's x-quorum-initial-group-size. Note: this requires at least 3 nodes.",
        relatedConcept: 'quorum-size',
      },
      {
        order: 3,
        triggerOnHealthBelow: 40,
        text: "As a last resort, force-leader-election can override Raft safety guarantees to unblock operations — but this risks data loss if the forced leader has a stale log. Only use this if you accept potential message loss and have no other option.",
        relatedConcept: 'leader-election',
      },
    ],
  },

  initialTopology: {
    nodes: [
      { id: 'rabbit@node-1', maxMemoryMb: 8192, minDiskFreeMb: 2000, maxConnections: 1000 },
      { id: 'rabbit@node-2', maxMemoryMb: 8192, minDiskFreeMb: 2000, maxConnections: 1000 },
      { id: 'rabbit@node-3', maxMemoryMb: 8192, minDiskFreeMb: 2000, maxConnections: 1000 },
      { id: 'rabbit@node-4', maxMemoryMb: 8192, minDiskFreeMb: 2000, maxConnections: 1000 },
      { id: 'rabbit@node-5', maxMemoryMb: 8192, minDiskFreeMb: 2000, maxConnections: 1000 },
    ],
    exchanges: [
      { name: 'orders', type: 'direct', durable: true, autoDelete: false },
      { name: 'inventory', type: 'topic', durable: true, autoDelete: false },
    ],
    queues: [
      {
        name: 'orders.quorum',
        type: 'quorum',
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
        name: 'inventory.updates',
        type: 'quorum',
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
      { exchange: 'orders', queue: 'orders.quorum', routingKey: 'order.#' },
      { exchange: 'inventory', queue: 'inventory.updates', routingKey: 'inventory.#' },
    ],
    publishers: [
      {
        id: 'publisher-orders',
        targetExchange: 'orders',
        routingKey: 'order.created',
        messagesPerSecond: 1000,
        messageSizeBytes: 1024,
        confirmMode: true,
        persistent: true,
      },
    ],
    consumers: [
      {
        id: 'consumer-order-processor',
        queue: 'orders.quorum',
        prefetchCount: 100,
        ackMode: 'manual',
        processingTimeMs: 10,
        errorRate: 0,
      },
    ],
  },

  failureScript: [
    { atTick: 5, type: 'node-offline', target: 'rabbit@node-3', params: { reason: 'network-switch-failure' } },
    { atTick: 5, type: 'node-offline', target: 'rabbit@node-4', params: { reason: 'network-switch-failure' } },
    { atTick: 5, type: 'node-offline', target: 'rabbit@node-5', params: { reason: 'network-switch-failure' } },
    { atTick: 7, type: 'quorum-lost', target: 'orders.quorum', params: { nodesAlive: 2, nodesTotal: 5, majorityRequired: 3 } },
    { atTick: 7, type: 'quorum-lost', target: 'inventory.updates', params: { nodesAlive: 2, nodesTotal: 5, majorityRequired: 3 } },
  ],

  victoryConditions: [
    {
      id: 'quorum-restored',
      description: 'Quorum queues have a leader elected',
      required: true,
      check: s => !s.activeFailures.includes('quorum-lost'),
    },
    {
      id: 'consumers-processing',
      description: 'Consumers are actively processing messages',
      required: true,
      check: s => s.metrics.totalConsumeRate > 0,
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
      concept: 'raft-consensus',
      title: 'Raft Consensus in Quorum Queues',
      body: "Quorum queues use the Raft distributed consensus algorithm. A write is confirmed only after it has been replicated to a majority (quorum) of the queue's replicas. This guarantees no message loss on node failure — but it means you need a majority of replicas alive to make any progress. A 5-replica queue requires 3 nodes; a 3-replica queue requires 2 nodes.",
      showWhenFixed: true,
    },
    {
      concept: 'quorum-size',
      title: 'Choosing Quorum Size',
      body: "The optimal quorum size balances availability against replication overhead. 3 replicas (can tolerate 1 failure) is common for low-latency queues. 5 replicas (can tolerate 2 failures) suits mission-critical queues. Never use 2 replicas — you need majority (2 of 2 = 100%), so a single failure halts the queue. Always use odd replica counts to avoid tie-breaking edge cases.",
      showWhenFixed: false,
    },
    {
      concept: 'leader-election',
      title: 'Leader Election',
      body: "In Raft, only the leader accepts writes. When the leader is lost, the remaining replicas hold an election: each follower waits a random timeout then requests votes. A candidate wins if it receives votes from a majority. Without a majority of replicas alive, no candidate can win and the queue blocks indefinitely — this is correct behaviour (availability vs. consistency trade-off).",
      showWhenFixed: false,
    },
  ],

  availableActions: [
    'restore-failed-nodes',
    'reduce-quorum-to-3',
    'force-leader-election',
  ],
}

export default scenario
