import type { ESScenarioDefinition } from '../engine/types'

const scenario: ESScenarioDefinition = {
  id: 'index-not-found',
  index: 2,
  title: 'Index Not Found',
  subtitle: 'Easy · Index Management',
  difficulty: 'easy',
  estimatedMinutes: 8,
  coverConcepts: ['index-creation', 'dynamic-mapping', 'explicit-mapping'],

  briefing: {
    story: "The data ingestion team rolled out a new microservice that sends product catalog documents to Elasticsearch. Within minutes, their monitoring alerts lit up — every single indexing request is failing with a 404.",
    symptom: "Error rate is 100%. All clients report 'index_not_found_exception'. Dynamic mapping has been disabled cluster-wide as a security policy, so auto-creation is off.",
    goal: "Reduce error rate below 1% by creating the index with an explicit mapping.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 70,
        text: "The index 'products' doesn't exist. With dynamic mapping disabled (action.auto_create_index=false), Elasticsearch refuses to create it automatically. You need to create it explicitly.",
        relatedConcept: 'index-creation',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: "Create the 'products' index with an explicit mapping. Define field types: 'name' as text, 'price' as float, 'sku' as keyword. Once created, the clients will start succeeding.",
        relatedConcept: 'explicit-mapping',
      },
    ],
  },

  initialTopology: {
    nodes: [
      { id: 'node-1', roles: ['master', 'data'], heapGb: 16, diskGb: 1000 },
      { id: 'node-2', roles: ['data'], heapGb: 16, diskGb: 1000 },
    ],
    indices: [],
    clients: [
      {
        id: 'product-indexer',
        targetIndex: 'products',
        queryType: 'bulk-index',
        requestsPerSec: 200,
      },
    ],
  },

  failureScript: [
    { atTick: 1, type: 'unassigned-shards', target: 'products', params: { count: 5 } },
  ],

  victoryConditions: [
    {
      id: 'error-rate-low',
      description: 'Error rate below 1%',
      required: true,
      check: s => s.metrics.errorRate < 0.01,
    },
  ],

  conceptCards: [
    {
      concept: 'dynamic-mapping',
      title: 'Dynamic Mapping',
      body: "By default Elasticsearch automatically creates indices and infers field types. In production, dynamic mapping is often disabled to prevent accidental schema drift. Always create indices with explicit mappings in production.",
      showWhenFixed: true,
    },
    {
      concept: 'explicit-mapping',
      title: 'Explicit Mappings',
      body: "An explicit mapping defines the field types before any data is ingested. Use 'keyword' for exact-match fields (IDs, SKUs), 'text' for full-text search, 'float'/'integer' for numerics. Wrong types are very expensive to fix later — they require a full reindex.",
      showWhenFixed: false,
    },
  ],

  availableActions: ['createIndex', 'applyIndexConfig'],
}

export default scenario
