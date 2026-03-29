import type { ESScenarioDefinition } from '../engine/types'

const scenario: ESScenarioDefinition = {
  id: 'es-28-geo-shape',
  index: 28,
  title: 'Geofence Query Failure',
  subtitle: 'Expert · Geo-Shape Indexing',
  difficulty: 'expert',
  estimatedMinutes: 40,
  coverConcepts: ['geo_shape', 'BKD-tree', 'geofence', 'spatial-queries', 'coordinate-system'],

  briefing: {
    story: "A fleet tracking system stores vehicle locations as `geo_point` but polygon geofence queries are failing — vehicles inside delivery zones aren't being found. The mapping uses `geo_point` for a field that should be `geo_shape` for polygon intersections. 15,000 deliveries are being misrouted.",
    symptom: "`geo_shape` intersection queries return zero results despite vehicles visually appearing inside delivery zone polygons. The `location` field is mapped as `geo_point`, which only supports point-to-bounding-box queries — not arbitrary polygon intersections. 15,000 deliveries have been dispatched to wrong zones in the last 4 hours.",
    goal: "Fix the geo mapping so polygon intersection queries return correct results. Misrouted delivery count must reach zero and system health must be above 80.",
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 60,
        text: "Inspect the mapping for the `location` field. `geo_point` stores a single latitude/longitude and only supports distance and bounding-box queries. To match arbitrary polygon shapes (delivery zones), you need `geo_shape`, which uses a BKD-tree to index polygons, lines, and points for full spatial predicate support.",
        relatedConcept: 'geo_shape',
      },
      {
        order: 2,
        triggerOnHealthBelow: 40,
        text: "Mappings cannot be changed in place — you must reindex. Create a new index with the `location` field as `geo_shape`, then use the Reindex API to move data. Update your alias to point to the new index. Verify polygon intersection queries with a known vehicle coordinate before switching production traffic.",
        relatedConcept: 'spatial-queries',
      },
    ],
  },

  initialTopology: {
    nodes: [
      { id: 'node-1', roles: ['master', 'data'], heapGb: 16, diskGb: 1000 },
      { id: 'node-2', roles: ['data'], heapGb: 16, diskGb: 1000 },
      { id: 'node-3', roles: ['data'], heapGb: 16, diskGb: 1000 },
    ],
    indices: [
      {
        name: 'fleet-locations',
        shards: 3,
        replicas: 1,
        refreshIntervalMs: 500,
        maxResultWindow: 10000,
        ilmPolicy: null,
      },
      {
        name: 'delivery-zones',
        shards: 1,
        replicas: 1,
        refreshIntervalMs: 5000,
        maxResultWindow: 10000,
        ilmPolicy: null,
      },
    ],
    clients: [
      {
        id: 'dispatch-service',
        targetIndex: 'fleet-locations',
        queryType: 'match',
        requestsPerSec: 300,
      },
    ],
  },

  failureScript: [
    { atTick: 1, type: 'query-failure', target: 'dispatch-service', params: { errorRate: 0.95 } },
  ],

  victoryConditions: [
    {
      id: 'geo-queries-working',
      description: 'Polygon intersection queries return correct results',
      required: true,
      check: s => s.metrics.avgQueryLatencyMs < 200,
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
      concept: 'geo_shape',
      title: 'geo_point vs geo_shape',
      body: "`geo_point` stores a single coordinate (lat/lon) and supports distance, bounding-box, and polygon-contains-point queries. `geo_shape` uses a BKD-tree to index arbitrarily complex geometries — points, lines, polygons, multipolygons. Use `geo_shape` whenever your queries involve polygon intersection, polygon containment of non-point features, or any shape other than a point.",
      showWhenFixed: true,
    },
    {
      concept: 'spatial-queries',
      title: 'Spatial Predicate Types',
      body: "Elasticsearch `geo_shape` queries support several spatial relations: `intersects` (default — shape overlaps query geometry), `disjoint` (no overlap), `within` (shape fully inside query geometry), and `contains` (shape fully contains query geometry). Choosing the wrong relation — or the wrong field type — silently returns empty results rather than an error.",
      showWhenFixed: false,
    },
  ],

  availableActions: ['fix-geo-shape-mapping', 'reindex-with-correct-type', 'verify-polygon-queries'],
}

export default scenario
