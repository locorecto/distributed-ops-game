import type { FlinkScenarioDefinition } from '../engine/types'

const scenario: FlinkScenarioDefinition = {
  id: 'flink-25-prometheus',
  index: 25,
  title: 'Missing Operator Metrics',
  subtitle: 'Expert · Observability',
  difficulty: 'expert',
  estimatedMinutes: 35,
  coverConcepts: ['MetricGroup', 'gauge', 'counter', 'histogram', 'prometheus-reporter', 'latency-tracking'],

  briefing: {
    story:
      "The ops team has zero visibility into a critical fraud detection Flink job. No custom metrics are emitted from any operator — they cannot see decision latency, false positive rate, or rules evaluated per second. Two weeks ago, false positives spiked 300% and nobody noticed for 6 hours because the only alert was on job health (which stayed green). The Prometheus reporter is already configured in flink-conf.yaml and the scrape endpoint is reachable, but no custom MetricGroups are registered in the operators themselves — the dashboards are empty.",
    symptom:
      'Grafana dashboards show only built-in Flink JVM metrics. No fraud_decision_latency_ms histogram, no false_positive_rate gauge, no rules_evaluated_total counter. Prometheus scrapes succeed but return zero custom metrics. The fraud model was silently degrading for days before anyone noticed.',
    goal:
      'Register custom metrics in the fraud detection operators (latency histogram, false-positive gauge, rules-evaluated counter), confirm the Prometheus reporter is correctly configured, and bring observability coverage above 90% so future regressions are caught within minutes.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: 'Custom metrics must be registered in the operator\'s open() method via getRuntimeContext().getMetricGroup(). A Gauge reports an instantaneous value, a Counter accumulates, and a Histogram tracks distribution (p50/p95/p99). Start by adding a Histogram for decision latency.',
        relatedConcept: 'MetricGroup',
      },
      {
        order: 2,
        triggerOnHealthBelow: 50,
        text: 'Verify the Prometheus reporter configuration in flink-conf.yaml: metrics.reporter.prom.class, metrics.reporter.prom.port, and metrics.reporter.prom.interval must all be set. Use enable-prometheus-reporter to apply the correct config.',
        relatedConcept: 'prometheus-reporter',
      },
      {
        order: 3,
        triggerOnHealthBelow: 35,
        text: 'Add a latency histogram with buckets covering 1ms–1000ms to capture p99 fraud decision time. This is the most actionable metric for SLA alerting.',
        relatedConcept: 'latency-tracking',
      },
    ],
  },

  initialTopology: {
    operators: [
      {
        id: 'source-events',
        name: 'Transaction Event Source',
        parallelism: 4,
        type: 'source',
        stateBackend: 'heap',
        checkpointIntervalMs: 10000,
      },
      {
        id: 'map-feature-extract',
        name: 'Feature Extraction',
        parallelism: 4,
        type: 'map',
        stateBackend: 'heap',
        checkpointIntervalMs: 10000,
      },
      {
        id: 'map-fraud-scorer',
        name: 'Fraud Scorer',
        parallelism: 4,
        type: 'map',
        stateBackend: 'rocksdb',
        checkpointIntervalMs: 10000,
      },
      {
        id: 'sink-decisions',
        name: 'Decision Sink',
        parallelism: 2,
        type: 'sink',
        stateBackend: 'heap',
        checkpointIntervalMs: 10000,
      },
    ],
    taskManagers: [
      { id: 'tm-1', slots: 8, maxHeapMb: 4096 },
      { id: 'tm-2', slots: 8, maxHeapMb: 4096 },
    ],
    checkpointIntervalMs: 10000,
    stateBackend: 'heap',
  },

  failureScript: [
    {
      atTick: 1,
      type: 'metrics-missing',
      target: 'map-fraud-scorer',
      params: { missingMetrics: ['fraud_decision_latency_ms', 'false_positive_rate', 'rules_evaluated_total'], observabilityCoveragePercent: 5 },
    },
    {
      atTick: 6,
      type: 'silent-regression',
      target: 'map-fraud-scorer',
      params: { falsePositiveSpikePercent: 300, undetectedForHours: 6 },
    },
  ],

  victoryConditions: [
    {
      id: 'metrics-registered',
      description: 'Custom metrics visible in Prometheus',
      required: true,
      check: s => s.metrics.errorRate < 0.05,
    },
    {
      id: 'observability-coverage',
      description: 'Observability coverage above 90%',
      required: true,
      check: s => s.systemHealthScore > 90,
    },
    {
      id: 'latency-tracked',
      description: 'Decision latency histogram emitting data',
      required: true,
      check: s => s.metrics.latencyMs < 500,
    },
  ],

  conceptCards: [
    {
      concept: 'MetricGroup',
      title: 'Flink MetricGroup API',
      body: "Flink operators access metrics via getRuntimeContext().getMetricGroup(). You can create child groups for logical namespacing. Three core metric types: Gauge (instantaneous snapshot of a value), Counter (monotonically increasing count), and Histogram (distribution with configurable buckets). Register them in open() so they exist for the operator's lifetime.",
      showWhenFixed: true,
    },
    {
      concept: 'prometheus-reporter',
      title: 'Prometheus Reporter Configuration',
      body: 'Flink ships a built-in Prometheus reporter. Configure it in flink-conf.yaml with: metrics.reporter.prom.class: org.apache.flink.metrics.prometheus.PrometheusReporter, metrics.reporter.prom.port: 9249, and metrics.reporter.prom.interval: 10 SECONDS. Each TaskManager exposes a /metrics endpoint that Prometheus scrapes.',
      showWhenFixed: true,
    },
    {
      concept: 'latency-tracking',
      title: 'Latency Tracking in Flink',
      body: 'Flink has built-in latency tracking (metrics.latency.interval) but it only measures pipeline latency, not operator-internal computation time. For measuring how long a fraud model takes to score a transaction, instrument your processElement() method with System.nanoTime() and record the delta in a Histogram metric.',
      showWhenFixed: false,
    },
  ],

  availableActions: ['register-custom-metrics', 'enable-prometheus-reporter', 'add-latency-histogram'],
}

export default scenario
