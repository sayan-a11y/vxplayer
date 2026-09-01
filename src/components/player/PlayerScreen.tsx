'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronDown,
  FastForward,
  Loader2,
  Lock,
  LockOpen,
  PictureInPicture2,
  Rewind,
  Sun,
  TriangleAlert,
  Volume2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/lib/store'
import { requestAd, trackAdEvent } from '@/lib/ads-client'
import { saveLocalHistory } from '@/lib/privateLibrary'
import { apiPost } from '@/lib/api'
import { generateDemoCues } from '@/lib/vtt'
import { formatDuration } from '@/lib/format'
import { qualityDisplayLabel, resolveAutoVariant } from '@/lib/qualities'
import type { AspectMode, QualityVariantDTO, ServedAd } from '@/lib/types'
import AdOverlay, { type AdPhase } from './AdOverlay'
import GestureLayer from './GestureLayer'
import OverlayAd from './OverlayAd'
import PlayerControls from './PlayerControls'
import SubtitleRenderer, { type SubtitleSize } from './SubtitleRenderer'

type Osd =
  | { kind: 'brightness'; value: number; key: number }
  | { kind: 'volume'; value: number; key: number }
  | { kind: 'seek'; icon: 'fwd' | 'back'; text: string; key: number }

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
type OsdInput = DistributiveOmit<Osd, 'key'>

type AdState = { ad: ServedAd; phase: AdPhase }

const MID_ROLL_THRESHOLDS: Record<number, number[]> = {
  0: [],
  1: [0.5],
  2: [0.33, 0.66],
  3: [0.25, 0.5, 0.75],
}

/** Hold-to-unlock button with a 1.2s progress ring. */
function LockOverlay({ onUnlock }: { onUnlock: () => void }) {
  const [holding, setHolding] = useState(false)
  const timerRef = useRef<number | null>(null)
  const C = 2 * Math.PI * 26

  const start = () => {
    setHolding(true)
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(onUnlock, 1200)
  }
  const cancel = () => {
    setHolding(false)
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }
  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    },
    []
  )

  return (
    <div className="absolute inset-x-0 top-0 z-30 flex flex-col items-center gap-4 pt-5">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-4 py-2 backdrop-blur"
      >
        <Lock className="h-3.5 w-3.5 text-white/80" />
        <span className="text-xs text-white/80">Player locked — hold to unlock</span>
      </motion.div>
      <button
        aria-label="Hold 1.2 seconds to unlock"
        onPointerDown={start}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
        onContextMenu={(e) => e.preventDefault()}
        className="relative flex h-14 w-14 touch-none items-center justify-center rounded-full border border-white/15 bg-black/60 text-white/90 backdrop-blur active:scale-95"
      >
        <svg viewBox="0 0 56 56" className="absolute inset-0 h-full w-full -rotate-90">
          <circle cx="28" cy="28" r="26" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3" />
          <circle
            cx="28"
            cy="28"
            r="26"
            fill="none"
            stroke="var(--vx-accent)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={holding ? 0 : C}
            style={{ transition: holding ? 'stroke-dashoffset 1.2s linear' : 'stroke-dashoffset 0.25s ease' }}
          />
        </svg>
        <LockOpen className="h-5 w-5" />
      </button>
    </div>
  )
}

/**
 * Full-screen immersive player + ad engine.
 * Rendered globally when store.playerVideo !== null.
 */
