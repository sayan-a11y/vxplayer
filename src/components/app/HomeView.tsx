'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import {
  ChevronRight,
  Clapperboard,
  Film,
  FolderSearch,
  History,
  ListVideo,
  RefreshCw,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'

import { apiGet } from '@/lib/api'
import { formatDuration } from '@/lib/format'
import { requestVideoPick } from '@/lib/import-client'
import { getLocalVideos } from '@/lib/privateLibrary'
import { useAppStore } from '@/lib/store'
import type { PlaylistDTO, VideoDTO } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

import { HeroAdBanner } from './HeroAdBanner'
import { VideoCard } from './VideoCard'

const byRecentAdded = (a: VideoDTO, b: VideoDTO) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()
const byRecentPlayed = (a: VideoDTO, b: VideoDTO) =>
  (b.history ? new Date(b.history.lastPlayedAt).getTime() : 0) -
  (a.history ? new Date(a.history.lastPlayedAt).getTime() : 0)

function Section({
  title,
  icon: Icon,
  onSeeAll,
  children,
}: {
  title: string
  icon: LucideIcon
  onSeeAll?: () => void
  children: ReactNode
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="mt-7"
      aria-label={title}
    >
      <div className="mb-3 flex min-h-9 items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <Icon className="size-4 text-[var(--vx-accent-soft)]" />
          {title}
        </h2>
        {onSeeAll && (
          <button
            type="button"
            onClick={onSeeAll}
            className="flex min-h-9 items-center gap-0.5 rounded-lg px-2 text-xs font-medium text-muted-foreground transition hover:text-[var(--vx-accent-soft)]"
          >
            See all
            <ChevronRight className="size-3.5" />
          </button>
        )}
      </div>
      {children}
    </motion.section>
  )
}

function Scroller({ children }: { children: ReactNode }) {
  return (
    <div className="vx-scroll -mx-4 flex snap-x snap-mandatory gap-3.5 overflow-x-auto px-4 pb-1 md:-mx-6 md:px-6">
      {children}
    </div>
  )
}

function PlaylistCollage({ videos }: { videos: VideoDTO[] }) {
  const thumbs = videos.slice(0, 3)
  if (thumbs.length === 0) {
    return (
      <div className="grid h-20 w-full place-items-center rounded-lg border border-white/5 bg-white/5">
        <ListVideo className="size-5 text-muted-foreground" />
      </div>
    )
  }
  return (
    <div
      className={cn(
        'grid h-20 w-full gap-0.5 overflow-hidden rounded-lg border border-white/5 bg-white/5',
        thumbs.length === 1 ? 'grid-cols-1' : thumbs.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
      )}
    >
      {thumbs.map((v) => (
        <div key={v.id} className="relative">
          <Image src={v.thumbnailUrl} alt={v.title} fill sizes="120px" className="object-cover" />
        </div>
      ))}
    </div>
  )
}

