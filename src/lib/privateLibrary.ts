'use client'

// VX Player — VLC Style Private Local Device Media Library (IndexedDB)
// Stores user device videos locally in the browser so they remain 100% private to that user
// and play with 0-second delay without requiring large cloud uploads.

import type { VideoDTO } from './types'

const DB_NAME = 'vxplayer_local_library'
const DB_VERSION = 1
const STORE_NAME = 'local_videos'

export type LocalVideoRecord = {
  id: string
  file: File | Blob
  video: VideoDTO
  createdAt: number
}

// In-memory ObjectURL cache for active blob URLs
const objectUrlMap = new Map<string, string>()

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported in this environment'))
      return
    }

    const req = window.indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }

    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function resolutionLabelFor(height: number): string {
  if (height >= 2160) return '4K'
  if (height >= 1440) return '2K'
  if (height >= 1080) return '1080p'
  if (height >= 720) return '720p'
  if (height >= 480) return '480p'
  if (height >= 360) return '360p'
  return 'SD'
}

/**
 * Capture video thumbnail and metadata from a local File in the browser using HTML5 Video + Canvas.
 */
export function extractLocalVideoMetadata(file: File): Promise<{
  duration: number
  width: number
  height: number
  thumbnailUrl: string
}> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.src = url

    let resolved = false
    const fallback = () => {
      if (resolved) return
      resolved = true
      URL.revokeObjectURL(url)
      resolve({
        duration: 60,
        width: 1920,
        height: 1080,
        thumbnailUrl: '',
      })
    }

    const timer = setTimeout(fallback, 4000)

    video.onloadedmetadata = () => {
      video.currentTime = Math.min(2, Math.max(0.5, video.duration * 0.1 || 1))
    }

    video.onseeked = () => {
      if (resolved) return
      resolved = true
      clearTimeout(timer)

      let thumbnailUrl = ''
      try {
        const canvas = document.createElement('canvas')
        canvas.width = Math.min(640, video.videoWidth || 640)
        canvas.height = Math.min(360, video.videoHeight || 360)
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          thumbnailUrl = canvas.toDataURL('image/jpeg', 0.8)
        }
      } catch {
        // canvas export issue
      }

      URL.revokeObjectURL(url)
      resolve({
        duration: Math.max(1, Math.round(video.duration || 60)),
        width: video.videoWidth || 1920,
        height: video.videoHeight || 1080,
        thumbnailUrl,
      })
    }

    video.onerror = fallback
  })
}

/**
 * Save a device video to the private local library with optional real folder categorization.
 */
export async function saveLocalVideo(file: File, folderName?: string): Promise<VideoDTO> {
  const id = `local_${crypto.randomUUID()}`
  const meta = await extractLocalVideoMetadata(file)
  const ext = file.name.lastIndexOf('.') >= 0 ? file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase() : 'mp4'
  const title = file.name.replace(/\.[^.]+$/, '').replace(/[._]+/g, ' ').trim() || 'Untitled Video'
  const sizeMB = Math.max(1, Math.round(file.size / (1024 * 1024)))

  // Determine folder name (Camera, Download, Movies, Screen Recordings, or passed folder)
  let folder = folderName || 'Device Storage'
  if (!folderName) {
    const lower = file.name.toLowerCase()
    if (/dcim|camera|vid_\d|p_v_|img_/i.test(lower)) folder = 'Camera'
    else if (/download|dl_|down/i.test(lower)) folder = 'Download'
    else if (/whatsapp|wa_/i.test(lower)) folder = 'WhatsApp Video'
    else if (/screen|rec|capture/i.test(lower)) folder = 'Screen Recordings'
    else if (/movie|film|trailer/i.test(lower)) folder = 'Movies'
  }

  // Active runtime object URL
  const srcUrl = URL.createObjectURL(file)
  objectUrlMap.set(id, srcUrl)

  const videoDto: VideoDTO = {
    id,
    title,
    fileName: file.name,
    folder,
    duration: meta.duration,
    width: meta.width,
    height: meta.height,
    resolutionLabel: resolutionLabelFor(meta.height),
    sizeMB,
    codec: 'h264',
    audioCodec: 'aac',
    container: ext,
    frameRate: 30,
    srcUrl,
    thumbnailUrl: meta.thumbnailUrl || '',
    addedAt: new Date().toISOString(),
    favorite: false,
    history: null,
    qualities: [],
  }

  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.put({
      id,
      file,
      video: videoDto,
      createdAt: Date.now(),
    })
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('IndexedDB save notice:', err)
  }

  return videoDto
}

/**
 * Scan a directory using modern File System Access API (Android/Chrome/Edge).
 */
export async function scanDeviceDirectory(): Promise<number> {
  if (typeof window === 'undefined' || !('showDirectoryPicker' in window)) {
    throw new Error('Directory picker not supported')
  }

  // @ts-expect-error - showDirectoryPicker is standard in modern browsers
  const dirHandle = await window.showDirectoryPicker({ mode: 'read' })
  let count = 0

  async function processEntries(handle: any, folderName: string) {
    for await (const entry of handle.values()) {
      if (entry.kind === 'file') {
        if (/\.(mp4|mkv|avi|mov|webm|3gp|m4v|ts|flv)$/i.test(entry.name)) {
          const file = await entry.getFile()
          await saveLocalVideo(file, folderName)
          count += 1
        }
      } else if (entry.kind === 'directory') {
        await processEntries(entry, entry.name)
      }
    }
  }

  await processEntries(dirHandle, dirHandle.name || 'Device Videos')
  return count
}

/**
 * Get all private local videos stored in this browser.
 */
export async function getLocalVideos(): Promise<VideoDTO[]> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const req = store.getAll()

    const records = await new Promise<LocalVideoRecord[]>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result as LocalVideoRecord[])
      req.onerror = () => reject(req.error)
    })

    return (records || []).map((rec) => {
      let liveUrl = objectUrlMap.get(rec.id)
      if (!liveUrl && rec.file) {
        liveUrl = URL.createObjectURL(rec.file)
        objectUrlMap.set(rec.id, liveUrl)
      }
      return {
        ...rec.video,
        srcUrl: liveUrl || rec.video.srcUrl,
      }
    })
  } catch (err) {
    console.warn('IndexedDB get notice:', err)
    return []
  }
}

/**
 * Delete a private local video from this browser.
 */
export async function deleteLocalVideo(id: string): Promise<void> {
  const activeUrl = objectUrlMap.get(id)
  if (activeUrl) {
    URL.revokeObjectURL(activeUrl)
    objectUrlMap.delete(id)
  }

  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.delete(id)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('IndexedDB delete notice:', err)
  }
}
