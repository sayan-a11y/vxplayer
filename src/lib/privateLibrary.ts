'use client'

// VX Player — 100% Private Local Device Media Library (IndexedDB & Local Storage)
// Stores user device videos, watch history, favorites, and playlists STRICTLY inside
// this device's browser/app storage. User media is NEVER sent or shared with other users or backend.

import type { HistoryDTO, PlaylistDTO, VideoDTO } from './types'

const DB_NAME = 'vxplayer_local_library'
const DB_VERSION = 2
const STORE_VIDEOS = 'local_videos'
const STORE_HISTORY = 'local_history'
const STORE_PLAYLISTS = 'local_playlists'

export type LocalVideoRecord = {
  id: string
  file: File | Blob
  video: VideoDTO
  createdAt: number
}

export type LocalHistoryRecord = {
  videoId: string
  position: number
  watchedPct: number
  lastPlayedAt: string
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
      if (!db.objectStoreNames.contains(STORE_VIDEOS)) {
        db.createObjectStore(STORE_VIDEOS, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORE_HISTORY)) {
        db.createObjectStore(STORE_HISTORY, { keyPath: 'videoId' })
      }
      if (!db.objectStoreNames.contains(STORE_PLAYLISTS)) {
        db.createObjectStore(STORE_PLAYLISTS, { keyPath: 'id' })
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
 * Save a device video to the private local library with folder categorization.
 */
export async function saveLocalVideo(file: File, folderName?: string): Promise<VideoDTO> {
  const id = `local_${crypto.randomUUID()}`
  const meta = await extractLocalVideoMetadata(file)
  const ext = file.name.lastIndexOf('.') >= 0 ? file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase() : 'mp4'
  const title = file.name.replace(/\.[^.]+$/, '').replace(/[._]+/g, ' ').trim() || 'Untitled Video'
  const sizeMB = Math.max(1, Math.round(file.size / (1024 * 1024)))

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
    const tx = db.transaction(STORE_VIDEOS, 'readwrite')
    const store = tx.objectStore(STORE_VIDEOS)
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
 * Get all private local videos stored in this device's browser.
 * NEVER merges with or fetches from remote shared database!
 */
export async function getLocalVideos(): Promise<VideoDTO[]> {
  try {
    const db = await openDB()
    const tx = db.transaction([STORE_VIDEOS, STORE_HISTORY], 'readonly')
    const store = tx.objectStore(STORE_VIDEOS)
    const historyStore = tx.objectStore(STORE_HISTORY)

    const [records, historyList] = await Promise.all([
      new Promise<LocalVideoRecord[]>((resolve, reject) => {
        const req = store.getAll()
        req.onsuccess = () => resolve(req.result as LocalVideoRecord[])
        req.onerror = () => reject(req.error)
      }),
      new Promise<LocalHistoryRecord[]>((resolve, reject) => {
        const req = historyStore.getAll()
        req.onsuccess = () => resolve(req.result as LocalHistoryRecord[])
        req.onerror = () => reject(req.error)
      }),
    ])

    const historyMap = new Map<string, LocalHistoryRecord>()
    for (const h of historyList || []) {
      historyMap.set(h.videoId, h)
    }

    return (records || []).map((rec) => {
      let liveUrl = objectUrlMap.get(rec.id)
      if (!liveUrl && rec.file) {
        liveUrl = URL.createObjectURL(rec.file)
        objectUrlMap.set(rec.id, liveUrl)
      }
      const hist = historyMap.get(rec.id)
      return {
        ...rec.video,
        srcUrl: liveUrl || rec.video.srcUrl,
        history: hist
          ? {
              position: hist.position,
              watchedPct: hist.watchedPct,
              lastPlayedAt: hist.lastPlayedAt,
            }
          : rec.video.history,
      }
    })
  } catch (err) {
    console.warn('IndexedDB get notice:', err)
    return []
  }
}

/**
 * Delete a private local video from this device.
 */
export async function deleteLocalVideo(id: string): Promise<void> {
  const activeUrl = objectUrlMap.get(id)
  if (activeUrl) {
    URL.revokeObjectURL(activeUrl)
    objectUrlMap.delete(id)
  }

  try {
    const db = await openDB()
    const tx = db.transaction([STORE_VIDEOS, STORE_HISTORY], 'readwrite')
    tx.objectStore(STORE_VIDEOS).delete(id)
    tx.objectStore(STORE_HISTORY).delete(id)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('IndexedDB delete notice:', err)
  }
}

/**
 * Save playback position strictly to device-local history.
 */
export async function saveLocalHistory(
  videoId: string,
  positionSec: number,
  durationSec: number
): Promise<void> {
  if (!videoId || durationSec <= 0) return
  const pos = Math.max(0, Math.floor(positionSec))
  const dur = Math.max(1, Math.floor(durationSec))
  const pct = Math.min(100, Math.round((pos / dur) * 100))

  try {
    const db = await openDB()
    const tx = db.transaction(STORE_HISTORY, 'readwrite')
    const store = tx.objectStore(STORE_HISTORY)
    store.put({
      videoId,
      position: pos,
      watchedPct: pct,
      lastPlayedAt: new Date().toISOString(),
    })
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('Save local history notice:', err)
  }
}

/**
 * Toggle favorite status strictly on this device.
 */
export async function toggleLocalFavorite(videoId: string, favorite: boolean): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_VIDEOS, 'readwrite')
    const store = tx.objectStore(STORE_VIDEOS)
    const rec = await new Promise<LocalVideoRecord | undefined>((resolve, reject) => {
      const req = store.get(videoId)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    if (rec) {
      rec.video.favorite = favorite
      store.put(rec)
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('Toggle local favorite notice:', err)
  }
}

/**
 * Get device-local history list.
 */
export async function getLocalHistory(): Promise<HistoryDTO[]> {
  const videos = await getLocalVideos()
  const historyVideos = videos.filter((v) => v.history !== null)
  historyVideos.sort((a, b) => {
    const at = a.history ? new Date(a.history.lastPlayedAt).getTime() : 0
    const bt = b.history ? new Date(b.history.lastPlayedAt).getTime() : 0
    return bt - at
  })

  return historyVideos.map((v) => ({
    video: v,
    position: v.history?.position ?? 0,
    watchedPct: v.history?.watchedPct ?? 0,
    lastPlayedAt: v.history?.lastPlayedAt ?? v.addedAt,
  }))
}

/**
 * Clear device-local history.
 */
export async function clearLocalHistory(): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_HISTORY, 'readwrite')
    tx.objectStore(STORE_HISTORY).clear()
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('Clear local history notice:', err)
  }
}

