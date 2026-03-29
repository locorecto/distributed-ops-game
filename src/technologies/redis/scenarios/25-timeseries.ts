import type { RedisScenarioDefinition } from './types'

const scenario: RedisScenarioDefinition = {
  id: 'redis-25-timeseries',
  index: 25,
  title: 'Time Series High Cardinality',
  subtitle: 'Expert · Time Series',
  difficulty: 'expert',
  estimatedMinutes: 40,
  coverConcepts: ['RedisTimeSeries', 'TS.ADD', 'TS.RANGE', 'downsampling', 'retention', 'compaction', 'high cardinality'],
  briefing: {
    story:
      'Your IoT metrics platform stores one reading per sensor per second. With 500,000 sensors each producing 1 reading/second, the system generates 500K writes/second and stores 43.2 billion readings/day. Each reading is stored as a Redis Hash field. Redis memory OOMs within 6 hours of operation. The team is renting additional Redis instances weekly and still running out of space.',
    symptom:
      'Memory is exhausting within hours. Key count exceeds 40 billion/day. Redis is using 500GB+ RAM for raw sensor data. No retention policies exist. Data from 3 years ago is kept at full second-level resolution — 90 trillion keys.',
    goal:
      'Migrate to RedisTimeSeries module (TS.ADD). Set a retention period of 7 days for raw data. Create compaction rules: 1-minute averages retained for 30 days, 1-hour averages retained for 1 year. Reduce memory usage below 60% and system health above 80.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 60,
        text: 'Storing raw per-second data forever for 500K sensors is untenable. You need retention policies and downsampling.',
        relatedConcept: 'high cardinality',
      },
      {
        order: 2,
        triggerOnHealthBelow: 45,
        text: 'TS.CREATE sensor:<id> RETENTION 604800000 creates a time series with 7-day retention (in ms). Older data is automatically deleted.',
        relatedConcept: 'RedisTimeSeries',
      },
      {
        order: 3,
        triggerOnHealthBelow: 30,
        text: 'Add compaction: TS.CREATERULE sensor:<id> sensor_1min:<id> AGGREGATION avg 60000 creates a 1-minute average. Chain with TS.CREATERULE sensor_1min:<id> sensor_1hr:<id> AGGREGATION avg 3600000 for hourly.',
        relatedConcept: 'compaction',
      },
    ],
  },
  initialTopology: {
    clusterMode: 'cluster',
    nodes: [
      {
        id: 'redis-ts-node-1',
        role: 'master',
        maxMemoryMb: 65536,
        evictionPolicy: 'noeviction',
        persistenceMode: 'rdb',
        appendfsync: 'everysec',
        maxClients: 5000,
      },
      {
        id: 'redis-ts-node-2',
        role: 'master',
        maxMemoryMb: 65536,
        evictionPolicy: 'noeviction',
        persistenceMode: 'rdb',
        appendfsync: 'everysec',
        maxClients: 5000,
      },
      {
        id: 'redis-ts-node-3',
        role: 'master',
        maxMemoryMb: 65536,
        evictionPolicy: 'noeviction',
        persistenceMode: 'rdb',
        appendfsync: 'everysec',
        maxClients: 5000,
      },
    ],
    clients: [
      {
        id: 'client-iot-ingest',
        targetNode: 'redis-ts-node-1',
        opsPerSecond: 500000,
        readRatio: 0.05,
        keyPattern: 'random',
        valueSize: 'small',
      },
    ],
  },
  failureScript: [
    { atTick: 10, type: 'memory-pressure', target: 'redis-ts-node-1', params: { reason: 'no-retention', keysPerDay: 43200000000 } },
    { atTick: 10, type: 'memory-pressure', target: 'redis-ts-node-2', params: { reason: 'no-retention' } },
    { atTick: 10, type: 'memory-pressure', target: 'redis-ts-node-3', params: { reason: 'no-retention' } },
  ],
  victoryConditions: [
    {
      id: 'low-memory',
      description: 'Memory usage below 60%',
      required: true,
      check: s => s.metrics.memoryUsageRatio < 0.6,
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
      concept: 'RedisTimeSeries',
      title: 'RedisTimeSeries Module',
      body: 'RedisTimeSeries adds native time series support to Redis. TS.ADD ingests data points; TS.RANGE queries by time range; TS.MRANGE queries multiple series with label filters. Built-in retention policies auto-delete old data. Compaction rules aggregate raw data into coarser time buckets, enabling long-term storage without unbounded growth.',
      showWhenFixed: true,
    },
    {
      concept: 'downsampling',
      title: 'Time Series Downsampling',
      body: 'Downsampling reduces data volume by replacing multiple raw samples with a single aggregate (avg, min, max, sum, count). A common pyramid: raw data for 7 days, 1-minute aggregates for 30 days, 1-hour aggregates for 1 year, 1-day aggregates forever. Each level uses ~1/60th the storage of the previous.',
      showWhenFixed: true,
    },
  ],
  availableActions: ['enable-timeseries-module', 'set-retention-policy', 'create-compaction-rules'],
}

export default scenario
