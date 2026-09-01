'use client'

// Videos — read-only inventory of the media library (public endpoint).

import { useCallback, useEffect, useState } from 'react'
import { Film, Heart, PlayCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDuration, formatSize } from '@/lib/format'
import type { VideoDTO } from '@/lib/types'
import { adminGet } from '../session'
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from '../shared'

export default function VideosView() {
  const [videos, setVideos] = useState<VideoDTO[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await adminGet<{ videos: VideoDTO[] }>('/api/videos')
      setVideos(data.videos)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load library')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Videos" description="Library inventory (read-only)" />
        <LoadingBlock className="h-[420px]" />
      </div>
    )
  }

  if (error || !videos) {
    return <ErrorState message={error ?? 'No library data available.'} onRetry={() => void load()} />
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Videos" description={`Library inventory (read-only) — ${videos.length} items`} />

      <div className="vx-card overflow-hidden p-0">
        {videos.length === 0 ? (
          <EmptyState icon={Film} title="Library is empty" hint="No videos found on the server." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-white/[0.07] hover:bg-transparent">
                  <TableHead className="text-white/45">Video</TableHead>
                  <TableHead className="text-white/45">Folder</TableHead>
                  <TableHead className="text-white/45">Resolution</TableHead>
                  <TableHead className="text-white/45">Duration</TableHead>
                  <TableHead className="text-white/45">Size</TableHead>
                  <TableHead className="text-white/45">Added</TableHead>
                  <TableHead className="text-white/45">Plays</TableHead>
                  <TableHead className="text-white/45">Fav</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {videos.map((v) => {
                  const played = v.history !== null && v.history.watchedPct > 0
                  return (
                    <TableRow key={v.id} className="border-white/[0.06]">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={v.thumbnailUrl}
                            alt={`Thumbnail for ${v.title}`}
                            className="h-9 w-16 shrink-0 rounded-md border border-white/10 object-cover"
                          />
                          <div className="min-w-0">
                            <p className="max-w-[220px] truncate text-sm font-medium text-white/85">{v.title}</p>
                            <p className="max-w-[220px] truncate text-[11px] text-white/35">{v.fileName}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="vx-chip">{v.folder}</span>
                      </TableCell>
                      <TableCell className="tabular-nums text-white/70">{v.resolutionLabel}</TableCell>
                      <TableCell className="tabular-nums text-white/70">{formatDuration(v.duration)}</TableCell>
                      <TableCell className="tabular-nums text-white/70">{formatSize(v.sizeMB)}</TableCell>
                      <TableCell className="tabular-nums text-white/60">{new Date(v.addedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</TableCell>
                      <TableCell>
                        {played ? (
                          <Badge variant="outline" className="border-violet-500/40 bg-violet-500/15 text-violet-300">
                            <PlayCircle className="h-3 w-3" /> Played
                          </Badge>
                        ) : (
                          <span className="text-white/30">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {v.favorite ? (
                          <Heart className="h-4 w-4 fill-rose-400 text-rose-400" aria-label="Favorite" />
                        ) : (
                          <Heart className="h-4 w-4 text-white/20" aria-label="Not favorite" />
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}
