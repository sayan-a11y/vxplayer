'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronRight,
  Clapperboard,
  Clock,
  Crown,
  Film,
  Folder,
  FolderOpen,
  FolderSearch,
  Grid,
  History,
  LayoutGrid,
  List,
  ListVideo,
  Lock,
  MoreVertical,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'

import { formatDuration, formatSize } from '@/lib/format'
import { requestVideoPick } from '@/lib/import-client'
import { getLocalVideos, getLocalPlaylists, scanDeviceDirectory } from '@/lib/privateLibrary'
import { useAppStore } from '@/lib/store'
import type { PlaylistDTO, VideoDTO } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'

import { BannerAd } from './BannerAd'
import { BetweenCardsAd } from './BetweenCardsAd'
import { HeroAdBanner } from './HeroAdBanner'
import { HomeFeedAd } from './HomeFeedAd'
import { PremiumDialog } from './PremiumDialog'
import { PrivateFolderDialog } from './PrivateFolderDialog'
import { VideoCard } from './VideoCard'
import { VideosView } from './VideosView'

const byRecentAdded = (a: VideoDTO, b: VideoDTO) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()
const byRecentPlayed = (a: VideoDTO, b: VideoDTO) =>
  (b.history ? new Date(b.history.lastPlayedAt).getTime() : 0) -
  (a.history ? new Date(a.history.lastPlayedAt).getTime() : 0)

type FolderGroup = {
  name: string
  count: number
  sizeMB: number
  videos: VideoDTO[]
}

