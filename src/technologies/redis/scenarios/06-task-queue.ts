import type { RedisScenarioDefinition } from './types'

const scenario: RedisScenarioDefinition = {
  id: 'redis-06-task-queue',
  index: 6,
  title: 'Task Queue Data Loss',
  subtitle: 'Medium · Reliable Queues',
  difficulty: 'medium',
  estimatedMinutes: 18,
  coverConcepts: ['LPUSH', 'RPOP', 'BRPOPLPUSH', 'LMOVE', 'reliable queue', 'processing list', 'at-least-once delivery'],
  briefing: {
    story:
      'Your batch processing platform uses a Redis List as a job queue: producers LPUSH jobs and workers RPOP to consume. The problem: if a worker crashes after popping a job but before completing it, the job is permanently lost. 5% of all batch jobs are silently disappearing — billing calculations are wrong, reports are incomplete, and you have no way to tell which jobs were dropped.',
    symptom:
      'Error rate is 5%. Monitoring shows jobs being popped from the queue that never appear in the completed-jobs list. Crash-looping workers are the primary culprit. There is no dead-letter queue or requeue mechanism.',
    goal:
      'Replace RPOP with BRPOPLPUSH (or the newer LMOVE) to implement a reliable queue pattern: popped jobs are atomically moved to a "processing" list. If a worker crashes, the job remains in the processing list and can be reclaimed. Reduce error rate below 1% and system health above 85.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 55,
        text: 'RPOP removes the job from the queue with no record of who is processing it. If the worker crashes, the job is gone.',
        relatedConcept: 'RPOP',
      },
      {
        order: 2,
        triggerOnHealthBelow: 40,
        text: 'BRPOPLPUSH queue:jobs queue:processing atomically pops from one list and pushes to another. If the worker crashes, the job is still in queue:processing.',
        relatedConcept: 'BRPOPLPUSH',
      },
      {
        order: 3,
        triggerOnHealthBelow: 25,
        text: 'Use LRANGE queue:processing 0 -1 to inspect stuck jobs. LREM queue:processing 1 <jobId> to remove after completion. A reaper process can re-queue stale processing entries.',
        relatedConcept: 'reliable queue',
      },
    ],
  },
  initialTopology: {
    clusterMode: 'standalone',
    nodes: [
      {
        id: 'redis-master',
        role: 'master',
        maxMemoryMb: 1024,
        evictionPolicy: 'noeviction',
        persistenceMode: 'aof',
        appendfsync: 'everysec',
        maxClients: 1000,
      },
    ],
    clients: [
      {
        id: 'client-job-producer',
        targetNode: 'redis-master',
        opsPerSecond: 500,
        readRatio: 0.0,
        keyPattern: 'sequential',
        valueSize: 'small',
      },
      {
        id: 'client-job-worker',
        targetNode: 'redis-master',
        opsPerSecond: 500,
        readRatio: 0.5,
        keyPattern: 'sequential',
        valueSize: 'small',
      },
    ],
  },
  failureScript: [
    { atTick: 15, type: 'node-down', target: 'redis-master', params: { reason: 'worker-crash' } },
    { atTick: 30, type: 'slow-query', target: 'redis-master', params: { latencyMs: 500 } },
  ],
  victoryConditions: [
    {
      id: 'low-error-rate',
      description: 'Error rate below 1%',
      required: true,
      check: s => s.metrics.errorRate < 0.01,
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
      concept: 'reliable queue',
      title: 'Reliable Queue Pattern',
      body: 'The reliable queue pattern uses two lists: a pending queue and a processing list. BRPOPLPUSH atomically moves a job between them. On successful completion, LREM removes it from processing. A watchdog process periodically re-queues jobs stuck in processing longer than a timeout.',
      showWhenFixed: true,
    },
    {
      concept: 'at-least-once delivery',
      title: 'At-Least-Once Delivery',
      body: 'The reliable queue pattern guarantees at-least-once delivery: every job will eventually be processed, even if a worker crashes. Jobs may be processed more than once after a crash recovery — ensure workers are idempotent.',
      showWhenFixed: true,
    },
  ],
  availableActions: ['enable-reliable-queue', 'set-persistence-mode', 'add-dead-letter-queue'],
}

export default scenario
