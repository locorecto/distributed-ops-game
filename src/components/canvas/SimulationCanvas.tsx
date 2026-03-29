import { useRef, useState, useEffect } from 'react'
import { useSimulationStore } from '../../store/simulationStore'
import type { SimulationSnapshot } from '../../engine/types'
import { useUIStore } from '../../store/uiStore'
import { ProducerNode } from './ProducerNode'
import { ConsumerNode } from './ConsumerNode'
import { TopicNode } from './TopicNode'
import { BrokerNode } from './BrokerNode'
import { ConnectionLine } from './ConnectionLine'
import { MessageParticle } from './MessageParticle'
import { COLORS } from '../../constants/colors'
import { nanoid } from 'nanoid'

interface Particle {
  id: string
  fromX: number
  fromY: number
  toX: number
  toY: number
  color: string
}

// Simple fixed-layout positions based on entity counts
function computeLayout(
  producerCount: number,
  topicCount: number,
  consumerCount: number,
  width: number,
  height: number,
) {
  const positions: Record<string, { x: number; y: number }> = {}
  const cx = width / 2
  const cy = height / 2

  const padX = Math.max(120, width * 0.14)
  // Producers: left column
  for (let i = 0; i < producerCount; i++) {
    const y = cy + (i - (producerCount - 1) / 2) * 90
    positions[`producer-${i}`] = { x: padX, y }
  }
  // Topics: center
  for (let i = 0; i < topicCount; i++) {
    const y = cy + (i - (topicCount - 1) / 2) * 120
    positions[`topic-${i}`] = { x: cx, y }
  }
  // Consumers: right column
  for (let i = 0; i < consumerCount; i++) {
    const y = cy + (i - (consumerCount - 1) / 2) * 80
    positions[`consumer-${i}`] = { x: width - padX, y }
  }
  // Brokers: top center
  return positions
}

