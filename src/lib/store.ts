'use client'

import { create } from 'zustand'
import type { SettingsDTO, VideoDTO } from '@/lib/types'

export type AppView =
  | 'home'
  | 'videos'
  | 'folders'
  | 'favorites'
  | 'playlists'
  | 'history'
  | 'settings'
  | 'search'

const SESSION_ID_KEY = 'vx_session_id'

export type UploadTask = {
  id: string
  name: string
  pct: number
  status: 'uploading' | 'processing' | 'done' | 'error'
  error?: string
}

function getSessionId(): string {
  if (typeof window === 'undefined') return ''
  let id = window.localStorage.getItem(SESSION_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    window.localStorage.setItem(SESSION_ID_KEY, id)
  }
  return id
}

type AppState = {
  // ── Navigation ──
  view: AppView
  setView: (v: AppView) => void
  searchQuery: string
  setSearchQuery: (q: string) => void
  /** bump to force views to refetch data */
  dataVersion: number
  bumpData: () => void

  // ── Player ──
  playerVideo: VideoDTO | null
  /** queue of videos for prev/next (e.g. folder or playlist); empty = single */
  playerQueue: VideoDTO[]
  openPlayer: (video: VideoDTO, queue?: VideoDTO[]) => void
  closePlayer: () => void
  playNext: () => void
  playPrev: () => void

  // ── Settings (cached client-side) ──
  settings: SettingsDTO | null
  setSettings: (s: SettingsDTO) => void

  // ── Library ──
  librarySort: 'recent_added' | 'recent_played' | 'name' | 'duration' | 'size'
  setLibrarySort: (s: 'recent_added' | 'recent_played' | 'name' | 'duration' | 'size') => void
  hiddenFolders: string[]
  setHiddenFolders: (folders: string[]) => void
  /** current folder being browsed (null = all) */
  activeFolder: string | null
  setActiveFolder: (f: string | null) => void

  // ── Device imports (upload tray) ──
  uploads: UploadTask[]
  upsertUpload: (task: UploadTask) => void
  removeUpload: (id: string) => void

  // ── Session / ads ──
  sessionId: string
  offlineMode: boolean
  setOfflineMode: (b: boolean) => void
  /** campaignId -> impression count this session (client-side frequency cap) */
  sessionImpressions: Record<string, number>
  countImpression: (campaignId: string) => void
  sessionImpressionTotal: number
  midRollsShown: number
  incMidRolls: () => void
  resetMidRolls: () => void
  lastAdAt: number | null
  setLastAdAt: (t: number) => void

  // ── Admin ──
  adminView: null | 'login' | 'panel'
  setAdminView: (v: null | 'login' | 'panel') => void
  adminToken: string | null
  setAdminToken: (t: string | null) => void
  tapCount: number
  lastTapAt: number
  registerLogoTap: () => void
  resetTaps: () => void
}

const ADMIN_TOKEN_KEY = 'vx_admin_token'

function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(ADMIN_TOKEN_KEY)
}

export const useAppStore = create<AppState>((set, get) => ({
  view: 'home',
  setView: (v) => set({ view: v }),
  searchQuery: '',
  setSearchQuery: (q) => set({ searchQuery: q }),
  dataVersion: 0,
  bumpData: () => set((s) => ({ dataVersion: s.dataVersion + 1 })),

  playerVideo: null,
  playerQueue: [],
  openPlayer: (video, queue = []) => set({ playerVideo: video, playerQueue: queue }),
  closePlayer: () => set({ playerVideo: null, playerQueue: [] }),
  playNext: () => {
    const { playerVideo, playerQueue } = get()
    if (!playerVideo || playerQueue.length < 2) return
    const idx = playerQueue.findIndex((v) => v.id === playerVideo.id)
    const next = playerQueue[(idx + 1) % playerQueue.length]
    if (next) set({ playerVideo: next, midRollsShown: 0, lastAdAt: null })
  },
  playPrev: () => {
    const { playerVideo, playerQueue } = get()
    if (!playerVideo || playerQueue.length < 2) return
    const idx = playerQueue.findIndex((v) => v.id === playerVideo.id)
    const prev = playerQueue[(idx - 1 + playerQueue.length) % playerQueue.length]
    if (prev) set({ playerVideo: prev, midRollsShown: 0, lastAdAt: null })
  },

  settings: null,
  setSettings: (s) => set({ settings: s }),

  librarySort: 'recent_added',
  setLibrarySort: (s) => set({ librarySort: s }),
  hiddenFolders: [],
  setHiddenFolders: (folders) => set({ hiddenFolders: folders }),
  activeFolder: null,
  setActiveFolder: (f) => set({ activeFolder: f }),

  uploads: [],
  upsertUpload: (task) =>
    set((s) => {
      const idx = s.uploads.findIndex((u) => u.id === task.id)
      if (idx === -1) return { uploads: [...s.uploads, task] }
      const next = [...s.uploads]
      next[idx] = task
      return { uploads: next }
    }),
  removeUpload: (id) => set((s) => ({ uploads: s.uploads.filter((u) => u.id !== id) })),

  sessionId: '',
  offlineMode: false,
  setOfflineMode: (b) => set({ offlineMode: b }),
  sessionImpressions: {},
  countImpression: (campaignId) =>
    set((s) => ({
      sessionImpressions: {
        ...s.sessionImpressions,
        [campaignId]: (s.sessionImpressions[campaignId] ?? 0) + 1,
      },
    })),
  sessionImpressionTotal: 0,
  midRollsShown: 0,
  incMidRolls: () => set((s) => ({ midRollsShown: s.midRollsShown + 1 })),
  resetMidRolls: () => set({ midRollsShown: 0 }),
  lastAdAt: null,
  setLastAdAt: (t) => set({ lastAdAt: t }),

  adminView: null,
  setAdminView: (v) => set({ adminView: v }),
  adminToken: null,
  setAdminToken: (t) => {
    if (typeof window !== 'undefined') {
      if (t) window.localStorage.setItem(ADMIN_TOKEN_KEY, t)
      else window.localStorage.removeItem(ADMIN_TOKEN_KEY)
    }
    set({ adminToken: t })
  },
  tapCount: 0,
  lastTapAt: 0,
  registerLogoTap: () => {
    const now = Date.now()
    const { tapCount, lastTapAt } = get()
    // consecutive taps within 2.5s window
    if (now - lastTapAt > 2500) {
      set({ tapCount: 1, lastTapAt: now })
      return
    }
    const next = tapCount + 1
    set({ tapCount: next, lastTapAt: now })
    if (next >= 7) {
      set({ tapCount: 0 })
      set({ adminView: 'login' })
    }
  },
  resetTaps: () => set({ tapCount: 0 }),
}))

/** init client-side session id + stored admin token once on app mount */
export function initClientSession() {
  const s = useAppStore.getState()
  if (!s.sessionId) {
    // hydration-safe: set synchronously after mount
    useAppStore.setState({ sessionId: getSessionId() })
  }
  if (s.adminToken === null) {
    const token = getStoredToken()
    useAppStore.setState({ adminToken: token })
  }
}
