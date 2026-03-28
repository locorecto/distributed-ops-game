# Kafka Ops Game

> An interactive browser-based simulation game that teaches Apache Kafka through hands-on incident response. Fix real distributed systems problems — no cluster required.

---

## Overview

Kafka Ops Game drops you into a running production system that's starting to fail. Your job: diagnose the issue, apply the right Kafka configuration, and restore system health before it crashes.

Every scenario is grounded in a real-world engineering situation — from a pizza ordering platform overwhelmed at rush hour to a healthcare ICU monitor violating patient SLAs. The simulation engine models Kafka's actual behavior in TypeScript so the mechanics you learn transfer directly to real clusters.

**20 scenarios** cover the full Kafka concept map, from beginner (consumer lag, partitions) through expert (schema evolution, MirrorMaker geo-replication).

---

## Gameplay

1. **Read the briefing** — understand the system architecture and the symptom being reported
2. **Watch the simulation** — producers, topics, partitions, and consumers animate in real time
3. **Diagnose the failure** — use the metrics panel (throughput, lag, error rate) to identify the root cause
4. **Apply the fix** — adjust Kafka configuration in the control panel (acks, partitions, retention, timeouts, etc.)
5. **Sustain recovery** — hold the fix for 10 consecutive ticks to win

Score is based on time taken, hints used, and final system health. Each scenario unlocks the next.

---

## Scenarios

| # | Scenario | Difficulty | Primary Concept |
|---|----------|------------|-----------------|
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

---

## Tech Stack

| Concern | Library |
|---------|---------|
| UI | React 18 + TypeScript |
| Build | Vite 6 |
| Styling | Tailwind CSS 4 |
| State | Zustand 5 |
| Animations | Framer Motion 12 |
| Charts | Recharts 3 |
| Testing | Vitest + @testing-library/react |

The simulation engine (`src/engine/`) is pure TypeScript with no React dependency — it can be unit-tested without a browser and run headless.

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
├── engine/               # Pure TS simulation — no React
│   ├── SimulationEngine  # Tick loop (10/s), config mutation API
│   ├── KafkaTopic        # Partition log, key hashing, compaction
│   ├── KafkaProducer     # Batching, acks, idempotency, EOS
│   ├── KafkaConsumer     # Poll loop, lag, processing simulation
│   ├── ConsumerGroup     # Partition assignment, rebalance
│   ├── KafkaBroker       # ISR, leader election, disk
│   ├── FailureInjector   # Scripted failure timeline per scenario
│   └── MetricsCollector  # Per-tick metrics snapshot
│
├── scenarios/            # 20 scenario definitions
│   └── types.ts          # ScenarioDefinition schema
│
├── store/                # Zustand stores
│   ├── gameStore         # Phase, progression, scores (localStorage)
│   ├── simulationStore   # Live snapshot from engine
│   └── metricsStore      # 300-tick circular buffer for charts
│
└── components/
    ├── canvas/           # SimulationCanvas, node components, particles
    ├── panels/           # ControlPanel — per-entity Kafka config UI
    ├── metrics/          # MetricsPanel, Recharts charts
    ├── tutorial/         # HintPanel, scenario briefing
    └── screens/          # MainMenu, GameScreen, VictoryScreen
```

### Simulation Tick Loop

Each tick (100ms at 1× speed, scalable to 2×/4×) executes in order:

1. **Producer step** — generate messages, hash key → partition, apply acks logic
2. **Broker step** — replicate to followers, update ISR, advance high-water mark
3. **Consumer step** — poll up to `maxPollRecords`, simulate processing + errors, commit offsets
4. **Retention step** — evict messages past `retentionMs`/`retentionBytes`; compact if `cleanup.policy=compact`
5. **Failure injector** — fire scripted `FailureEvent` at the right tick
6. **Metrics step** — compute lag, throughput, error rate, ISR health
7. **Victory check** — evaluate conditions; 10 consecutive passes = win

### Engine API

```typescript
engine.applyTopicConfig(topic, patch)       // partitions, retention, cleanup.policy
engine.applyProducerConfig(id, patch)       // acks, idempotent, batchSize, compression
engine.applyConsumerConfig(id, patch)       // maxPollRecords, commitMode, isolationLevel
engine.addConsumer(groupId, config, id?)    // triggers group rebalance
engine.toggleBroker(id)                     // bring broker on/off
engine.triggerManualCommit(consumerId)      // for manual-commit scenarios
engine.getSnapshot(): SimulationSnapshot    // called by UI at 10fps
```

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

Progress and scores persist to `localStorage`.

---

## Kafka Concepts Covered

`consumer-lag` · `partitions` · `consumer-groups` · `message-keys` · `auto.offset.reset` · `linger.ms` · `batch.size` · `compression` · `idempotent-producer` · `acks` · `transactions` · `isolation.level` · `retention` · `compaction` · `replication-factor` · `min.insync.replicas` · `manual-commit` · `max.request.size` · `session.timeout.ms` · `heartbeat.interval.ms` · `max.poll.interval.ms` · `dead-letter-queue` · `schema-evolution` · `mirrormaker`
