import type { RMQScenarioDefinition } from '../engine/types'

const scenario: RMQScenarioDefinition = {
  id: 'rmq-headers-exchange',
  index: 12,
  title: 'Headers Exchange Mismatch',
  subtitle: 'Medium-Hard · Headers Exchange & x-match',
  difficulty: 'medium-hard',
  estimatedMinutes: 15,
  coverConcepts: ['headers-exchange', 'x-match', 'message-attributes', 'routing-without-key'],

  briefing: {
    story:
      "ContentRouter uses a headers exchange to route articles to different processing pipelines based on article metadata (content-type, region, priority). The binding requires ALL 3 headers to match (x-match=all). But many articles only have 2 of 3 headers set — they come from a legacy CMS that doesn't always include 'priority'. Those articles are never routed to any queue.",
    symptom:
      "With x-match=all, articles missing the 'priority' header fail the binding check and are dropped. 60% of content is lost. Only fully-annotated articles from the new CMS reach processing queues.",
    goal:
      "Change the binding x-match mode from 'all' to 'any' so articles with at least one matching header are routed. Error rate should drop below 2% and health above 85.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 70,
        text: "Headers exchange bindings have an 'x-match' attribute: 'all' means ALL binding headers must be present in the message. 'any' means AT LEAST ONE header must match. With 'all', missing headers cause routing failure.",
        relatedConcept: 'x-match',
      },
      {
        order: 2,
        triggerOnHealthBelow: 50,
        text: "Change the routing key in the binding from 'all' to 'any'. In the simulation, binding routingKey encodes the x-match mode. Changing to 'any' will route messages that have partial header matches.",
        relatedConcept: 'headers-exchange',
      },
    ],
  },

  initialTopology: {
    nodes: [{ id: 'rabbit@node1', maxMemoryMb: 8192, minDiskFreeMb: 500, maxConnections: 1000 }],
    exchanges: [
      { name: 'content', type: 'headers', durable: true, autoDelete: false },
    ],
    queues: [
      {
        name: 'content.articles',
        type: 'classic',
        durable: true,
        exclusive: false,
        autoDelete: false,
        maxLength: 100000,
        messageTtlMs: null,
        deadLetterExchange: null,
        deadLetterRoutingKey: null,
        maxPriority: null,
        lazyMode: false,
      },
      {
        name: 'content.unrouted',
        type: 'classic',
        durable: true,
        exclusive: false,
        autoDelete: false,
        maxLength: 50000,
        messageTtlMs: null,
        deadLetterExchange: null,
        deadLetterRoutingKey: null,
        maxPriority: null,
        lazyMode: false,
      },
    ],
    bindings: [
      // 'all' mode — requires ALL headers to match
      { exchange: 'content', queue: 'content.articles', routingKey: 'all' },
    ],
    publishers: [
      {
        id: 'publisher-new-cms',
        targetExchange: 'content',
        routingKey: 'content-type:article,region:us,priority:high',  // All 3 headers — routes OK
        messagesPerSecond: 400,
        messageSizeBytes: 4096,
        confirmMode: false,
        persistent: true,
      },
      {
        id: 'publisher-legacy-cms',
        targetExchange: 'content',
        routingKey: 'partial:content-type:article,region:eu',  // Only 2 headers — fails with x-match=all
        messagesPerSecond: 600,
        messageSizeBytes: 4096,
        confirmMode: false,
        persistent: true,
      },
    ],
    consumers: [
      {
        id: 'consumer-content-processor',
        queue: 'content.articles',
        prefetchCount: 100,
        ackMode: 'manual',
        processingTimeMs: 10,
        errorRate: 0,
      },
    ],
  },

  failureScript: [],

  victoryConditions: [
    {
      id: 'error-rate-low',
      description: 'Error rate below 2%',
      required: true,
      check: s => s.metrics.errorRate < 0.02,
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
      concept: 'headers-exchange',
      title: 'Headers Exchange',
      body: "A headers exchange routes messages based on message header attributes rather than routing keys. Each binding specifies a set of expected headers. 'x-match=all' requires all specified headers to be present and matching. 'x-match=any' requires at least one header to match. Headers exchanges are powerful for content-based routing but slower than direct/topic exchanges due to header inspection overhead.",
      showWhenFixed: true,
    },
    {
      concept: 'x-match',
      title: 'x-match: all vs any',
      body: "The x-match binding argument controls header matching strictness. 'all' = logical AND (every binding header must match). 'any' = logical OR (at least one binding header must match). Use 'all' when messages must satisfy all criteria (e.g., region=US AND priority=high). Use 'any' for flexible routing where partial matches are acceptable.",
      showWhenFixed: false,
    },
  ],

  availableActions: [
    'set-binding-xmatch',
    'add-binding',
    'remove-binding',
  ],
}

export default scenario
