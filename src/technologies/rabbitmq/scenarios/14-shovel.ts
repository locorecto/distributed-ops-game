import type { RMQScenarioDefinition } from '../engine/types'

const scenario: RMQScenarioDefinition = {
  id: 'rmq-14-shovel',
  index: 14,
  title: 'Shovel Migration Stall',
  subtitle: 'Medium-Hard · Shovel Plugin',
  difficulty: 'medium-hard',
  estimatedMinutes: 20,
  coverConcepts: ['shovel-plugin', 'dynamic-shovel', 'source-destination', 'uri-config', 'acknowledgement-mode'],

  briefing: {
    story:
      "You're migrating 500,000 messages from a legacy RabbitMQ 3.8 cluster to a new 3.12 cluster using the Shovel plugin. The shovel connected but stopped after transferring 12,000 messages — acknowledgement-mode is set to 'no-ack' causing the source to drain faster than the destination can confirm. Messages are being lost between clusters.",
    symptom:
      "The dynamic shovel shows state 'terminated' after 12,000 messages. The source queue has dropped by 12,000 messages but the destination queue only received 9,400. Roughly 2,600 messages vanished because no-ack mode never waited for destination confirms before deleting from the source.",
    goal:
      "Reconfigure the shovel with acknowledgement-mode 'on-publish' (or 'on-confirm'), set an appropriate prefetch to pace the transfer, and restart the shovel. Confirm all 500,000 messages reach the destination without loss.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 70,
        text: "The shovel's acknowledgement-mode is 'no-ack'. This means messages are deleted from the source queue immediately after being read, with no confirmation the destination received them. Change it to 'on-publish' to only ack at the source after publishing to the destination.",
        relatedConcept: 'acknowledgement-mode',
      },
      {
        order: 2,
        triggerOnHealthBelow: 50,
        text: "Set prefetch-count on the shovel source to a moderate value (e.g. 1000). This throttles how many messages the shovel holds in-flight at once, preventing memory spikes and giving the destination time to keep up.",
        relatedConcept: 'dynamic-shovel',
      },
      {
        order: 3,
        triggerOnHealthBelow: 35,
        text: "After updating the shovel configuration, restart it via the management API or rabbitmqctl. Check that the shovel state transitions to 'running' and monitor source/destination queue depths converging.",
        relatedConcept: 'source-destination',
      },
    ],
  },

  initialTopology: {
    nodes: [
      { id: 'rabbit@legacy-38', maxMemoryMb: 8192, minDiskFreeMb: 2000, maxConnections: 500 },
      { id: 'rabbit@new-312', maxMemoryMb: 8192, minDiskFreeMb: 2000, maxConnections: 500 },
    ],
    exchanges: [
      { name: 'migration', type: 'direct', durable: true, autoDelete: false },
    ],
    queues: [
      {
        name: 'legacy.messages',
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
        name: 'new.messages',
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
      { exchange: 'migration', queue: 'legacy.messages', routingKey: 'msg' },
      { exchange: 'migration', queue: 'new.messages', routingKey: 'msg' },
    ],
    publishers: [
      {
        id: 'publisher-legacy',
        targetExchange: 'migration',
        routingKey: 'msg',
        messagesPerSecond: 0,
        messageSizeBytes: 2048,
        confirmMode: false,
        persistent: true,
      },
    ],
    consumers: [
      {
        id: 'consumer-new-cluster',
        queue: 'new.messages',
        prefetchCount: 100,
        ackMode: 'manual',
        processingTimeMs: 10,
        errorRate: 0,
      },
    ],
  },

  failureScript: [
    { atTick: 1, type: 'shovel-misconfigured', target: 'legacy.messages', params: { ackMode: 'no-ack', messagesLost: 2600 } },
    { atTick: 5, type: 'shovel-terminated', target: 'legacy.messages', params: { transferred: 12000 } },
  ],

  victoryConditions: [
    {
      id: 'shovel-running',
      description: 'Shovel is running with safe acknowledgement mode',
      required: true,
      check: s => !s.activeFailures.includes('shovel-misconfigured'),
    },
    {
      id: 'no-message-loss',
      description: 'No messages lost during transfer',
      required: true,
      check: s => s.metrics.errorRate < 0.01,
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
      concept: 'acknowledgement-mode',
      title: 'Shovel Acknowledgement Mode',
      body: "The shovel's acknowledgement-mode controls when it acks messages at the source. 'no-ack' is the fastest but unsafe: messages are removed from the source queue before the destination confirms receipt — any network hiccup loses them permanently. 'on-publish' acks at source after publishing to destination. 'on-confirm' (safest) waits for publisher-confirm from the destination before acking at the source.",
      showWhenFixed: true,
    },
    {
      concept: 'dynamic-shovel',
      title: 'Dynamic Shovels',
      body: "Dynamic shovels are configured at runtime via the management HTTP API or rabbitmqctl, stored in the Mnesia database, and survive broker restarts. Unlike static shovels (defined in rabbitmq.conf), dynamic shovels can be created, updated, and deleted without restarting the broker — ideal for live migrations.",
      showWhenFixed: false,
    },
    {
      concept: 'shovel-plugin',
      title: 'Shovel Plugin',
      body: "The Shovel plugin moves messages from a source queue on one broker to a destination exchange/queue on another (or the same) broker. It handles reconnection automatically and tracks its position in the source queue. For large migrations, combine it with prefetch-count to control memory usage and throughput.",
      showWhenFixed: false,
    },
  ],

  availableActions: [
    'set-ack-mode-on-publish',
    'configure-prefetch-count',
    'restart-shovel',
  ],
}

export default scenario
