'use client'

/**
 * Device video import — lets users pick videos from their phone/desktop
 * storage (gallery on Android) and upload them into the library with
 * real per-file progress. Uploads run sequentially to keep mobile
 * networks happy, and the tray UI lives in the zustand store.
 */
import { toast } from 'sonner'

import { useAppStore, type UploadTask } from '@/lib/store'
import type { VideoDTO } from '@/lib/types'

/** Custom event AppShell listens on to open its hidden <input type="file">. */
export const PICK_VIDEOS_EVENT = 'vx:pick-videos'

export function requestVideoPick() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(PICK_VIDEOS_EVENT))
}

type UploadResponse = { video: VideoDTO; duplicate: boolean }

function uploadOne(file: File, id: string, onProgress: (pct: number) => void): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api/videos/upload?name=${encodeURIComponent(file.name)}`)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText) as UploadResponse & { error?: string }
        if (xhr.status >= 200 && xhr.status < 300) resolve(body)
        else reject(new Error(body.error || 'Import failed'))
      } catch {
        reject(new Error('Import failed'))
      }
    }
    xhr.onerror = () => reject(new Error('Network error during upload'))
    xhr.onabort = () => reject(new Error('Upload cancelled'))
    xhr.send(file)
  })
}

/** Import the selected files one-by-one with live progress in the tray. */
export async function importVideoFiles(files: File[]) {
  const videos = Array.from(files).filter(
    (f) => f.size > 0 || /video\//.test(f.type) || /\.(mp4|mkv|avi|mov|webm|3gp|m4v|ts|mts|flv)$/i.test(f.name),
  )
  if (videos.length === 0) {
    toast.error('No video files selected')
    return
  }

  let added = 0
  let failed = 0

  for (const file of videos) {
    const id = crypto.randomUUID()
    const base: UploadTask = { id, name: file.name, pct: 0, status: 'uploading' }
    useAppStore.getState().upsertUpload(base)
    try {
      const res = await uploadOne(file, id, (pct) => {
        useAppStore.getState().upsertUpload({
          id,
          name: file.name,
          pct,
          status: pct >= 100 ? 'processing' : 'uploading',
        })
      })
      added += res.duplicate ? 0 : 1
      useAppStore.getState().bumpData()
      useAppStore.getState().upsertUpload({ id, name: file.name, pct: 100, status: 'done' })
      window.setTimeout(() => useAppStore.getState().removeUpload(id), 2200)
    } catch (err) {
      failed += 1
      useAppStore.getState().upsertUpload({
        id,
        name: file.name,
        pct: 100,
        status: 'error',
        error: err instanceof Error ? err.message : 'Import failed',
      })
      window.setTimeout(() => useAppStore.getState().removeUpload(id), 6000)
    }
  }

  if (added > 0 && failed === 0) {
    toast.success(`Added ${added} video${added === 1 ? '' : 's'} to your library`)
  } else if (added > 0 && failed > 0) {
    toast.warning(`Added ${added} video${added === 1 ? '' : 's'} · ${failed} failed`)
  } else if (failed > 0) {
    toast.error(`Couldn't import ${failed} video${failed === 1 ? '' : 's'}`)
  }
}
