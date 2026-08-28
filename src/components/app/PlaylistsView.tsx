'use client'

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { ArrowLeft, ChevronRight, ListVideo, Loader2, Play, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'

import { apiDelete, apiGet, apiPost } from '@/lib/api'
import { formatDuration } from '@/lib/format'
import { useAppStore } from '@/lib/store'
import type { PlaylistDTO, VideoDTO } from '@/lib/types'
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
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

import { EmptyState, ErrorState } from './VideosView'

function PlaylistMiniCollage({ videos }: { videos: VideoDTO[] }) {
  const thumbs = videos.slice(0, 3)
  if (thumbs.length === 0) {
    return (
      <span className="grid size-14 shrink-0 place-items-center rounded-xl border border-white/5 bg-white/5 text-muted-foreground">
        <ListVideo className="size-5" />
      </span>
    )
  }
  return (
    <span
      className={cn(
        'grid h-14 w-[76px] shrink-0 gap-0.5 overflow-hidden rounded-xl border border-white/5 bg-white/5',
        thumbs.length === 1 ? 'grid-cols-1' : thumbs.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
      )}
    >
      {thumbs.map((v) => (
        <span key={v.id} className="relative block">
          <Image src={v.thumbnailUrl} alt={v.title} fill sizes="76px" className="object-cover" />
        </span>
      ))}
    </span>
  )
}

export function PlaylistsView() {
  const dataVersion = useAppStore((s) => s.dataVersion)
  const bumpData = useAppStore((s) => s.bumpData)
  const openPlayer = useAppStore((s) => s.openPlayer)

  const [playlists, setPlaylists] = useState<PlaylistDTO[] | null>(null)
  const [error, setError] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(false)
    try {
      const res = await apiGet<{ playlists: PlaylistDTO[] }>('/api/playlists')
      setPlaylists(res.playlists ?? [])
    } catch {
      setError(true)
      toast.error('Could not load playlists')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, dataVersion])

  const selected = playlists?.find((p) => p.id === selectedId) ?? null

  async function handleCreate() {
    const name = newName.trim()
    if (!name || creating) return
    setCreating(true)
    try {
      await apiPost('/api/playlists', { name })
      toast.success(`Playlist “${name}” created`)
      setCreateOpen(false)
      setNewName('')
      bumpData()
    } catch {
      toast.error('Could not create playlist')
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete() {
    if (!confirmDeleteId) return
    const target = playlists?.find((p) => p.id === confirmDeleteId)
    try {
      await apiDelete(`/api/playlists/${confirmDeleteId}`)
      toast.success(`Playlist “${target?.name ?? 'playlist'}” deleted`)
      if (selectedId === confirmDeleteId) setSelectedId(null)
      setConfirmDeleteId(null)
      bumpData()
    } catch {
      toast.error('Could not delete playlist')
    }
  }

  async function handleRemoveVideo(playlistId: string, videoId: string) {
    try {
      await apiDelete(`/api/playlists/${playlistId}/items?videoId=${encodeURIComponent(videoId)}`)
      toast.success('Removed from playlist')
      bumpData()
    } catch {
      toast.error('Could not remove video')
    }
  }

  if (playlists === null && error) {
    return (
      <div className="px-4 py-6 md:px-6">
        <ErrorState onRetry={() => void load()} />
      </div>
    )
  }

  if (playlists === null) {
    return (
      <div className="px-4 py-6 md:px-6">
        <div className="mb-4 h-7 w-40 rounded bg-white/5" />
        <div className="flex flex-col gap-2.5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[76px] w-full rounded-2xl" />
          ))}
        </div>
      </div>
    )
  }

  // ── Playlist detail (inline) ──
  if (selected) {
    return (
      <div className="px-4 py-4 md:px-6">
        <div className="mb-4 flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            className="size-11 shrink-0 rounded-xl"
            onClick={() => setSelectedId(null)}
            aria-label="Back to playlists"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold tracking-tight">{selected.name}</h1>
            <p className="text-xs tabular-nums text-muted-foreground">
              {selected.videos.length} video{selected.videos.length === 1 ? '' : 's'}
            </p>
          </div>
          <Button
            variant="outline"
            size="icon"
            className="size-11 shrink-0 rounded-xl text-muted-foreground hover:text-destructive"
            onClick={() => setConfirmDeleteId(selected.id)}
            aria-label="Delete playlist"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>

        <div className="mb-4 flex items-center gap-2">
          <button
            type="button"
            disabled={selected.videos.length === 0}
            onClick={() => {
              if (selected.videos.length > 0) openPlayer(selected.videos[0], selected.videos)
            }}
            className="vx-btn-accent inline-flex min-h-11 items-center gap-2 px-4 text-sm font-semibold disabled:pointer-events-none disabled:opacity-50"
          >
            <Play className="size-4 fill-current" />
            Play all
          </button>
        </div>

        {selected.videos.length === 0 ? (
          <EmptyState
            icon={ListVideo}
            title="This playlist is empty"
            hint="Use the ⋯ menu on any video to add it here."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {selected.videos.map((v, i) => (
              <motion.li
                key={v.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
              >
                <div className="vx-card flex items-center gap-3 p-2.5">
                  <span className="w-6 shrink-0 text-center text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                  <button
                    type="button"
                    onClick={() => openPlayer(v, selected.videos)}
                    className="relative aspect-video w-[104px] shrink-0 overflow-hidden rounded-lg bg-white/5"
                    aria-label={`Play ${v.title}`}
                  >
                    <Image src={v.thumbnailUrl} alt="" fill sizes="104px" className="object-cover" />
                  </button>
                  <button
                    type="button"
                    onClick={() => openPlayer(v, selected.videos)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate text-sm font-medium">{v.title}</span>
                    <span className="block text-xs tabular-nums text-muted-foreground">
                      {formatDuration(v.duration)} • {v.resolutionLabel}
                    </span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-10 shrink-0 rounded-lg text-muted-foreground hover:text-destructive"
                    onClick={() => void handleRemoveVideo(selected.id, v.id)}
                    aria-label={`Remove ${v.title} from playlist`}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              </motion.li>
            ))}
          </ul>
        )}

        <AlertDialog open={confirmDeleteId !== null} onOpenChange={(open) => !open && setConfirmDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this playlist?</AlertDialogTitle>
              <AlertDialogDescription>
                “{selected.name}” will be removed. Your videos stay in the library.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => void handleDelete()}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    )
  }

  // ── Playlist list ──
  return (
    <div className="px-4 py-4 md:px-6">
      <div className="mb-4 flex min-h-11 items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">Playlists</h1>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="vx-btn-accent inline-flex min-h-10 items-center gap-1.5 px-3.5 text-sm font-semibold"
        >
          <Plus className="size-4" />
          New playlist
        </button>
      </div>

      {playlists.length === 0 ? (
        <EmptyState
          icon={ListVideo}
          title="No playlists yet"
          hint="Group your videos into collections for one-tap playback."
          action={
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="vx-btn-accent mt-3 inline-flex min-h-11 items-center gap-2 px-4 text-sm font-semibold"
            >
              <Plus className="size-4" />
              Create your first playlist
            </button>
          }
        />
      ) : (
        <motion.ul initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} className="flex flex-col gap-2.5">
          {playlists.map((pl) => (
            <li key={pl.id}>
              <button
                type="button"
                onClick={() => setSelectedId(pl.id)}
                className="vx-card flex w-full items-center gap-3.5 p-3 text-left transition hover:border-[var(--vx-accent)]/40 hover:bg-white/[0.06]"
              >
                <PlaylistMiniCollage videos={pl.videos} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{pl.name}</span>
                  <span className="block text-xs tabular-nums text-muted-foreground">
                    {pl.videos.length} video{pl.videos.length === 1 ? '' : 's'}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </motion.ul>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New playlist</DialogTitle>
            <DialogDescription>Give your playlist a memorable name.</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Flight Mode Films"
            aria-label="Playlist name"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreate()
            }}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              className="vx-btn-accent min-h-10 gap-2 border-0"
              disabled={creating || !newName.trim()}
              onClick={() => void handleCreate()}
            >
              {creating && <Loader2 className="size-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
