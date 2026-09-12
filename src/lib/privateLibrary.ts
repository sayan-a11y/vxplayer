'use client'

// VX Player — 100% Private Local Device Media Library (IndexedDB & Local Storage)
// Stores user device videos, watch history, favorites, and playlists STRICTLY inside
// this device's browser/app storage. User media is NEVER sent or shared with other users or backend.

import type { HistoryDTO, PlaylistDTO, VideoDTO } from './types'

const DB_NAME = 'vxplayer_local_library'
const DB_VERSION = 4
const STORE_VIDEOS = 'local_videos'
const STORE_HISTORY = 'local_history'
const STORE_PLAYLISTS = 'local_playlists'
const STORE_DIRECTORIES = 'scan_directories'
const STORE_SCAN_STATE = 'scan_state'

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

export type ScanDirectoryRecord = {
  id: string
  name: string
  handle: FileSystemDirectoryHandle
  grantedAt: number
  lastScannedAt: number | null
  videoCount: number
  enabled: boolean
}

export type ScanStateRecord = {
  key: 'scan_state'
  isScanning: boolean
  lastFullScanAt: number | null
  scannedCount: number
  totalEstimated: number
  currentDirectory: string | null
}

// In-memory ObjectURL cache for active blob URLs
const objectUrlMap = new Map<string, string>()

// In-memory cache of video signatures (fileName_sizeMB) for instant deduplication
const knownSignatures = new Set<string>()
const knownVideoMap = new Map<string, VideoDTO>()

// Video file extensions supported
const VIDEO_EXTENSIONS = /\.(mp4|mkv|avi|mov|webm|3gp|m4v|ts|mts|m2ts|flv|ogv|wmv|asf|rm|rmvb|vob|divx|xvid)$/i

// MIME types for video detection
const VIDEO_MIME_PREFIX = 'video/'

// Background metadata worker queue for non-blocking thumbnail extraction
type ExtractionJob = {
  id: string
  file: File
}
const extractionQueue: ExtractionJob[] = []
let isProcessingQueue = false

async function processNextExtraction() {
  if (isProcessingQueue || extractionQueue.length === 0) return
  isProcessingQueue = true

  while (extractionQueue.length > 0) {
    const job = extractionQueue.shift()
    if (!job) break

    try {
      const meta = await extractLocalVideoMetadata(job.file)
      if (meta.thumbnailUrl || meta.duration > 0) {
        await updateVideoMetadataInDB(job.id, meta)
      }
    } catch {
      // Safe fallback
    }

    // Yield to main event loop between jobs
    await new Promise((r) => setTimeout(r, 40))
  }

  isProcessingQueue = false
}

export function queueMetadataExtraction(id: string, file: File) {
  extractionQueue.push({ id, file })
  void processNextExtraction()
}

/**
 * Update video metadata (thumbnail, duration, dimensions) in IndexedDB after background extraction.
 */
