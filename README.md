# Distributed Ops Game

> An interactive browser-based simulation game that teaches distributed systems through hands-on incident response. Fix real infrastructure problems — no cluster required.

---

## Overview

Distributed Ops Game drops you into running production systems that are starting to fail. Your job: diagnose the issue, apply the right configuration, and restore system health before it crashes.

Every scenario is grounded in a real-world engineering situation — from a pizza ordering platform overwhelmed at rush hour to a Redis cluster in a brain-split to a Flink job with unbounded state growth. Each technology's simulation engine models actual behavior in TypeScript so the mechanics you learn transfer directly to real systems.

**150 scenarios** across 5 technology tracks, from beginner through master difficulty.

---

## Technology Tracks

| Technology | Scenarios | Concepts Covered |
|---|---|---|
| 🟠 Apache Kafka | 30 | Topics, Partitions, Consumer Groups, Replication, Exactly-Once, Kafka Streams, Schema Registry, MirrorMaker |
| 🔴 Redis | 30 | Data Structures, Pub/Sub, Streams, Persistence, Sentinel, Cluster, Eviction, Redlock, RediSearch |
| 🟡 Elasticsearch | 30 | Shards, Mappings, Query DSL, Aggregations, ILM, CCR, Snapshots, ML Anomaly Detection, EQL |
| 🔵 Apache Flink | 30 | Windowing, Watermarks, Checkpointing, State Backends, Backpressure, Exactly-Once, CEP, Rescaling |
| 🟣 RabbitMQ | 30 | Exchanges, Queues, Routing, Publisher Confirms, Dead Letters, Quorum Queues, Streams, Federation |

All 5 tracks are available from the start — no cross-technology unlock requirements.

---

## Gameplay

1. **Choose a technology track** — select from Kafka, Redis, Elasticsearch, Flink, or RabbitMQ
2. **Read the briefing** — understand the system architecture and the symptom being reported
3. **Watch the simulation** — entities animate in real time with flowing message particles
4. **Diagnose the failure** — use the metrics panel (throughput, latency, error rate, health score) to identify the root cause
5. **Apply the fix** — adjust configuration in the control panel
6. **Sustain recovery** — hold the fix for 10 consecutive ticks to win

Score is based on time taken, hints used, and final system health. Each scenario within a track unlocks the next.

---

## Kafka Scenarios (30)

| # | Scenario | Difficulty | Primary Concept |
|---|---|---|---|
| 1 | Pizza Order System | Beginner | Consumer lag, max.poll.records |
| 2 | Flash Sale Inventory | Easy | Partitions, consumer groups |
| 3 | Ride-Sharing Dispatch | Easy | Message keys, partition routing |
| 4 | Chat App Fan-Out | Easy | Multiple consumer groups, auto.offset.reset |
| 5 | IoT Sensor Pipeline | Medium | Batching, linger.ms, compression |
| 6 | Stock Market Data Feed | Medium | Key strategy, per-symbol ordering |
| 7 | Payment Gateway | Medium | Idempotent producer, acks=all |
| 8 | Log Aggregation Pipeline | Medium | Retention (time + size), cleanup.policy |
| 9 | E-Commerce Order Pipeline | Medium | Transactional read-process-write |
| 10 | Audit Log Compliance | Medium | Replication factor, min.insync.replicas |
| 11 | Real-Time Analytics Dashboard | Medium-Hard | Manual commit, offset reset |
| 12 | Video Streaming Platform | Medium-Hard | Large messages, fetch.max.bytes |
| 13 | Supply Chain Event Tracker | Medium-Hard | Transactions, isolation.level |
| 14 | Gaming Leaderboard | Medium-Hard | Partition scaling, rebalance |
| 15 | Healthcare Patient Monitor | Hard | session.timeout.ms, SLA enforcement |
| 16 | Microservices Event Bus | Hard | Dead letter queue, retry logic |
| 17 | Database CDC Sync | Hard | Log compaction, exactly-once |
| 18 | Fraud Detection Engine | Expert | Kafka Streams, stateful windowing |
| 19 | Schema Registry Migration | Expert | Schema evolution, BACKWARD compatibility |
| 20 | Multi-DC Disaster Recovery | Master | MirrorMaker, geo-replication lag |
| 21 | Log Compaction Deep Dive | Hard | Tombstones, compaction lag, cleaner threads |
| 22 | Consumer Rebalance Storm | Hard | Eager vs cooperative sticky rebalancing |
| 23 | Quota Throttling Crisis | Hard | Producer/consumer byte-rate quotas |
| 24 | Kafka Connect — JDBC Sink | Hard | Sink connector, error tolerance, DLQ |
| 25 | Debezium CDC Source | Hard | CDC, binlog offset, idempotent producer |
| 26 | Schema Forward Compatibility | Expert | FORWARD compat, field removal, Avro unions |
| 27 | Partition Leadership Imbalance | Expert | Preferred replica election, leader skew |
| 28 | Active-Active Geo-Replication | Expert | MirrorMaker 2, cycle detection |
| 29 | ACL & SASL Security Incident | Expert | SASL/PLAIN, ACLs, authorization failures |
| 30 | Multi-Tenant Cluster Isolation | Master | Quotas per client-id, namespace isolation |

