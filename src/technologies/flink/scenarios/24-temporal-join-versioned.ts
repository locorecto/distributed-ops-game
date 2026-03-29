import type { FlinkScenarioDefinition } from '../engine/types'

const scenario: FlinkScenarioDefinition = {
  id: 'flink-24-temporal-join',
  index: 24,
  title: 'Temporal Join Version Mismatch',
  subtitle: 'Expert · Versioned Tables',
  difficulty: 'expert',
  estimatedMinutes: 45,
  coverConcepts: ['temporal-join', 'versioned-table', 'event-time', 'FOR SYSTEM_TIME AS OF', 'enrichment'],

  briefing: {
    story:
      "An order enrichment pipeline joins a live orders stream with a product price table using Flink SQL's temporal join syntax (FOR SYSTEM_TIME AS OF). The product_prices table was never declared as a versioned table — it is missing both the PRIMARY KEY constraint and an event-time attribute backed by a watermark. Flink silently fell back to a processing-time temporal join, enriching each order with whatever price happened to be current at processing time rather than the price that was valid when the order was placed. The pricing discrepancy was discovered during a month-end reconciliation: $50K in orders were billed at the wrong price.",
    symptom:
      'Temporal join is executing in processing-time mode. Orders placed during a flash sale (prices dropped 40%) are being enriched with the post-sale full price. No watermark is advancing on the price table. No error is thrown — the silent fallback is the bug.',
    goal:
      'Declare the product_prices table as a versioned table with a PRIMARY KEY and an event-time watermark, fix the temporal join syntax to use event-time semantics, and validate that historical price lookups return the price valid at the order event time.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: 'A versioned table in Flink SQL requires both a PRIMARY KEY (the lookup key) and a time attribute (the version dimension). Add these to the product_prices DDL. Without them, FOR SYSTEM_TIME AS OF silently becomes a processing-time join.',
        relatedConcept: 'versioned-table',
      },
      {
        order: 2,
        triggerOnHealthBelow: 50,
        text: "The orders stream must also carry an event-time attribute with a watermark. The temporal join syntax `FOR SYSTEM_TIME AS OF o.order_time` only works in event-time mode when both sides have proper watermarks.",
        relatedConcept: 'FOR SYSTEM_TIME AS OF',
      },
      {
        order: 3,
        triggerOnHealthBelow: 35,
        text: 'After fixing the table declarations, use validate-price-history to replay a sample of affected orders and confirm enriched prices match the historical price table for those event timestamps.',
        relatedConcept: 'enrichment',
      },
    ],
  },

  initialTopology: {
    operators: [
      {
        id: 'source-orders',
        name: 'Orders Stream Source',
        parallelism: 4,
        type: 'source',
        stateBackend: 'rocksdb',
        checkpointIntervalMs: 10000,
      },
      {
        id: 'source-prices',
        name: 'Product Prices Source',
        parallelism: 2,
        type: 'source',
        stateBackend: 'rocksdb',
        checkpointIntervalMs: 10000,
      },
      {
        id: 'join-temporal',
        name: 'Temporal Join',
        parallelism: 4,
        type: 'keyBy',
        stateBackend: 'rocksdb',
        checkpointIntervalMs: 10000,
      },
      {
        id: 'sink-enriched',
        name: 'Enriched Orders Sink',
        parallelism: 4,
        type: 'sink',
        stateBackend: 'rocksdb',
        checkpointIntervalMs: 10000,
      },
    ],
    taskManagers: [
      { id: 'tm-1', slots: 8, maxHeapMb: 8192 },
      { id: 'tm-2', slots: 8, maxHeapMb: 8192 },
    ],
    checkpointIntervalMs: 10000,
    stateBackend: 'rocksdb',
  },

  failureScript: [
    {
      atTick: 2,
      type: 'watermark-stall',
      target: 'source-prices',
      params: { reason: 'no-event-time-attribute', watermarkLagMs: 999999 },
    },
    {
      atTick: 3,
      type: 'wrong-join-mode',
      target: 'join-temporal',
      params: { mode: 'processing-time', expectedMode: 'event-time', pricingErrorUsd: 50000 },
    },
  ],

  victoryConditions: [
    {
      id: 'watermark-advancing',
      description: 'Price table watermark lag below 5 seconds',
      required: true,
      check: s => s.metrics.watermarkLag < 5000,
    },
    {
      id: 'join-event-time',
      description: 'Temporal join operating in event-time mode',
      required: true,
      check: s => s.metrics.errorRate < 0.01,
    },
    {
      id: 'health-good',
      description: 'System health above 80%',
      required: true,
      check: s => s.systemHealthScore > 80,
    },
  ],

  conceptCards: [
    {
      concept: 'temporal-join',
      title: 'Temporal Joins in Flink SQL',
      body: "A temporal join (FOR SYSTEM_TIME AS OF) enriches a stream with the version of a lookup table that was valid at the stream event's time. This is critical for slowly changing dimensions (e.g., prices, exchange rates). If the lookup table is not declared as a versioned table, Flink silently falls back to a processing-time join — always using the latest version regardless of event time.",
      showWhenFixed: true,
    },
    {
      concept: 'versioned-table',
      title: 'Versioned Tables',
      body: 'A versioned table in Flink SQL is a table that tracks its history by time. It requires: (1) a PRIMARY KEY to identify rows, and (2) an event-time attribute with a watermark so Flink can look up the row version that was valid at a given point in time. Without both, temporal joins degrade to processing-time semantics.',
      showWhenFixed: true,
    },
    {
      concept: 'event-time',
      title: 'Event Time vs Processing Time',
      body: 'Event time uses timestamps embedded in the data, allowing correct results even when events arrive out of order or late. Processing time uses the wall clock when the record is processed — fast, but incorrect for historical or out-of-order scenarios. For pricing and financial enrichment, always use event time.',
      showWhenFixed: false,
    },
  ],

  availableActions: ['declare-versioned-table', 'fix-temporal-join-syntax', 'validate-price-history'],
}

export default scenario
