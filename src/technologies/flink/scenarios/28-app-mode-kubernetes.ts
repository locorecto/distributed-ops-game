import type { FlinkScenarioDefinition } from '../engine/types'

const scenario: FlinkScenarioDefinition = {
  id: 'flink-28-app-mode-k8s',
  index: 28,
  title: 'Application Mode HA Failure',
  subtitle: 'Expert · Kubernetes Deployment',
  difficulty: 'expert',
  estimatedMinutes: 45,
  coverConcepts: ['application-mode', 'kubernetes-HA', 'JobManager-HA', 'ZooKeeper-HA', 'pod-restart'],

  briefing: {
    story:
      "A Flink job is deployed in Kubernetes Application Mode — one JobManager pod per job, running inside the cluster. The JobManager is configured with ZooKeeper HA, but the ZooKeeper connection string references a namespace (zookeeper.legacy-infra.svc.cluster.local) that was decommissioned three weeks ago. The configuration was never updated. During a routine GC pause on the JobManager pod, the JM heartbeat timed out and Kubernetes killed the pod. Because ZooKeeper was unreachable, the standby JobManager could not read the HA metadata and never took over. The job was completely down for 45 minutes until an engineer manually restarted it. The fix: replace ZooKeeper HA with native Kubernetes ConfigMap-based HA, which requires no external dependency.",
    symptom:
      'JobManager pod restarted but entered CrashLoopBackOff. Logs show: "Could not retrieve job graph from ZooKeeper: Connection refused (zookeeper.legacy-infra:2181)". Standby JM pod is running but stuck in WAITING state — it cannot read leader election data. Job has been down for 45 minutes. No automatic failover occurred.',
    goal:
      'Switch the JobManager HA configuration from ZooKeeper to native Kubernetes HA (ConfigMap-based leader election), configure at least 2 JobManager replicas, and verify that killing the active JM pod triggers automatic failover within 30 seconds.',
    hints: [
      {
        order: 1,
        triggerOnHealthBelow: 65,
        text: 'Native Kubernetes HA uses ConfigMaps and Leases for leader election — no external ZooKeeper needed. Set high-availability: kubernetes in flink-conf.yaml and remove the ZooKeeper connection string. Use switch-to-k8s-ha to apply this configuration.',
        relatedConcept: 'kubernetes-HA',
      },
      {
        order: 2,
        triggerOnHealthBelow: 50,
        text: 'Even with correct HA config, a single JM replica means there is a gap between pod death and Kubernetes scheduling a replacement. Configure kubernetes.jobmanager.replicas: 2 so a standby JM is always warm and can take over within seconds.',
        relatedConcept: 'JobManager-HA',
      },
      {
        order: 3,
        triggerOnHealthBelow: 35,
        text: 'After switching to K8s HA, verify the old ZooKeeper endpoint config is fully removed — a stale high-availability.zookeeper.quorum property will cause the JM to attempt ZooKeeper connection even when HA mode is set to kubernetes.',
        relatedConcept: 'pod-restart',
      },
    ],
  },

  initialTopology: {
    operators: [
      {
        id: 'source-events',
        name: 'Event Source',
        parallelism: 4,
        type: 'source',
        stateBackend: 'rocksdb',
        checkpointIntervalMs: 10000,
      },
      {
        id: 'map-process',
        name: 'Event Processor',
        parallelism: 4,
        type: 'map',
        stateBackend: 'rocksdb',
        checkpointIntervalMs: 10000,
      },
      {
        id: 'sink-output',
        name: 'Output Sink',
        parallelism: 4,
        type: 'sink',
        stateBackend: 'rocksdb',
        checkpointIntervalMs: 10000,
      },
    ],
    taskManagers: [
      { id: 'tm-1', slots: 4, maxHeapMb: 4096 },
      { id: 'tm-2', slots: 4, maxHeapMb: 4096 },
      { id: 'tm-3', slots: 4, maxHeapMb: 4096 },
    ],
    checkpointIntervalMs: 10000,
    stateBackend: 'rocksdb',
  },

  failureScript: [
    {
      atTick: 2,
      type: 'zookeeper-connection-failure',
      target: 'source-events',
      params: { zkEndpoint: 'zookeeper.legacy-infra.svc.cluster.local:2181', errorType: 'ConnectionRefused' },
    },
    {
      atTick: 4,
      type: 'job-manager-crash',
      target: 'source-events',
      params: { reason: 'GC-pause-heartbeat-timeout', standbyFailedReason: 'zookeeper-unreachable', downtimeMinutes: 45 },
    },
  ],

  victoryConditions: [
    {
      id: 'k8s-ha-active',
      description: 'Kubernetes native HA is configured and active',
      required: true,
      check: s => s.metrics.errorRate < 0.01,
    },
    {
      id: 'jm-replicas-configured',
      description: 'At least 2 JobManager replicas configured',
      required: true,
      check: s => s.metrics.restartCount <= 1,
    },
    {
      id: 'health-good',
      description: 'System health above 85%',
      required: true,
      check: s => s.systemHealthScore > 85,
    },
  ],

  conceptCards: [
    {
      concept: 'kubernetes-HA',
      title: 'Native Kubernetes HA for Flink',
      body: 'Since Flink 1.12, native Kubernetes HA uses Kubernetes ConfigMaps and Leases for JobManager leader election and HA metadata storage — no ZooKeeper required. The active JM writes its address to a ConfigMap; standby JMs watch it via the Kubernetes API. This eliminates an external dependency and works natively within any Kubernetes cluster.',
      showWhenFixed: true,
    },
    {
      concept: 'JobManager-HA',
      title: 'JobManager High Availability',
      body: 'In HA mode, multiple JobManager pods run simultaneously. One is elected leader; others are standbys. On leader failure, a standby reads the HA metadata (job graph, checkpoint pointers) and takes over within seconds. The key config: high-availability: kubernetes, high-availability.storageDir (for checkpoint metadata), and kubernetes.jobmanager.replicas: 2.',
      showWhenFixed: true,
    },
    {
      concept: 'application-mode',
      title: 'Flink Application Mode',
      body: "In Application Mode, the JobManager runs inside the cluster (as a Kubernetes pod) and is dedicated to a single job. The user jar is loaded by the JM directly. This isolates job classpaths and resources, but means the JM must be robust — it is both the coordinator and the job submission point. HA is critical in this mode because there is no external session cluster to fall back to.",
      showWhenFixed: false,
    },
  ],

  availableActions: ['switch-to-k8s-ha', 'fix-zookeeper-endpoint', 'configure-jm-replicas'],
}

export default scenario