/**
 * Get device-local playlists.
 */
export async function getLocalPlaylists(): Promise<PlaylistDTO[]> {
  try {
    const db = await openDB()
    const tx = db.transaction([STORE_PLAYLISTS, STORE_VIDEOS], 'readonly')
    const pStore = tx.objectStore(STORE_PLAYLISTS)
    const rawPlaylists = await new Promise<{ id: string; name: string; createdAt: string; videoIds: string[] }[]>(
      (resolve, reject) => {
        const req = pStore.getAll()
        req.onsuccess = () => resolve(req.result || [])
        req.onerror = () => reject(req.error)
      }
    )

    const allVideos = await getLocalVideos()
    const videoMap = new Map<string, VideoDTO>()
    for (const v of allVideos) videoMap.set(v.id, v)

    return rawPlaylists.map((p) => ({
      id: p.id,
      name: p.name,
      createdAt: p.createdAt,
      videos: (p.videoIds || []).map((id) => videoMap.get(id)).filter(Boolean) as VideoDTO[],
    }))
  } catch {
    return []
  }
}

/**
 * Create device-local playlist.
 */
export async function createLocalPlaylist(name: string): Promise<PlaylistDTO> {
  const id = `playlist_${crypto.randomUUID()}`
  const playlist = {
    id,
    name: name.trim() || 'New Playlist',
    createdAt: new Date().toISOString(),
    videoIds: [],
  }

  try {
    const db = await openDB()
    const tx = db.transaction(STORE_PLAYLISTS, 'readwrite')
    tx.objectStore(STORE_PLAYLISTS).put(playlist)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('Create local playlist notice:', err)
  }

  return { ...playlist, videos: [] }
}

/**
 * Add video to device-local playlist.
 */
export async function addVideoToLocalPlaylist(playlistId: string, videoId: string): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_PLAYLISTS, 'readwrite')
    const store = tx.objectStore(STORE_PLAYLISTS)
    const rec = await new Promise<{ id: string; name: string; createdAt: string; videoIds: string[] } | undefined>(
      (resolve, reject) => {
        const req = store.get(playlistId)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }
    )
    if (rec) {
      if (!rec.videoIds.includes(videoId)) {
        rec.videoIds.push(videoId)
        store.put(rec)
      }
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('Add to local playlist notice:', err)
  }
}

/**
 * Delete device-local playlist.
 */
export async function deleteLocalPlaylist(playlistId: string): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_PLAYLISTS, 'readwrite')
    tx.objectStore(STORE_PLAYLISTS).delete(playlistId)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('Delete local playlist notice:', err)
  }
}