---

## Redis Scenarios (30)

| # | Scenario | Difficulty | Primary Concept |
|---|---|---|---|
| 1 | Session Cache Miss Storm | Beginner | GET/SET, TTL, cache-aside pattern |
| 2 | Leaderboard Sorted Set | Easy | ZADD/ZRANGE, sorted sets |
| 3 | Shopping Cart Hash | Easy | HSET/HGET, hash operations |
| 4 | Rate Limiter Race Condition | Easy | INCR + EXPIRE, atomic operations |
| 5 | Pub/Sub Fan-Out Failure | Easy | PUBLISH/SUBSCRIBE vs Streams |
| 6 | Task Queue Data Loss | Medium | LPUSH/BRPOPLPUSH, reliable queue |
| 7 | Cache Stampede | Medium | Thundering herd, mutex lock |
| 8 | Inventory Race Condition | Medium | WATCH/MULTI/EXEC transactions |
| 9 | Bloom Filter Memory | Medium | Probabilistic structures, false positives |
| 10 | Geospatial Delivery Zones | Medium | GEOADD/GEORADIUS, spatial queries |
| 11 | RDB Snapshot Blocking | Medium | BGSAVE, fork, COW, latency spikes |
| 12 | AOF Rewrite Overhead | Medium | appendfsync, AOF rewrite, disk I/O |
| 13 | Memory Eviction Crisis | Medium-Hard | maxmemory-policy, LRU vs LFU |
| 14 | Streams Consumer Group | Medium-Hard | XADD/XREADGROUP, pending entries |
| 15 | Keyspace Notification Flood | Medium-Hard | notify-keyspace-events, filtering |
| 16 | Lua Script Blocking | Medium-Hard | EVAL, event loop, atomicity |
| 17 | Pipeline Throughput | Medium-Hard | Pipelining, RTT reduction |
| 18 | Sentinel Failover | Hard | Sentinel quorum, leader election |
| 19 | Cluster Slot Resharding | Hard | CLUSTER RESHARD, MOVED redirects |
| 20 | Hot Key Overload | Hard | Key sharding, read replicas |
| 21 | Redlock Race Condition | Hard | SET NX PX, fencing tokens |
| 22 | Replica Lag Under Load | Hard | repl-backlog-size, partial resync |
| 23 | Connection Pool Exhaustion | Hard | maxclients, connection multiplexing |
| 24 | Large Value Fragmentation | Hard | OBJECT ENCODING, compression |
| 25 | Time Series High Cardinality | Expert | RedisTimeSeries, downsampling |
| 26 | RediSearch Index Corruption | Expert | FT.CREATE, SORTABLE, query optimization |
| 27 | Transaction Isolation Failure | Expert | MULTI/EXEC, WATCH, retry backoff |
| 28 | Cluster Brain-Split | Expert | Quorum, cluster-require-full-coverage |
| 29 | ACL Security Breach | Expert | ACL SETUSER, command categories |
| 30 | Active-Active Geo-Replication | Master | CRDT, conflict resolution, causal consistency |

---

## Elasticsearch Scenarios (30)