export default function PlayerScreen() {
  const video = useAppStore((s) => s.playerVideo)
  const settings = useAppStore((s) => s.settings)
  const queueLength = useAppStore((s) => s.playerQueue.length)

  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  // playback state
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [waiting, setWaiting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorDetails, setErrorDetails] = useState(false)

  // visual state
  const [brightness, setBrightness] = useState(1)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [aspect, setAspect] = useState<AspectMode>('Fit')
  const [rotation, setRotation] = useState(0)
  const [natural, setNatural] = useState({ w: 0, h: 0 })
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [pipActive, setPipActive] = useState(false)

  // subtitles / audio
  const [subtitlesOn, setSubtitlesOn] = useState(true)
  const [subDelay, setSubDelay] = useState(0)
  const [subSize, setSubSize] = useState<SubtitleSize>('M')
  const [subBgOpacity, setSubBgOpacity] = useState(40)
  const [subPositionPct, setSubPositionPct] = useState(85)
  const [audioTrack, setAudioTrack] = useState('English 5.1 (AAC)')

  // ui state
  const [controlsVisible, setControlsVisible] = useState(true)
  const [osd, setOsd] = useState<Osd | null>(null)
  const [locked, setLocked] = useState(false)

  // ad machine
  const [startupGate, setStartupGate] = useState(false)
  const [activeAd, setActiveAd] = useState<AdState | null>(null)
  const [overlayAd, setOverlayAd] = useState<ServedAd | null>(null)
  const [mainStarted, setMainStarted] = useState(false)

  // refs
  const hideTimerRef = useRef<number | null>(null)
  const osdTimerRef = useRef<number | null>(null)
  const lastSaveRef = useRef<number>(0)
  const positionRef = useRef<{ id: string; time: number; dur: number } | null>(null)
  const endedRef = useRef(false)
  const midRollFetchingRef = useRef(false)
  const overlayShownRef = useRef(false)
  const userPausedRef = useRef(false)
  const resumeAppliedRef = useRef<string | null>(null)
  const speedTouchedRef = useRef(false)
  const subSyncedRef = useRef(false)
  const adRef = useRef<AdState | null>(null)

  // quality state
  const [variants, setVariants] = useState<QualityVariantDTO[]>([])
  const [qualityPref, setQualityPref] = useState('auto')
  const [viewportH, setViewportH] = useState(() =>
    typeof window !== 'undefined' ? window.innerHeight : 720,
  )
  const playingRef = useRef(false)
  const pendingQualitySeekRef = useRef<{ t: number; wasPlaying: boolean } | null>(null)
  const prevActiveSrcRef = useRef<string | null>(null)

  const videoId = video?.id ?? null
  const pipSupported =
    typeof document !== 'undefined' && 'pictureInPictureEnabled' in document

  useEffect(() => {
    adRef.current = activeAd
  }, [activeAd])

  // Track PiP state via media events (React types don't expose these props)
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const enter = () => setPipActive(true)
    const leave = () => setPipActive(false)
    v.addEventListener('enterpictureinpicture', enter)
    v.addEventListener('leavepictureinpicture', leave)
    return () => {
      v.removeEventListener('enterpictureinpicture', enter)
      v.removeEventListener('leavepictureinpicture', leave)
    }
  }, [videoId])

  // ── OSD helpers ──────────────────────────────────────────────
  const showOsd = useCallback((o: OsdInput) => {
    setOsd({ ...o, key: Date.now() } as Osd)
    if (osdTimerRef.current) window.clearTimeout(osdTimerRef.current)
    osdTimerRef.current = window.setTimeout(() => {
      osdTimerRef.current = null
      setOsd(null)
    }, 800)
  }, [])

  const showSeekOsd = useCallback(
    (deltaSec: number, target: number) => {
      const d = Math.round(deltaSec)
      showOsd({
        kind: 'seek',
        icon: d >= 0 ? 'fwd' : 'back',
        text: `${d >= 0 ? '+' : ''}${d}s / ${formatDuration(target)}`,
      })
    },
    [showOsd]
  )

  // ── Playback handlers (stable, ref-based) ────────────────────
  const stepSeek = useCallback(
    (d: number) => {
      const v = videoRef.current
      const vid = useAppStore.getState().playerVideo
      if (!v || !vid) return
      const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : vid.duration
      const t = Math.min(Math.max(0, v.currentTime + d), dur)
      v.currentTime = t
      setCurrentTime(t)
      showSeekOsd(d, t)
    },
    [showSeekOsd]
  )

  const applyVolume = useCallback(
    (nv: number) => {
      const v = videoRef.current
      setVolume(nv)
      if (v) {
        v.volume = nv
        if (nv > 0 && v.muted) {
          v.muted = false
          setMuted(false)
        }
      }
      showOsd({ kind: 'volume', value: nv })
    },
    [showOsd]
  )

  const handleBrightness = useCallback(
    (v: number) => {
      setBrightness(v)
      showOsd({ kind: 'brightness', value: v })
    },
    [showOsd]
  )

  const handleSeekCommit = useCallback(
    (target: number, delta: number) => {
      const v = videoRef.current
      const vid = useAppStore.getState().playerVideo
      if (!v || !vid) return
      const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : vid.duration
      const t = Math.min(Math.max(0, target), dur)
      v.currentTime = t
      setCurrentTime(t)
      showSeekOsd(delta, t)
    },
    [showSeekOsd]
  )

  const handleSeekPreview = useCallback(
    (target: number | null, delta: number) => {
      if (target === null) {
        if (osdTimerRef.current) {
          window.clearTimeout(osdTimerRef.current)
          osdTimerRef.current = null
        }
        setOsd(null)
        return
      }
      const d = Math.round(delta)
      showOsd({
        kind: 'seek',
        icon: d >= 0 ? 'fwd' : 'back',
        text: `${d >= 0 ? '+' : ''}${d}s / ${formatDuration(target)}`,
      })
    },
    [showOsd]
  )

  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      userPausedRef.current = false
      const p = v.play()
      if (p !== undefined && typeof p.catch === 'function') {
        p.catch(() => {})
      }
    } else {
      userPausedRef.current = true
      try {
        v.pause()
      } catch {}
    }
  }, [])

  const toggleControls = useCallback(() => {
    setControlsVisible((prev) => !prev)
  }, [])

  // ── Controls auto-hide (3s) ──────────────────────────────────
  const armHideTimer = useCallback(() => {
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current)
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null
      setControlsVisible(false)
    }, 3000)
  }, [])

  const holdVisibility = useCallback(
    (active: boolean) => {
      if (active) {
        if (hideTimerRef.current) {
          window.clearTimeout(hideTimerRef.current)
          hideTimerRef.current = null
        }
      } else {
        armHideTimer()
      }
    },
    [armHideTimer]
  )

  useEffect(() => {
    if (!playing || activeAd || locked || error) {
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }
      if (!playing) setControlsVisible(true)
      return
    }
    if (controlsVisible) armHideTimer()
  }, [playing, controlsVisible, activeAd, locked, error, armHideTimer])

  // ── Settings → subtitle prefs (once) ─────────────────────────
  useEffect(() => {
    if (!settings || subSyncedRef.current) return
    subSyncedRef.current = true
    setSubSize(settings.subtitleSize)
    setSubBgOpacity(settings.subtitleBgOpacity)
    setSubPositionPct(settings.subtitlePosition)
  }, [settings])

  // Apply defaultSpeed as soon as settings are known (unless user chose one)
  useEffect(() => {
    if (!settings || speedTouchedRef.current) return
    const v = videoRef.current
    if (v) v.playbackRate = settings.defaultSpeed
    setSpeed(settings.defaultSpeed)
  }, [settings])

  // ── Per-video lifecycle: resets + PRE_ROLL + save on leave ───
  useEffect(() => {
    if (!videoId) return
    const store = useAppStore.getState()
    const s = store.settings

    endedRef.current = false
    midRollFetchingRef.current = false
    overlayShownRef.current = false
    userPausedRef.current = false
    speedTouchedRef.current = false
    playingRef.current = false
    pendingQualitySeekRef.current = null
    prevActiveSrcRef.current = null
    lastSaveRef.current = Date.now()
    setError(null)
    setErrorDetails(false)
    setWaiting(true)
    setCurrentTime(0)
    setBuffered(0)
    setActiveAd(null)
    setOverlayAd(null)
    setMainStarted(false)
    setVariants(useAppStore.getState().playerVideo?.qualities ?? [])
    try {
      const stored = window.localStorage.getItem('vx_quality')
      setQualityPref(stored ? stored : 'auto')
    } catch {
      setQualityPref('auto')
    }
    store.resetMidRolls()

    // PRE_ROLL on every video open
    if (s && s.adsEnabled) {
      setStartupGate(true)
      requestAd({ placement: 'PRE_ROLL', videoId })
        .then((a) => {
          setStartupGate(false)
          if (a) setActiveAd({ ad: a, phase: 'pre' })
        })
        .catch(() => setStartupGate(false))
    } else {
      setStartupGate(false)
    }

    return () => {
      const p = positionRef.current
      if (p && p.id === videoId) {
        void saveLocalHistory(p.id, Math.floor(p.time), Math.floor(p.dur || 0))
      }
    }
  }, [videoId])

  // ── Play gate: main video only plays when no ad is active ────
  useEffect(() => {
    if (!videoId) return
    const v = videoRef.current
    if (!v) return
    if (startupGate || activeAd) {
      if (!v.paused) {
        try {
          v.pause()
        } catch {}
      }
      return
    }
    if (userPausedRef.current || v.ended) return
    const p = v.play()
    if (p !== undefined && typeof p.catch === 'function') {
      p.catch(() => {})
    }
  }, [startupGate, activeAd, videoId])

  // ── OVERLAY ad: once per video, 20s after main playback starts
  useEffect(() => {
    if (!videoId || !mainStarted) return
    const t = window.setTimeout(() => {
      if (overlayShownRef.current || adRef.current) return
      overlayShownRef.current = true
      requestAd({ placement: 'OVERLAY', videoId })
        .then((a) => {
          if (a) {
            void trackAdEvent(a, 'IMPRESSION', videoId)
            setOverlayAd(a)
          }
        })
        .catch(() => {})
    }, 20000)
    return () => window.clearTimeout(t)
  }, [mainStarted, videoId])

  // ── Fullscreen tracking ──────────────────────────────────────
  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  // ── Keyboard niceties ────────────────────────────────────────
  useEffect(() => {
    if (!videoId) return
    const onKey = (e: KeyboardEvent) => {
      if (adRef.current || locked) return
      const t = e.target as HTMLElement | null
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable ||
          t.closest('button, a, [role=slider], [data-radix-popper-content-wrapper]'))
      ) {
        return
      }
      const v = videoRef.current
      if (!v) return
      switch (e.code) {
        case 'Space':
          e.preventDefault()
          togglePlay()
          break
        case 'ArrowLeft': {
          e.preventDefault()
          stepSeek(-(useAppStore.getState().settings?.doubleTapSeek ?? 10))
          break
        }
        case 'ArrowRight': {
          e.preventDefault()
          stepSeek(useAppStore.getState().settings?.doubleTapSeek ?? 10)
          break
        }
        case 'ArrowUp': {
          e.preventDefault()
          applyVolume(Math.min(1, Math.round((v.volume + 0.1) * 100) / 100))
          break
        }
        case 'ArrowDown': {
          e.preventDefault()
          applyVolume(Math.max(0, Math.round((v.volume - 0.1) * 100) / 100))
          break
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [videoId, locked, togglePlay, stepSeek, applyVolume])

  // ── Quality: viewport tracking (auto mode) ─────────────────
  useEffect(() => {
    const onResize = () => setViewportH(window.innerHeight)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // ── Quality: drop stored preference if this video lacks it ─
  const effectivePref =
    qualityPref !== 'auto' &&
    variants.length > 0 &&
    !variants.some((v) => v.label === qualityPref)
      ? 'auto'
      : qualityPref

  // ── Quality: fetch + poll variants while they are generated ─
  useEffect(() => {
    if (!videoId) return
    const initial = useAppStore.getState().playerVideo?.qualities
    const busy = initial?.some((v) => v.status === 'PROCESSING') ?? false
    if (initial && initial.length > 0 && !busy) return
    let cancelled = false
    let timer: number | null = null
    let attempts = 0
    const tick = async () => {
      attempts += 1
      try {
        const res = await fetch(`/api/videos/${videoId}`, { cache: 'no-store' })
        if (res.ok) {
          const data = (await res.json()) as {
            video?: { qualities?: QualityVariantDTO[] }
          }
          if (cancelled) return
          const q = data.video?.qualities
          if (q && q.length > 0) {
            setVariants(q)
            if (q.some((v) => v.status === 'PROCESSING') && attempts < 150) {
              timer = window.setTimeout(tick, 4000)
              return
            }
          } else if (attempts < 5) {
            // Variants not registered yet (transcode job starting up)
            timer = window.setTimeout(tick, 4000)
            return
          }
        } else if (attempts < 5) {
          timer = window.setTimeout(tick, 6000)
          return
        }
      } catch {
        if (attempts < 5) timer = window.setTimeout(tick, 6000)
        return
      }
    }
    void tick()
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [videoId])

  // ── Quality: resolve the active playback source ────────────
  const readyVariants = useMemo(
    () => variants.filter((v) => v.status === 'READY'),
    [variants],
  )
  const autoVariant = useMemo(
    () => resolveAutoVariant(readyVariants, viewportH),
    [readyVariants, viewportH],
  )
  const activeSrc = useMemo(() => {
    if (effectivePref !== 'auto') {
      const chosen = readyVariants.find((v) => v.label === effectivePref)
      if (chosen) return chosen.filePath
    }
    return autoVariant?.filePath ?? video?.srcUrl ?? ''
  }, [effectivePref, readyVariants, autoVariant, video])
  const activeQualityLabel = useMemo(() => {
    const playingNow = readyVariants.find((v) => v.filePath === activeSrc)
    return playingNow ? qualityDisplayLabel(playingNow.label) : null
  }, [readyVariants, activeSrc])
  const autoQualityLabel = useMemo(
    () => (autoVariant ? qualityDisplayLabel(autoVariant.label) : null),
    [autoVariant],
  )

  // ── Quality: preserve playback position across source swaps ─
  useEffect(() => {
    if (!videoId) {
      prevActiveSrcRef.current = null
      return
    }
    if (prevActiveSrcRef.current !== null && prevActiveSrcRef.current !== activeSrc) {
      pendingQualitySeekRef.current = {
        t:
          positionRef.current && positionRef.current.id === videoId
            ? positionRef.current.time
            : 0,
        wasPlaying: playingRef.current,
      }
    }
    prevActiveSrcRef.current = activeSrc
  }, [activeSrc, videoId])

  // ── Global timer cleanup on unmount ──────────────────────────
  useEffect(
    () => () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current)
      if (osdTimerRef.current) window.clearTimeout(osdTimerRef.current)
    },
    []
  )

  const cues = useMemo(() => {
    if (!video) return []
    const d = duration > 0 ? duration : video.duration
    return generateDemoCues(d, video.title)
  }, [video, duration])

  if (!video) return null

  // ── Everything below runs only with an active video ──────────
  const dur = duration > 0 ? duration : video.duration

  const saveProgressNow = () => {
    const v = videoRef.current
    if (!v) return
    const d = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : video.duration
    const pos = Math.floor(v.currentTime || 0)
    positionRef.current = { id: video.id, time: pos, dur: d }
    void saveLocalHistory(video.id, pos, Math.floor(d || 0))
  }

  const updateBuffered = () => {
    const v = videoRef.current
    if (!v) return
    try {
      if (v.buffered.length > 0) setBuffered(v.buffered.end(v.buffered.length - 1))
    } catch {
      /* noop */
    }
  }

  const handleClose = () => {
    saveProgressNow()
    useAppStore.getState().bumpData()
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    if (document.pictureInPictureElement) void document.exitPictureInPicture().catch(() => {})
    useAppStore.getState().closePlayer()
  }

  const afterPostRoll = () => {
    const st = useAppStore.getState()
    if (st.settings?.autoPlayNext && st.playerQueue.length > 1) st.playNext()
    else handleClose()
  }

  const handleAdComplete = (skipped: boolean) => {
    useAppStore.getState().setLastAdAt(Date.now())
    const phase = activeAd?.phase
    setActiveAd(null)
    if (phase === 'post') afterPostRoll()
    // 'pre' / 'mid': the play-gate effect resumes the main video
  }

  const handleLoadedMetadata = () => {
    const v = videoRef.current
    if (!v) return
    const metaDur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : video.duration
    setDuration(metaDur)
    setNatural({ w: v.videoWidth, h: v.videoHeight })
    // Quality swap: restore position and playback state (before resume-once logic)
    if (pendingQualitySeekRef.current) {
      const seek = pendingQualitySeekRef.current
      pendingQualitySeekRef.current = null
      if (seek.t > 0.25 && seek.t < metaDur - 0.5) {
        v.currentTime = seek.t
        setCurrentTime(seek.t)
      }
      if (seek.wasPlaying) {
        const p = v.play()
        if (p !== undefined && typeof p.catch === 'function') p.catch(() => {})
      }
    }
    if (resumeAppliedRef.current !== video.id) {
      resumeAppliedRef.current = video.id
      const s = useAppStore.getState().settings
      if (
        s &&
        s.resumePlayback &&
        video.history &&
        video.history.watchedPct < 95 &&
        video.history.position > 3
      ) {
        const target = Math.min(video.history.position, Math.max(0, metaDur - 2))
        if (target > 0) {
          v.currentTime = target
          setCurrentTime(target)
          toast(`Resumed at ${formatDuration(target)}`)
        }
      } else if (!s || !s.resumePlayback) {
        v.currentTime = 0
      }
      const spd = s?.defaultSpeed ?? 1
      if (!speedTouchedRef.current) {
        v.playbackRate = spd
        setSpeed(spd)
      }
    }
  }

  const handleTimeUpdate = () => {
    const v = videoRef.current
    if (!v) return
    const t = v.currentTime
    const d = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : video.duration
    setCurrentTime(t)
    positionRef.current = { id: video.id, time: t, dur: d }
    updateBuffered()

    // throttled progress save every 5s
    const now = Date.now()
    if (now - lastSaveRef.current >= 5000) {
      lastSaveRef.current = now
      saveProgressNow()
    }

    // ── MID_ROLL machine ──
    if (!activeAd && !startupGate && mainStarted && !midRollFetchingRef.current) {
      const st = useAppStore.getState()
      const s = st.settings
      if (s && s.adsEnabled && d >= (s.minMidRollDurationSec || 300)) {
        if (st.midRollsShown < s.maxMidRolls) {
          const last = st.lastAdAt
          if (last === null || now - last > 90_000) {
            const thresholds = MID_ROLL_THRESHOLDS[s.maxMidRolls] ?? []
            const th = thresholds[st.midRollsShown]
            if (th !== undefined && t >= th * d) {
              midRollFetchingRef.current = true
              saveProgressNow()
              requestAd({
                placement: 'MID_ROLL',
                videoId: video.id,
                videoDuration: Math.floor(d),
              })
                .then((a) => {
                  midRollFetchingRef.current = false
                  if (a) {
                    st.setLastAdAt(Date.now())
                    st.incMidRolls()
                    setActiveAd({ ad: a, phase: 'mid' })
                  }
                })
                .catch(() => {
                  midRollFetchingRef.current = false
                })
            }
          }
        }
      }
    }
  }

  const handlePlayEvent = () => {
    setPlaying(true)
    playingRef.current = true
    setWaiting(false)
    if (!startupGate && !adRef.current) setMainStarted(true)
  }

  const handlePauseEvent = () => {
    setPlaying(false)
    playingRef.current = false
    saveProgressNow()
  }

  const handleEnded = () => {
    if (endedRef.current) return
    endedRef.current = true
    setPlaying(false)
    saveProgressNow()
    const s = useAppStore.getState().settings
    if (s && s.adsEnabled) {
      requestAd({ placement: 'POST_ROLL', videoId: video.id })
        .then((a) => {
          if (a) setActiveAd({ ad: a, phase: 'post' })
          else afterPostRoll()
        })
        .catch(() => afterPostRoll())
    } else {
      afterPostRoll()
    }
  }

  const handleVideoError = () => {
    const v = videoRef.current
    playingRef.current = false
    const code = v?.error?.code
    const messages: Record<number, string> = {
      1: 'Loading aborted',
      2: 'Network error while fetching the video',
      3: 'Decode error — the codec may be unsupported',
      4: 'Source format not supported or file corrupted',
    }
    setError(
      code !== undefined
        ? `${messages[code] ?? 'Playback error'} (code ${code})`
        : 'Unknown playback error'
    )
    setWaiting(false)
  }

  const tryAgain = () => {
    const v = videoRef.current
    if (!v) return
    setError(null)
    setErrorDetails(false)
    endedRef.current = false
    setWaiting(true)
    v.load()
    if (!userPausedRef.current) {
      const p = v.play()
      if (p !== undefined && typeof p.catch === 'function') p.catch(() => {})
    }
  }

  const toggleMute = () => {
    const v = videoRef.current
    if (!v) return
    const next = !v.muted
    v.muted = next
    setMuted(next)
  }

  const handleSpeed = (s: number) => {
    const v = videoRef.current
    if (v) v.playbackRate = s
    speedTouchedRef.current = true
    setSpeed(s)
    toast(`Speed ${s}×`)
  }

  const changeQuality = (label: string) => {
    setQualityPref(label)
    try {
      window.localStorage.setItem('vx_quality', label)
    } catch {
      /* storage unavailable */
    }
    if (label === 'auto') {
      toast(`Quality: Auto${autoVariant ? ` · ${qualityDisplayLabel(autoVariant.label)}` : ''}`)
    } else {
      toast(`Quality: ${qualityDisplayLabel(label)}`)
    }
  }

  const handleAspect = (a: AspectMode) => {
    setAspect(a)
    toast(`Aspect: ${a}`)
  }

  const handleRotate = () => {
    const next = (rotation + 90) % 360
    setRotation(next)
    toast(`Rotation ${next}° (${next % 180 === 0 ? 'portrait' : 'landscape'})`)
  }

  const handleAudioTrack = (t: string) => {
    setAudioTrack(t)
    toast(`Audio track: ${t} (demo)`)
  }

  const toggleFullscreen = () => {
    const el = containerRef.current
    if (!el) return
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {})
    } else {
      void el.requestFullscreen().catch(() => {
        toast('Fullscreen not available on this device')
      })
    }
  }

  const handlePip = () => {
    const v = videoRef.current
    if (!v) return
    if (document.pictureInPictureElement) {
      void document.exitPictureInPicture().catch(() => {})
    } else {
      void v.requestPictureInPicture().catch(() => toast('PiP not supported on this device'))
    }
  }

  const videoStyle: CSSProperties = {
    objectFit: aspect === 'Crop' ? 'cover' : aspect === 'Stretch' ? 'fill' : 'contain',
    transform: `rotate(${rotation}deg)${aspect === 'Zoom' ? ' scale(1.28)' : ''}`,
    filter: `brightness(${brightness})`,
    transition: 'transform 0.25s ease, filter 0.15s ease',
  }
  const useNaturalSize = aspect === '100%' && natural.w > 0 && natural.h > 0

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label={`Video player — ${video.title}`}
      className={`fixed inset-0 z-50 select-none overflow-hidden ${
        settings?.playerTheme === 'DIM' ? '' : 'bg-black'
      }`}
      style={settings?.playerTheme === 'DIM' ? { backgroundColor: '#0a0a14' } : undefined}
      onPointerMove={() => {
        if (controlsVisible && playing && !activeAd && !locked) armHideTimer()
      }}
    >
      {/* Main video */}
      <div className="absolute inset-0 z-0 flex items-center justify-center overflow-hidden bg-black">
        <video
          key={video.id}
          ref={videoRef}
          src={activeSrc}
          playsInline
          preload="auto"
          className={useNaturalSize ? '' : 'h-full w-full'}
          style={
            useNaturalSize
              ? {
                  ...videoStyle,
                  width: natural.w,
                  height: natural.h,
                  maxWidth: '100%',
                  maxHeight: '100%',
                }
              : videoStyle
          }
          onLoadedMetadata={handleLoadedMetadata}
          onLoadStart={() => setWaiting(true)}
          onTimeUpdate={handleTimeUpdate}
          onProgress={updateBuffered}
          onPlay={handlePlayEvent}
          onPause={handlePauseEvent}
          onEnded={handleEnded}
          onWaiting={() => setWaiting(true)}
          onPlaying={() => setWaiting(false)}
          onCanPlay={() => setWaiting(false)}
          onError={handleVideoError}
        />
      </div>

      {/* Gestures */}
      <GestureLayer
        disabled={Boolean(activeAd) || Boolean(error)}
        locked={locked}
        brightness={brightness}
        volume={volume}
        seekAmount={settings?.doubleTapSeek ?? 10}
        currentTime={currentTime}
        duration={dur}
        onBrightnessChange={handleBrightness}
        onVolumeChange={applyVolume}
        onSeekPreview={handleSeekPreview}
        onSeekCommit={handleSeekCommit}
        onToggleControls={toggleControls}
      />

      {/* Subtitles */}
      {subtitlesOn && !activeAd && !error && (
        <SubtitleRenderer
          cues={cues}
          currentTime={currentTime}
          delay={subDelay}
          size={subSize}
          positionPct={subPositionPct}
          bgOpacity={subBgOpacity}
        />
      )}

      {/* Buffering spinner */}
      <AnimatePresence>
        {waiting && !error && !activeAd && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
          >
            <Loader2 className="h-12 w-12 animate-spin text-white/85" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* OSD */}
      <AnimatePresence>
        {osd && (
          <motion.div
            key={osd.key}
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
          >
            <div className="flex flex-col items-center gap-3 rounded-2xl bg-black/60 px-7 py-5 text-white backdrop-blur">
              {osd.kind === 'brightness' && <Sun className="h-9 w-9" />}
              {osd.kind === 'volume' && <Volume2 className="h-9 w-9" />}
              {osd.kind === 'seek' &&
                (osd.icon === 'fwd' ? (
                  <FastForward className="h-9 w-9" />
                ) : (
                  <Rewind className="h-9 w-9" />
                ))}
              {osd.kind === 'seek' ? (
                <div className="text-base font-semibold tabular-nums">{osd.text}</div>
              ) : (
                <>
                  <div className="h-1.5 w-40 overflow-hidden rounded-full bg-white/20">
                    <div
                      className="h-full rounded-full bg-white"
                      style={{ width: `${Math.round(osd.value * 100)}%` }}
                    />
                  </div>
                  <div className="text-xs tabular-nums text-white/80">
                    {Math.round(osd.value * 100)}%
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top gradient bar */}
      <AnimatePresence>
        {controlsVisible && !activeAd && !locked && !error && (
          <motion.div
            key="topbar"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent px-3 pb-12 pt-3 sm:px-5"
          >
            <div className="flex min-w-0 items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="pointer-events-auto h-11 w-11 shrink-0 rounded-full text-white hover:bg-white/15 hover:text-white"
                onClick={handleClose}
                aria-label="Close player"
              >
                <ChevronDown className="h-6 w-6" />
              </Button>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-white">{video.title}</div>
                <div className="truncate text-xs text-white/55">
                  {video.folder} · {activeQualityLabel ?? video.resolutionLabel}
                </div>
              </div>
            </div>
            {pipSupported && (
              <Button
                variant="ghost"
                size="icon"
                className={`pointer-events-auto h-11 w-11 shrink-0 rounded-full text-white hover:bg-white/15 hover:text-white ${
                  pipActive ? 'text-(--vx-accent)' : ''
                }`}
                onClick={handlePip}
                aria-label="Picture in picture"
              >
                <PictureInPicture2 className="h-5 w-5" />
              </Button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls */}
      <AnimatePresence>
        {controlsVisible && !activeAd && !locked && !error && (
          <PlayerControls
            key="controls"
            playing={playing}
            currentTime={currentTime}
            duration={dur}
            buffered={buffered}
            volume={volume}
            muted={muted}
            speed={speed}
            aspect={aspect}
            fullscreen={isFullscreen}
            queueLength={queueLength}
            pipActive={pipActive}
            subtitlesOn={subtitlesOn}
            subDelay={subDelay}
            subSize={subSize}
            subBgOpacity={subBgOpacity}
            audioTrack={audioTrack}
            defaultSpeed={settings?.defaultSpeed ?? 1}
            qualities={variants}
            qualityPref={readyVariants.length === 0 ? 'auto' : effectivePref}
            activeQualityLabel={activeQualityLabel}
            autoQualityLabel={autoQualityLabel}
            onQuality={changeQuality}
            onTogglePlay={togglePlay}
            onSeek={(t) => handleSeekCommit(t, t - currentTime)}
            onStep={stepSeek}
            onPrev={() => useAppStore.getState().playPrev()}
            onNext={() => useAppStore.getState().playNext()}
            onToggleMute={toggleMute}
            onSpeed={handleSpeed}
            onAspect={handleAspect}
            onRotate={handleRotate}
            onToggleFullscreen={toggleFullscreen}
            onPip={handlePip}
            onLock={() => {
              setLocked(true)
              toast('Screen locked — hold the unlock button to release')
            }}
            onSubtitlesToggle={setSubtitlesOn}
            onSubDelay={setSubDelay}
            onSubSize={setSubSize}
            onSubBg={setSubBgOpacity}
            onAudioTrack={handleAudioTrack}
            onInteract={() => {
              if (playing) armHideTimer()
            }}
            onHoldVisibility={holdVisibility}
          />
        )}
      </AnimatePresence>

      {/* Lock mode */}
      {locked && (
        <LockOverlay
          onUnlock={() => {
            setLocked(false)
            toast('Unlocked')
          }}
        />
      )}

      {/* Non-blocking overlay ad */}
      <AnimatePresence>
        {overlayAd && !activeAd && (
          <OverlayAd
            key={overlayAd.creativeId}
            ad={overlayAd}
            videoId={video.id}
            onClose={() => setOverlayAd(null)}
          />
        )}
      </AnimatePresence>

      {/* Error panel */}
      {error && !activeAd && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/90 p-6">
          <div className="vx-card w-full max-w-sm rounded-2xl p-6 text-center">
            <TriangleAlert className="mx-auto h-10 w-10 text-rose-400" />
            <h2 className="mt-3 text-base font-semibold text-white">Unable to play this video.</h2>
            <ul className="mx-auto mt-3 space-y-1 text-left text-xs text-white/55">
              <li>• Unsupported codec</li>
              <li>• Corrupted file</li>
              <li>• Storage permission unavailable</li>
            </ul>
            {errorDetails && (
              <div className="mt-3 break-words rounded-lg bg-white/5 p-2 text-left text-[11px] text-white/45">
                {error}
              </div>
            )}
            <div className="mt-5 flex items-center justify-center gap-2">
              <Button
                onClick={tryAgain}
                className="vx-btn-accent h-10 rounded-full border-0 px-5 text-sm font-semibold text-white"
              >
                TRY AGAIN
              </Button>
              <Button
                variant="ghost"
                onClick={() => setErrorDetails((d) => !d)}
                className="h-10 rounded-full px-4 text-sm text-white/70 hover:text-white"
              >
                DETAILS
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Full-screen ad (pre / mid / post roll) */}
      <AnimatePresence>
        {activeAd && (
          <AdOverlay
            key={`${activeAd.ad.creativeId}-${activeAd.phase}`}
            ad={activeAd.ad}
            phase={activeAd.phase}
            videoId={video.id}
            onComplete={handleAdComplete}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