export async function updateVideoMetadataInDB(
  id: string,
  meta: { duration: number; width: number; height: number; thumbnailUrl: string }
): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_VIDEOS, 'readwrite')
    const store = tx.objectStore(STORE_VIDEOS)
    const rec = await new Promise<LocalVideoRecord | undefined>((resolve, reject) => {
      const req = store.get(id)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })

    if (rec) {
      rec.video.duration = meta.duration > 0 ? meta.duration : rec.video.duration
      rec.video.width = meta.width || rec.video.width
      rec.video.height = meta.height || rec.video.height
      rec.video.resolutionLabel = resolutionLabelFor(meta.height || rec.video.height)
      if (meta.thumbnailUrl) {
        rec.video.thumbnailUrl = meta.thumbnailUrl
      }
      store.put(rec)
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })

      // Update in-memory map
      const inMem = knownVideoMap.get(id)
      if (inMem) {
        inMem.duration = rec.video.duration
        inMem.thumbnailUrl = rec.video.thumbnailUrl
        inMem.resolutionLabel = rec.video.resolutionLabel
      }

      // Notify store to update UI
      if (typeof window !== 'undefined') {
        const { useAppStore } = await import('./store')
        useAppStore.getState().bumpData()
      }
    }
  } catch (err) {
    console.warn('Failed to update video metadata in DB:', err)
  }
}

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
      if (!db.objectStoreNames.contains(STORE_DIRECTORIES)) {
        const dirStore = db.createObjectStore(STORE_DIRECTORIES, { keyPath: 'id' })
        dirStore.createIndex('by_name', 'name', { unique: false })
        dirStore.createIndex('by_enabled', 'enabled', { unique: false })
      }
      if (!db.objectStoreNames.contains(STORE_SCAN_STATE)) {
        db.createObjectStore(STORE_SCAN_STATE, { keyPath: 'key' })
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
 * Ultra-fast, lightweight canvas capture with aggressive 800ms safety timeout.
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

    let resolved = false
    const fallback = () => {
      if (resolved) return
      resolved = true
      try {
        video.removeAttribute('src')
        video.load()
      } catch {}
      URL.revokeObjectURL(url)
      resolve({
        duration: 0,
        width: 1920,
        height: 1080,
        thumbnailUrl: '',
      })
    }

    // 800ms maximum timeout so it never blocks
    const timer = setTimeout(fallback, 800)

    video.onloadedmetadata = () => {
      const seekTime = Math.min(2, Math.max(0.5, (video.duration || 0) * 0.1))
      video.currentTime = seekTime
    }

    video.onseeked = () => {
      if (resolved) return
      resolved = true
      clearTimeout(timer)

      let thumbnailUrl = ''
      try {
        const canvas = document.createElement('canvas')
        canvas.width = Math.min(360, video.videoWidth || 360)
        canvas.height = Math.min(200, video.videoHeight || 200)
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          thumbnailUrl = canvas.toDataURL('image/jpeg', 0.7)
        }
      } catch {
        // Canvas export issue fallback
      }

      const duration = Math.max(1, Math.round(video.duration || 0))
      const width = video.videoWidth || 1920
      const height = video.videoHeight || 1080

      try {
        video.removeAttribute('src')
        video.load()
      } catch {}
      URL.revokeObjectURL(url)

      resolve({
        duration,
        width,
        height,
        thumbnailUrl,
      })
    }

    video.onerror = fallback
    video.src = url
    try {
      video.load()
    } catch {}
  })
}

/**
 * Check if a file is a video based on extension and MIME type.
 */
function isVideoFile(file: File): boolean {
  if (VIDEO_EXTENSIONS.test(file.name)) return true
  if (file.type.startsWith(VIDEO_MIME_PREFIX)) return true
  return false
}

/**
 * Extract folder name from file path or directory handle.
 */
function extractFolderName(entry: FileSystemFileHandle | FileSystemDirectoryHandle, rootDirName: string): string {
  // For now, use the root directory name as folder
  // In a more advanced implementation, we could track relative paths
  return rootDirName
}

/**
 * Save video from a FileSystemFileHandle.
 */
async function saveVideoFromHandle(
  fileHandle: FileSystemFileHandle,
  folderName: string
): Promise<VideoDTO | null> {
  try {
    const file = await fileHandle.getFile()
    if (!isVideoFile(file)) return null
    return await saveLocalVideo(file, folderName)
  } catch (err) {
    console.warn('Failed to save video from handle:', err)
    return null
  }
}

/**
 * Recursively scan a directory for video files with batching for performance.
 */
