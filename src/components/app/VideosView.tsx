'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowLeft, FolderOpen, FolderSearch, RefreshCw, TriangleAlert, type LucideIcon } from 'lucide-react'
import { toast } from 'sonner'

import { apiGet } from '@/lib/api'
import { requestVideoPick } from '@/lib/import-client'
import { useAppStore } from '@/lib/store'
import type { VideoDTO } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

import { VideoCard } from './VideoCard'

export type LibrarySort = 'recent_added' | 'recent_played' | 'name' | 'duration' | 'size'

function lastPlayedTs(v: VideoDTO): number {
  return v.history ? new Date(v.history.lastPlayedAt).getTime() : 0
}

export function sortVideos(list: VideoDTO[], sort: LibrarySort): VideoDTO[] {
  const arr = [...list]
  if (sort === 'recent_added') return arr.sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime())
  if (sort === 'recent_played') return arr.sort((a, b) => lastPlayedTs(b) - lastPlayedTs(a))
  if (sort === 'name') return arr.sort((a, b) => a.title.localeCompare(b.title))
  if (sort === 'duration') return arr.sort((a, b) => b.duration - a.duration)
  return arr.sort((a, b) => b.sizeMB - a.sizeMB)
}

/** Shared videos fetch — refetches when the global dataVersion bumps. */
export function useVideos() {
  const dataVersion = useAppStore((s) => s.dataVersion)
  const [videos, setVideos] = useState<VideoDTO[] | null>(null)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    setError(false)
    try {
      const res = await apiGet<{ videos: VideoDTO[] }>('/api/videos').catch(() => ({ videos: [] }))
      setVideos(res?.videos ?? [])
    } catch {
      setVideos([])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, dataVersion])

  return { videos, error, reload: load }
}

export function VideoGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="aspect-video w-full rounded-xl" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: LucideIcon
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-16 text-center">
      <div className="grid size-14 place-items-center rounded-2xl border border-white/5 bg-white/5 text-muted-foreground">
        <Icon className="size-7" />
      </div>
      <p className="mt-1.5 font-medium">{title}</p>
      {hint && <p className="max-w-xs text-sm text-muted-foreground">{hint}</p>}
      {action}
    </div>
  )
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="vx-card flex flex-col items-center gap-3 p-8 text-center">
      <div className="grid size-14 place-items-center rounded-2xl bg-[var(--vx-accent)]/10 text-[var(--vx-accent-soft)]">
        <TriangleAlert className="size-7" />
      </div>
      <div>
        <p className="font-medium">Something went wrong</p>
        <p className="mt-1 text-sm text-muted-foreground">We couldn’t reach your library. Check the connection and retry.</p>
      </div>
      <Button variant="ghost" onClick={onRetry} className="vx-btn-accent mt-1 min-h-11 gap-2 px-5 font-semibold">
        <RefreshCw className="size-4" />
        Retry
      </Button>
    </div>
  )
}

export function VideosView() {
  const activeFolder = useAppStore((s) => s.activeFolder)
  const setActiveFolder = useAppStore((s) => s.setActiveFolder)
  const hiddenFolders = useAppStore((s) => s.hiddenFolders)
  const librarySort = useAppStore((s) => s.librarySort)
  const { videos, error, reload } = useVideos()

  const visible = useMemo(() => {
    if (!videos) return []
    const filtered = videos.filter(
      (v) => !hiddenFolders.includes(v.folder) && (!activeFolder || v.folder === activeFolder)
    )
    return sortVideos(filtered, librarySort)
  }, [videos, hiddenFolders, activeFolder, librarySort])

  if (videos === null && error) {
    return (
      <div className="px-4 py-6 md:px-6">
        <ErrorState onRetry={() => void reload()} />
      </div>
    )
  }

  if (videos === null) {
    return (
      <div className="px-4 py-6 md:px-6">
        <Skeleton className="mb-5 h-7 w-40" />
        <VideoGridSkeleton />
      </div>
    )
  }

  return (
    <div className="px-4 py-4 md:px-6">
      {activeFolder ? (
        <div className="mb-4 flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            className="size-11 shrink-0 rounded-xl"
            onClick={() => setActiveFolder(null)}
            aria-label="Back to all folders"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold tracking-tight">{activeFolder}</h1>
            <p className="text-xs tabular-nums text-muted-foreground">
              {visible.length} video{visible.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
      ) : (
        <div className="mb-4 flex min-h-11 items-center justify-between gap-3">
          <h1 className="text-lg font-semibold tracking-tight">All Videos</h1>
          <span className="vx-chip tabular-nums">{visible.length}</span>
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="No videos here"
          hint={
            activeFolder
              ? 'This folder has no playable videos yet.'
              : 'Import videos from this device’s storage to start watching.'
          }
          action={
            !activeFolder && (
              <Button
                onClick={() => requestVideoPick()}
                className="vx-btn-accent mt-3 min-h-11 gap-2 rounded-xl px-5 font-semibold"
              >
                <FolderSearch className="size-4" />
                Scan device storage
              </Button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {visible.map((v) => (
            <VideoCard key={v.id} video={v} queue={visible} />
          ))}
        </div>
      )}
    </div>
  )
}
