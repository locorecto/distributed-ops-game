import type { ESScenarioDefinition } from '../engine/types'

const scenario: ESScenarioDefinition = {
  id: 'ingest-pipeline',
  index: 15,
  title: 'Where Did the GeoIP Go?',
  subtitle: 'Medium-Hard · Ingest Pipelines',
  difficulty: 'medium-hard',
  estimatedMinutes: 20,
  coverConcepts: ['ingest-pipeline', 'geoip-processor', 'pipeline-failure', 'on-failure-handler'],

  briefing: {
    story: "The security team's geo-analytics dashboard went dark 3 days ago. IP-based threat maps show no data. Investigation reveals the GeoIP ingest pipeline is silently failing — the geoip database hasn't been updated in 30 days and Elasticsearch stopped using stale databases by default.",
    symptom: "All documents indexed through the 'geoip-pipeline' are missing the 'geo.location' field. The GeoIP database is 30 days old (expired). No on_failure handler was configured so failures are silent. Error rate is low but enrichment is 0%.",
    goal: "Restore GeoIP enrichment. Reduce error rate below 1% and system health above 80.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: "The GeoIP processor requires an up-to-date database. Trigger the built-in GeoIP downloader: POST /_ingest/geoip/database/GeoLite2-City/_download. ES 8.x requires the database to be updated at least every 30 days.",
        relatedConcept: 'geoip-processor',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: "Also add an on_failure handler to your pipeline to route failed enrichments to a fallback processor. Setting 'ignore_missing: true' on the geoip processor prevents full document rejection when enrichment fails.",
        relatedConcept: 'on-failure-handler',
      },
    ],
  },

  initialTopology: {
    nodes: [
      { id: 'node-1', roles: ['master', 'data', 'ingest'], heapGb: 16, diskGb: 1000 },
      { id: 'node-2', roles: ['data', 'ingest'], heapGb: 16, diskGb: 1000 },
    ],
    indices: [
      {
        name: 'security-events',
        shards: 3,
        replicas: 1,
        refreshIntervalMs: 5000,
        maxResultWindow: 10000,
        ilmPolicy: 'security-ilm',
      },
    ],
    clients: [
      {
        id: 'log-shipper',
        targetIndex: 'security-events',
        queryType: 'bulk-index',
        requestsPerSec: 1000,
      },
    ],
  },

  failureScript: [
    { atTick: 1, type: 'mapping-conflict', target: 'security-events', params: {} },
  ],

  victoryConditions: [
    {
      id: 'error-rate-low',
      description: 'Error rate below 1%',
      required: true,
      check: s => s.metrics.errorRate < 0.01,
    },
    {
      id: 'health-good',
      description: 'System health above 80',
      required: true,
      check: s => s.systemHealthScore > 80,
    },
  ],

  conceptCards: [
    {
      concept: 'ingest-pipeline',
      title: 'Ingest Pipelines',
      body: "Ingest pipelines process documents before indexing using a sequence of processors: geoip enrichment, field renaming, date parsing, JSON decoding, etc. Pipelines run on ingest nodes. Always add on_failure handlers to prevent pipeline errors from silently dropping documents.",
      showWhenFixed: true,
    },
    {
      concept: 'geoip-processor',
      title: 'GeoIP Database Freshness',
      body: "The GeoIP processor enriches documents with geographic data from IP addresses. ES 8.x uses the Maxmind GeoLite2 database, which must be refreshed every 30 days. The built-in downloader automates this. If the database expires, the processor stops enriching (failing silently by default).",
      showWhenFixed: false,
    },
  ],

  availableActions: ['applyNodeConfig', 'applyIndexConfig'],
}

export default scenario
