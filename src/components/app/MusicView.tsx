'use client'

import { useState } from 'react'
import { Music, Play, Disc3, Radio, Headphones, Shuffle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function MusicView() {
  const [isPlaying, setIsPlaying] = useState(false)

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Music className="size-5 text-[var(--vx-accent-soft)]" />
            Music & Audio
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">High-fidelity offline music player</p>
        </div>
        <Button size="sm" className="vx-btn-accent h-9 gap-1.5 rounded-xl px-3 text-xs font-semibold">
          <Shuffle className="size-3.5" />
          Shuffle All
        </Button>
      </div>

      {/* Featured Card */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-r from-blue-950/40 via-purple-950/30 to-black p-5">
        <div className="flex items-center gap-4">
          <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[var(--vx-accent)]/20 text-[var(--vx-accent-soft)] shadow-lg shadow-blue-500/20">
            <Disc3 className="size-8 animate-spin-slow" />
          </div>
          <div className="min-w-0">
            <span className="vx-chip text-[10px] uppercase tracking-wider mb-1 font-semibold text-[var(--vx-accent-soft)]">
              Dolby Audio Engine
            </span>
            <h2 className="text-sm font-semibold text-white">Lossless Audio Experience</h2>
            <p className="text-xs text-muted-foreground">Studio-grade FLAC, MP3, AAC, and WAV offline playback.</p>
          </div>
        </div>
      </div>

      {/* Empty / Audio List State */}
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <div className="grid size-14 place-items-center rounded-2xl border border-white/10 bg-white/[0.03] text-muted-foreground">
          <Headphones className="size-7" />
        </div>
        <p className="text-sm font-medium text-white">No audio tracks detected</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          Your device's local audio files and extracted video soundtracks will appear here.
        </p>
      </div>
    </div>
  )
}

export default MusicView