| # | Scenario | Difficulty | Primary Concept |
|---|---|---|---|
| 1 | Unassigned Shards | Beginner | Primary shard allocation, cluster yellow/red |
| 2 | Index Not Found | Easy | Index creation, dynamic vs explicit mappings |
| 3 | Slow Query | Easy | match vs term queries, _source filtering |
| 4 | Mapping Conflict | Easy | Field type mismatch, strict mapping |
| 5 | Over-Sharding OOM | Medium | Shard sizing, heap per shard |
| 6 | Relevance Tuning | Medium | BM25 scoring, field boost |
| 7 | Analyzer Mismatch | Medium | standard vs keyword analyzers |
| 8 | Nested Object Query | Medium | nested field type, nested query |
| 9 | Aggregation Memory OOM | Medium | Terms agg circuit breaker |
| 10 | Index Template Migration | Medium | Template priority, component templates |
| 11 | Reindex Performance | Medium-Hard | Sliced scroll, pipeline ingest |
| 12 | Disk Watermark Breach | Medium-Hard | flood_stage, read-only index |
| 13 | Split-Brain Cluster | Medium-Hard | Master quorum, voting config |
| 14 | Alias Rollover | Medium-Hard | Write alias, ILM rollover |
| 15 | Ingest Pipeline Failure | Medium-Hard | Enrich processor, GeoIP, refresh |
| 16 | ILM Policy Misconfiguration | Medium-Hard | hot/warm/cold/delete phases |
| 17 | Cross-Cluster Replication Lag | Hard | CCR leader/follower, lag monitoring |
| 18 | Snapshot Restore Failure | Hard | SLM policy, partial restore |
| 19 | Deep Pagination OOM | Hard | search_after, point-in-time |
| 20 | Circuit Breaker Tripping | Hard | Request/fielddata breakers, heap |
| 21 | Security Role Mapping | Hard | Document-level security, field masking |
| 22 | Watcher Alert Latency | Hard | Trigger, condition, action throttle |
| 23 | EQL Sequence Matching | Expert | EQL syntax, max_span |
| 24 | ML Anomaly Detection | Expert | Datafeed, job state, index patterns |
| 25 | Runtime Field Performance | Expert | Painless scripts, doc_values |
| 26 | Async Search | Expert | Long-running queries, status polling |
| 27 | Percolator Queries | Expert | Document matching, alerting |
| 28 | Geo-Shape Indexing | Expert | geo_shape, BKD tree, spatial |
| 29 | Transform Pivot Aggregation | Expert | Transforms, checkpointing |
| 30 | Cross-Cluster Search | Master | CCS, skip_unavailable, minimize_roundtrips |

---

## Apache Flink Scenarios (30)

| # | Scenario | Difficulty | Primary Concept |
|---|---|---|---|
| 1 | DataStream Backpressure | Beginner | Operator chaining, throughput |
| 2 | Tumbling Window Late Data | Easy | Window triggers, allowedLateness |
| 3 | Event Time Semantics | Easy | Watermarks, out-of-order records |
| 4 | Unbounded ValueState | Easy | StateTtlConfig, key TTL |
| 5 | Sliding Window Memory | Medium | Window pane overhead |
| 6 | Session Window Timeout | Medium | Session gap, dynamic sessions |
| 7 | Checkpoint Failure | Medium | Checkpoint barriers, recovery |
| 8 | Savepoint Migration | Medium | Operator UIDs, restore |
| 9 | Kafka Source Offset | Medium | scan.startup.mode, backfill |
| 10 | Side Output Late Data | Medium | Tagged outputs, late events |
| 11 | Async I/O DB Lookup | Medium-Hard | AsyncFunction, capacity |
| 12 | RocksDB State Backend | Medium-Hard | Heap vs RocksDB, incremental checkpoints |
| 13 | Broadcast State Rules | Medium-Hard | BroadcastStream, dynamic config |
| 14 | Temporal Join | Medium-Hard | Versioned table, event-time join |
| 15 | Watermark Alignment | Medium-Hard | Multi-source drift, idle timeout |
| 16 | Late Data Side Output | Medium-Hard | allowedLateness, side output |
| 17 | Task Manager OOM | Hard | Managed memory fraction, network buffers |
| 18 | State Rescaling | Hard | Key group redistribution, savepoint |
| 19 | Exactly-Once Sink | Hard | TwoPhaseCommitSink, pre-commit |
| 20 | CEP Pattern Matching | Hard | Strict/relaxed contiguity |
| 21 | State TTL Cleanup | Hard | StateTtlConfig, background cleanup |
| 22 | Dynamic Parallelism | Hard | Per-operator parallelism, auto-scaling |
| 23 | Flink SQL CDC Pipeline | Expert | CDC connector, upsert Kafka sink |
| 24 | Temporal Join Versioned Table | Expert | Versioned table, changelog mode |
| 25 | Prometheus Metrics | Expert | MetricGroup, custom reporters |
| 26 | Multi-Sink Fan-Out | Expert | Independent exactly-once per sink |
| 27 | Changelog Compaction | Expert | CHANGELOG_MODE, retract vs upsert |
| 28 | Kubernetes HA | Expert | Application mode, HA config |
| 29 | Global Window Trigger | Master | Custom trigger, purge logic |
| 30 | Unified Batch + Streaming | Master | BATCH execution mode, bounded source |

