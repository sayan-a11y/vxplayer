'use client'

import { useEffect, useState } from 'react'
import { Check, ListVideo, Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'

import {
  addVideoToLocalPlaylist,
  createLocalPlaylist,
  getLocalPlaylists,
} from '@/lib/privateLibrary'
import { useAppStore } from '@/lib/store'
import type { PlaylistDTO, VideoDTO } from '@/lib/types'
import { cn } from '@/lib/utils'
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

type AddToPlaylistDialogProps = {
  video: VideoDTO | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddToPlaylistDialog({ video, open, onOpenChange }: AddToPlaylistDialogProps) {
  const bumpData = useAppStore((s) => s.bumpData)
  const [playlists, setPlaylists] = useState<PlaylistDTO[] | null>(null)
  const [checked, setChecked] = useState<string[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setChecked([])
    setNewName('')
    setShowCreate(false)

    void (async () => {
      try {
        const list = await getLocalPlaylists()
        setPlaylists(list)
      } catch {
        setPlaylists([])
      }
    })()
  }, [open])

  function toggle(id: string) {
    setChecked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  }

  async function save() {
    if (!video || saving) return
    const targets = playlists?.filter((p) => checked.includes(p.id)) ?? []
    const name = newName.trim()
    if (targets.length === 0 && !name) return
    setSaving(true)
    try {
      let createdName: string | null = null
      if (name) {
        const created = await createLocalPlaylist(name)
        createdName = created.name
        await addVideoToLocalPlaylist(created.id, video.id)
      }
      for (const p of targets) {
        await addVideoToLocalPlaylist(p.id, video.id)
      }
      const names = [...targets.map((t) => t.name), ...(createdName ? [createdName] : [])]
      toast.success(names.length === 1 ? `Added to ${names[0]}` : `Added to ${names.length} playlists`)
      bumpData()
      onOpenChange(false)
    } catch {
      toast.error('Could not add to playlist')
    } finally {
      setSaving(false)
    }
  }

  const canSave = !saving && (checked.length > 0 || newName.trim().length > 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add to playlist</DialogTitle>
          <DialogDescription>{video ? video.title : 'Choose playlists for this video.'}</DialogDescription>
        </DialogHeader>

        {playlists === null ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full rounded-xl" />
            ))}
          </div>
        ) : playlists.length === 0 && !showCreate ? (
          <div className="flex flex-col items-center gap-1.5 py-5 text-center">
            <ListVideo className="size-7 text-muted-foreground" />
            <p className="text-sm font-medium">No playlists yet</p>
            <p className="text-xs text-muted-foreground">Create your first one below.</p>
          </div>
        ) : (
          <div className="vx-scroll max-h-60 overflow-y-auto pr-1">
            <ul className="flex flex-col gap-1">
              {playlists.map((p) => {
                const isOn = checked.includes(p.id)
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={isOn}
                      onClick={() => toggle(p.id)}
                      className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left transition hover:bg-white/5"
                    >
                      <span
                        className={cn(
                          'grid size-5 shrink-0 place-items-center rounded-md border transition',
                          isOn ? 'border-[var(--vx-accent)] bg-[var(--vx-accent)] text-white' : 'border-white/25'
                        )}
                      >
                        {isOn && <Check className="size-3.5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{p.name}</span>
                        <span className="block text-xs tabular-nums text-muted-foreground">
                          {p.videos.length} video{p.videos.length === 1 ? '' : 's'}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          {showCreate ? (
            <Input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New playlist name"
              aria-label="New playlist name"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void save()
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="flex min-h-9 w-full items-center gap-2 text-sm font-medium text-[var(--vx-accent-soft)] transition hover:text-[var(--vx-accent)]"
            >
              <Plus className="size-4" />
              Create new playlist
            </button>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="vx-btn-accent min-h-10 gap-2 border-0" disabled={!canSave} onClick={() => void save()}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
