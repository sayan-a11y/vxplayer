'use client'

// Dashboard — 11 stat cards, 4 charts and recent audit activity.

import { useCallback, useEffect, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Film,
  Megaphone,
  Play,
  PlayCircle,
  RefreshCw,
  ScrollText,
  SkipForward,
  UserCheck,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCompact, formatDateTime } from '@/lib/format'
import type { DashboardDTO } from '@/lib/types'
import { adminGet } from '../session'
import {
  actionMeta,
  AXIS_TICK,
  CHART_COLORS,
  CURSOR_FILL,
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

const CARDS: { key: keyof DashboardDTO['cards']; label: string; icon: LucideIcon; accent?: boolean; danger?: boolean; suffix?: string }[] = [
  { key: 'totalUsers', label: 'Total viewers', icon: Users },
  { key: 'activeUsers', label: 'Active viewers · 7d', icon: UserCheck },
  { key: 'newUsers', label: 'New viewers · 7d', icon: UserPlus },
  { key: 'videosPlayed', label: 'Videos played', icon: Film },
  { key: 'sessions', label: 'Playback sessions', icon: PlayCircle },
  { key: 'watchTimeMin', label: 'Watch time', icon: Clock, suffix: ' min' },
  { key: 'adImpressions', label: 'Ad impressions', icon: Megaphone, accent: true },
  { key: 'adStarts', label: 'Ad starts', icon: Play, accent: true },
  { key: 'adCompletions', label: 'Ad completions', icon: CheckCircle2, accent: true },
  { key: 'adSkips', label: 'Ad skips', icon: SkipForward, accent: true },
  { key: 'adErrors', label: 'Ad errors', icon: AlertTriangle, accent: true, danger: true },
]

export default function DashboardView() {
  const [data, setData] = useState<DashboardDTO | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true)
    else setRefreshing(true)
    setError(null)
    try {
      const res = await adminGet<DashboardDTO>('/api/admin/dashboard')
      setData(res)
      setLastUpdated(new Date())
    } catch (e) {
      if (!isBackground) {
        setError(e instanceof Error ? e.message : 'Failed to load dashboard')
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  // Initial load
  useEffect(() => {
    void load()
  }, [load])

  // Real-time polling (every 3.5 seconds)
  useEffect(() => {
    if (!autoRefresh) return
    const interval = window.setInterval(() => {
      void load(true)
    }, 3500)
    return () => window.clearInterval(interval)
  }, [autoRefresh, load])

  if (loading) {
    return (
      <div className="space-y-6">
        <LoadingCards className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6" count={12} />
        <div className="grid gap-6 lg:grid-cols-2">
          <LoadingBlock />
          <LoadingBlock />
        </div>
      </div>
    )
  }

  if (error || !data) {
    return <ErrorState message={error ?? 'No dashboard data available.'} onRetry={() => void load()} />
  }

  const pieData = data.charts.placementSplit.map((p) => ({ name: p.placement, value: p.impressions }))

  return (
    <div className="space-y-6">
      {/* Real-data notice & live controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`vx-chip border-emerald-400/30 bg-emerald-400/10 text-[11px] font-semibold text-emerald-300 ${
              refreshing ? 'animate-pulse' : ''
            }`}
            role="status"
          >
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
            </span>
            {autoRefresh ? 'REAL-TIME LIVE' : 'LIVE (PAUSED)'}
          </span>
          <p className="text-xs text-white/45">
            Auto-syncing actual playback, ad events & user sessions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-white/40">
            Updated {lastUpdated.toLocaleTimeString()}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh((prev) => !prev)}
            className={`h-7 px-2.5 text-xs font-medium ${
              autoRefresh
                ? 'border-violet-500/30 bg-violet-500/10 text-violet-300'
                : 'border-white/10 bg-white/[0.04] text-white/60'
            }`}
          >
            {autoRefresh ? 'Auto 3.5s (ON)' : 'Auto (PAUSED)'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={refreshing}
            onClick={() => void load(true)}
            className="h-7 px-2 border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/10 hover:text-white"
            title="Refresh now"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {CARDS.map((c) => {
          const value = data.cards[c.key]
          return (
            <StatCard
              key={c.key}
              icon={c.icon}
              label={c.label}
              value={`${formatCompact(value)}${c.suffix ?? ''}`}
              accent={c.accent}
              danger={c.danger}
            />
          )
        })}
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="vx-card p-5">
          <h3 className="text-sm font-medium text-white/80">Viewers — active vs new (30 days)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data.charts.daily} margin={{ top: 12, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} vertical={false} />
              <XAxis dataKey="date" tickFormatter={fmtDay} tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={28} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM} labelStyle={TOOLTIP_LABEL} labelFormatter={fmtDay} />
              <Legend wrapperStyle={{ fontSize: 12, color: 'rgba(235,235,255,0.65)' }} />
              <Area type="monotone" dataKey="activeUsers" name="Active" stroke={CHART_COLORS[0]} fill={CHART_COLORS[0]} fillOpacity={0.18} strokeWidth={2} />
              <Area type="monotone" dataKey="newUsers" name="New" stroke={CHART_COLORS[2]} fill={CHART_COLORS[2]} fillOpacity={0.14} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="vx-card p-5">
          <h3 className="text-sm font-medium text-white/80">Playback sessions (daily)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data.charts.daily} margin={{ top: 12, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} vertical={false} />
              <XAxis dataKey="date" tickFormatter={fmtDay} tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={28} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM} labelStyle={TOOLTIP_LABEL} labelFormatter={fmtDay} cursor={CURSOR_FILL} />
              <Bar dataKey="playbackSessions" name="Sessions" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} maxBarSize={26} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="vx-card p-5">
          <h3 className="text-sm font-medium text-white/80">Ad delivery — impressions vs completions vs skips</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data.charts.adDaily} margin={{ top: 12, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} vertical={false} />
              <XAxis dataKey="date" tickFormatter={fmtDay} tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={28} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM} labelStyle={TOOLTIP_LABEL} labelFormatter={fmtDay} />
              <Legend wrapperStyle={{ fontSize: 12, color: 'rgba(235,235,255,0.65)' }} />
              <Line type="monotone" dataKey="impressions" name="Impressions" stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="completions" name="Completions" stroke={CHART_COLORS[4]} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="skips" name="Skips" stroke={CHART_COLORS[3]} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="vx-card p-5">
          <h3 className="text-sm font-medium text-white/80">Impressions by placement</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={3} stroke="none">
                {pieData.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM} labelStyle={TOOLTIP_LABEL} />
              <Legend wrapperStyle={{ fontSize: 12, color: 'rgba(235,235,255,0.65)' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent activity */}
      <div className="vx-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-white/40" />
          <h3 className="text-sm font-medium text-white/80">Recent admin activity</h3>
        </div>
        {data.recentAudit.length === 0 ? (
          <p className="py-4 text-center text-sm text-white/40">No audit activity yet.</p>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {data.recentAudit.slice(0, 8).map((log) => {
              const meta = actionMeta(log.action)
              const Icon = meta.icon
              return (
                <li key={log.id} className="flex items-center gap-3 py-2.5">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${meta.className}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-white/80">
                      <span className="font-medium">{log.adminName}</span>
                      <span className="text-white/40"> · </span>
                      <span className="font-mono text-xs text-violet-300/90">{log.action}</span>
                    </p>
                    {log.target ? <p className="truncate text-xs text-white/40">{log.target}</p> : null}
                  </div>
                  <time className="shrink-0 text-xs tabular-nums text-white/35">{formatDateTime(log.createdAt)}</time>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