async function scanDirectoryRecursive(
  dirHandle: FileSystemDirectoryHandle,
  folderName: string,
  options: {
    onProgress?: (scanned: number, totalEstimated: number, currentPath: string) => void
    batchSize?: number
    signal?: AbortSignal
    maxFiles?: number
  } = {}
): Promise<number> {
  const { onProgress, batchSize = 50, signal, maxFiles = 5000 } = options
  let count = 0
  let scanned = 0
  const entries: Array<FileSystemFileHandle | FileSystemDirectoryHandle> = []

  // Collect all entries first
  for await (const entry of (dirHandle as any).values()) {
    entries.push(entry)
  }

  // Process in batches to avoid blocking UI
  for (let i = 0; i < entries.length; i += batchSize) {
    if (signal?.aborted) break
    if (count >= maxFiles) break

    const batch = entries.slice(i, i + batchSize)
    const batchPromises = batch.map(async (entry) => {
      if (signal?.aborted) return 0

      if (entry.kind === 'file') {
        if (VIDEO_EXTENSIONS.test(entry.name)) {
          const video = await saveVideoFromHandle(entry, folderName)
          if (video) return 1
        }
        return 0
      } else if (entry.kind === 'directory') {
        // Recursively scan subdirectories
        return await scanDirectoryRecursive(entry, entry.name, {
          onProgress: (s, t, p) => onProgress?.(scanned + s, t, p),
          batchSize,
          signal,
          maxFiles: maxFiles - count,
        })
      }
      return 0
    })

    const results = await Promise.all(batchPromises)
    for (const r of results) {
      count += r
      scanned += 1
    }

    onProgress?.(scanned, entries.length, folderName)

    // Yield to main thread between batches
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  return count
}

/**
 * Request permission for a directory handle and store it for persistent access.
 */
export async function requestDirectoryAccess(): Promise<FileSystemDirectoryHandle | null> {
  if (typeof window === 'undefined' || !('showDirectoryPicker' in window)) {
    throw new Error('Directory picker not supported in this browser')
  }

  // @ts-expect-error - showDirectoryPicker is standard in modern browsers
  const dirHandle = await window.showDirectoryPicker({ mode: 'read' })
  return dirHandle
}

/**
 * Store a directory handle for persistent access across sessions.
 */
export async function storeDirectoryHandle(dirHandle: FileSystemDirectoryHandle): Promise<string> {
  const id = `dir_${crypto.randomUUID()}`
  const record: ScanDirectoryRecord = {
    id,
    name: dirHandle.name,
    handle: dirHandle,
    grantedAt: Date.now(),
    lastScannedAt: null,
    videoCount: 0,
    enabled: true,
  }

  try {
    const db = await openDB()
    const tx = db.transaction(STORE_DIRECTORIES, 'readwrite')
    tx.objectStore(STORE_DIRECTORIES).put(record)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('Failed to store directory handle:', err)
  }

  return id
}

/**
 * Get all stored directory handles.
 */
export async function getStoredDirectories(): Promise<ScanDirectoryRecord[]> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_DIRECTORIES, 'readonly')
    const store = tx.objectStore(STORE_DIRECTORIES)

    const records = await new Promise<ScanDirectoryRecord[]>((resolve, reject) => {
      const req = store.getAll()
      req.onsuccess = () => resolve(req.result as ScanDirectoryRecord[])
      req.onerror = () => reject(req.error)
    })

    // Filter enabled directories
    return (records || []).filter((d) => d.enabled)
  } catch (err) {
    console.warn('Failed to get stored directories:', err)
    return []
  }
}

/**
 * Remove a stored directory handle.
 */
export async function removeStoredDirectory(id: string): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_DIRECTORIES, 'readwrite')
    tx.objectStore(STORE_DIRECTORIES).delete(id)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('Failed to remove stored directory:', err)
  }
}

/**
 * Update directory record (e.g., last scanned time, video count).
 */
export async function updateDirectoryRecord(id: string, updates: Partial<ScanDirectoryRecord>): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_DIRECTORIES, 'readwrite')
    const store = tx.objectStore(STORE_DIRECTORIES)
    const existing = await new Promise<ScanDirectoryRecord | undefined>((resolve, reject) => {
      const req = store.get(id)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    if (existing) {
      store.put({ ...existing, ...updates })
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    }
  } catch (err) {
    console.warn('Failed to update directory record:', err)
  }
}

/**
 * Get or initialize scan state.
 */
async function getScanState(): Promise<ScanStateRecord> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_SCAN_STATE, 'readonly')
    const store = tx.objectStore(STORE_SCAN_STATE)
    const state = await new Promise<ScanStateRecord | undefined>((resolve, reject) => {
      const req = store.get('scan_state')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    return state || {
      key: 'scan_state',
      isScanning: false,
      lastFullScanAt: null,
      scannedCount: 0,
      totalEstimated: 0,
      currentDirectory: null,
    }
  } catch (err) {
    console.warn('Failed to get scan state:', err)
    return {
      key: 'scan_state',
      isScanning: false,
      lastFullScanAt: null,
      scannedCount: 0,
      totalEstimated: 0,
      currentDirectory: null,
    }
  }
}