export function HomeView() {
  const dataVersion = useAppStore((s) => s.dataVersion)
  const setView = useAppStore((s) => s.setView)
  const setLibrarySort = useAppStore((s) => s.setLibrarySort)
  const activeFolder = useAppStore((s) => s.activeFolder)
  const setActiveFolder = useAppStore((s) => s.setActiveFolder)
  const hiddenFolders = useAppStore((s) => s.hiddenFolders)
  const openPlayer = useAppStore((s) => s.openPlayer)

  const [videos, setVideos] = useState<VideoDTO[] | null>(null)
  const [playlists, setPlaylists] = useState<PlaylistDTO[] | null>(null)
  const [premiumOpen, setPremiumOpen] = useState(false)
  const [privateFolderOpen, setPrivateFolderOpen] = useState(false)
  const [mobileViewMode, setMobileViewMode] = useState<'list' | 'grid'>('list')
  const [mobileSort, setMobileSort] = useState<'name' | 'count' | 'recent'>('name')
  const [selectedFolderFilter, setSelectedFolderFilter] = useState<string>('all')

  const load = useCallback(async () => {
    try {
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

  // Build grouped folders dynamically from available local media
  const folders: FolderGroup[] = useMemo(() => {
    if (!videos) return []
    const map = new Map<string, FolderGroup>()
    for (const v of videos) {
      if (hiddenFolders.includes(v.folder)) continue
      const existing = map.get(v.folder) ?? {
        name: v.folder,
        count: 0,
        sizeMB: 0,
        videos: [],
      }
      existing.count += 1
      existing.sizeMB += v.sizeMB
      existing.videos.push(v)
      map.set(v.folder, existing)
    }

    const list = Array.from(map.values())
    if (mobileSort === 'name') list.sort((a, b) => a.name.localeCompare(b.name))
    else if (mobileSort === 'count') list.sort((a, b) => b.count - a.count)
    else if (mobileSort === 'recent') {
      list.sort((a, b) => {
        const aMax = Math.max(...a.videos.map((v) => new Date(v.addedAt).getTime()))
        const bMax = Math.max(...b.videos.map((v) => new Date(v.addedAt).getTime()))
        return bMax - aMax
      })
    }
    return list
  }, [videos, hiddenFolders, mobileSort])

  const filteredFolders = useMemo(() => {
    if (selectedFolderFilter === 'all') return folders
    return folders.filter((f) => f.name === selectedFolderFilter)
  }, [folders, selectedFolderFilter])

  async function handleScanDevice() {
    try {
      const count = await scanDeviceDirectory()
      if (count > 0) {
        useAppStore.getState().bumpData()
        toast.success(`Detected ${count} video${count === 1 ? '' : 's'} across your device folders`)
      }
    } catch {
      requestVideoPick()
    }
  }

  const handlePlayAll = () => {
    if (!videos || videos.length === 0) {
      toast('No videos available to play')
      return
    }
    openPlayer(videos[0], videos)
  }

  // If a folder is opened on mobile, show its video list
  if (activeFolder) {
    return <VideosView />
  }

  if (videos === null || playlists === null) {
    return (
      <div className="w-full">
        <HeroAdBanner />
        <div className="mt-6 space-y-4">
          <Skeleton className="h-10 w-48" />
          <div className="grid grid-cols-3 gap-3">
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-20 rounded-2xl" />
          </div>
          <div className="space-y-3 pt-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  const continueWatching = videos
    .filter((v) => v.history && v.history.watchedPct > 0 && v.history.watchedPct < 95)
    .sort(byRecentPlayed)
  const recentlyAdded = [...videos].sort(byRecentAdded).slice(0, 10)

  return (
    <div className="w-full">
      {/* ─────────────────────────────────────────────────────────────
          MOBILE VIEW (<768px) — MATCHES REFERENCE IMAGE EXACTLY
         ───────────────────────────────────────────────────────────── */}
      <div className="block md:hidden pb-12">
        {/* 1. TOP AD BANNER — Reference "AD VX PRO Unlock Dolby Atmos & 120 FPS" */}
        <div className="mb-4 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-r from-zinc-950 via-[#0a0f24] to-zinc-900 p-3.5 shadow-xl">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="rounded bg-black/80 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-white ring-1 ring-white/20">
                  AD
                </span>
                <span className="text-[11px] font-bold tracking-wide text-white/70">VX PRO</span>
              </div>
              <h3 className="mt-1 text-sm font-bold text-white tracking-tight leading-snug">
                Unlock Dolby Atmos & 120 FPS
              </h3>
              <p className="mt-0.5 text-[11px] text-white/60 leading-tight">
                Pure offline playback with crystal clear sound.
              </p>
              <button
                type="button"
                onClick={() => setPremiumOpen(true)}
                className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-md shadow-blue-500/20 active:scale-95"
              >
                Upgrade Now
                <span className="text-[10px]">↗</span>
              </button>
            </div>
            {/* Vintage microphone glow visual */}
            <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-gradient-to-tr from-purple-900/40 via-amber-600/30 to-black border border-white/10 flex items-center justify-center">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(251,191,36,0.3)_0%,transparent_70%)]" />
              <Crown className="size-8 text-amber-300 drop-shadow-[0_0_12px_rgba(251,191,36,0.8)]" />
            </div>
          </div>
        </div>

        {/* 2. THREE QUICK ACTION CARDS */}
        <div className="mb-5 grid grid-cols-3 gap-2 sm:gap-3">
          {/* Card 1: Premium */}
          <button
            type="button"
            onClick={() => setPremiumOpen(true)}
            className="vx-card group flex flex-col items-center justify-center gap-1.5 py-3.5 px-2 text-center transition hover:border-[var(--vx-accent)]/40 hover:bg-white/[0.06] active:scale-95"
          >
            <span className="text-lg">👑</span>
            <span className="text-xs font-semibold text-white group-hover:text-[var(--vx-accent-soft)]">Premium</span>
          </button>

          {/* Card 2: Private Folder */}
          <button
            type="button"
            onClick={() => setPrivateFolderOpen(true)}
            className="vx-card group flex flex-col items-center justify-center gap-1.5 py-3.5 px-2 text-center transition hover:border-[var(--vx-accent)]/40 hover:bg-white/[0.06] active:scale-95"
          >
            <span className="text-lg">🔒</span>
            <span className="text-xs font-semibold text-white group-hover:text-[var(--vx-accent-soft)]">Private Folder</span>
          </button>

          {/* Card 3: Recently Played */}
          <button
            type="button"
            onClick={() => setView('history')}
            className="vx-card group flex flex-col items-center justify-center gap-1.5 py-3.5 px-2 text-center transition hover:border-[var(--vx-accent)]/40 hover:bg-white/[0.06] active:scale-95"
          >
            <span className="text-lg">🕒</span>
            <span className="text-xs font-semibold text-white group-hover:text-[var(--vx-accent-soft)]">Recently Played</span>
          </button>
        </div>

        {/* 3. "ALL FOLDERS ▾" SECTION HEADER */}
        <div className="mb-3 flex items-center justify-between">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1.5 text-base font-bold text-white hover:text-[var(--vx-accent-soft)] transition"
              >
                <span>{selectedFolderFilter === 'all' ? 'All Folders' : selectedFolderFilter}</span>
                <ChevronDown className="size-4 text-white/60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48 bg-[#090b1c] border-white/10">
              <DropdownMenuItem
                onSelect={() => setSelectedFolderFilter('all')}
                className="justify-between text-xs"
              >
                All Folders
                {selectedFolderFilter === 'all' && <Check className="size-3.5 text-[var(--vx-accent-soft)]" />}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-white/10" />
              {folders.map((f) => (
                <DropdownMenuItem
                  key={f.name}
                  onSelect={() => setSelectedFolderFilter(f.name)}
                  className="justify-between text-xs"
                >
                  <span className="truncate">{f.name}</span>
                  <span className="text-[10px] text-white/40 ml-2">{f.count}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMobileViewMode(mobileViewMode === 'list' ? 'grid' : 'list')}
              aria-label="Toggle view mode"
              className="grid size-8 place-items-center rounded-lg text-white/70 hover:bg-white/5 hover:text-white transition"
            >
              {mobileViewMode === 'list' ? <LayoutGrid className="size-4" /> : <List className="size-4" />}
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Sort folders"
                  className="grid size-8 place-items-center rounded-lg text-white/70 hover:bg-white/5 hover:text-white transition"
                >
                  <ArrowUpDown className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40 bg-[#090b1c] border-white/10 text-xs">
                <DropdownMenuItem onSelect={() => setMobileSort('name')} className="justify-between">
                  Name (A-Z)
                  {mobileSort === 'name' && <Check className="size-3.5 text-[var(--vx-accent-soft)]" />}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setMobileSort('count')} className="justify-between">
                  Video count
                  {mobileSort === 'count' && <Check className="size-3.5 text-[var(--vx-accent-soft)]" />}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setMobileSort('recent')} className="justify-between">
                  Recently added
                  {mobileSort === 'recent' && <Check className="size-3.5 text-[var(--vx-accent-soft)]" />}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* 4. FOLDERS LIST / GRID */}
        {filteredFolders.length === 0 ? (
          <div className="vx-card flex flex-col items-center justify-center gap-2 py-12 text-center my-3 p-4">
            <div className="grid size-12 place-items-center rounded-2xl border border-white/10 bg-white/5 text-muted-foreground">
              <FolderOpen className="size-6 text-white/50" />
            </div>
            <p className="font-semibold text-sm text-white">No videos found</p>
            <p className="max-w-xs text-xs text-white/50">
              Scan your device for videos to automatically populate your folders.
            </p>
            <Button
              onClick={() => void handleScanDevice()}
              className="vx-btn-accent mt-2 h-10 gap-2 rounded-xl px-5 text-xs font-semibold"
            >
              <FolderSearch className="size-4" />
              Scan Device Storage
            </Button>
          </div>
        ) : mobileViewMode === 'list' ? (
          <div className="space-y-2">
            {filteredFolders.map((folder) => (
              <div
                key={folder.name}
                onClick={() => setActiveFolder(folder.name)}
                className="vx-card group flex cursor-pointer items-center justify-between p-3 transition hover:border-[var(--vx-accent)]/40 hover:bg-white/[0.05] active:scale-[0.99]"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/[0.06] border border-white/10 text-white/80 group-hover:text-[var(--vx-accent-soft)] group-hover:border-[var(--vx-accent)]/30 transition">
                    <Folder className="size-5 fill-white/20" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="truncate text-sm font-semibold text-white tracking-tight">
                      {folder.name}
                    </h4>
                    <p className="text-[11px] text-white/50 tabular-nums">
                      {folder.count} video{folder.count === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Options for ${folder.name}`}
                        className="grid size-9 place-items-center rounded-lg text-white/40 hover:bg-white/10 hover:text-white transition"
                      >
                        <MoreVertical className="size-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48 bg-[#090b1c] border-white/10 text-xs">
                      <DropdownMenuItem
                        onSelect={() => {
                          if (folder.videos.length > 0) {
                            openPlayer(folder.videos[0], folder.videos)
                          }
                        }}
                      >
                        <Play className="size-3.5 mr-2 text-[var(--vx-accent-soft)]" />
                        Play All in {folder.name}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setActiveFolder(folder.name)}>
                        <FolderOpen className="size-3.5 mr-2" />
                        Open Folder
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filteredFolders.map((folder) => (
              <div
                key={folder.name}
                onClick={() => setActiveFolder(folder.name)}
                className="vx-card group flex cursor-pointer flex-col p-3.5 transition hover:border-[var(--vx-accent)]/40 hover:bg-white/[0.05] active:scale-[0.98]"
              >
                <div className="grid size-12 place-items-center rounded-xl bg-white/[0.06] border border-white/10 text-white/80 group-hover:text-[var(--vx-accent-soft)] transition mb-2.5">
                  <Folder className="size-6 fill-white/20" />
                </div>
                <h4 className="truncate text-xs font-semibold text-white tracking-tight">
                  {folder.name}
                </h4>
                <p className="text-[10px] text-white/50 tabular-nums mt-0.5">
                  {folder.count} video{folder.count === 1 ? '' : 's'}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* 5. FLOATING ACTION BUTTON (FAB) — "▶ Play All" */}
        {videos.length > 0 && (
          <button
            type="button"
            onClick={handlePlayAll}
            aria-label="Play all detected videos"
            className="fixed bottom-24 right-4 z-20 flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 px-5 py-3 text-sm font-bold text-white shadow-[0_4px_24px_rgba(0,132,255,0.5)] active:scale-95 transition-all hover:brightness-110"
          >
            <Play className="size-4 fill-white" />
            <span>Play All</span>
          </button>
        )}

        {/* 6. BOTTOM AD BANNER — Reference "AD VX PLAYER PRO Experience Pure 4K HDR" */}
        <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-r from-zinc-950 via-[#120a1c] to-zinc-950 p-3.5 shadow-xl">
          <div className="flex items-center gap-3">
            {/* Cinema neon preview image */}
            <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-red-950/40 border border-red-500/20 flex flex-col items-center justify-center text-center p-1">
              <span className="text-[8px] font-black tracking-widest text-red-400 uppercase leading-none">CENTRAL</span>
              <span className="text-[9px] font-extrabold tracking-wider text-white uppercase drop-shadow-[0_0_6px_rgba(239,68,68,0.8)]">CINEMA</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="rounded bg-black/80 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-white ring-1 ring-white/20">
                  AD
                </span>
                <span className="text-[11px] font-bold tracking-wide text-white/70">VX PLAYER PRO</span>
              </div>
              <h4 className="mt-1 text-xs font-bold text-white tracking-tight">
                Experience Pure 4K HDR
              </h4>
              <p className="text-[10px] text-white/50 leading-tight">
                Hardware-accelerated zero buffering.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPremiumOpen(true)}
              className="shrink-0 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-md active:scale-95"
            >
              Explore Features →
            </button>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          DESKTOP VIEW (>=768px) — PRESERVED 100% AS-IS
         ───────────────────────────────────────────────────────────── */}
      <div className="hidden md:block">
        {/* 1. Dedicated Hero Ad slot at top of Home */}
        <HeroAdBanner />

        {/* 2. Continue Watching */}
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

        {/* 3. In-feed Section Ad */}
        <HomeFeedAd />

        {/* 4. Recently Added */}
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

        {/* 5. Playlists */}
        {playlists.length > 0 && (
          <Section title="Playlists" icon={ListVideo} onSeeAll={() => setView('playlists')}>
            <Scroller>
              {playlists.map((pl) => (
                <button
                  key={pl.id}
                  type="button"
                  onClick={() => setView('playlists')}
                  className="vx-card w-40 shrink-0 snap-start p-3 text-left transition hover:border-[var(--vx-accent)]/40 hover:bg-white/[0.06] sm:w-44"
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

        {/* 6. All Videos with Between-Cards Ad */}
        <Section title="All Videos" icon={Film} onSeeAll={() => setView('videos')}>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
            {videos.slice(0, 4).map((v) => (
              <VideoCard key={v.id} video={v} queue={videos} />
            ))}
            {videos.length >= 2 && <BetweenCardsAd />}
            {videos.slice(4, 12).map((v) => (
              <VideoCard key={v.id} video={v} queue={videos} />
            ))}
          </div>
        </Section>

        {/* 7. Dedicated Banner Ad slot */}
        <BannerAd />
      </div>

      {/* Security and Upgrade Dialogs */}
      <PremiumDialog open={premiumOpen} onOpenChange={setPremiumOpen} />
      <PrivateFolderDialog open={privateFolderOpen} onOpenChange={setPrivateFolderOpen} videos={videos} />
    </div>
  )
}

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
      className="mt-6 sm:mt-7"
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
    <div className="vx-scroll -mx-3 sm:-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 sm:px-4 pb-1 md:-mx-6 md:px-6">
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

export default HomeView
