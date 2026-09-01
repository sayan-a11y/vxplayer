'use client'

/**
 * VLC-style private device video import.
 * Videos picked from the user's phone/desktop storage are processed and stored
 * locally in IndexedDB with instant 0-second playback and remain 100% private.
 */
import { toast } from 'sonner'
import { saveLocalVideo } from '@/lib/privateLibrary'
import { useAppStore, type UploadTask } from '@/lib/store'

/** Custom event AppShell listens on to open its hidden <input type="file">. */
export const PICK_VIDEOS_EVENT = 'vx:pick-videos'

export function requestVideoPick() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(PICK_VIDEOS_EVENT))
}

/** Import selected device videos locally with instant 0-second loading. */
export async function importVideoFiles(files: File[]) {
  const videos = Array.from(files).filter(
    (f) => f.size > 0 || /video\//.test(f.type) || /\.(mp4|mkv|avi|mov|webm|3gp|m4v|ts|mts|flv)$/i.test(f.name),
  )
  if (videos.length === 0) {
    toast.error('No video files selected')
    return
  }

  let added = 0

  for (const file of videos) {
    const id = crypto.randomUUID()
    const base: UploadTask = { id, name: file.name, pct: 40, status: 'uploading' }
    useAppStore.getState().upsertUpload(base)

    try {
      useAppStore.getState().upsertUpload({ id, name: file.name, pct: 85, status: 'processing' })
      await saveLocalVideo(file)
      added += 1

      useAppStore.getState().upsertUpload({ id, name: file.name, pct: 100, status: 'done' })
      useAppStore.getState().bumpData()
      window.setTimeout(() => useAppStore.getState().removeUpload(id), 1500)
    } catch (err) {
      useAppStore.getState().upsertUpload({
        id,
        name: file.name,
        pct: 100,
        status: 'error',
        error: err instanceof Error ? err.message : 'Import failed',
      })
      window.setTimeout(() => useAppStore.getState().removeUpload(id), 4000)
    }
  }

  if (added > 0) {
    toast.success(`Added ${added} video${added === 1 ? '' : 's'} to your private library`)
  }
}
