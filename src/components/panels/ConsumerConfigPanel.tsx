import { useState } from 'react'
import type { SimulationEngine } from '../../engine/SimulationEngine'
import type { SimulationSnapshot } from '../../engine/types'
import type { ScenarioDefinition } from '../../scenarios/types'
import { Button } from '../shared/Button'
import { Toggle } from '../shared/Toggle'
import { Select } from '../shared/Select'
import { useUIStore } from '../../store/uiStore'
import { formatMs } from '../../utils/formatters'

interface ConsumerConfigPanelProps {
  engine: SimulationEngine
  snapshot: SimulationSnapshot
  scenario: ScenarioDefinition | undefined
}

export function ConsumerConfigPanel({ engine, snapshot, scenario }: ConsumerConfigPanelProps) {
  const consumers = Array.from(snapshot.consumers.entries())
  const [selectedId, setSelectedId] = useState(consumers[0]?.[0] ?? '')
  const consumer = snapshot.consumers.get(selectedId)
  const { showToast } = useUIStore()
  const actions = scenario?.availableActions ?? []

  const apply = (patch: Parameters<typeof engine.applyConsumerConfig>[1]) => {
    engine.applyConsumerConfig(selectedId, patch)
  }

  return (
    <div className="flex flex-col gap-3">
      {consumers.length > 1 && (
        <Select
          label="Consumer"
          value={selectedId}
          options={consumers.map(([id]) => ({ label: id.replace('consumer-', ''), value: id }))}
          onChange={setSelectedId}
        />
      )}

      {consumer && (
        <>
          <div className="text-xs text-slate-500">
            Group: <span className="text-slate-300">{consumer.config.groupId}</span> |
            Lag: <span className="text-yellow-400 font-mono">{consumer.lag}</span>
          </div>

          {actions.includes('enable-manual-commit') && (
            <Toggle
              label="Manual Commit"
              tooltip="When enabled, offsets are only saved when you explicitly click 'Commit Offsets Now'. This gives you full control over at-least-once delivery guarantees."
              description="Disable auto-commit — you control when offsets commit"
              checked={!consumer.config.enableAutoCommit}
              onChange={v => { apply({ enableAutoCommit: !v }); showToast(`Auto-commit ${!v ? 'enabled' : 'disabled'}`, 'success') }}
            />
          )}

          {!consumer.config.enableAutoCommit && (
            <Button size="sm" onClick={() => { engine.triggerManualCommit(selectedId); showToast('Offsets committed', 'success') }}>
              Commit Offsets Now
            </Button>
          )}

          {actions.includes('set-offset-reset') && (
            <Select
              label="auto.offset.reset"
              tooltip="Controls where the consumer starts reading when no committed offset exists for a partition. 'earliest' reads from the very beginning of the log; 'latest' skips old messages and only reads new ones."
              value={consumer.config.autoOffsetReset}
              options={[
                { label: 'earliest (read all)', value: 'earliest' },
                { label: 'latest (new messages only)', value: 'latest' },
              ]}
              onChange={v => { apply({ autoOffsetReset: v as 'earliest' | 'latest' }); showToast(`auto.offset.reset = ${v}`, 'success') }}
            />
          )}

          {actions.includes('reset-consumer-group-offset') && (
            <div className="flex flex-col gap-1">
              <div className="text-xs text-slate-400">Reset Group Offset</div>
              <div className="flex gap-1">
                <Button size="sm" variant="secondary" onClick={() => {
                  engine.resetConsumerGroupOffset(consumer.config.groupId, consumer.config.subscribedTopics[0], 'earliest')
                  showToast(`Group offset reset to earliest`, 'success')
                }}>→ earliest</Button>
                <Button size="sm" variant="secondary" onClick={() => {
                  engine.resetConsumerGroupOffset(consumer.config.groupId, consumer.config.subscribedTopics[0], 'latest')
                  showToast(`Group offset reset to latest`, 'info')
                }}>→ latest</Button>
              </div>
            </div>
          )}

          {actions.includes('set-isolation-level') && (
            <Select
              label="isolation.level"
              tooltip="'read_uncommitted' lets consumers see all messages immediately, including those from in-flight transactions. 'read_committed' hides messages until their transaction is committed, preventing dirty reads."
              value={consumer.config.isolationLevel}
              options={[
                { label: 'read_uncommitted', value: 'read_uncommitted' },
                { label: 'read_committed', value: 'read_committed' },
              ]}
              onChange={v => { apply({ isolationLevel: v as 'read_uncommitted' | 'read_committed' }); showToast(`isolation.level = ${v}`, 'success') }}
            />
          )}

          {actions.includes('set-session-timeout') && (
            <Select
              label="session.timeout.ms"
              tooltip="How long the broker waits for a heartbeat before declaring a consumer dead and triggering a group rebalance. Lower values detect failures faster but risk false timeouts on slow consumers."
              value={consumer.config.sessionTimeoutMs}
              options={[
                { label: '6s (aggressive)', value: 6000 },
                { label: '10s', value: 10000 },
                { label: '15s', value: 15000 },
                { label: '30s (default)', value: 30000 },
                { label: '60s', value: 60000 },
              ]}
              onChange={v => { apply({ sessionTimeoutMs: Number(v) }); showToast(`session.timeout.ms = ${formatMs(Number(v))}`, 'success') }}
            />
          )}

          {actions.includes('set-heartbeat') && (
            <Select
              label="heartbeat.interval.ms"
              tooltip="How often the consumer sends a heartbeat to the broker. Must be lower than session.timeout.ms. Shorter intervals allow the broker to detect a dead consumer more quickly."
              value={consumer.config.heartbeatIntervalMs}
              options={[
                { label: '1s', value: 1000 },
                { label: '2s', value: 2000 },
                { label: '3s (default)', value: 3000 },
                { label: '5s', value: 5000 },
                { label: '10s', value: 10000 },
              ]}
              onChange={v => { apply({ heartbeatIntervalMs: Number(v) }); showToast(`heartbeat.interval.ms = ${formatMs(Number(v))}`, 'success') }}
            />
          )}

          {actions.includes('set-poll-interval') && (
            <Select
              label="max.poll.interval.ms"
              tooltip="Maximum time between poll() calls before the broker treats the consumer as stuck and removes it from the group. If your processing logic is slow, increase this. If you want fast failure detection, decrease it."
              value={consumer.config.maxPollIntervalMs}
              options={[
                { label: '10s', value: 10000 },
                { label: '30s', value: 30000 },
                { label: '5m (default)', value: 300000 },
              ]}
              onChange={v => { apply({ maxPollIntervalMs: Number(v) }); showToast(`max.poll.interval.ms = ${formatMs(Number(v))}`, 'success') }}
            />
          )}

          {actions.includes('add-dlq') && (
            <Toggle
              label="Enable DLQ"
              tooltip="Dead Letter Queue: when enabled, messages that fail processing after all retries are routed to a separate topic instead of being silently dropped. Useful for inspecting and reprocessing problem messages."
              description="Route failed messages to dead letter queue"
              checked={consumer.config.dlqEnabled}
              onChange={v => { apply({ dlqEnabled: v }); showToast(`DLQ ${v ? 'enabled' : 'disabled'}`, 'success') }}
            />
          )}

          {actions.includes('set-max-poll-records') && (
            <Select
              label="max.poll.records"
              tooltip="Maximum number of messages fetched in a single poll() call. Increasing this lets the consumer process more messages per tick, directly reducing consumer lag. The throughput is also bounded by your processing speed."
              value={consumer.config.maxPollRecords}
              options={[1, 3, 5, 10, 20, 50, 100, 500].map(n => ({
                label: n === 3 ? `${n} (default)` : `${n}`,
                value: n,
              }))}
              onChange={v => { apply({ maxPollRecords: Number(v) }); showToast(`max.poll.records = ${v}`, 'success') }}
            />
          )}

          {actions.includes('configure-retry') && (
            <Select
              label="Max Retries"
              tooltip="How many times to retry a failed message before sending it to the DLQ (or dropping it). More retries help with transient errors but delay processing of subsequent messages."
              value={consumer.config.maxRetries}
              options={[0, 1, 2, 3, 5, 10].map(n => ({ label: n === 0 ? '0 (no retry)' : `${n}`, value: n }))}
              onChange={v => { apply({ maxRetries: Number(v) }); showToast(`maxRetries = ${v}`, 'success') }}
            />
          )}

          {actions.includes('set-schema') && (
            <Select
              label="Schema Version"
              tooltip="The Avro/JSON schema version this consumer expects. If a message's schema version is newer than what the consumer supports, it will fail deserialization and be counted as an error."
              value={consumer.config.schemaVersion ?? 1}
              options={[
                { label: 'v1 (original schema)', value: 1 },
                { label: 'v2 (with optional userSegment)', value: 2 },
              ]}
              onChange={v => { apply({ schemaVersion: Number(v) }); showToast(`Consumer schema → v${v}`, 'success') }}
            />
          )}
        </>
      )}

      {/* Add consumer button */}
      {actions.includes('add-consumer') && consumers.length > 0 && (() => {
        const base = consumers[0][1]
        // Generate a sequential name based on the first consumer's ID
        const baseId = base.config.id
        const nextNum = consumers.filter(([id]) => id === baseId || id.startsWith(baseId + '-')).length + 1
        const newId = `${baseId}-${nextNum}`
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _id, ...configWithoutId } = base.config
        return (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              engine.addConsumer(base.config.groupId, configWithoutId, newId)
              showToast(`Added consumer "${newId.replace('consumer-', '')}" to group`, 'success')
            }}
          >
            + Add Consumer to Group
          </Button>
        )
      })()}
    </div>
  )
}
