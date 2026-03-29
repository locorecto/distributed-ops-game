import type { RedisScenarioDefinition } from './types'

const scenario: RedisScenarioDefinition = {
  id: 'redis-29-acl-security',
  index: 29,
  title: 'ACL Security Breach',
  subtitle: 'Expert · Security',
  difficulty: 'expert',
  estimatedMinutes: 40,
  coverConcepts: ['ACL', 'ACL SETUSER', 'default user', 'FLUSHALL', 'command restriction', 'principle of least privilege', 'security hardening'],
  briefing: {
    story:
      'All 30 microservices in your platform connect to Redis using the "default" user with no password and full permissions. Last Tuesday, a compromised recommendations microservice was exploited — the attacker ran FLUSHALL, deleting all 50 million keys in production. Sessions, caches, queues, rate limiters — all gone. 4 hours of downtime. $2M in lost revenue. The post-mortem demands immediate Redis ACL implementation.',
    symptom:
      'The system is recovering from a FLUSHALL wipe. Error rate is 100% — all data is gone. System health is 0%. Any service with Redis access can run any command on any key, including destructive ones like FLUSHALL, DEBUG RELOAD, CONFIG REWRITE.',
    goal:
      'Implement Redis ACLs: create per-service users with minimal permissions. Restrict commands per user (e.g., ~session:* for session service, no FLUSHALL for any service). Disable the default user or set a strong password. Restore system health above 85% and error rate below 1%.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 70,
        text: 'The default user has full access with no password. ACL LIST shows all users. ACL GETUSER default shows its permissions.',
        relatedConcept: 'default user',
      },
      {
        order: 2,
        triggerOnHealthBelow: 50,
        text: 'ACL SETUSER session-svc on >StrongPassword123 ~session:* +GET +SET +DEL +EXPIRE creates a user that can only touch session:* keys and only use GET/SET/DEL/EXPIRE.',
        relatedConcept: 'ACL SETUSER',
      },
      {
        order: 3,
        triggerOnHealthBelow: 30,
        text: 'Disable destructive commands globally: ACL SETUSER default on nopass ~* +@all -FLUSHALL -FLUSHDB -DEBUG -CONFIG. Or create a restricted default and require all services to use named users.',
        relatedConcept: 'command restriction',
      },
    ],
  },
  initialTopology: {
    clusterMode: 'standalone',
    nodes: [
      {
        id: 'redis-master',
        role: 'master',
        maxMemoryMb: 8192,
        evictionPolicy: 'allkeys-lru',
        persistenceMode: 'rdb+aof',
        appendfsync: 'everysec',
        maxClients: 2000,
      },
    ],
    clients: [
      {
        id: 'client-compromised-service',
        targetNode: 'redis-master',
        opsPerSecond: 100,
        readRatio: 0.0,
        keyPattern: 'sequential',
        valueSize: 'small',
      },
      {
        id: 'client-normal-services',
        targetNode: 'redis-master',
        opsPerSecond: 5000,
        readRatio: 0.7,
        keyPattern: 'random',
        valueSize: 'small',
      },
    ],
  },
  failureScript: [
    { atTick: 5, type: 'node-down', target: 'redis-master', params: { reason: 'flushall-executed', keyCount: 0 } },
    { atTick: 20, type: 'memory-pressure', target: 'redis-master', params: { reason: 'recovery-flood' } },
  ],
  victoryConditions: [
    {
      id: 'healthy-system',
      description: 'System health above 85',
      required: true,
      check: s => s.systemHealthScore > 85,
    },
    {
      id: 'low-error-rate',
      description: 'Error rate below 1%',
      required: true,
      check: s => s.metrics.errorRate < 0.01,
    },
  ],
  conceptCards: [
    {
      concept: 'ACL',
      title: 'Redis Access Control Lists (ACL)',
      body: 'Redis ACLs (available since Redis 6.0) control per-user access to commands and keys. Each user has: on/off status, a password, a set of allowed commands (+@read, +GET, -FLUSHALL), and key patterns (~user:* allows only user:* keys). ACL LOG records denied commands. Store ACLs in a file with aclfile /etc/redis/users.acl.',
      showWhenFixed: true,
    },
    {
      concept: 'principle of least privilege',
      title: 'Principle of Least Privilege',
      body: 'Each service should have the minimum Redis permissions required for its function. A read-only cache client: +@read. A session service: +GET +SET +DEL +EXPIRE on ~session:*. No service needs FLUSHALL, DEBUG, or CONFIG in production. Audit with ACL LOG and regularly review ACL LIST.',
      showWhenFixed: true,
    },
  ],
  availableActions: ['create-acl-users', 'disable-default-user', 'restrict-dangerous-commands'],
}

export default scenario
