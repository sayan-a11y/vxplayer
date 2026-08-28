'use client'

// Analytics — ad delivery funnel, daily trend, placement & campaign breakdowns,
// CSV export of the daily series.

import { useCallback, useEffect, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ArrowDownRight, ArrowUpRight, CheckCircle2, Download, Megaphone, Play, AlertTriangle, SkipForward } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCompact } from '@/lib/format'
import type { AnalyticsDTO } from '@/lib/types'
import { adminGet } from '../session'
import {
  AXIS_TICK,
  CHART_COLORS,
  CURSOR_FILL,
  downloadCsv,
  ErrorState,
  fmtDay,
  GRID_STROKE,
  LoadingBlock,
  LoadingCards,
  PageHeader,
  PLACEMENT_LABELS,
  ratePct,
  StatCard,
  TOOLTIP_ITEM,
  TOOLTIP_LABEL,
  TOOLTIP_STYLE,
} from '../shared'

export default function AnalyticsView() {
  const [data, setData] = useState<AnalyticsDTO | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await adminGet<AnalyticsDTO>('/api/admin/analytics'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function exportCsv() {
    if (!data) return
    downloadCsv(
      `vx-analytics-${new Date().toISOString().slice(0, 10)}.csv`,
      data.byDay.map((d) => ({ date: d.date, impressions: d.impressions, completions: d.completions, skips: d.skips }))
    )
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Analytics" description="Ad funnel & delivery performance" />
        <LoadingCards className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-6" count={6} />
        <LoadingBlock />
        <LoadingBlock />
      </div>
    )
  }

  if (error || !data) {
    return <ErrorState message={error ?? 'No analytics data available.'} onRetry={() => void load()} />
  }

  const t = data.totals
  const rateUp = t.completionRate >= 50

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Ad funnel & delivery performance"
        actions={
          <Button variant="outline" onClick={exportCsv} className="h-10 border-white/15 bg-transparent text-white/75 hover:bg-white/5 hover:text-white">
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
        }
      />

      {/* Totals */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard icon={Megaphone} label="Impressions" value={formatCompact(t.impressions)} accent />
        <StatCard icon={Play} label="Starts" value={formatCompact(t.starts)} accent />
        <StatCard icon={CheckCircle2} label="Completions" value={formatCompact(t.completions)} accent />
        <StatCard icon={SkipForward} label="Skips" value={formatCompact(t.skips)} accent />
        <StatCard icon={AlertTriangle} label="Errors" value={formatCompact(t.errors)} accent danger />
        <StatCard
          icon={rateUp ? ArrowUpRight : ArrowDownRight}
          label="Completion rate"
          value={`${t.completionRate.toFixed(1)}%`}
          hint="of impressions"
          accent
        />
      </div>

      {/* Funnel */}
      <div className="vx-card p-5">
        <h3 className="mb-2 text-sm font-medium text-white/80">Delivery funnel — IMPRESSION → COMPLETE</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data.funnel} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
            <CartesianGrid stroke={GRID_STROKE} horizontal={false} />
            <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="label" tick={AXIS_TICK} width={104} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM} labelStyle={TOOLTIP_LABEL} cursor={CURSOR_FILL} />
            <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={22}>
              {data.funnel.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Daily trend */}
      <div className="vx-card p-5">
        <h3 className="mb-2 text-sm font-medium text-white/80">Daily delivery (30 days)</h3>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data.byDay} margin={{ top: 12, right: 8, left: -12, bottom: 0 }}>
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

      {/* Placement + campaign breakdowns */}
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="vx-card overflow-hidden p-0">
          <div className="border-b border-white/[0.07] px-5 py-3.5">
            <h3 className="text-sm font-medium text-white/80">By placement</h3>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-white/[0.07] hover:bg-transparent">
                  <TableHead className="text-white/45">Placement</TableHead>
                  <TableHead className="text-right text-white/45">Impr.</TableHead>
                  <TableHead className="text-right text-white/45">Compl.</TableHead>
                  <TableHead className="text-right text-white/45">Skips</TableHead>
                  <TableHead className="text-right text-white/45">Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.byPlacement.map((p) => (
                  <TableRow key={p.placement} className="border-white/[0.06]">
                    <TableCell className="font-medium text-white/80">{PLACEMENT_LABELS[p.placement as keyof typeof PLACEMENT_LABELS] ?? p.placement}</TableCell>
                    <TableCell className="text-right tabular-nums text-white/70">{formatCompact(p.impressions)}</TableCell>
                    <TableCell className="text-right tabular-nums text-white/70">{formatCompact(p.completions)}</TableCell>
                    <TableCell className="text-right tabular-nums text-white/70">{formatCompact(p.skips)}</TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-300/90">{ratePct(p.completions, p.impressions)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="vx-card overflow-hidden p-0">
          <div className="border-b border-white/[0.07] px-5 py-3.5">
            <h3 className="text-sm font-medium text-white/80">By campaign</h3>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-white/[0.07] hover:bg-transparent">
                  <TableHead className="text-white/45">Campaign</TableHead>
                  <TableHead className="text-right text-white/45">Impr.</TableHead>
                  <TableHead className="text-right text-white/45">Compl.</TableHead>
                  <TableHead className="w-[140px] text-white/45">Completion rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.byCampaign.map((c) => (
                  <TableRow key={c.campaignId} className="border-white/[0.06]">
                    <TableCell className="max-w-[180px] truncate font-medium text-white/80">{c.campaignName}</TableCell>
                    <TableCell className="text-right tabular-nums text-white/70">{formatCompact(c.impressions)}</TableCell>
                    <TableCell className="text-right tabular-nums text-white/70">{formatCompact(c.completions)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={Math.min(100, c.completionRate)} className="h-1.5 w-16" />
                        <span className="text-xs tabular-nums text-white/55">{c.completionRate}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  )
}