---

## RabbitMQ Scenarios (30)

| # | Scenario | Difficulty | Primary Concept |
|---|---|---|---|
| 1 | Queue Overflow | Beginner | max-length, consumer overload |
| 2 | Direct Exchange Routing | Easy | Routing keys, bindings |
| 3 | Fanout Broadcast | Easy | Fanout exchange, multi-queue |
| 4 | Topic Exchange Wildcards | Easy | `#`/`*` routing patterns |
| 5 | Message TTL Expiry | Medium | Per-message TTL, x-message-ttl |
| 6 | Dead Letter Infinite Loop | Medium | DLX, nack requeue=false |
| 7 | Priority Queue Starvation | Medium | x-max-priority, fairness |
| 8 | Manual Acknowledgements | Medium | manual-ack, nack on failure |
| 9 | Publisher Confirms | Medium | confirm mode, retry on nack |
| 10 | Prefetch Throttling | Medium | basic.qos, unacked limits |
| 11 | Lazy Queue Memory | Medium-Hard | Lazy mode, disk spooling |
| 12 | Headers Exchange | Medium-Hard | x-match all/any, complex routing |
| 13 | Classic Mirrored HA | Medium-Hard | ha-mode, ha-sync-mode |
| 14 | Shovel Plugin | Medium-Hard | Shovel config, frame max |
| 15 | Federation Link | Medium-Hard | Federation upstream, link state |
| 16 | Vhost Isolation | Medium-Hard | Virtual hosts, per-vhost limits |
| 17 | Memory Alarm Blocking | Hard | vm_memory_high_watermark, flow control |
| 18 | Disk Free Alarm | Hard | disk_free_limit, publish blocking |
| 19 | Quorum Queue Election | Hard | Raft consensus, leader election |
| 20 | Classic → Quorum Migration | Hard | Drain-and-delete migration |
| 21 | Split-Brain Partition | Hard | cluster_partition_handling, autoheal |
| 22 | Connection Storm | Hard | channel_max, connection pooling |
| 23 | OAuth 2.0 Auth | Hard | rabbitmq-auth-backend-oauth2, JWT |
| 24 | Per-User Rate Limiting | Hard | Credit flow, per-connection rate |
| 25 | Consistent Hash Exchange | Expert | Sharded queues, slot redistribution |
| 26 | Stream Queue Throughput | Expert | RabbitMQ Streams, publisher offsets |
| 27 | Stream Offset Replay | Expert | Offset spec, timestamp-based restart |
| 28 | Delayed Message Exchange | Expert | rabbitmq-delayed-message-exchange |
| 29 | Multi-AZ Active-Passive | Expert | Quorum queues, node evacuation |
| 30 | Cross-Protocol AMQP → MQTT | Master | MQTT plugin, QoS levels, session |

---

## Tech Stack

| Concern | Library |
|---|---|
| UI | React 18 + TypeScript |
| Build | Vite 6 |
| Styling | Tailwind CSS 4 |
| State | Zustand 5 |
| Animations | Framer Motion 12 |
| Charts | Recharts 3 |
| Testing | Vitest + @testing-library/react |

The simulation engines (`src/technologies/*/engine/`) are pure TypeScript with no React dependency — they can be unit-tested without a browser and run headless.

---

## Getting Started

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Run tests
npm test

