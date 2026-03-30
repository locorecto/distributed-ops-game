import type { RedisScenarioDefinition } from './types'

const scenario: RedisScenarioDefinition = {
  id: 'redis-10-geospatial',
  index: 10,
  title: 'Geospatial Delivery Zones',
  subtitle: 'Medium · Geospatial Indexing',
  difficulty: 'medium',
  estimatedMinutes: 18,
  coverConcepts: ['GEOADD', 'GEOSEARCH', 'GEORADIUS', 'geospatial index', 'geohash', 'O(n) vs O(log n)'],
  briefing: {
    story:
      'Your food delivery app stores restaurant locations as Redis String keys: "restaurant:<id>:lat" and "restaurant:<id>:lon". To find nearby restaurants, the app fetches all 50,000 restaurant keys, reads both coordinates, and computes distances in application code. A "nearby restaurants" query takes 3 seconds, users abandon the search, and restaurant partners are complaining about low order volume.',
    symptom:
      'Average latency for restaurant-search queries is above 3000ms. The Redis instance is handling 100K key reads per search query. Application servers are CPU-bound computing Haversine distances for 50K restaurants on every request.',
    goal:
      'Use GEOADD to store restaurant locations in a single geospatial key. Use GEOSEARCH (Redis 6.2+) or GEORADIUS to find restaurants within a given radius. GEOSEARCH is O(N+log M) where N is the result count. Reduce average latency below 20ms and system health above 80.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 55,
        text: 'Storing lat/lon as separate String keys means O(n) lookups — you must fetch all restaurants to find nearby ones.',
        relatedConcept: 'O(n) vs O(log n)',
      },
      {
        order: 2,
        triggerOnHealthBelow: 40,
        text: 'GEOADD restaurants <lon> <lat> <restaurantId> stores location using a geohash. One command per restaurant at load time.',
        relatedConcept: 'GEOADD',
      },
      {
        order: 3,
        triggerOnHealthBelow: 25,
        text: 'GEOSEARCH restaurants FROMLONLAT <lon> <lat> BYRADIUS 5 km ASC COUNT 20 returns the 20 nearest restaurants within 5km.',
        relatedConcept: 'GEOSEARCH',
      },
    ],
  },
  initialTopology: {
    clusterMode: 'standalone',
    nodes: [
      {
        id: 'redis-master',
        role: 'master',
        maxMemoryMb: 2048,
        evictionPolicy: 'noeviction',
        persistenceMode: 'rdb',
        appendfsync: 'everysec',
        maxClients: 2000,
      },
    ],
    clients: [
      {
        id: 'client-delivery-app',
        targetNode: 'redis-master',
        opsPerSecond: 2000,
        readRatio: 0.98,
        keyPattern: 'random',
        valueSize: 'small',
      },
    ],
  },
  failureScript: [
    { atTick: 5, type: 'slow-query', target: 'redis-master', params: { reason: 'full-scan-keys', latencyMs: 2000 } },
  ],
  victoryConditions: [
    {
      id: 'low-latency',
      description: 'Average latency below 20ms',
      required: true,
      check: s => s.metrics.avgLatencyMs < 20,
    },
    {
      id: 'healthy-system',
      description: 'System health above 80',
      required: true,
      check: s => s.systemHealthScore > 80,
    },
  ],
  conceptCards: [
    {
      concept: 'GEOADD',
      title: 'Redis Geospatial Commands',
      body: 'GEOADD stores members with longitude/latitude as a Sorted Set internally, using geohash encoding. GEOSEARCH queries by radius or bounding box from a point or member. GEODIST returns distance between two members. GEOPOS returns coordinates of a stored member.',
      showWhenFixed: true,
    },
    {
      concept: 'geohash',
      title: 'Geohash Encoding',
      body: 'Redis encodes geo coordinates as 52-bit integers (geohash). This allows proximity queries using the Sorted Set score. GEOSEARCH uses bounding-box approximation then filters to exact radius, giving O(log M + N) performance where M is the total set size and N is results.',
      showWhenFixed: true,
    },
  ],
  availableActions: ['enable-geo-index', 'rebuild-index', 'set-eviction-policy'],
}

export default scenario