function HomeSkeleton() {
  return (
    <div className="px-4 md:px-6">
      <div className="mt-6 space-y-8">
        {[0, 1, 2].map((i) => (
          <div key={i}>
            <Skeleton className="mb-3 h-5 w-44" />
            <div className="flex gap-3.5 overflow-hidden">
              {[0, 1, 2, 3, 4].map((j) => (
                <div key={j} className="w-40 shrink-0 space-y-2 sm:w-44">
                  <Skeleton className="aspect-video w-full rounded-xl" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function HomeView() {
  const dataVersion = useAppStore((s) => s.dataVersion)
  const setView = useAppStore((s) => s.setView)
  const setLibrarySort = useAppStore((s) => s.setLibrarySort)

  const [videos, setVideos] = useState<VideoDTO[] | null>(null)
  const [playlists, setPlaylists] = useState<PlaylistDTO[] | null>(null)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    setError(false)
    try {
      const { getLocalVideos, getLocalPlaylists } = await import('@/lib/privateLibrary')
      const [localVids, localPls] = await Promise.all([
        getLocalVideos().catch(() => []),
        getLocalPlaylists().catch(() => []),
      ])
      setVideos(localVids ?? [])
      setPlaylists(localPls ?? [])
    } catch {
      setVideos([])
      setPlaylists([])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, dataVersion])

  if (videos === null || playlists === null) {
    return (
      <div>
        <HeroAdBanner />
        <HomeSkeleton />
      </div>
    )
  }

  async function handleAddFolder() {
    try {
      const { scanDeviceDirectory } = await import('@/lib/privateLibrary')
      const count = await scanDeviceDirectory()
      if (count > 0) {
        useAppStore.getState().bumpData()
        toast.success(`Added ${count} video${count === 1 ? '' : 's'} from folder`)
      }
    } catch {
      requestVideoPick()
    }
  }

  if (videos.length === 0) {
    return (
      <div>
        <HeroAdBanner />
        <div className="flex flex-col items-center gap-2 py-20 text-center">
          <div className="grid size-14 place-items-center rounded-2xl border border-white/5 bg-white/5 text-muted-foreground">
            <Clapperboard className="size-7" />
          </div>
          <p className="mt-1.5 font-medium">Your library is empty</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            Scan or add videos from this device's storage to start watching.
          </p>
          <Button
            onClick={() => void handleAddFolder()}
            className="vx-btn-accent mt-3 min-h-11 gap-2 rounded-xl px-5 font-semibold"
          >
            <FolderSearch className="size-4" />
            + Add Folder / Scan Device
          </Button>
        </div>
      </div>
    )
  }

  const continueWatching = videos
    .filter((v) => v.history && v.history.watchedPct > 0 && v.history.watchedPct < 95)
    .sort(byRecentPlayed)
  const recentlyAdded = [...videos].sort(byRecentAdded).slice(0, 10)

  return (
    <div>
      <HeroAdBanner />
      <div className="px-4 pb-2 md:px-6">
        {continueWatching.length > 0 && (
          <Section title="Continue Watching" icon={History} onSeeAll={() => setView('history')}>
            <Scroller>
              {continueWatching.map((v) => (
                <VideoCard
                  key={v.id}
                  video={v}
                  variant="wide"
                  queue={continueWatching}
                  footerNote={v.history ? `Resume at ${formatDuration(v.history.position)}` : undefined}
                />
              ))}
            </Scroller>
          </Section>
        )}

        <Section
          title="Recently Added"
          icon={Sparkles}
          onSeeAll={() => {
            setLibrarySort('recent_added')
            setView('videos')
          }}
        >
          <Scroller>
            {recentlyAdded.map((v) => (
              <VideoCard key={v.id} video={v} variant="wide" queue={recentlyAdded} />
            ))}
          </Scroller>
        </Section>

        {playlists.length > 0 && (
          <Section title="Playlists" icon={ListVideo} onSeeAll={() => setView('playlists')}>
            <Scroller>
              {playlists.map((pl) => (
                <button
                  key={pl.id}
                  type="button"
                  onClick={() => setView('playlists')}
                  className="vx-card w-44 shrink-0 snap-start p-3 text-left transition hover:border-[var(--vx-accent)]/40 hover:bg-white/[0.06]"
                >
                  <PlaylistCollage videos={pl.videos} />
                  <p className="mt-2.5 truncate text-sm font-medium">{pl.name}</p>
                  <p className="text-[11px] tabular-nums text-muted-foreground">
                    {pl.videos.length} video{pl.videos.length === 1 ? '' : 's'}
                  </p>
                </button>
              ))}
            </Scroller>
          </Section>
        )}

        <Section title="All Videos" icon={Film} onSeeAll={() => setView('videos')}>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {videos.slice(0, 12).map((v) => (
              <VideoCard key={v.id} video={v} queue={videos.slice(0, 12)} />
            ))}
          </div>
        </Section>
      </div>
    </div>
  )
}
