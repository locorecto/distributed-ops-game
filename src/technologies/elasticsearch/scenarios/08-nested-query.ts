import type { ESScenarioDefinition } from '../engine/types'

const scenario: ESScenarioDefinition = {
  id: 'nested-query',
  index: 8,
  title: 'Nested Object Chaos',
  subtitle: 'Medium · Nested Documents',
  difficulty: 'medium',
  estimatedMinutes: 15,
  coverConcepts: ['nested-objects', 'nested-query', 'object-flattening', 'document-relationships'],

  briefing: {
    story: "The product team stores tags as nested objects: [{name: 'color', value: 'red'}, {name: 'size', value: 'large'}]. They query for products with color=red AND size=small, expecting zero results for a red-large item. Instead, every query returns wrong matches.",
    symptom: "Queries return incorrect results. A product tagged as {color: red, size: large} matches a query for {color: red, size: small}. This happens because Elasticsearch flattens object arrays, mixing values across array elements.",
    goal: "Fix the nested query issue. Reduce error rate below 2%.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: "When objects are stored in an array with type 'object', Elasticsearch flattens them: {name: ['color','size'], value: ['red','large']}. This breaks cross-field conditions. You need the 'nested' field type to preserve object identity.",
        relatedConcept: 'nested-objects',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: "Change the 'tags' field to type 'nested' and use a 'nested' query with the correct path. Each nested object becomes a hidden child document, allowing conditions across its fields to be evaluated together.",
        relatedConcept: 'nested-query',
      },
    ],
  },

  initialTopology: {
    nodes: [
      { id: 'node-1', roles: ['master', 'data'], heapGb: 16, diskGb: 500 },
      { id: 'node-2', roles: ['data'], heapGb: 16, diskGb: 500 },
    ],
    indices: [
      {
        name: 'products',
        shards: 3,
        replicas: 1,
        refreshIntervalMs: 1000,
        maxResultWindow: 10000,
        ilmPolicy: null,
      },
    ],
    clients: [
      {
        id: 'tag-search-service',
        targetIndex: 'products',
        queryType: 'match',
        requestsPerSec: 150,
      },
    ],
  },

  failureScript: [
    { atTick: 1, type: 'mapping-conflict', target: 'products', params: {} },
  ],

  victoryConditions: [
    {
      id: 'error-rate-low',
      description: 'Error rate below 2%',
      required: true,
      check: s => s.metrics.errorRate < 0.02,
    },
  ],

  conceptCards: [
    {
      concept: 'nested-objects',
      title: 'Nested vs Object Types',
      body: "Elasticsearch 'object' type flattens arrays of objects into parallel arrays, losing the connection between fields within each object. 'nested' type stores each array element as a separate hidden Lucene document, preserving field relationships for accurate querying.",
      showWhenFixed: true,
    },
    {
      concept: 'nested-query',
      title: 'The nested Query',
      body: "To query nested objects, use the 'nested' query with the 'path' parameter pointing to the nested field. All conditions inside the nested query are evaluated against the same nested document. Without it, conditions are checked independently across all nested objects.",
      showWhenFixed: false,
    },
  ],

  availableActions: ['applyIndexConfig', 'reindex'],
}

export default scenario
