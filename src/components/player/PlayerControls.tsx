'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Ratio,
  AudioLines,
  Check,
  FastForward,
  Gauge,
  Loader2,
  Lock,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  Rewind,
  RotateCw,
  Settings2,
  StepBack,
  StepForward,
  Subtitles,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { formatDuration } from '@/lib/format'
import { qualityDisplayLabel } from '@/lib/qualities'
import { ASPECT_MODES, SPEED_OPTIONS, type AspectMode, type QualityVariantDTO } from '@/lib/types'
import type { SubtitleSize } from './SubtitleRenderer'

const AUDIO_TRACKS = ['English 5.1 (AAC)', 'Hindi (AC3)', 'Director Commentary']
const SUB_SIZES: SubtitleSize[] = ['S', 'M', 'L', 'XL']

/** One row of the quality menu. */
function QualityRow({
  label,
  hint,
  active,
  processing,
  disabled,
  onClick,
}: {
  label: string
  hint?: string
  active: boolean
  processing?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-[40px] w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-white/10 disabled:opacity-45 disabled:hover:bg-transparent"
    >
      <span className="flex min-w-0 items-center gap-2">
        {processing && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-white/50" />}
        <span className={active ? 'font-medium text-(--vx-accent)' : 'text-white/85'}>{label}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2 text-xs tabular-nums text-white/45">
        {hint}
        {active && <Check className="h-4 w-4 text-(--vx-accent)" />}
      </span>
    </button>
  )
}

type PlayerControlsProps = {
  playing: boolean
  currentTime: number
  duration: number
  buffered: number
  volume: number
  muted: boolean
  speed: number
  aspect: AspectMode
  fullscreen: boolean
  queueLength: number
  pipActive: boolean
  subtitlesOn: boolean
  subDelay: number
  subSize: SubtitleSize
  subBgOpacity: number
  audioTrack: string
  defaultSpeed: number
  /** All quality variants of the current video (READY + PROCESSING), sorted high → low */
  qualities: QualityVariantDTO[]
  /** 'auto' or a variant label */
  qualityPref: string
  /** display label of the rendition currently playing (resolved auto incl.) */
  activeQualityLabel: string | null
  /** display label Auto mode would pick for this screen */
  autoQualityLabel: string | null
  onQuality: (label: string) => void
  onTogglePlay: () => void
  onSeek: (t: number) => void
  onStep: (d: number) => void
  onPrev: () => void
  onNext: () => void
  onToggleMute: () => void
  onSpeed: (s: number) => void
  onAspect: (a: AspectMode) => void
  onRotate: () => void
  onToggleFullscreen: () => void
  onPip: () => void
  onLock: () => void
  onSubtitlesToggle: (on: boolean) => void
  onSubDelay: (d: number) => void
  onSubSize: (s: SubtitleSize) => void
  onSubBg: (v: number) => void
  onAudioTrack: (t: string) => void
  /** any pointer interaction inside controls — resets the auto-hide timer */
  onInteract: () => void
  /** a popover opened (true) / closed (false) — pause/resume auto-hide */
  onHoldVisibility: (active: boolean) => void
}

const ACCENT_ACTIVE =
  'border-(--vx-accent) bg-(--vx-accent)/20 text-white'
const IDLE_ITEM = 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'

export default function PlayerControls(props: PlayerControlsProps) {
  const {
    playing,
    currentTime,
    duration,
    buffered,
    volume,
    muted,
    speed,
    aspect,
    fullscreen,
    queueLength,
    pipActive,
    subtitlesOn,
    subDelay,
    subSize,
    subBgOpacity,
    audioTrack,
    defaultSpeed,
    qualities,
    qualityPref,
    activeQualityLabel,
    autoQualityLabel,
    onQuality,
    onTogglePlay,
    onSeek,
    onStep,
    onPrev,
    onNext,
    onToggleMute,
    onSpeed,
    onAspect,
    onRotate,
    onToggleFullscreen,
    onPip,
    onLock,
    onSubtitlesToggle,
    onSubDelay,
    onSubSize,
    onSubBg,
    onAudioTrack,
    onInteract,
    onHoldVisibility,
  } = props

  const [scrub, setScrub] = useState<number | null>(null)
  const [openPanel, setOpenPanel] = useState<string | null>(null)

  const pipSupported =
    typeof document !== 'undefined' && 'pictureInPictureEnabled' in document

  const dur = duration > 0 ? duration : 1
  const shown = scrub ?? currentTime
  const remaining = Math.max(0, dur - shown)
  const bufferedPct = dur > 0 ? Math.min(100, (buffered / dur) * 100) : 0

  const panelChange = (name: string, open: boolean) => {
    setOpenPanel(open ? name : null)
    onHoldVisibility(open)
    onInteract()
  }

  const iconBtn =
    'h-11 w-11 shrink-0 rounded-full text-white hover:bg-white/15 hover:text-white disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-white'

  const readyCount = qualities.filter((q) => q.status === 'READY').length
  const processingCount = qualities.filter((q) => q.status === 'PROCESSING').length

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-3 pb-4 pt-14 sm:px-5"
      onPointerDown={onInteract}
    >
      {/* Seek bar with buffered indicator */}
      <div className="relative flex h-6 w-full items-center">
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-white/15">
          <div className="h-full bg-white/25" style={{ width: `${bufferedPct}%` }} />
        </div>
        <Slider
          value={[Math.min(shown, dur)]}
          min={0}
          max={dur}
          step={0.1}
          onValueChange={(v) => {
            setScrub(v[0])
            onInteract()
          }}
          onValueCommit={(v) => {
            onSeek(v[0])
            setScrub(null)
          }}
          aria-label="Seek"
          className="relative z-10 [&_[data-slot=slider-range]]:bg-(--vx-accent) [&_[data-slot=slider-thumb]]:size-3.5 [&_[data-slot=slider-thumb]]:border-white [&_[data-slot=slider-thumb]]:bg-white [&_[data-slot=slider-track]]:bg-transparent"
        />
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px] tabular-nums text-white/65">
        <span>{formatDuration(shown)}</span>
        <span>
          -{formatDuration(remaining)} / {formatDuration(dur)}
        </span>
      </div>

      {/* Transport row */}
      <div className="mt-2 flex items-center justify-center gap-1 sm:gap-2">
        <Button
          variant="ghost"
          size="icon"
          className={iconBtn}
          disabled={queueLength < 2}
          onClick={onPrev}
          aria-label="Previous video"
        >
          <StepBack className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={iconBtn}
          onClick={() => onStep(-10)}
          aria-label="Back 10 seconds"
        >
          <Rewind className="h-5 w-5" />
        </Button>
        <button
          onClick={onTogglePlay}
          aria-label={playing ? 'Pause' : 'Play'}
          className="mx-1 flex h-14 w-14 items-center justify-center rounded-full vx-btn-accent text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
        >
          {playing ? (
            <Pause className="h-6 w-6 fill-current" />
          ) : (
            <Play className="h-6 w-6 fill-current" />
          )}
        </button>
        <Button
          variant="ghost"
          size="icon"
          className={iconBtn}
          onClick={() => onStep(10)}
          aria-label="Forward 10 seconds"
        >
          <FastForward className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={iconBtn}
          disabled={queueLength < 2}
          onClick={onNext}
          aria-label="Next video"
        >
          <StepForward className="h-5 w-5" />
        </Button>
      </div>

      {/* Secondary row — horizontally scrollable on narrow phones */}
      <div className="mt-2 flex items-center justify-between gap-1">
        <Button
          variant="ghost"
          size="icon"
          className={iconBtn}
          onClick={onToggleMute}
          aria-label={muted || volume === 0 ? 'Unmute' : 'Mute'}
        >
          {muted || volume === 0 ? (
            <VolumeX className="h-5 w-5" />
          ) : (
            <Volume2 className="h-5 w-5" />
          )}
        </Button>

        <div className="vx-scroll flex min-w-0 max-w-full items-center gap-0.5 overflow-x-auto sm:gap-1">
          {/* Quality (140p → 2K/4K) */}
          <Popover open={openPanel === 'quality'} onOpenChange={(o) => panelChange('quality', o)}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                className={`${iconBtn} w-auto gap-1.5 px-2.5 ${qualityPref !== 'auto' ? 'text-(--vx-accent)' : ''}`}
                aria-label="Video quality"
              >
                <Settings2 className="h-5 w-5" />
                <span className="text-xs font-semibold tabular-nums">
                  {qualityPref === 'auto' ? 'Auto' : qualityPref}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="end"
              className="vx-scroll max-h-[60vh] w-64 overflow-y-auto border-white/10 bg-zinc-900/95 text-white backdrop-blur-xl"
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between px-1 pb-2">
                  <span className="text-xs font-medium text-white/50">Quality</span>
                  {processingCount > 0 && (
                    <span className="flex items-center gap-1 text-[10px] text-white/40">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {processingCount} processing
                    </span>
                  )}
                </div>
                <QualityRow
                  label="Auto"
                  hint={autoQualityLabel ?? undefined}
                  active={qualityPref === 'auto'}
                  onClick={() => onQuality('auto')}
                />
                {qualities.map((q) => (
                  <QualityRow
                    key={q.label}
                    label={qualityDisplayLabel(q.label)}
                    hint={
                      q.status === 'READY'
                        ? q.isSource
                          ? 'Original'
                          : `${q.fileSizeMB} MB`
                        : q.status === 'PROCESSING'
                          ? 'Processing…'
                          : 'Unavailable'
                    }
                    active={qualityPref === q.label}
                    processing={q.status === 'PROCESSING'}
                    disabled={q.status !== 'READY'}
                    onClick={() => onQuality(q.label)}
                  />
                ))}
                {readyCount === 0 && processingCount > 0 && (
                  <div className="px-3 pb-1 pt-1 text-[11px] leading-snug text-white/40">
                    Playback uses the original file until variants are ready.
                  </div>
                )}
                <div className="px-1 pb-1 pt-1 text-[11px] leading-snug text-white/40">
                  Auto matches quality to your screen · up to 2K/4K for high-res imports
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Subtitles */}
          <Popover open={openPanel === 'subs'} onOpenChange={(o) => panelChange('subs', o)}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={`${iconBtn} ${subtitlesOn ? 'text-(--vx-accent)' : ''}`}
                aria-label="Subtitle settings"
              >
                <Subtitles className="h-5 w-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="end"
              className="vx-scroll max-h-[70vh] w-64 overflow-y-auto border-white/10 bg-zinc-900/95 text-white backdrop-blur-xl"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Subtitles</span>
                  <Switch checked={subtitlesOn} onCheckedChange={onSubtitlesToggle} />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/50">Track</span>
                  <span className="text-white/85">English (demo)</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white/70">Delay</span>
                    <span className="tabular-nums text-white/90">
                      {subDelay > 0 ? '+' : ''}
                      {subDelay.toFixed(1)}s
                    </span>
                  </div>
                  <Slider
                    min={-10}
                    max={10}
                    step={0.5}
                    value={[subDelay]}
                    onValueChange={(v) => onSubDelay(v[0])}
                    aria-label="Subtitle delay"
                    className="[&_[data-slot=slider-range]]:bg-(--vx-accent)"
                  />
                </div>
                <div className="space-y-2">
                  <div className="text-xs text-white/70">Size</div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {SUB_SIZES.map((s) => (
                      <button
                        key={s}
                        onClick={() => onSubSize(s)}
                        className={`h-9 rounded-lg border text-xs font-medium transition-colors ${
                          subSize === s ? ACCENT_ACTIVE : IDLE_ITEM
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white/70">Background opacity</span>
                    <span className="tabular-nums text-white/90">{subBgOpacity}%</span>
                  </div>
                  <Slider
                    min={0}
                    max={100}
                    step={5}
                    value={[subBgOpacity]}
                    onValueChange={(v) => onSubBg(v[0])}
                    aria-label="Subtitle background opacity"
                    className="[&_[data-slot=slider-range]]:bg-(--vx-accent)"
                  />
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Audio tracks */}
          <Popover open={openPanel === 'audio'} onOpenChange={(o) => panelChange('audio', o)}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className={iconBtn} aria-label="Audio tracks">
                <AudioLines className="h-5 w-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="end"
              className="w-60 border-white/10 bg-zinc-900/95 text-white backdrop-blur-xl"
            >
              <div className="space-y-1">
                <div className="px-1 pb-2 text-xs font-medium text-white/50">
                  Audio tracks (demo)
                </div>
                {AUDIO_TRACKS.map((t) => (
                  <button
                    key={t}
                    onClick={() => onAudioTrack(t)}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-white/10"
                  >
                    <span className={audioTrack === t ? 'text-(--vx-accent)' : 'text-white/85'}>
                      {t}
                    </span>
                    {audioTrack === t && <Check className="h-4 w-4 text-(--vx-accent)" />}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Speed */}
          <Popover open={openPanel === 'speed'} onOpenChange={(o) => panelChange('speed', o)}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={`${iconBtn} ${speed !== 1 ? 'text-(--vx-accent)' : ''}`}
                aria-label="Playback speed"
              >
                <Gauge className="h-5 w-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="end"
              className="w-64 border-white/10 bg-zinc-900/95 text-white backdrop-blur-xl"
            >
              <div className="space-y-3">
                <div className="text-xs font-medium text-white/50">Playback speed</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {SPEED_OPTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => onSpeed(s)}
                      className={`h-9 rounded-lg border text-xs font-medium tabular-nums transition-colors ${
                        speed === s ? ACCENT_ACTIVE : IDLE_ITEM
                      }`}
                    >
                      {s}×
                    </button>
                  ))}
                </div>
                <div className="text-[11px] text-white/40">
                  Default: {defaultSpeed}× — change it in Settings
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Aspect ratio */}
          <Popover open={openPanel === 'aspect'} onOpenChange={(o) => panelChange('aspect', o)}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={`${iconBtn} ${aspect !== 'Fit' ? 'text-(--vx-accent)' : ''}`}
                aria-label="Aspect ratio"
              >
                <Ratio className="h-5 w-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="end"
              className="w-56 border-white/10 bg-zinc-900/95 text-white backdrop-blur-xl"
            >
              <div className="space-y-1">
                <div className="px-1 pb-2 text-xs font-medium text-white/50">Aspect ratio</div>
                {ASPECT_MODES.map((a) => (
                  <button
                    key={a}
                    onClick={() => onAspect(a)}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-white/10"
                  >
                    <span className={aspect === a ? 'text-(--vx-accent)' : 'text-white/85'}>
                      {a}
                    </span>
                    {aspect === a && <Check className="h-4 w-4 text-(--vx-accent)" />}
                  </button>
                ))}
                <div className="px-1 pt-1 text-[11px] text-white/40">
                  Fit · Crop · Stretch · Zoom · 100% (no upscale)
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Rotate */}
          <Button
            variant="ghost"
            size="icon"
            className={iconBtn}
            onClick={onRotate}
            aria-label="Rotate video"
          >
            <RotateCw className="h-5 w-5" />
          </Button>

          {/* Fullscreen */}
          <Button
            variant="ghost"
            size="icon"
            className={iconBtn}
            onClick={onToggleFullscreen}
            aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
          </Button>

          {/* PiP */}
          {pipSupported && (
            <Button
              variant="ghost"
              size="icon"
              className={`${iconBtn} ${pipActive ? 'text-(--vx-accent)' : ''}`}
              onClick={onPip}
              aria-label="Picture in picture"
            >
              <PictureInPicture2 className="h-5 w-5" />
            </Button>
          )}

          {/* Lock */}
          <Button variant="ghost" size="icon" className={iconBtn} onClick={onLock} aria-label="Lock controls">
            <Lock className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </motion.div>
  )
}

