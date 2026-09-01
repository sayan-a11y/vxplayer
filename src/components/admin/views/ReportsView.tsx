'use client'

// Reports — periodic performance report with 7/30 day switcher, top campaigns
// table, daily chart and CSV export.

import { useCallback, useEffect, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { CheckCircle2, Clock, Download, Megaphone, PlayCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatCompact } from '@/lib/format'
import type { ReportsDTO } from '@/lib/types'
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
  StatCard,
  TOOLTIP_ITEM,
  TOOLTIP_LABEL,
  TOOLTIP_STYLE,
} from '../shared'

type Days = '7' | '30'

export default function ReportsView() {
  const [days, setDays] = useState<Days>('7')
  const [data, setData] = useState<ReportsDTO | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (range: Days) => {
    setLoading(true)
    setError(null)
    try {
      setData(await adminGet<ReportsDTO>(`/api/admin/reports?days=${range}`))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load report')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(days)
  }, [days, load])

  function exportCsv() {
    if (!data) return
    downloadCsv(
      `vx-report-${days}d-${new Date().toISOString().slice(0, 10)}.csv`,
      data.byDay.map((d) => ({ date: d.date, impressions: d.impressions, completions: d.completions, skips: d.skips }))
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Periodic performance report"
        actions={
          <>
            <Tabs value={days} onValueChange={(v) => setDays(v as Days)}>
              <TabsList className="border border-white/10 bg-white/[0.04]">
                <TabsTrigger value="7" className="px-4 text-white/70 data-[state=active]:text-white">Last 7 days</TabsTrigger>
                <TabsTrigger value="30" className="px-4 text-white/70 data-[state=active]:text-white">Last 30 days</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button variant="outline" onClick={exportCsv} className="h-10 border-white/15 bg-transparent text-white/75 hover:bg-white/5 hover:text-white">
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          </>
        }
      />

      {loading ? (
        <div className="space-y-6">
          <LoadingCards className="grid-cols-2 sm:grid-cols-4" count={4} />
          <LoadingBlock />
        </div>
      ) : error || !data ? (
        <ErrorState message={error ?? 'No report data available.'} onRetry={() => void load(days)} />
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard icon={PlayCircle} label="Sessions" value={formatCompact(data.summary.sessions)} hint={`last ${data.summary.days} days`} />
            <StatCard icon={Clock} label="Watch time" value={`${formatCompact(data.summary.watchTimeMin)} min`} accent />
            <StatCard icon={Megaphone} label="Impressions" value={formatCompact(data.summary.impressions)} accent />
            <StatCard icon={CheckCircle2} label="Completion rate" value={`${data.summary.completionRate.toFixed(1)}%`} accent />
          </div>

          {/* Daily chart */}
          <div className="vx-card p-5">
            <h3 className="mb-2 text-sm font-medium text-white/80">Daily ad delivery (last {data.summary.days} days)</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.byDay} margin={{ top: 12, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                <XAxis dataKey="date" tickFormatter={fmtDay} tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM} labelStyle={TOOLTIP_LABEL} labelFormatter={fmtDay} cursor={CURSOR_FILL} />
                <Legend wrapperStyle={{ fontSize: 12, color: 'rgba(235,235,255,0.65)' }} />
                <Bar dataKey="impressions" name="Impressions" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Bar dataKey="completions" name="Completions" fill={CHART_COLORS[4]} radius={[4, 4, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Top campaigns */}
          <div className="vx-card overflow-hidden p-0">
            <div className="border-b border-white/[0.07] px-5 py-3.5">
              <h3 className="text-sm font-medium text-white/80">Top campaigns</h3>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/[0.07] hover:bg-transparent">
                    <TableHead className="w-12 text-white/45">#</TableHead>
                    <TableHead className="text-white/45">Campaign</TableHead>
                    <TableHead className="text-white/45">Advertiser</TableHead>
                    <TableHead className="text-right text-white/45">Impr.</TableHead>
                    <TableHead className="text-right text-white/45">Compl.</TableHead>
                    <TableHead className="text-right text-white/45">Skips</TableHead>
                    <TableHead className="w-[140px] text-white/45">Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.topCampaigns.map((c, i) => (
                    <TableRow key={c.campaignId} className="border-white/[0.06]">
                      <TableCell className="tabular-nums text-white/40">{i + 1}</TableCell>
                      <TableCell className="max-w-[200px] truncate font-medium text-white/85">{c.campaignName}</TableCell>
                      <TableCell className="max-w-[140px] truncate text-white/60">{c.advertiser}</TableCell>
                      <TableCell className="text-right tabular-nums text-white/70">{formatCompact(c.impressions)}</TableCell>
                      <TableCell className="text-right tabular-nums text-white/70">{formatCompact(c.completions)}</TableCell>
                      <TableCell className="text-right tabular-nums text-white/70">{formatCompact(c.skips)}</TableCell>
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
        </>
      )}
    </div>
  )
}
