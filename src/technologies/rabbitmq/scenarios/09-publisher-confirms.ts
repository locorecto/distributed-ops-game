import type { RMQScenarioDefinition } from '../engine/types'

const scenario: RMQScenarioDefinition = {
  id: 'rmq-publisher-confirms',
  index: 9,
  title: 'Silent Message Loss',
  subtitle: 'Medium · Publisher Confirms',
  difficulty: 'medium',
  estimatedMinutes: 12,
  coverConcepts: ['publisher-confirms', 'message-durability', 'at-least-once', 'fire-and-forget'],

  briefing: {
    story:
      "AuditTrail's compliance system must guarantee every audit event is recorded. The publisher uses fire-and-forget mode (no publisher confirms). During a scheduled broker rolling restart, 5,000 audit messages were published while the broker was transitioning — they were sent into the void. The audit log has gaps and the compliance team is filing incident reports.",
    symptom:
      "Publisher sends messages with no confirmation handshake. During broker restart at tick 20, the publisher keeps sending but gets no confirms. 5,000 messages are lost. totalFailed counter on publisher climbs. No retry logic exists.",
    goal:
      'Enable publisher confirms on the audit publisher. Implement retry on nack (totalFailed should reach 0). System health above 85.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 75,
        text: "Enable confirmMode=true on the 'publisher-audit' publisher. With publisher confirms, RabbitMQ sends a basic.ack back for each successfully stored message, or basic.nack if it fails. The publisher must wait for the ack before considering the message safe.",
        relatedConcept: 'publisher-confirms',
      },
      {
        order: 2,
        triggerOnHealthBelow: 55,
        text: "Publisher confirms without retry logic still loses messages (unconfirmed messages are tracked in totalUnconfirmed). Set confirmMode=true AND monitor totalUnconfirmed — when it grows, the publisher should retry. The fix: enable confirms and restart the publisher.",
        relatedConcept: 'at-least-once',
      },
    ],
  },

  initialTopology: {
    nodes: [{ id: 'rabbit@node1', maxMemoryMb: 8192, minDiskFreeMb: 1000, maxConnections: 1000 }],
    exchanges: [
      { name: 'audit', type: 'topic', durable: true, autoDelete: false },
    ],
    queues: [
      {
        name: 'audit.events',
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
      { exchange: 'audit', queue: 'audit.events', routingKey: 'audit.#' },
    ],
    publishers: [
      {
        id: 'publisher-audit',
        targetExchange: 'audit',
        routingKey: 'audit.user.action',
        messagesPerSecond: 1000,
        messageSizeBytes: 512,
        confirmMode: false,  // BUG: no confirms — fire-and-forget
        persistent: true,
      },
    ],
    consumers: [
      {
        id: 'consumer-audit-store',
        queue: 'audit.events',
        prefetchCount: 200,
        ackMode: 'manual',
        processingTimeMs: 2,
        errorRate: 0,
      },
    ],
  },

  failureScript: [
    // Broker rolling restart at tick 20 — node goes down briefly
    { atTick: 20, type: 'node-down', target: 'rabbit@node1', params: {} },
    // Comes back at tick 25
    { atTick: 25, type: 'node-down', target: 'rabbit@node1', params: { restore: true } },
  ],

  victoryConditions: [
    {
      id: 'total-failed-zero',
      description: 'Publisher total failed messages equals 0',
      required: true,
      check: s => {
        const pub = s.publishers.get('publisher-audit')
        return pub !== undefined && pub.totalFailed === 0
      },
    },
    {
      id: 'health-good',
      description: 'System health above 85',
      required: true,
      check: s => s.systemHealthScore > 85,
    },
  ],

  conceptCards: [
    {
      concept: 'publisher-confirms',
      title: 'Publisher Confirms',
      body: "Publisher confirms (aka publisher acknowledgements) provide delivery guarantees from broker to publisher. After enabling confirm mode on a channel, every published message gets a basic.ack (stored successfully) or basic.nack (failed). Without confirms, you never know if messages reached the broker. Essential for financial data, compliance records, and any exactly-once-on-publish requirement.",
      showWhenFixed: true,
    },
    {
      concept: 'fire-and-forget',
      title: 'Fire-and-Forget vs Confirmed Publish',
      body: "Fire-and-forget publishing is fast (no round-trip) but provides zero durability guarantee. Even with persistent=true and durable queues, without confirms you can lose messages during broker restarts, full disks, or network blips. Use publisher confirms for critical data. For high-throughput scenarios, batch confirms (async) provide both speed and safety.",
      showWhenFixed: false,
    },
  ],

  availableActions: [
    'enable-publisher-confirms',
    'set-publisher-persistent',
    'restart-publisher',
    'toggle-node',
  ],
}

export default scenario
