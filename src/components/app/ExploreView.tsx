'use client'

import { useState } from 'react'
import { Compass, Globe, Radio, Play, Sparkles, Tv, Cloud, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { useAppStore } from '@/lib/store'

export function ExploreView() {
  const [streamUrl, setStreamUrl] = useState('')
  const openPlayer = useAppStore((s) => s.openPlayer)

  const handlePlayStream = (e: React.FormEvent) => {
    e.preventDefault()
    if (!streamUrl.trim()) return
    const url = streamUrl.trim()
    const syntheticVideo = {
      id: `stream_${Date.now()}`,
      title: url.split('/').pop() || 'Network Stream',
      fileName: url.split('/').pop() || 'stream.m3u8',
      folder: 'Network Streams',
      duration: 0,
      width: 1920,
      height: 1080,
      resolutionLabel: 'LIVE',
      sizeMB: 0,
      codec: 'h264',
      audioCodec: 'aac',
      container: 'm3u8',
      frameRate: 30,
      srcUrl: url,
      thumbnailUrl: '',
      addedAt: new Date().toISOString(),
      favorite: false,
      history: null,
      qualities: [],
    }
    openPlayer(syntheticVideo)
    toast.success('Opening network stream...')
  }

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2.5">
          <Compass className="size-5 text-[var(--vx-accent-soft)]" />
          Explore & Stream
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">Stream direct URLs, cloud playlists, and trending content</p>
      </div>

      {/* Network Stream URL Input */}
      <div className="vx-card p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-white">
          <Globe className="size-4 text-[var(--vx-accent-soft)]" />
          Play Direct Network Stream / URL
        </div>
        <form onSubmit={handlePlayStream} className="flex gap-2">
          <Input
            value={streamUrl}
            onChange={(e) => setStreamUrl(e.target.value)}
            placeholder="Enter MP4, HLS (.m3u8), or video URL..."
            className="bg-black/40 border-white/10 text-xs h-10"
          />
          <Button type="submit" className="vx-btn-accent h-10 px-4 text-xs font-semibold shrink-0">
            <Play className="size-3.5 mr-1" />
            Play
          </Button>
        </form>
        <p className="text-[10px] text-muted-foreground">
          Supports direct MP4 links, HLS live streams, WebM, and local network media servers.
        </p>
      </div>

      {/* Cloud & Backup Card */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-r from-cyan-950/40 via-blue-950/30 to-black p-5">
        <div className="flex items-center gap-4">
          <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-cyan-500/20 text-cyan-300 shadow-lg shadow-cyan-500/20">
            <Cloud className="size-8" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="vx-chip text-[10px] uppercase tracking-wider mb-1 font-semibold text-cyan-300">
              VX Cloud Sync
            </span>
            <h2 className="text-sm font-semibold text-white">Backup Your Playlists & Favorites</h2>
            <p className="text-xs text-muted-foreground">Sync your video positions and playlists seamlessly across devices.</p>
          </div>
          <Button
            size="sm"
            onClick={() => toast.info('Cloud sync is available with VX Pro.')}
            className="vx-btn-accent h-9 text-xs shrink-0"
          >
            Connect
          </Button>
        </div>
      </div>

      {/* Trending Categories */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Sparkles className="size-4 text-amber-400" />
          Featured Formats & Features
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { title: '4K Ultra HD', desc: 'Hardware 120 FPS decode' },
            { title: 'Dolby Audio', desc: 'Surround sound spatializer' },
            { title: 'All Formats', desc: 'MKV, MP4, AVI, WebM' },
            { title: 'Secure Vault', desc: 'Encrypted private folder' },
          ].map((item) => (
            <div key={item.title} className="vx-card p-3.5 space-y-1">
              <p className="text-xs font-semibold text-white">{item.title}</p>
              <p className="text-[10px] text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default ExploreView