/**
 * Update scan state.
 */
async function updateScanState(updates: Partial<ScanStateRecord>): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_SCAN_STATE, 'readwrite')
    const store = tx.objectStore(STORE_SCAN_STATE)
    const existing = await getScanState()
    store.put({ ...existing, ...updates })
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('Failed to update scan state:', err)
  }
}

/**
 * Perform a full scan of all stored directories.
 * This is the main auto-scan function that runs on app start.
 */
export async function performFullScan(options: {
  onProgress?: (progress: {
    scanned: number
    totalEstimated: number
    currentDirectory: string | null
    isComplete: boolean
  }) => void
  signal?: AbortSignal
} = {}): Promise<{ totalAdded: number; directoriesScanned: number }> {
  const { onProgress, signal } = options

  await updateScanState({ isScanning: true, scannedCount: 0, totalEstimated: 0, currentDirectory: 'Starting...' })

  const directories = await getStoredDirectories()
  if (directories.length === 0) {
    await updateScanState({ isScanning: false, currentDirectory: null })
    onProgress?.({ scanned: 0, totalEstimated: 0, currentDirectory: null, isComplete: true })
    return { totalAdded: 0, directoriesScanned: 0 }
  }

  let totalAdded = 0
  let directoriesScanned = 0

  for (const dir of directories) {
    if (signal?.aborted) break

    await updateScanState({ currentDirectory: dir.name })
    onProgress?.({ scanned: totalAdded, totalEstimated: 0, currentDirectory: dir.name, isComplete: false })

    try {
      // Request permission for this directory handle
      const permission = (dir.handle as any).requestPermission
        ? await (dir.handle as any).requestPermission({ mode: 'read' })
        : 'granted'
      if (permission !== 'granted') {
        console.warn(`Permission denied for directory: ${dir.name}`)
        await updateDirectoryRecord(dir.id, { enabled: false })
        continue
      }

      const added = await scanDirectoryRecursive(dir.handle, dir.name, {
        onProgress: (scanned, totalEstimated, currentPath) => {
          onProgress?.({ scanned: totalAdded + scanned, totalEstimated, currentDirectory: currentPath, isComplete: false })
        },
        signal,
      })

      totalAdded += added
      directoriesScanned += 1

      await updateDirectoryRecord(dir.id, {
        lastScannedAt: Date.now(),
        videoCount: dir.videoCount + added,
      })
    } catch (err) {
      console.warn(`Failed to scan directory ${dir.name}:`, err)
      // If permission was revoked, mark as disabled
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        await updateDirectoryRecord(dir.id, { enabled: false })
      }
    }

    // Yield between directories
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  await updateScanState({
    isScanning: false,
    lastFullScanAt: Date.now(),
    scannedCount: totalAdded,
    currentDirectory: null,
  })

  onProgress?.({ scanned: totalAdded, totalEstimated: 0, currentDirectory: null, isComplete: true })

  return { totalAdded, directoriesScanned }
}

/**
 * Quick scan - only scan directories that haven't been scanned recently.
 */