export function SimulationCanvas() {
  const snapshot = useSimulationStore(s => s.snapshot) as SimulationSnapshot | null
  const { selectedEntityId, selectEntity, clearSelection } = useUIStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 800, height: 400 })
  const [particles, setParticles] = useState<Particle[]>([])
  const tickRef = useRef(0)

  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      setSize({ width, height })
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // Spawn particles periodically when simulation is running
  useEffect(() => {
    if (!snapshot) return
    const tick = snapshot.tickNumber
    if (tick === tickRef.current) return
    tickRef.current = tick

    // add one particle per active producer per tick (sampled)
    if (tick % 3 !== 0) return
    const producerList = Array.from(snapshot.producers.values())
    const topicList = Array.from(snapshot.topics.values())
    if (producerList.length === 0 || topicList.length === 0) return

    const layout = computeLayout(
      producerList.length,
      topicList.length,
      Array.from(snapshot.consumers.values()).length,
      size.width,
      size.height,
    )

    producerList.forEach((prod, pi) => {
      if (!prod.isHealthy) return
      const from = layout[`producer-${pi}`]
      if (!from) return
      const topicIdx = Array.from(snapshot.topics.keys()).indexOf(prod.config.targetTopic)
      const to = layout[`topic-${topicIdx}`]
      if (!to) return

      const color = prod.config.idempotent
        ? COLORS.message.compacted
        : prod.config.transactional
        ? COLORS.message.transaction
        : COLORS.message.normal

      setParticles(prev => [
        ...prev.slice(-30),
        { id: nanoid(6), fromX: from.x, fromY: from.y, toX: to.x, toY: to.y, color },
      ])
    })
  }, [snapshot, size])

  if (!snapshot) {
    return (
      <div ref={containerRef} className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: COLORS.background.canvas }}>
        <p className="text-slate-600 text-sm font-mono">Initializing topology…</p>
      </div>
    )
  }

  const producerList = Array.from(snapshot.producers.entries())
  const topicList = Array.from(snapshot.topics.entries())
  const consumerList = Array.from(snapshot.consumers.entries())
  const brokerList = Array.from(snapshot.brokers.entries())

  const layout = computeLayout(producerList.length, topicList.length, consumerList.length, size.width, size.height)

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden"
      style={{ backgroundColor: COLORS.background.canvas }}
      onClick={() => clearSelection()}
    >
      {/* Column headers */}
      <div className="absolute top-3 left-0 right-0 flex pointer-events-none px-4" style={{ zIndex: 1 }}>
        <div className="flex-1 text-center">
          <span className="text-xs font-mono uppercase tracking-widest" style={{ color: '#334155' }}>Producers</span>
        </div>
        <div className="flex-1 text-center">
          <span className="text-xs font-mono uppercase tracking-widest" style={{ color: '#334155' }}>Topics / Partitions</span>
        </div>
        <div className="flex-1 text-center">
          <span className="text-xs font-mono uppercase tracking-widest" style={{ color: '#334155' }}>Consumers</span>
        </div>
      </div>

      {/* SVG overlay for connection lines */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        {producerList.map(([, prod], pi) => {
          const from = layout[`producer-${pi}`]
          const topicIdx = topicList.findIndex(([name]) => name === prod.config.targetTopic)
          const to = layout[`topic-${topicIdx}`]
          if (!from || !to) return null
          return (
            <ConnectionLine
              key={prod.config.id}
              fromX={from.x} fromY={from.y}
              toX={to.x} toY={to.y}
              color={COLORS.partition.leader}
              animated
            />
          )
        })}
        {consumerList.map(([, consumer], ci) => {
          const to = layout[`consumer-${ci}`]
          consumer.assignedPartitions.forEach((_, topicName) => {
            const topicIdx = topicList.findIndex(([name]) => name === topicName)
            const from = layout[`topic-${topicIdx}`]
            if (!from || !to) return null
          })
          return consumerList.map(([, c], ci2) => {
            if (ci2 !== ci) return null
            const to2 = layout[`consumer-${ci}`]
            const entries: JSX.Element[] = []
            c.assignedPartitions.forEach((_, topicName) => {
              const topicIdx = topicList.findIndex(([name]) => name === topicName)
              const from = layout[`topic-${topicIdx}`]
              if (!from || !to2) return
              entries.push(
                <ConnectionLine
                  key={`${c.config.id}-${topicName}`}
                  fromX={from.x} fromY={from.y}
                  toX={to2.x} toY={to2.y}
                  color={c.isActive ? COLORS.consumer.active : COLORS.consumer.crashed}
                />
              )
            })
            return entries
          })
        })}
      </svg>

      {/* Broker nodes — top row */}
      {brokerList.map(([, broker], bi) => (
        <BrokerNode
          key={broker.config.id}
          broker={broker}
          x={size.width / 2 + (bi - (brokerList.length - 1) / 2) * 100}
          y={50}
          selected={selectedEntityId === String(broker.config.id)}
          onClick={() => { selectEntity(String(broker.config.id), 'broker') }}
        />
      ))}

      {/* Producer nodes */}
      {producerList.map(([, prod], pi) => {
        const pos = layout[`producer-${pi}`]
        return pos ? (
          <ProducerNode
            key={prod.config.id}
            producer={prod}
            x={pos.x} y={pos.y}
            selected={selectedEntityId === prod.config.id}
            onClick={() => { selectEntity(prod.config.id, 'producer') }}
          />
        ) : null
      })}

      {/* Topic nodes */}
      {topicList.map(([, topic], ti) => {
        const pos = layout[`topic-${ti}`]
        return pos ? (
          <TopicNode
            key={topic.config.name}
            topic={topic}
            x={pos.x} y={pos.y}
            selected={selectedEntityId === topic.config.name}
            onClick={() => { selectEntity(topic.config.name, 'topic') }}
          />
        ) : null
      })}

      {/* Consumer nodes */}
      {consumerList.map(([, consumer], ci) => {
        const pos = layout[`consumer-${ci}`]
        return pos ? (
          <ConsumerNode
            key={consumer.config.id}
            consumer={consumer}
            x={pos.x} y={pos.y}
            selected={selectedEntityId === consumer.config.id}
            onClick={() => { selectEntity(consumer.config.id, 'consumer') }}
          />
        ) : null
      })}

      {/* Message particles */}
      {particles.map(p => (
        <MessageParticle
          key={p.id}
          fromX={p.fromX} fromY={p.fromY}
          toX={p.toX} toY={p.toY}
          color={p.color}
          onComplete={() => setParticles(prev => prev.filter(x => x.id !== p.id))}
        />
      ))}
    </div>
  )
}
