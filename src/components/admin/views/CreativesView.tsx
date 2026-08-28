'use client'

// Ad Creatives — read-only cross-campaign inventory of creative assets.

import { useCallback, useEffect, useState } from 'react'
import { ImagePlay, Info } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDuration } from '@/lib/format'
import type { CreativeDTO } from '@/lib/types'
import { adminGet } from '../session'
import { CreativeTypeBadge, EmptyState, ErrorState, LoadingBlock, PageHeader } from '../shared'

/** CreativeDTO joined with campaign info (server adds campaignName). */
type CreativeRow = CreativeDTO & { campaignName?: string | null }

function skipLabel(skipAfter: number): string {
  if (skipAfter === -1) return 'Non-skippable'
  if (skipAfter > 0) return `${skipAfter}s`
  return '—'
}

export default function CreativesView() {
  const [creatives, setCreatives] = useState<CreativeRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await adminGet<{ creatives: CreativeRow[] }>('/api/admin/creatives')
      setCreatives(data.creatives)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load creatives')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ad Creatives"
        description="All creative assets across campaigns (read-only)"
        actions={
          <span className="vx-chip">
            <Info className="h-3.5 w-3.5" /> Manage creatives in Campaigns
          </span>
        }
      />

      <div className="vx-card overflow-hidden p-0">
        {loading ? (
          <div className="p-5">
            <LoadingBlock className="h-[360px]" />
          </div>
        ) : error || !creatives ? (
          <ErrorState message={error ?? 'No creative data available.'} onRetry={() => void load()} />
        ) : creatives.length === 0 ? (
          <EmptyState icon={ImagePlay} title="No creatives found" hint="Creatives are added from the Campaigns manager." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-white/[0.07] hover:bg-transparent">
                  <TableHead className="text-white/45">Media</TableHead>
                  <TableHead className="text-white/45">Name</TableHead>
                  <TableHead className="text-white/45">Campaign</TableHead>
                  <TableHead className="text-white/45">Type</TableHead>
                  <TableHead className="text-white/45">Duration</TableHead>
                  <TableHead className="text-white/45">Skip</TableHead>
                  <TableHead className="text-white/45">Position</TableHead>
                  <TableHead className="text-white/45">Headline</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {creatives.map((c) => (
                  <TableRow key={c.id} className="border-white/[0.06]">
                    <TableCell>
                      {c.mediaUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={c.mediaUrl}
                          alt={`Preview of ${c.name}`}
                          className="h-9 w-16 rounded-md border border-white/10 object-cover"
                        />
                      ) : (
                        <div className="flex h-9 w-16 items-center justify-center rounded-md border border-white/[0.07] bg-white/[0.03] text-[10px] text-white/30">
                          {c.type}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <p className="max-w-[180px] truncate text-sm font-medium text-white/85">{c.name}</p>
                    </TableCell>
                    <TableCell className="max-w-[160px] truncate text-white/60">{c.campaignName ?? '—'}</TableCell>
                    <TableCell>
                      <CreativeTypeBadge type={c.type} />
                    </TableCell>
                    <TableCell className="tabular-nums text-white/70">{formatDuration(c.duration)}</TableCell>
                    <TableCell className="whitespace-nowrap text-white/70">{skipLabel(c.skipAfter)}</TableCell>
                    <TableCell className="text-white/60">{c.position ?? '—'}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-white/60">{c.headline ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}
