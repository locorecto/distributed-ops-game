import type { RMQScenarioDefinition } from '../engine/types'

const scenario: RMQScenarioDefinition = {
  id: 'rmq-29-multi-az',
  index: 29,
  title: 'Multi-AZ Active-Passive Failover',
  subtitle: 'Expert · Node Evacuation',
  difficulty: 'expert',
  estimatedMinutes: 45,
  coverConcepts: ['node-maintenance', 'queue-evacuation', 'maintenance-mode', 'graceful-shutdown', 'consumer-migration'],

  briefing: {
    story:
      "You need to perform OS patching on all 3 RabbitMQ nodes with zero message loss. Stopping nodes directly while consumers are active causes quorum queue leaders to trigger elections, temporarily blocking consumers. Using maintenance mode (rabbitmq-upgrade enable-maintenance-mode) evacuates queues gracefully — but you've never tested this procedure in production.",
    symptom:
      "Three nodes must be patched in a rolling fashion. Direct node shutdown causes: (1) quorum queue leader elections blocking operations for 5-15 seconds, (2) consumers losing their TCP connections and reconnecting, (3) in-flight unacked messages being requeued. Using maintenance mode avoids these issues by gracefully migrating queue leaders before shutdown.",
    goal:
      'Successfully patch all 3 nodes using maintenance mode: enable maintenance mode on node-1, verify queue migration to node-2/node-3, patch and restart node-1, disable maintenance mode, repeat for node-2 and node-3. Achieve zero message loss and less than 5 seconds total consumer downtime.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 70,
        text: "Enable maintenance mode on node-1: rabbitmq-upgrade enable-maintenance-mode. This suspends queu listener activity and migrates queue leaders away from node-1. Wait for rabbitmq-upgrade await-online-quorum-plus-one before proceeding.",
        relatedConcept: 'maintenance-mode',
      },
      {
        order: 2,
        triggerOnHealthBelow: 55,
        text: "Verify queue migration after enabling maintenance mode: rabbitmqctl list_queues name leader --formatter=pretty_table. All quorum queue leaders should now be on node-2 or node-3. Only proceed with node shutdown once all leaders have migrated.",
        relatedConcept: 'queue-evacuation',
      },
      {
        order: 3,
        triggerOnHealthBelow: 40,
        text: "After patching and restarting node-1, disable maintenance mode: rabbitmq-upgrade disable-maintenance-mode. Wait for the node to fully sync (check rabbit_quorum_queue:status) before enabling maintenance mode on node-2. Never put two nodes in maintenance mode simultaneously in a 3-node cluster — you'd lose quorum.",
        relatedConcept: 'graceful-shutdown',
      },
    ],
  },

  initialTopology: {
    nodes: [
      { id: 'rabbit@node-1', maxMemoryMb: 16384, minDiskFreeMb: 4000, maxConnections: 2000 },
      { id: 'rabbit@node-2', maxMemoryMb: 16384, minDiskFreeMb: 4000, maxConnections: 2000 },
      { id: 'rabbit@node-3', maxMemoryMb: 16384, minDiskFreeMb: 4000, maxConnections: 2000 },
    ],
    exchanges: [
      { name: 'orders', type: 'direct', durable: true, autoDelete: false },
      { name: 'events', type: 'topic', durable: true, autoDelete: false },
    ],
    queues: [
      {
        name: 'orders.high-priority',
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
        name: 'orders.standard',
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
        name: 'events.audit',
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
      { exchange: 'orders', queue: 'orders.high-priority', routingKey: 'order.priority' },
      { exchange: 'orders', queue: 'orders.standard', routingKey: 'order.standard' },
      { exchange: 'events', queue: 'events.audit', routingKey: 'event.#' },
    ],
    publishers: [
      {
        id: 'publisher-order-service',
        targetExchange: 'orders',
        routingKey: 'order.standard',
        messagesPerSecond: 1000,
        messageSizeBytes: 1024,
        confirmMode: true,
        persistent: true,
      },
    ],
    consumers: [
      {
        id: 'consumer-order-worker',
        queue: 'orders.standard',
        prefetchCount: 100,
        ackMode: 'manual',
        processingTimeMs: 10,
        errorRate: 0,
      },
      {
        id: 'consumer-audit-logger',
        queue: 'events.audit',
        prefetchCount: 500,
        ackMode: 'manual',
        processingTimeMs: 2,
        errorRate: 0,
      },
    ],
  },

  failureScript: [
    { atTick: 5, type: 'maintenance-required', target: 'rabbit@node-1', params: { reason: 'os-patching' } },
    { atTick: 8, type: 'maintenance-required', target: 'rabbit@node-2', params: { reason: 'os-patching' } },
    { atTick: 11, type: 'maintenance-required', target: 'rabbit@node-3', params: { reason: 'os-patching' } },
  ],

  victoryConditions: [
    {
      id: 'all-nodes-patched',
      description: 'All 3 nodes patched and back online',
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
      id: 'no-message-loss',
      description: 'Zero messages lost during maintenance',
      required: true,
      check: s => s.metrics.errorRate < 0.001,
    },
    {
      id: 'consumers-continuous',
      description: 'Consumer downtime less than 5 seconds total',
      required: true,
      check: s => s.metrics.totalConsumeRate > 900,
    },
  ],

  conceptCards: [
    {
      concept: 'maintenance-mode',
      title: 'RabbitMQ Maintenance Mode',
      body: "rabbitmq-upgrade enable-maintenance-mode (introduced in RabbitMQ 3.9) suspends a node's queue activity: it stops accepting new connections, migrates quorum queue leaders to other nodes, and waits for in-flight operations to complete. The node remains in the cluster and participates in quorum votes — it just won't serve as a queue leader. This enables safe rolling upgrades without leader election disruption.",
      showWhenFixed: true,
    },
    {
      concept: 'queue-evacuation',
      title: 'Queue Leader Evacuation',
      body: "Before putting a node into maintenance, RabbitMQ automatically triggers Raft leader elections for all quorum queues where this node is the leader, transferring leadership to another replica. The rabbitmq-upgrade await-online-quorum-plus-one command blocks until the cluster has enough online nodes (quorum + 1) to safely survive the maintenance node going offline.",
      showWhenFixed: false,
    },
    {
      concept: 'graceful-shutdown',
      title: 'Graceful vs. Abrupt Shutdown',
      body: "An abrupt node shutdown (kill -9, power loss) causes immediate leader election for all queues on that node — clients experience a brief unavailability window. A graceful shutdown via maintenance mode pre-evacuates leaders before shutdown, so consumers never notice the node is gone. For zero-downtime patching of RabbitMQ clusters, maintenance mode is the correct tool.",
      showWhenFixed: false,
    },
  ],

  availableActions: [
    'enable-maintenance-mode',
    'verify-queue-migration',
    'disable-maintenance-mode',
  ],
}

export default scenario