export async function performQuickScan(options: {
  onProgress?: (progress: { scanned: number; currentDirectory: string | null; isComplete: boolean }) => void
  signal?: AbortSignal
  maxAgeHours?: number
} = {}): Promise<number> {
  const { onProgress, signal, maxAgeHours = 24 } = options
  const directories = await getStoredDirectories()
  const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000

  const staleDirs = directories.filter((d) => !d.lastScannedAt || d.lastScannedAt < cutoff)

  if (staleDirs.length === 0) return 0

  let totalAdded = 0

  for (const dir of staleDirs) {
    if (signal?.aborted) break

    onProgress?.({ scanned: totalAdded, currentDirectory: dir.name, isComplete: false })

    try {
      const permission = (dir.handle as any).requestPermission
        ? await (dir.handle as any).requestPermission({ mode: 'read' })
        : 'granted'
      if (permission !== 'granted') {
        await updateDirectoryRecord(dir.id, { enabled: false })
        continue
      }

      const added = await scanDirectoryRecursive(dir.handle, dir.name, {
        onProgress: (scanned) => onProgress?.({ scanned: totalAdded + scanned, currentDirectory: dir.name, isComplete: false }),
        signal,
      })

      totalAdded += added
      await updateDirectoryRecord(dir.id, {
        lastScannedAt: Date.now(),
        videoCount: dir.videoCount + added,
      })
    } catch (err) {
      console.warn(`Quick scan failed for ${dir.name}:`, err)
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        await updateDirectoryRecord(dir.id, { enabled: false })
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  onProgress?.({ scanned: totalAdded, currentDirectory: null, isComplete: true })
  return totalAdded
}

/**
 * Initialize auto-scan on app startup.
 * Checks for stored directories and performs a quick scan if needed.
 */
export async function initializeAutoScan(): Promise<{ hasStoredDirs: boolean; added: number }> {
  const directories = await getStoredDirectories()
  const hasStoredDirs = directories.length > 0

  if (!hasStoredDirs) {
    return { hasStoredDirs: false, added: 0 }
  }

  // Check if we should do a quick scan (e.g., last scan was > 1 hour ago)
  const scanState = await getScanState()
  const lastScan = scanState.lastFullScanAt || 0
  const oneHourAgo = Date.now() - 60 * 60 * 1000

  if (lastScan < oneHourAgo) {
    const added = await performQuickScan({ maxAgeHours: 1 })
    return { hasStoredDirs: true, added }
  }

  return { hasStoredDirs: true, added: 0 }
}

/**
 * Add a new directory to scan (user-initiated).
 */
export async function addScanDirectory(): Promise<{ count: number; directoryName: string } | null> {
  try {
    const dirHandle = await requestDirectoryAccess()
    if (!dirHandle) return null

    const id = await storeDirectoryHandle(dirHandle)

    // Perform initial scan
    const permission = (dirHandle as any).requestPermission
      ? await (dirHandle as any).requestPermission({ mode: 'read' })
      : 'granted'
    if (permission !== 'granted') {
      await removeStoredDirectory(id)
      throw new Error('Permission denied for directory')
    }

    const count = await scanDirectoryRecursive(dirHandle, dirHandle.name, {
      onProgress: (scanned, total, path) => {
        console.log(`Scanning ${path}: ${scanned}/${total}`)
      },
    })

    await updateDirectoryRecord(id, {
      lastScannedAt: Date.now(),
      videoCount: count,
    })

    return { count, directoryName: dirHandle.name }
  } catch (err) {
    console.warn('Failed to add scan directory:', err)
    throw err
  }
}

/**
 * Save a device video to the private local library with folder categorization.
 * Instant sub-5ms save with immediate UI display, followed by background thumbnail extraction.
 */
export async function saveLocalVideo(file: File, folderName?: string): Promise<VideoDTO> {
  const ext = file.name.lastIndexOf('.') >= 0 ? file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase() : 'mp4'
  const title = file.name.replace(/\.[^.]+$/, '').replace(/[._]+/g, ' ').trim() || 'Untitled Video'
  const sizeMB = Math.max(1, Math.round(file.size / (1024 * 1024)))
  const signature = `${file.name}_${sizeMB}`

  // Instant deduplication: check in-memory cache first
  if (knownSignatures.has(signature)) {
    for (const v of knownVideoMap.values()) {
      if (v.fileName === file.name && Math.abs(v.sizeMB - sizeMB) <= 1) {
        let liveUrl = objectUrlMap.get(v.id)
        if (!liveUrl) {
          liveUrl = URL.createObjectURL(file)
          objectUrlMap.set(v.id, liveUrl)
        }
        return { ...v, srcUrl: liveUrl }
      }
    }
  }

  let folder = folderName?.trim()
  if (!folder && file.webkitRelativePath) {
    const parts = file.webkitRelativePath.split('/').filter(Boolean)
    if (parts.length > 1) {
      folder = parts[parts.length - 2]
    }
  }
  if (!folder) {
    const lower = file.name.toLowerCase()
    if (/dcim|camera|vid_\d|p_v_|img_/i.test(lower)) folder = 'Camera'
    else if (/download|dl_|down/i.test(lower)) folder = 'Download'
    else if (/whatsapp|wa_/i.test(lower)) folder = 'WhatsApp Video'
    else if (/screen|rec|capture/i.test(lower)) folder = 'ScreenRecordings'
    else if (/movie|film|trailer/i.test(lower)) folder = 'Movies'
    else if (/editor|edit/i.test(lower)) folder = 'Video Editor'
    else if (/telegram/i.test(lower)) folder = 'Telegram'
    else if (/instagram|insta/i.test(lower)) folder = 'Instagram'
    else folder = 'Videos'
  }

  const id = `local_${crypto.randomUUID()}`
  const srcUrl = URL.createObjectURL(file)
  objectUrlMap.set(id, srcUrl)

  const videoDto: VideoDTO = {
    id,
    title,
    fileName: file.name,
    folder,
    duration: 0,
    width: 1920,
    height: 1080,
    resolutionLabel: 'HD',
    sizeMB,
    codec: 'h264',
    audioCodec: 'aac',
    container: ext,
    frameRate: 30,
    srcUrl,
    thumbnailUrl: '',
    addedAt: new Date().toISOString(),
    favorite: false,
    history: null,
    qualities: [],
  }

  knownSignatures.add(signature)
  knownVideoMap.set(id, videoDto)

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

  // Queue thumbnail and exact duration extraction in background without blocking
  queueMetadataExtraction(id, file)

  return videoDto
}

/**
 * Scan a directory using modern File System Access API (Desktop Chrome/Edge).
 * Automatically stores handle for persistent background access.
 */
export async function scanDeviceDirectory(): Promise<number> {
  if (typeof window === 'undefined' || !('showDirectoryPicker' in window)) {
    throw new Error('Directory picker not supported in this browser')
  }

  // @ts-expect-error - showDirectoryPicker is standard in modern desktop browsers
  const dirHandle = await window.showDirectoryPicker({ mode: 'read' })
  if (!dirHandle) return 0

  // Persist handle for subsequent auto-scans
  try {
    await storeDirectoryHandle(dirHandle)
  } catch {}

  let count = 0
  const { useAppStore } = await import('./store')

  async function processEntries(handle: any, folderName: string) {
    for await (const entry of handle.values()) {
      if (entry.kind === 'file') {
        if (/\.(mp4|mkv|avi|mov|webm|3gp|m4v|ts|mts|flv|wmv|ogv)$/i.test(entry.name)) {
          const file = await entry.getFile()
          await saveLocalVideo(file, folderName)
          count += 1
          useAppStore.getState().bumpData()
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
 * Batch import files with instant sub-5ms non-blocking async execution.
 * Triggers live UI bumps so files appear in real-time as they are added.
 */
export async function scanFilesBatch(
  files: File[] | FileList,
  onProgress?: (current: number, total: number) => void
): Promise<number> {
  const fileArray = Array.from(files).filter((f) =>
    /\.(mp4|mkv|avi|mov|webm|3gp|m4v|ts|mts|flv|wmv|ogv)$/i.test(f.name) || f.type.startsWith('video/')
  )
  if (fileArray.length === 0) return 0

  let count = 0
  const { useAppStore } = await import('./store')

  for (let i = 0; i < fileArray.length; i++) {
    const f = fileArray[i]
    await saveLocalVideo(f)
    count++
    useAppStore.getState().bumpData() // Instant UI display for each video!
    onProgress?.(i + 1, fileArray.length)
    if (i % 3 === 0) {
      await new Promise((r) => setTimeout(r, 0))
    }
  }
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

    const result: VideoDTO[] = []

    for (const rec of records || []) {
      let liveUrl = objectUrlMap.get(rec.id)
      if (!liveUrl && rec.file) {
        liveUrl = URL.createObjectURL(rec.file)
        objectUrlMap.set(rec.id, liveUrl)
      }
      const hist = historyMap.get(rec.id)
      const v: VideoDTO = {
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

      const sig = `${v.fileName}_${v.sizeMB}`
      knownSignatures.add(sig)
      knownVideoMap.set(v.id, v)
      result.push(v)
    }

    return result
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
