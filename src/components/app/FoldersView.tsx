'use client'

import Image from 'next/image'
import { FolderOpen, FolderSearch } from 'lucide-react'

import { formatSize } from '@/lib/format'
import { requestVideoPick } from '@/lib/import-client'
import { useAppStore } from '@/lib/store'
import type { VideoDTO } from '@/lib/types'
import { Button } from '@/components/ui/button'

import { EmptyState, ErrorState, VideoGridSkeleton, useVideos } from './VideosView'
import { VideosView } from './VideosView'

type FolderSummary = {
  name: string
  count: number
  sizeMB: number
  thumbs: VideoDTO[]
}

function buildFolders(videos: VideoDTO[]): FolderSummary[] {
  const map = new Map<string, FolderSummary>()
  for (const v of videos) {
    const entry = map.get(v.folder) ?? { name: v.folder, count: 0, sizeMB: 0, thumbs: [] }
    entry.count += 1
    entry.sizeMB += v.sizeMB
    if (entry.thumbs.length < 3) entry.thumbs.push(v)
    map.set(v.folder, entry)
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
}

export function FoldersView() {
  const activeFolder = useAppStore((s) => s.activeFolder)
  const setActiveFolder = useAppStore((s) => s.setActiveFolder)
  const hiddenFolders = useAppStore((s) => s.hiddenFolders)
  const { videos, error, reload } = useVideos()

  // A folder was opened (from here or from Home) — show its videos.
  if (activeFolder) {
    return <VideosView />
  }

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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="vx-card space-y-3 p-4">
              <div className="h-24 w-full rounded-xl bg-white/5" />
              <div className="h-4 w-1/2 rounded bg-white/5" />
              <div className="h-3 w-1/3 rounded bg-white/5" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  const folders = buildFolders(videos.filter((v) => !hiddenFolders.includes(v.folder)))

  return (
    <div className="px-4 py-4 md:px-6">
      <div className="mb-4 flex min-h-11 items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">Folders</h1>
        <span className="vx-chip tabular-nums">{folders.length}</span>
      </div>

      {folders.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="No folders found"
          hint="Import videos from this device's storage to build your library."
          action={
            <Button
              onClick={() => requestVideoPick()}
              className="vx-btn-accent mt-3 min-h-11 gap-2 rounded-xl px-5 font-semibold"
            >
              <FolderSearch className="size-4" />
              Scan device storage
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {folders.map((f) => (
            <button
              key={f.name}
              type="button"
              onClick={() => setActiveFolder(f.name)}
              aria-label={`Open folder ${f.name}`}
              className="vx-card group p-4 text-left transition hover:border-[var(--vx-accent)]/40 hover:bg-white/[0.06]"
            >
              <div className="mb-3 grid h-24 grid-cols-3 gap-0.5 overflow-hidden rounded-xl border border-white/5 bg-white/5">
                {f.thumbs.map((v) => (
                  <div key={v.id} className="relative">
                    <Image
                      src={v.thumbnailUrl}
                      alt={v.title}
                      fill
                      sizes="120px"
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--vx-accent)]/15 text-[var(--vx-accent-soft)]">
                  <FolderOpen className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{f.name}</span>
                  <span className="block text-xs tabular-nums text-muted-foreground">
                    {f.count} video{f.count === 1 ? '' : 's'} • {formatSize(f.sizeMB)}
                  </span>
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
