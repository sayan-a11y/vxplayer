'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Folder, Heart, HeartOff, Info, ListPlus, MoreVertical, Play, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { apiDelete, apiPost } from '@/lib/api'
import { formatDuration, formatSize } from '@/lib/format'
import { useAppStore } from '@/lib/store'
import type { VideoDTO } from '@/lib/types'
import { cn } from '@/lib/utils'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import { AddToPlaylistDialog } from './AddToPlaylistDialog'
import { VideoInfoSheet } from './VideoInfoSheet'

type VideoCardProps = {
  video: VideoDTO
  /** videos listed alongside this one — used as the player queue */
  queue?: VideoDTO[]
  variant?: 'grid' | 'wide'
  /** small accent note rendered under the meta line (e.g. "Resume at 4:32") */
  footerNote?: string
}

export function VideoCard({ video, queue, variant = 'grid', footerNote }: VideoCardProps) {
  const openPlayer = useAppStore((s) => s.openPlayer)
  const bumpData = useAppStore((s) => s.bumpData)
  const [favBusy, setFavBusy] = useState(false)
  const [playlistOpen, setPlaylistOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const watched = video.history?.watchedPct ?? 0
  const showProgress = video.history !== null && watched > 0 && watched < 95

  function play() {
    openPlayer(video, queue && queue.length > 0 ? queue : [video])
  }

  async function toggleFavorite() {
    if (favBusy) return
    setFavBusy(true)
    try {
      await apiPost(`/api/videos/${video.id}/favorite`, { favorite: !video.favorite })
      toast.success(video.favorite ? 'Removed from favorites' : 'Added to favorites')
      bumpData()
    } catch {
      toast.error('Could not update favorite')
    } finally {
      setFavBusy(false)
    }
  }

  async function deleteVideo() {
    if (deleteBusy) return
    setDeleteBusy(true)
    try {
      if (video.id.startsWith('local_')) {
        const { deleteLocalVideo } = await import('@/lib/privateLibrary')
        await deleteLocalVideo(video.id)
      } else {
        await apiDelete(`/api/videos/${video.id}`)
      }
      // Close the player if this exact video is on screen.
      if (useAppStore.getState().playerVideo?.id === video.id) {
        useAppStore.getState().closePlayer()
      }
      toast.success(`"${video.title}" deleted`)
      setDeleteOpen(false)
      bumpData()
    } catch {
      toast.error('Could not delete this video')
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div className={cn('group select-none', variant === 'wide' ? 'w-40 shrink-0 snap-start sm:w-44' : 'w-full')}>
      <div
        role="button"
        tabIndex={0}
        aria-label={`Play ${video.title}`}
        onClick={play}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            play()
          }
        }}
        className="cursor-pointer rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--vx-accent)]/60"
      >
        <div className="relative aspect-video overflow-hidden rounded-xl border border-white/5 bg-white/5">
          {video.thumbnailUrl ? (
            <img
              src={video.thumbnailUrl}
              alt={video.title}
              loading="lazy"
              className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-purple-950/40 via-black to-slate-900">
              <Play className="size-8 text-white/30" />
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-black/0 to-black/20" />

          <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white/90 backdrop-blur-sm">
            {video.resolutionLabel}
          </span>

          <span className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="grid size-12 place-items-center rounded-full border border-white/20 bg-black/50 opacity-0 backdrop-blur transition-opacity duration-200 group-hover:opacity-100">
              <Play className="size-5 fill-white text-white" />
            </span>
          </span>

          <span className="pointer-events-none absolute bottom-1.5 right-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white backdrop-blur-sm">
            {formatDuration(video.duration)}
          </span>

          {showProgress && (
            <span className="absolute inset-x-0 bottom-0 h-[3px] bg-white/15">
              <span className="block h-full bg-[var(--vx-accent)]" style={{ width: `${watched}%` }} />
            </span>
          )}

          <div className="absolute right-1.5 top-1.5 flex gap-1" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => void toggleFavorite()}
              aria-label={video.favorite ? 'Remove from favorites' : 'Add to favorites'}
              aria-pressed={video.favorite}
              disabled={favBusy}
              className="grid size-11 place-items-center rounded-full border border-white/10 bg-black/45 text-white/90 backdrop-blur transition hover:bg-black/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-60"
            >
              <Heart className={cn('size-[18px]', video.favorite && 'fill-[var(--vx-accent)] text-[var(--vx-accent)]')} />
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`More options for ${video.title}`}
                  className="grid size-11 place-items-center rounded-full border border-white/10 bg-black/45 text-white/90 backdrop-blur transition hover:bg-black/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                >
                  <MoreVertical className="size-[18px]" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onSelect={() => setPlaylistOpen(true)} className="gap-2.5">
                  <ListPlus className="size-4" />
                  Add to playlist
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setInfoOpen(true)} className="gap-2.5">
                  <Info className="size-4" />
                  Video information
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void toggleFavorite()} className="gap-2.5">
                  {video.favorite ? <HeartOff className="size-4" /> : <Heart className="size-4" />}
                  {video.favorite ? 'Unfavorite' : 'Favorite'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => setDeleteOpen(true)}
                  className="gap-2.5 text-red-300 focus:bg-red-500/10 focus:text-red-200"
                >
                  <Trash2 className="size-4" />
                  Delete video
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="px-0.5 pt-2">
          <p className="line-clamp-1 text-sm font-medium leading-snug">{video.title}</p>
          <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
            {video.resolutionLabel} • {formatDuration(video.duration)} • {formatSize(video.sizeMB)}
          </p>
          {footerNote ? (
            <p className="mt-0.5 text-[11px] font-medium text-[var(--vx-accent-soft)]">{footerNote}</p>
          ) : (
            <span className="vx-chip mt-1.5 max-w-full gap-1 text-[10px]">
              <Folder className="size-3 shrink-0" />
              <span className="truncate">{video.folder}</span>
            </span>
          )}
        </div>
      </div>

      <AddToPlaylistDialog video={video} open={playlistOpen} onOpenChange={setPlaylistOpen} />
      <VideoInfoSheet video={video} open={infoOpen} onOpenChange={setInfoOpen} />

      <AlertDialog open={deleteOpen} onOpenChange={(o) => !deleteBusy && setDeleteOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete video?</AlertDialogTitle>
            <AlertDialogDescription>
              "{video.title}" will be permanently removed from your library — including its quality
              variants, watch history and playlist entries. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteBusy}
              onClick={(e) => {
                e.preventDefault()
                void deleteVideo()
              }}
              className="bg-red-600 text-white hover:bg-red-500"
            >
              {deleteBusy ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
