'use client'

// Audit Logs — every admin action, filterable by action group with search.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, ScrollText } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDateTime } from '@/lib/format'
import type { AuditLogDTO } from '@/lib/types'
import { adminGet } from '../session'
import { actionMeta, EmptyState, ErrorState, LoadingBlock, PageHeader } from '../shared'

const FILTERS: { value: string; label: string; prefix: string | null }[] = [
  { value: 'ALL', label: 'All actions', prefix: null },
  { value: 'AUTH', label: 'Auth (login / logout)', prefix: 'LOG' },
  { value: 'CAMPAIGNS', label: 'Campaigns', prefix: 'CAMPAIGN' },
  { value: 'ADS', label: 'Ads / kill switches', prefix: 'ADS' },
  { value: 'SETTINGS', label: 'Settings', prefix: 'SETTINGS' },
  { value: 'CACHE', label: 'Cache', prefix: 'CACHE' },
]

export default function AuditView() {
  const [logs, setLogs] = useState<AuditLogDTO[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('ALL')
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await adminGet<{ logs: AuditLogDTO[] }>('/api/admin/audit?limit=100')
      setLogs(data.logs)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit logs')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    if (!logs) return []
    const prefix = FILTERS.find((f) => f.value === filter)?.prefix ?? null
    const needle = q.trim().toLowerCase()
    return logs.filter((log) => {
      if (prefix && !log.action.startsWith(prefix)) return false
      if (!needle) return true
      return [log.action, log.adminName, log.adminEmail, log.target ?? '', log.detail ?? '']
        .join(' ')
        .toLowerCase()
        .includes(needle)
    })
  }, [logs, filter, q])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Logs"
        description="Last 100 admin actions, newest first"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="h-10 w-[200px] border-white/10 bg-white/[0.04] text-white"><SelectValue /></SelectTrigger>
              <SelectContent className="border-white/10 bg-[#12122a] text-white">
                {FILTERS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search admin, target, detail…"
                aria-label="Search audit logs"
                className="h-10 w-[240px] border-white/10 bg-white/[0.04] pl-9 text-white placeholder:text-white/25"
              />
            </div>
          </div>
        }
      />

      <div className="vx-card overflow-hidden p-0">
        {loading ? (
          <div className="p-5">
            <LoadingBlock className="h-[480px]" />
          </div>
        ) : error || !logs ? (
          <ErrorState message={error ?? 'No audit data available.'} onRetry={() => void load()} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={ScrollText} title="No matching audit entries" hint="Try a different filter or clear the search." />
        ) : (
          <ScrollArea className="h-[560px]">
            <Table>
              <TableHeader>
                <TableRow className="border-white/[0.07] hover:bg-transparent">
                  <TableHead className="text-white/45">Time</TableHead>
                  <TableHead className="text-white/45">Admin</TableHead>
                  <TableHead className="text-white/45">Action</TableHead>
                  <TableHead className="text-white/45">Target</TableHead>
                  <TableHead className="text-white/45">Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((log) => {
                  const meta = actionMeta(log.action)
                  const Icon = meta.icon
                  return (
                    <TableRow key={log.id} className="border-white/[0.06]">
                      <TableCell className="whitespace-nowrap text-xs tabular-nums text-white/55">
                        {formatDateTime(log.createdAt)}
                      </TableCell>
                      <TableCell>
                        <p className="text-sm text-white/80">{log.adminName}</p>
                        <p className="text-[11px] text-white/35">{log.adminEmail}</p>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[11px] ${meta.className}`}>
                          <Icon className="h-3 w-3" />
                          {log.action}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate font-mono text-xs text-white/60">{log.target ?? '—'}</TableCell>
                      <TableCell className="max-w-[260px] truncate text-xs text-white/50">{log.detail ?? '—'}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </div>
    </div>
  )
}
