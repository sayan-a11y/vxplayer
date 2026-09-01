'use client'

// Users — aggregate end-user analytics derived from the dashboard dataset.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { TrendingDown, TrendingUp, UserCheck, Users } from 'lucide-react'
import { formatCompact } from '@/lib/format'
import type { DashboardDTO } from '@/lib/types'
import { adminGet } from '../session'
import {
  AXIS_TICK,
  CHART_COLORS,
  ErrorState,
  fmtDay,
  GRID_STROKE,
  LoadingBlock,
  LoadingCards,
  StatCard,
  TOOLTIP_ITEM,
  TOOLTIP_LABEL,
  TOOLTIP_STYLE,
} from '../shared'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export default function UsersView() {
  const [data, setData] = useState<DashboardDTO | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await adminGet<DashboardDTO>('/api/admin/dashboard'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load user analytics')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const kpis = useMemo(() => {
    if (!data || data.charts.daily.length === 0) return null
    const daily = data.charts.daily
    const latest = daily[daily.length - 1]
    const avgActive = Math.round(daily.reduce((sum, d) => sum + d.activeUsers, 0) / daily.length)
    const first = daily[0]
    const growth = first.totalUsers > 0 ? ((latest.totalUsers - first.totalUsers) / first.totalUsers) * 100 : 0
    return { totalUsers: latest.totalUsers, avgActive, growth }
  }, [data])

  const last14 = useMemo(() => (data ? [...data.charts.daily].slice(-14).reverse() : []), [data])

  if (loading) {
    return (
      <div className="space-y-6">
        <LoadingCards className="grid-cols-1 sm:grid-cols-3" count={3} />
        <LoadingBlock />
      </div>
    )
  }

  if (error || !data) {
    return <ErrorState message={error ?? 'No user data available.'} onRetry={() => void load()} />
  }

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard icon={Users} label="Total users (latest)" value={formatCompact(kpis?.totalUsers ?? 0)} hint="Most recent day in dataset" />
        <StatCard icon={UserCheck} label="30-day avg active" value={formatCompact(kpis?.avgActive ?? 0)} hint="Average daily active users" accent />
        <StatCard
          icon={(kpis?.growth ?? 0) >= 0 ? TrendingUp : TrendingDown}
          label="D30 growth"
          value={`${(kpis?.growth ?? 0) >= 0 ? '+' : ''}${(kpis?.growth ?? 0).toFixed(1)}%`}
          hint="Total users, first vs latest day"
        />
      </div>

      {/* Chart */}
      <div className="vx-card p-5">
        <h3 className="text-sm font-medium text-white/80">Total users vs active users (30 days)</h3>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={data.charts.daily} margin={{ top: 12, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid stroke={GRID_STROKE} vertical={false} />
            <XAxis dataKey="date" tickFormatter={fmtDay} tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={28} />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM} labelStyle={TOOLTIP_LABEL} labelFormatter={fmtDay} />
            <Legend wrapperStyle={{ fontSize: 12, color: 'rgba(235,235,255,0.65)' }} />
            <Area type="monotone" dataKey="totalUsers" name="Total users" stroke={CHART_COLORS[0]} fill={CHART_COLORS[0]} fillOpacity={0.16} strokeWidth={2} />
            <Area type="monotone" dataKey="activeUsers" name="Active users" stroke={CHART_COLORS[2]} fill={CHART_COLORS[2]} fillOpacity={0.14} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Last 14 days table */}
      <div className="vx-card overflow-hidden p-0">
        <div className="border-b border-white/[0.07] px-5 py-3.5">
          <h3 className="text-sm font-medium text-white/80">Last 14 days</h3>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-white/[0.07] hover:bg-transparent">
                <TableHead className="text-white/45">Date</TableHead>
                <TableHead className="text-right text-white/45">Total users</TableHead>
                <TableHead className="text-right text-white/45">Active</TableHead>
                <TableHead className="text-right text-white/45">New</TableHead>
                <TableHead className="text-right text-white/45">Sessions</TableHead>
                <TableHead className="text-right text-white/45">Watch time (min)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {last14.map((d) => (
                <TableRow key={d.date} className="border-white/[0.06]">
                  <TableCell className="tabular-nums text-white/75">{fmtDay(d.date)}</TableCell>
                  <TableCell className="text-right tabular-nums text-white/75">{d.totalUsers}</TableCell>
                  <TableCell className="text-right tabular-nums text-white/60">{d.activeUsers}</TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-300/90">+{d.newUsers}</TableCell>
                  <TableCell className="text-right tabular-nums text-white/60">{d.playbackSessions}</TableCell>
                  <TableCell className="text-right tabular-nums text-white/60">{formatCompact(d.watchTimeMin)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
