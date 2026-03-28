import { LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useMetricsHistory } from '../../hooks/useMetrics'
import { useSimulationStore } from '../../store/simulationStore'
import { COLORS } from '../../constants/colors'
import { formatNumber, formatRate } from '../../utils/formatters'

export function MetricsPanel() {
  const history = useMetricsHistory()
  const snapshot = useSimulationStore(s => s.snapshot)
  const metrics = snapshot?.metrics

  const data = history.slice(-60).map((d, i) => ({ i, lag: d.totalLag, throughput: Math.round(d.messagesPerSecIn), error: Math.round(d.errorRate * 100), health: d.healthScore }))

  return (
    <div className="border-t border-slate-700 bg-slate-900">
      <div className="flex gap-4 px-4 py-2 overflow-x-auto">
        {/* KPI cards */}
        <MetricCard label="Consumer Lag" value={formatNumber(metrics?.totalLag ?? 0)} color={metrics && metrics.totalLag > 500 ? COLORS.health.red : metrics && metrics.totalLag > 100 ? COLORS.health.yellow : COLORS.health.green} />
        <MetricCard label="Msg/sec In" value={formatRate(metrics?.messagesPerSecIn ?? 0)} color={COLORS.producer.healthy} />
        <MetricCard label="Error Rate" value={`${((metrics?.errorRate ?? 0) * 100).toFixed(1)}%`} color={metrics && metrics.errorRate > 0.05 ? COLORS.health.red : COLORS.health.green} />
        <MetricCard label="Under-replicated" value={String(metrics?.underReplicatedPartitions ?? 0)} color={metrics && metrics.underReplicatedPartitions > 0 ? COLORS.health.red : COLORS.health.green} />
        {(metrics?.dlqDepth ?? 0) > 0 && <MetricCard label="DLQ Depth" value={formatNumber(metrics!.dlqDepth)} color={COLORS.message.dlq} />}
        {(metrics?.duplicateCount ?? 0) > 0 && <MetricCard label="Duplicates" value={formatNumber(metrics!.duplicateCount)} color={COLORS.message.duplicate} />}
        {(metrics?.slaBreaches ?? 0) > 0 && <MetricCard label="SLA Breaches" value={String(metrics!.slaBreaches)} color={COLORS.health.red} />}

        {/* Lag chart */}
        <div className="flex-shrink-0 w-40 h-14">
          <div className="text-xs text-slate-500 mb-1">Lag (60s)</div>
          <ResponsiveContainer width="100%" height={40}>
            <AreaChart data={data}>
              <Area type="monotone" dataKey="lag" stroke={COLORS.health.yellow} fill={COLORS.health.yellow + '22'} dot={false} strokeWidth={1.5} />
              <Tooltip contentStyle={{ background: '#1e293b', border: 'none', fontSize: 10 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Throughput chart */}
        <div className="flex-shrink-0 w-40 h-14">
          <div className="text-xs text-slate-500 mb-1">Throughput</div>
          <ResponsiveContainer width="100%" height={40}>
            <LineChart data={data}>
              <Line type="monotone" dataKey="throughput" stroke={COLORS.producer.healthy} dot={false} strokeWidth={1.5} />
              <Tooltip contentStyle={{ background: '#1e293b', border: 'none', fontSize: 10 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Health chart */}
        <div className="flex-shrink-0 w-40 h-14">
          <div className="text-xs text-slate-500 mb-1">Health Score</div>
          <ResponsiveContainer width="100%" height={40}>
            <LineChart data={data}>
              <Line type="monotone" dataKey="health" stroke={COLORS.health.green} dot={false} strokeWidth={1.5} />
              <Tooltip contentStyle={{ background: '#1e293b', border: 'none', fontSize: 10 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex-shrink-0 flex flex-col justify-center">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-base font-mono font-bold" style={{ color }}>{value}</div>
    </div>
  )
}
