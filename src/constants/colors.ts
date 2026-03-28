export const COLORS = {
  broker: {
    online: '#10b981',
    offline: '#ef4444',
    degraded: '#f59e0b',
    controller: '#6366f1',
  },
  partition: {
    leader: '#3b82f6',
    follower: '#64748b',
    outOfSync: '#ef4444',
    hot: '#f97316',
  },
  consumer: {
    active: '#22c55e',
    lagging: '#f59e0b',
    crashed: '#ef4444',
    rebalancing: '#8b5cf6',
  },
  producer: {
    healthy: '#38bdf8',
    erroring: '#ef4444',
    throttled: '#f59e0b',
  },
  message: {
    normal: '#60a5fa',
    duplicate: '#f97316',
    dlq: '#ef4444',
    compacted: '#a78bfa',
    transaction: '#34d399',
  },
  health: {
    green: '#22c55e',
    yellow: '#eab308',
    orange: '#f97316',
    red: '#ef4444',
  },
  background: {
    canvas: '#0f172a',
    panel: '#1e293b',
    card: '#334155',
    border: '#475569',
  },
} as const
