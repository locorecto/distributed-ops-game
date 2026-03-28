import { useEffect, useRef } from 'react'
import type { SimulationEngine } from '../engine/SimulationEngine'
import { useSimulationStore } from '../store/simulationStore'
import { useMetricsStore } from '../store/metricsStore'
import { makeDataPoint, collectMetrics, computeHealthScore } from '../engine/MetricsCollector'

export function useSimulation(engine: SimulationEngine | null): void {
  const setSnapshot = useSimulationStore((s) => s.setSnapshot)
  const pushDataPoint = useMetricsStore((s) => s.pushDataPoint)
  const prevMetricsRef = useRef<ReturnType<typeof collectMetrics> | null>(null)

  useEffect(() => {
    if (!engine) return

    // Listen to tick events from the engine and update stores
    const unsubscribe = engine.eventBus.on<import('../engine/types').MetricsDataPoint>('tick', (dataPoint) => {
      if (dataPoint) pushDataPoint(dataPoint)
    })

    // Poll snapshot at ~10fps for React rendering (separate from engine tick rate)
    const pollId = setInterval(() => {
      const snapshot = engine.getSnapshot()
      setSnapshot(snapshot)
    }, 100)

    return () => {
      unsubscribe()
      clearInterval(pollId)
    }
  }, [engine, setSnapshot, pushDataPoint])
}