# Production build
npm run build
```

Requires Node 18+. No external services needed — everything runs in-browser.

---

## Architecture

```
src/
├── technologies/             # Per-technology engines + scenarios
│   ├── types.ts              # TechKey, TechDefinition, TECH_DEFINITIONS
│   ├── kafka/
│   │   ├── engine/           # Kafka simulation engine (11 modules)
│   │   └── scenarios/        # 30 Kafka scenario definitions
│   ├── redis/
│   │   ├── engine/           # Redis simulation engine
│   │   └── scenarios/        # 30 Redis scenario definitions
│   ├── elasticsearch/
│   │   ├── engine/           # Elasticsearch simulation engine
│   │   └── scenarios/        # 30 ES scenario definitions
│   ├── flink/
│   │   ├── engine/           # Flink simulation engine
│   │   └── scenarios/        # 30 Flink scenario definitions
│   └── rabbitmq/
│       ├── engine/           # RabbitMQ simulation engine
│       └── scenarios/        # 30 RabbitMQ scenario definitions
│
├── store/
│   ├── gameStore             # Phase, tech selection, per-tech progress (localStorage)
│   ├── simulationStore       # Live snapshot from active engine
│   └── metricsStore          # 300-tick circular buffer for charts
│
└── components/
    ├── screens/
    │   ├── TechnologyLobby   # 5-technology selection screen
    │   ├── MainMenu          # Per-tech scenario grid
    │   └── GameScreen        # Simulation canvas + control panel
    ├── canvas/               # SimulationCanvas, node components, particles
    ├── panels/               # ControlPanel — per-entity config UI
    ├── metrics/              # MetricsPanel, Recharts charts
    └── tutorial/             # HintPanel, scenario briefing
```

### Simulation Tick Loop

Each engine runs a 100ms tick loop (scalable to 2×/4× speed):

1. **Entity step** — update entity states based on current config
2. **Failure injector** — fire scripted `FailureEvent` at the right tick
3. **Metrics step** — compute health score, error rate, throughput
4. **Victory check** — evaluate conditions; 10 consecutive passes = win
5. **Emit** — push snapshot to `simulationStore`

---

## Scoring

```
score = 1000
      − (secondsTaken × 5)       # time penalty
      − (hintsUsed × 50)          # hint penalty
      + (finalHealthScore × 2)    # health bonus (max +200)
      − (duplicates × 10)         # correctness penalty

Stars:  ≥ 800 → 3★   ≥ 500 → 2★   ≥ 1 → 1★
```

Progress and scores persist per technology to `localStorage`.

---

## Concepts Covered

### Kafka
`consumer-lag` · `partitions` · `consumer-groups` · `message-keys` · `auto.offset.reset` · `linger.ms` · `batch.size` · `compression` · `idempotent-producer` · `acks` · `transactions` · `isolation.level` · `retention` · `compaction` · `replication-factor` · `min.insync.replicas` · `manual-commit` · `max.request.size` · `session.timeout.ms` · `dead-letter-queue` · `schema-evolution` · `mirrormaker` · `kafka-connect` · `quotas` · `acl`

### Redis
`strings` · `hashes` · `lists` · `sets` · `sorted-sets` · `streams` · `pub-sub` · `ttl` · `eviction` · `rdb` · `aof` · `pipelining` · `transactions` · `lua-scripts` · `sentinel` · `cluster` · `redlock` · `keyspace-notifications` · `bloom-filter` · `geospatial` · `timeseries` · `redisearch`

### Elasticsearch
`shards` · `replicas` · `mappings` · `analyzers` · `query-dsl` · `aggregations` · `ilm` · `aliases` · `rollover` · `ccr` · `snapshots` · `ingest-pipelines` · `circuit-breakers` · `security` · `eql` · `ml-anomaly-detection` · `runtime-fields` · `async-search` · `percolator` · `transforms`

### Apache Flink
`datastream` · `windowing` · `watermarks` · `event-time` · `processing-time` · `checkpointing` · `savepoints` · `state-backends` · `rocksdb` · `backpressure` · `exactly-once` · `cep` · `broadcast-state` · `temporal-join` · `async-io` · `rescaling` · `flink-sql` · `kubernetes-ha`

### RabbitMQ
`exchanges` · `queues` · `bindings` · `routing-keys` · `publisher-confirms` · `consumer-acks` · `prefetch` · `dead-letter-exchange` · `ttl` · `priority-queues` · `lazy-queues` · `quorum-queues` · `streams` · `federation` · `shovel` · `vhosts` · `flow-control` · `oauth2` · `consistent-hash` · `mqtt`
