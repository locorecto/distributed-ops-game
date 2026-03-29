import type { RMQScenarioDefinition } from '../engine/types'

const scenario: RMQScenarioDefinition = {
  id: 'rmq-24-rate-limiting',
  index: 24,
  title: 'Per-Connection Rate Limit',
  subtitle: 'Hard · Flow Control',
  difficulty: 'hard',
  estimatedMinutes: 25,
  coverConcepts: ['credit-flow', 'per-connection-rate', 'channel-credit', 'publisher-flow-control', 'back-pressure'],

  briefing: {
    story:
      "A marketing email service publishes 500,000 messages/minute in bursts. The burst traffic is causing TCP buffer bloat on the broker, making latency for other connections spike from 5ms to 8 seconds. RabbitMQ's credit-based flow control isn't activating fast enough. The marketing publisher needs rate limiting but the configuration is missing.",
    symptom:
      "The marketing publisher sends 500K msg/min in 10-second bursts. TCP socket buffers on the broker fill up during each burst, causing 8-second latency spikes for all other connections sharing the same broker. Credit-based flow control activates only after the buffer is full — it doesn't prevent the initial burst. There are no per-connection rate limits configured.",
    goal:
      'Configure channel credit for the marketing publisher connection to limit its burst rate, add an explicit publisher rate limit at the application level, or move bulk publishing to a dedicated vhost. Reduce latency for other connections below 50ms.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 70,
        text: "Add an explicit rate limit in the marketing publisher application: use a token bucket or leaky bucket algorithm to smooth 500K/min into a steady 8,333/sec stream. This eliminates burst behaviour before it reaches the broker.",
        relatedConcept: 'publisher-flow-control',
      },
      {
        order: 2,
        triggerOnHealthBelow: 55,
        text: "Configure channel credit: set credit_flow_default_credit to a lower value for the marketing publisher's channel. Lower credit means RabbitMQ sends fewer 'credit grants' to the publisher, reducing the maximum burst size. Note: this is a global setting — consider vhost-level separation instead.",
        relatedConcept: 'channel-credit',
      },
      {
        order: 3,
        triggerOnHealthBelow: 40,
        text: "The cleanest solution: move bulk publishers to a separate vhost (or broker). Vhost-level separation means TCP buffer bloat from bulk traffic cannot affect other vhosts' connections. Use different load balancer targets for bulk vs. real-time traffic.",
        relatedConcept: 'back-pressure',
      },
    ],
  },

  initialTopology: {
    nodes: [
      { id: 'rabbit@node-1', maxMemoryMb: 16384, minDiskFreeMb: 4000, maxConnections: 2000 },
    ],
    exchanges: [
      { name: 'marketing', type: 'direct', durable: true, autoDelete: false },
      { name: 'realtime', type: 'topic', durable: true, autoDelete: false },
    ],
    queues: [
      {
        name: 'marketing.emails',
        type: 'classic',
        durable: true,
        exclusive: false,
        autoDelete: false,
        maxLength: 1000000,
        messageTtlMs: 86400000,
        deadLetterExchange: null,
        deadLetterRoutingKey: null,
        maxPriority: null,
        lazyMode: true,
      },
      {
        name: 'realtime.transactions',
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
      { exchange: 'marketing', queue: 'marketing.emails', routingKey: 'email' },
      { exchange: 'realtime', queue: 'realtime.transactions', routingKey: 'txn.#' },
    ],
    publishers: [
      {
        id: 'publisher-marketing',
        targetExchange: 'marketing',
        routingKey: 'email',
        messagesPerSecond: 8333,
        messageSizeBytes: 2048,
        confirmMode: false,
        persistent: false,
      },
      {
        id: 'publisher-payment-realtime',
        targetExchange: 'realtime',
        routingKey: 'txn.created',
        messagesPerSecond: 500,
        messageSizeBytes: 512,
        confirmMode: true,
        persistent: true,
      },
    ],
    consumers: [
      {
        id: 'consumer-email-sender',
        queue: 'marketing.emails',
        prefetchCount: 1000,
        ackMode: 'auto',
        processingTimeMs: 2,
        errorRate: 0,
      },
      {
        id: 'consumer-payment-handler',
        queue: 'realtime.transactions',
        prefetchCount: 50,
        ackMode: 'manual',
        processingTimeMs: 5,
        errorRate: 0,
      },
    ],
  },

  failureScript: [
    { atTick: 3, type: 'tcp-buffer-bloat', target: 'rabbit@node-1', params: { cause: 'burst-publish', burstMsgPerSec: 50000, normalLatencyMs: 5, degradedLatencyMs: 8000 } },
    { atTick: 4, type: 'latency-spike', target: 'consumer-payment-handler', params: { latencyMs: 8000 } },
  ],

  victoryConditions: [
    {
      id: 'latency-normal',
      description: 'Payment handler latency below 50ms',
      required: true,
      check: s => !s.activeFailures.includes('latency-spike'),
    },
    {
      id: 'bulk-isolated',
      description: 'Marketing traffic isolated from real-time traffic',
      required: true,
      check: s => !s.activeFailures.includes('tcp-buffer-bloat'),
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
      concept: 'credit-flow',
      title: 'Credit-Based Flow Control',
      body: "RabbitMQ uses a credit-based flow control system between its internal processes. A publisher's channel process receives a credit grant from the queue process; when credits are exhausted, the channel stops reading from the TCP socket, causing TCP backpressure to propagate to the publisher. This works well for sustained overload but doesn't prevent initial bursts from filling socket buffers.",
      showWhenFixed: true,
    },
    {
      concept: 'channel-credit',
      title: 'Tuning Channel Credit',
      body: "The credit_flow_default_credit parameter (default {400, 200}) controls the initial credit and refill amount for inter-process message passing. Reducing it makes credit flow activate sooner, limiting burst size at the cost of slightly reduced throughput for all connections. For bulk publishers specifically, application-level rate limiting is more surgical and doesn't affect other clients.",
      showWhenFixed: false,
    },
    {
      concept: 'back-pressure',
      title: 'Back-Pressure Architecture',
      body: "True back-pressure means a slow consumer slows down the entire pipeline back to the source. In RabbitMQ: consumer prefetch limits unacked messages → queue depth affects credit flow → credit flow limits channel throughput → TCP backpressure limits publisher. For bulk workloads, designing explicit back-pressure checkpoints (publisher confirms + rate limiting) is safer than relying on the broker's automatic mechanisms.",
      showWhenFixed: false,
    },
  ],

  availableActions: [
    'configure-channel-credit',
    'add-publisher-rate-limit',
    'separate-vhost-for-bulk-publishing',
  ],
}

export default scenario
