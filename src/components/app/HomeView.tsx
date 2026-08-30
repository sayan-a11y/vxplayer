'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import {
  ChevronRight,
  Clapperboard,
  Clock3,
  Film,
  FolderOpen,
  FolderSearch,
  Heart,
  History,
  ListVideo,
  RefreshCw,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'

import { apiGet } from '@/lib/api'
import { formatDuration, formatSize } from '@/lib/format'
import { requestVideoPick } from '@/lib/import-client'
import { useAppStore } from '@/lib/store'
import type { PlaylistDTO, VideoDTO } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

import { BannerAd } from './BannerAd'
import { VideoCard } from './VideoCard'

type FolderCard = { name: string; count: number; sizeMB: number }

function buildFolderCards(videos: VideoDTO[]): FolderCard[] {
  const map = new Map<string, FolderCard>()
  for (const v of videos) {
    const entry = map.get(v.folder) ?? { name: v.folder, count: 0, sizeMB: 0 }
    entry.count += 1
    entry.sizeMB += v.sizeMB
    map.set(v.folder, entry)
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
}

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
  const setActiveFolder = useAppStore((s) => s.setActiveFolder)

  const [videos, setVideos] = useState<VideoDTO[] | null>(null)
  const [playlists, setPlaylists] = useState<PlaylistDTO[] | null>(null)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    setError(false)
    try {
      const [vRes, pRes] = await Promise.all([
        apiGet<{ videos: VideoDTO[] }>('/api/videos'),
        apiGet<{ playlists: PlaylistDTO[] }>('/api/playlists'),
      ])
      setVideos(vRes.videos ?? [])
      setPlaylists(pRes.playlists ?? [])
    } catch {
      setError(true)
      toast.error('Could not load your library')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, dataVersion])

  if (videos === null && error) {
    return (
      <div>
        <BannerAd />
        <div className="px-4 py-2 md:px-6">
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="grid size-14 place-items-center rounded-2xl bg-[var(--vx-accent)]/10 text-[var(--vx-accent-soft)]">
              <Film className="size-7" />
            </div>
            <div>
              <p className="font-medium">Couldn’t load your library</p>
              <p className="mt-1 text-sm text-muted-foreground">Check your connection and try again.</p>
            </div>
            <Button variant="ghost" onClick={() => void load()} className="vx-btn-accent mt-1 min-h-11 gap-2 px-5 font-semibold">
              <RefreshCw className="size-4" />
              Retry
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (videos === null || playlists === null) {
    return (
      <div>
        <BannerAd />
        <HomeSkeleton />
      </div>
    )
  }

  if (videos.length === 0) {
    return (
      <div>
        <BannerAd />
        <div className="flex flex-col items-center gap-2 py-20 text-center">
          <div className="grid size-14 place-items-center rounded-2xl border border-white/5 bg-white/5 text-muted-foreground">
            <Clapperboard className="size-7" />
          </div>
          <p className="mt-1.5 font-medium">Your library is empty</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            Import videos from this device's storage to start watching.
          </p>
          <Button
            onClick={() => requestVideoPick()}
            className="vx-btn-accent mt-3 min-h-11 gap-2 rounded-xl px-5 font-semibold"
          >
            <FolderSearch className="size-4" />
            Scan device storage
          </Button>
        </div>
      </div>
    )
  }

  const continueWatching = videos
    .filter((v) => v.history && v.history.watchedPct > 0 && v.history.watchedPct < 95)
    .sort(byRecentPlayed)
  const recentlyAdded = [...videos].sort(byRecentAdded).slice(0, 10)
  const recentlyPlayed = videos.filter((v) => v.history).sort(byRecentPlayed).slice(0, 10)
  const favorites = videos.filter((v) => v.favorite)
  const folderCards = buildFolderCards(videos)

  return (
    <div>
      <BannerAd />
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

        {recentlyPlayed.length > 0 && (
          <Section
            title="Recently Played"
            icon={Clock3}
            onSeeAll={() => {
              setLibrarySort('recent_played')
              setView('videos')
            }}
          >
            <Scroller>
              {recentlyPlayed.map((v) => (
                <VideoCard key={v.id} video={v} variant="wide" queue={recentlyPlayed} />
              ))}
            </Scroller>
          </Section>
        )}

        {favorites.length > 0 && (
          <Section title="Favorites" icon={Heart} onSeeAll={() => setView('favorites')}>
            <Scroller>
              {favorites.map((v) => (
                <VideoCard key={v.id} video={v} variant="wide" queue={favorites} />
              ))}
            </Scroller>
          </Section>
        )}

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

        {folderCards.length > 0 && (
          <Section title="Folders" icon={FolderOpen} onSeeAll={() => setView('folders')}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {folderCards.map((f) => (
                <button
                  key={f.name}
                  type="button"
                  onClick={() => {
                    setActiveFolder(f.name)
                    setView('folders')
                  }}
                  className="vx-card flex items-center gap-3 p-3.5 text-left transition hover:border-[var(--vx-accent)]/40 hover:bg-white/[0.06]"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--vx-accent)]/15 text-[var(--vx-accent-soft)]">
                    <FolderOpen className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{f.name}</span>
                    <span className="block text-[11px] tabular-nums text-muted-foreground">
                      {f.count} videos • {formatSize(f.sizeMB)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
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
