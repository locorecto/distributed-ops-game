import { useState } from 'react'
import type { SimulationEngine } from '../../engine/SimulationEngine'
import type { SimulationSnapshot } from '../../engine/types'
import type { ScenarioDefinition } from '../../scenarios/types'
import { Button } from '../shared/Button'
import { Slider } from '../shared/Slider'
import { Select } from '../shared/Select'
import { useUIStore } from '../../store/uiStore'
import { formatMs, formatBytes } from '../../utils/formatters'

interface TopicConfigPanelProps {
  engine: SimulationEngine
  snapshot: SimulationSnapshot
  scenario: ScenarioDefinition | undefined
}

export function TopicConfigPanel({ engine, snapshot, scenario }: TopicConfigPanelProps) {
  const topics = Array.from(snapshot.topics.entries())
  const [selectedTopic, setSelectedTopic] = useState(topics[0]?.[0] ?? '')
  const topic = snapshot.topics.get(selectedTopic)
  const { showToast } = useUIStore()
  const actions = scenario?.availableActions ?? []

  if (!topic) return <p className="text-slate-500 text-xs">No topics loaded.</p>

  return (
    <div className="flex flex-col gap-3">
      {topics.length > 1 && (
        <Select
          label="Topic"
          value={selectedTopic}
          options={topics.map(([name]) => ({ label: name, value: name }))}
          onChange={setSelectedTopic}
        />
      )}

      <div className="text-xs text-slate-500 font-mono">{selectedTopic}</div>

      {actions.includes('add-partitions') && (
        <div className="flex flex-col gap-1">
          <div className="text-xs text-slate-400">Partitions: <span className="text-slate-200 font-mono">{topic.config.partitionCount}</span></div>
          <div className="flex gap-1">
            <Button size="sm" variant="secondary" onClick={() => {
              engine.addPartitions(selectedTopic, 1)
              showToast(`Added 1 partition to ${selectedTopic}`, 'success')
            }}>+1</Button>
            <Button size="sm" variant="secondary" onClick={() => {
              engine.addPartitions(selectedTopic, 3)
              showToast(`Added 3 partitions to ${selectedTopic}`, 'success')
            }}>+3</Button>
            <Button size="sm" variant="secondary" onClick={() => {
              engine.addPartitions(selectedTopic, 5)
              showToast(`Added 5 partitions to ${selectedTopic}`, 'success')
            }}>+5</Button>
          </div>
        </div>
      )}

      {actions.includes('change-replication') && (
        <div className="flex flex-col gap-1">
          <div className="text-xs text-slate-400">Replication Factor: <span className="text-slate-200 font-mono">{topic.config.replicationFactor}</span></div>
          <div className="flex gap-1">
            {[1, 2, 3].map(rf => (
              <Button
                key={rf}
                size="sm"
                variant={topic.config.replicationFactor === rf ? 'primary' : 'secondary'}
                onClick={() => {
                  engine.applyTopicConfig(selectedTopic, { replicationFactor: rf })
                  showToast(`Replication factor set to ${rf}`, 'success')
                }}
              >RF={rf}</Button>
            ))}
          </div>
        </div>
      )}

      {actions.includes('set-min-isr') && (
        <Slider
          label="min.insync.replicas"
          value={topic.config.minInsyncReplicas}
          min={1}
          max={topic.config.replicationFactor}
          onChange={v => {
            engine.applyTopicConfig(selectedTopic, { minInsyncReplicas: v })
            showToast(`min.insync.replicas = ${v}`, 'success')
          }}
        />
      )}

      {actions.includes('set-retention-ms') && (
        <Select
          label="retention.ms"
          value={topic.config.retentionMs}
          options={[
            { label: '1 hour', value: 3_600_000 },
            { label: '4 hours', value: 14_400_000 },
            { label: '12 hours', value: 43_200_000 },
            { label: '1 day', value: 86_400_000 },
            { label: '7 days', value: 604_800_000 },
            { label: '30 days', value: 2_592_000_000 },
            { label: 'Infinite', value: -1 },
          ]}
          onChange={v => {
            engine.applyTopicConfig(selectedTopic, { retentionMs: Number(v) })
            showToast(`retention.ms = ${formatMs(Number(v))}`, 'success')
          }}
        />
      )}

      {actions.includes('set-retention-bytes') && (
        <Select
          label="retention.bytes"
          value={topic.config.retentionBytes}
          options={[
            { label: '100 MB', value: 104_857_600 },
            { label: '500 MB', value: 524_288_000 },
            { label: '1 GB', value: 1_073_741_824 },
            { label: '2 GB', value: 2_147_483_648 },
            { label: '5 GB', value: 5_368_709_120 },
            { label: 'Unlimited', value: -1 },
          ]}
          onChange={v => {
            engine.applyTopicConfig(selectedTopic, { retentionBytes: Number(v) })
            showToast(`retention.bytes = ${formatBytes(Number(v))}`, 'success')
          }}
        />
      )}

      {actions.includes('set-cleanup-policy') && (
        <Select
          label="cleanup.policy"
          value={topic.config.cleanupPolicy}
          options={[
            { label: 'delete', value: 'delete' },
            { label: 'compact', value: 'compact' },
          ]}
          onChange={v => {
            engine.applyTopicConfig(selectedTopic, { cleanupPolicy: v as 'delete' | 'compact' })
            showToast(`cleanup.policy = ${v}`, 'success')
          }}
        />
      )}

      {actions.includes('set-message-size') && (
        <Select
          label="message.max.bytes"
          value={topic.config.messageMaxBytes}
          options={[
            { label: '1 MB (default)', value: 1_048_576 },
            { label: '5 MB', value: 5_242_880 },
            { label: '10 MB', value: 10_485_760 },
            { label: '50 MB', value: 52_428_800 },
          ]}
          onChange={v => {
            engine.applyTopicConfig(selectedTopic, { messageMaxBytes: Number(v) })
            showToast(`message.max.bytes = ${formatBytes(Number(v))}`, 'success')
          }}
        />
      )}

      <div className="border-t border-slate-700 pt-2 text-xs text-slate-500 space-y-0.5">
        <div>Partitions: {topic.config.partitionCount}</div>
        <div>RF: {topic.config.replicationFactor} / min.isr: {topic.config.minInsyncReplicas}</div>
        <div>Cleanup: {topic.config.cleanupPolicy}</div>
      </div>
    </div>
  )
}
