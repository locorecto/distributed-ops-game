import type { RedisScenarioDefinition } from './types'

const scenario: RedisScenarioDefinition = {
  id: 'redis-26-redisearch',
  index: 26,
  title: 'RediSearch Index Corruption',
  subtitle: 'Expert · Full-Text Search',
  difficulty: 'expert',
  estimatedMinutes: 40,
  coverConcepts: ['RediSearch', 'FT.CREATE', 'SORTABLE', 'TAG', 'full-text search', 'index rebuild', 'faceting'],
  briefing: {
    story:
      'Your e-commerce platform uses RediSearch to power product search over a 10 million product catalog. The index was created without SORTABLE on price and rating fields, and without TAG on category and brand fields. Full-text search works fine. But "sort by price" triggers a full scan of all 10M documents to sort in-memory — O(n) instead of O(log n). Every price-sorted search query times out after 10 seconds. The product page abandonment rate has hit 60%.',
    symptom:
      'Average latency for sorted search queries is 10,000ms+. Full-text queries without sorting are fast (< 20ms). Queries with ORDER BY price or ORDER BY rating time out. Faceted filtering by category uses full scan instead of TAG index.',
    goal:
      'Rebuild the RediSearch index with SORTABLE on numeric fields (price, rating, stock_count) and TAG on categorical fields (category, brand). Drop and recreate the index with FT.DROPINDEX + FT.CREATE. Reduce average latency below 50ms and system health above 85.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 60,
        text: 'Without SORTABLE, RediSearch must fetch all matching documents and sort them in memory on every query. With 10M products, this is prohibitively slow.',
        relatedConcept: 'SORTABLE',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: 'FT.CREATE products ON HASH SCHEMA name TEXT price NUMERIC SORTABLE rating NUMERIC SORTABLE category TAG brand TAG creates an optimized index.',
        relatedConcept: 'FT.CREATE',
      },
      {
        order: 3,
        triggerOnHealthBelow: 30,
        text: 'FT.DROPINDEX products DD drops the index and deletes index data. FT.INFO products shows current schema. FT.SEARCH with @price:[10 50] and SORTBY price ASC will be O(log n) after rebuilding with SORTABLE.',
        relatedConcept: 'index rebuild',
      },
    ],
  },
  initialTopology: {
    clusterMode: 'standalone',
    nodes: [
      {
        id: 'redis-search-master',
        role: 'master',
        maxMemoryMb: 16384,
        evictionPolicy: 'noeviction',
        persistenceMode: 'rdb',
        appendfsync: 'everysec',
        maxClients: 3000,
      },
    ],
    clients: [
      {
        id: 'client-product-search',
        targetNode: 'redis-search-master',
        opsPerSecond: 5000,
        readRatio: 0.98,
        keyPattern: 'random',
        valueSize: 'medium',
      },
    ],
  },
  failureScript: [
    { atTick: 5, type: 'memory-pressure', target: 'redis-search-master', params: { reason: 'unsortable-index-full-scan', documents: 10000000 } },
  ],
  victoryConditions: [
    {
      id: 'low-latency',
      description: 'Average latency below 50ms',
      required: true,
      check: s => s.metrics.avgLatencyMs < 50,
    },
    {
      id: 'healthy-system',
      description: 'System health above 85',
      required: true,
      check: s => s.systemHealthScore > 85,
    },
  ],
  conceptCards: [
    {
      concept: 'RediSearch',
      title: 'RediSearch Full-Text Search Engine',
      body: 'RediSearch is a Redis module providing full-text search with inverted indexes. Field types: TEXT (full-text), NUMERIC (range queries), TAG (exact match, faceting), GEO (spatial), VECTOR (vector similarity). SORTABLE stores a copy of the field in the index for O(log n) sorting. Without SORTABLE, sorting requires loading all matching documents.',
      showWhenFixed: true,
    },
    {
      concept: 'faceting',
      title: 'Faceted Search with TAG Fields',
      body: 'TAG fields are indexed for exact match and faceting. FT.SEARCH idx "@category:{Electronics} @brand:{Apple}" filters by tag values. FT.AGGREGATE with GROUPBY @category gives facet counts. TAG fields are case-sensitive and do not tokenize — use them for categories, brands, status values, and IDs.',
      showWhenFixed: true,
    },
  ],
  availableActions: ['rebuild-search-index', 'add-sortable-fields', 'add-tag-fields'],
}

export default scenario
