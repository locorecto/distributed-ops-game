export const GAME = {
  TICK_RATE_MS: 100,           // 10 ticks/second
  VICTORY_SUSTAIN_TICKS: 10,  // must pass for 1 second straight
  MAX_METRICS_HISTORY: 300,   // 30 seconds of history
  MAX_LOG_MESSAGES: 500,      // per partition in-memory cap
  REBALANCE_TICKS: 20,        // 2 seconds at 10/s
  SPEEDS: [1, 2, 4] as const,
  SCORE: {
    BASE: 1000,
    TIME_PENALTY_PER_SEC: 5,
    HINT_PENALTY: 50,
    HEALTH_BONUS_MULTIPLIER: 2,
    DUPLICATE_PENALTY: 10,
  },
  HEALTH: {
    LAG_WEIGHT: 0.35,
    BROKER_WEIGHT: 0.25,
    ERROR_WEIGHT: 0.2,
    DLQ_WEIGHT: 0.1,
    REPLICA_WEIGHT: 0.1,
    CRITICAL_THRESHOLD: 20,
    WARNING_THRESHOLD: 50,
  },
} as const
