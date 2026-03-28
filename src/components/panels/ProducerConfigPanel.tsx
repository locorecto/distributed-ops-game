import { useState } from 'react'
import type { SimulationEngine } from '../../engine/SimulationEngine'
import type { SimulationSnapshot } from '../../engine/types'
import type { ScenarioDefinition } from '../../scenarios/types'
import { Button } from '../shared/Button'
import { Toggle } from '../shared/Toggle'
import { Select } from '../shared/Select'
import { useUIStore } from '../../store/uiStore'
import { InfoTooltip } from '../shared/InfoTooltip'
import { formatBytes } from '../../utils/formatters'

interface ProducerConfigPanelProps {
  engine: SimulationEngine
  snapshot: SimulationSnapshot
  scenario: ScenarioDefinition | undefined
}

export function ProducerConfigPanel({ engine, snapshot, scenario }: ProducerConfigPanelProps) {
  const producers = Array.from(snapshot.producers.entries())
  const [selectedId, setSelectedId] = useState(producers[0]?.[0] ?? '')
  const producer = snapshot.producers.get(selectedId)
  const { showToast } = useUIStore()
  const actions = scenario?.availableActions ?? []

  if (!producer) return <p className="text-slate-500 text-xs">No producers loaded.</p>

  const apply = (patch: Parameters<typeof engine.applyProducerConfig>[1]) => {
    engine.applyProducerConfig(selectedId, patch)
  }

  return (
    <div className="flex flex-col gap-3">
      {producers.length > 1 && (
        <Select
          label="Producer"
          value={selectedId}
          options={producers.map(([id]) => ({ label: id.replace('producer-', ''), value: id }))}
          onChange={setSelectedId}
        />
      )}

      {actions.includes('set-producer-acks') && (
        <div className="flex flex-col gap-1">
          <div className="text-xs text-slate-400 flex items-center">
            acks
            <InfoTooltip text="How many broker acknowledgements the producer waits for. 0 = fire-and-forget (fastest, data loss risk). 1 = leader ack only (data loss if leader crashes). all = full ISR ack (safest, slowest)." />
          </div>
          <div className="flex gap-1">
            {([0, 1, -1] as const).map(a => (
              <Button
                key={a}
                size="sm"
                variant={producer.config.acks === a ? 'primary' : 'secondary'}
                onClick={() => { apply({ acks: a }); showToast(`acks = ${a === -1 ? 'all' : a}`, 'success') }}
              >{a === -1 ? 'all' : a}</Button>
            ))}
          </div>
        </div>
      )}

      {actions.includes('enable-idempotence') && (
        <Toggle
          label="Idempotent Producer"
          tooltip="Each message gets a unique sequence number. If the producer retries a failed send, the broker detects the duplicate and ignores it — preventing double-writes. Requires acks=all."
          description="Forces acks=all, prevents duplicates on retry"
          checked={producer.config.idempotent}
          onChange={v => { apply({ idempotent: v }); showToast(`Idempotent ${v ? 'enabled' : 'disabled'}`, v ? 'success' : 'info') }}
        />
      )}

      {actions.includes('enable-transactions') && (
        <Toggle
          label="Transactional"
          tooltip="Wraps reads and writes across multiple partitions/topics in an atomic transaction. Either all writes commit or none do. Essential for exactly-once semantics in read-process-write pipelines."
          description="Enables atomic write across partitions/topics"
          checked={producer.config.transactional}
          onChange={v => { apply({ transactional: v, transactionalId: v ? selectedId + '-txn' : undefined }); showToast(`Transactions ${v ? 'enabled' : 'disabled'}`, 'success') }}
        />
      )}

      {actions.includes('set-producer-key') && (
        <Select
          label="Key Strategy"
          tooltip="The message key determines which partition a message goes to (via hash). 'null' uses round-robin — spreading messages evenly but losing ordering guarantees. A consistent key (e.g. orderId) ensures all messages for one entity land on the same partition in order."
          value={producer.config.keyStrategy}
          options={[
            { label: 'null (round-robin)', value: 'null' },
            { label: 'fixed key', value: 'fixed' },
            { label: 'random', value: 'random' },
          ]}
          onChange={v => { apply({ keyStrategy: v as 'null' | 'fixed' | 'random' }); showToast(`Key strategy = ${v}`, 'success') }}
        />
      )}

      {actions.includes('set-linger-ms') && (
        <Select
          label="linger.ms"
          tooltip="How long the producer waits before sending a batch, even if batch.size isn't full. A higher value groups more messages together, reducing network overhead and improving throughput at the cost of slightly higher latency."
          value={producer.config.lingerMs}
          options={[
            { label: '0ms (no batching)', value: 0 },
            { label: '5ms', value: 5 },
            { label: '10ms', value: 10 },
            { label: '20ms', value: 20 },
            { label: '50ms', value: 50 },
            { label: '100ms', value: 100 },
          ]}
          onChange={v => { apply({ lingerMs: Number(v) }); showToast(`linger.ms = ${v}ms`, 'success') }}
        />
      )}

      {actions.includes('set-batch-size') && (
        <Select
          label="batch.size"
          tooltip="Maximum bytes accumulated in one batch before it's sent. Larger batches mean fewer network round-trips and better compression ratios, but they use more memory and increase latency if the batch never fills up."
          value={producer.config.batchSizeBytes}
          options={[
            { label: '16 KB (default)', value: 16_384 },
            { label: '64 KB', value: 65_536 },
            { label: '128 KB', value: 131_072 },
            { label: '256 KB', value: 262_144 },
            { label: '512 KB', value: 524_288 },
          ]}
          onChange={v => { apply({ batchSizeBytes: Number(v) }); showToast(`batch.size = ${formatBytes(Number(v))}`, 'success') }}
        />
      )}

      {actions.includes('set-compression') && (
        <Select
          label="compression.type"
          tooltip="Compresses message batches before sending. Reduces network bandwidth and broker disk usage. snappy/lz4 are fast with moderate compression; gzip/zstd achieve higher ratios at a small CPU cost."
          value={producer.config.compressionType}
          options={[
            { label: 'none', value: 'none' },
            { label: 'snappy (~50% smaller)', value: 'snappy' },
            { label: 'gzip (~60% smaller)', value: 'gzip' },
            { label: 'lz4 (~45% smaller, fast)', value: 'lz4' },
            { label: 'zstd (~65% smaller)', value: 'zstd' },
          ]}
          onChange={v => { apply({ compressionType: v as 'none' | 'snappy' | 'gzip' | 'lz4' | 'zstd' }); showToast(`compression.type = ${v}`, 'success') }}
        />
      )}

      {actions.includes('set-message-size') && (
        <Select
          label="max.request.size"
          tooltip="Maximum size of a single produce request. If any message exceeds this limit, the producer throws RecordTooLargeException. Must be coordinated with the broker's message.max.bytes and consumer's fetch.max.bytes."
          value={producer.config.maxRequestSizeBytes}
          options={[
            { label: '1 MB (default)', value: 1_048_576 },
            { label: '5 MB', value: 5_242_880 },
            { label: '10 MB', value: 10_485_760 },
            { label: '50 MB', value: 52_428_800 },
          ]}
          onChange={v => { apply({ maxRequestSizeBytes: Number(v) }); showToast(`max.request.size = ${formatBytes(Number(v))}`, 'success') }}
        />
      )}

      {actions.includes('set-schema') && (
        <Select
          label="Schema Version"
          tooltip="The Avro/JSON schema version this producer uses when serializing messages. Consumers must support this version or higher. Upgrading without coordinating with consumers causes deserialization errors."
          value={producer.config.schemaVersion ?? 1}
          options={[
            { label: 'v1 (original)', value: 1 },
            { label: 'v2 (optional userSegment field)', value: 2 },
          ]}
          onChange={v => { apply({ schemaVersion: Number(v) }); showToast(`Producer schema → v${v}`, 'success') }}
        />
      )}

      <div className="border-t border-slate-700 pt-2 text-xs text-slate-500 space-y-0.5">
        <div>acks: {producer.config.acks === -1 ? 'all' : producer.config.acks}</div>
        <div>sent: {producer.totalSent.toLocaleString()} | failed: {producer.totalFailed}</div>
        {producer.totalDuplicates > 0 && <div className="text-orange-400">duplicates: {producer.totalDuplicates}</div>}
      </div>
    </div>
  )
}
