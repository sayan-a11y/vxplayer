'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Image from 'next/image'
import { Heart, Play } from 'lucide-react'
import { toast } from 'sonner'

import { apiPost } from '@/lib/api'
import { formatDuration, formatSize } from '@/lib/format'
import { useAppStore } from '@/lib/store'
import type { VideoDTO } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

type VideoInfoSheetProps = {
  video: VideoDTO | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 py-2.5">
      <span className="shrink-0 text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium">{value}</span>
    </div>
  )
}

export function VideoInfoSheet({ video, open, onOpenChange }: VideoInfoSheetProps) {
  const openPlayer = useAppStore((s) => s.openPlayer)
  const bumpData = useAppStore((s) => s.bumpData)
  const [fav, setFav] = useState(video?.favorite ?? false)

  useEffect(() => {
    setFav(video?.favorite ?? false)
  }, [video, open])

  async function toggleFavorite() {
    if (!video) return
    const next = !fav
    setFav(next)
    try {
      await apiPost(`/api/videos/${video.id}/favorite`, { favorite: next })
      toast.success(next ? 'Added to favorites' : 'Removed from favorites')
      bumpData()
    } catch {
      setFav(!next)
      toast.error('Could not update favorite')
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="vx-scroll w-full gap-0 overflow-y-auto p-0 sm:max-w-md">
        {video && (
          <div className="flex min-h-full flex-col">
            <div className="relative aspect-video w-full shrink-0 bg-white/5">
              <Image
                src={video.thumbnailUrl}
                alt={video.title}
                fill
                sizes="(max-width: 640px) 100vw, 448px"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/20" />
            </div>

            <div className="flex flex-1 flex-col gap-4 p-5">
              <SheetHeader className="space-y-1 p-0 text-left">
                <SheetTitle className="text-base font-semibold leading-snug tracking-tight">{video.title}</SheetTitle>
                <p className="text-xs text-muted-foreground">
                  {video.folder} / {video.fileName}
                </p>
              </SheetHeader>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    openPlayer(video, [video])
                    onOpenChange(false)
                  }}
                  className="vx-btn-accent inline-flex min-h-11 flex-1 items-center justify-center gap-2 text-sm font-semibold"
                >
                  <Play className="size-4 fill-current" />
                  Play
                </button>
                <Button
                  variant="outline"
                  aria-label={fav ? 'Remove from favorites' : 'Add to favorites'}
                  aria-pressed={fav}
                  onClick={() => void toggleFavorite()}
                  className="size-11 shrink-0 rounded-xl p-0"
                >
                  <Heart className={cn('size-4', fav && 'fill-[var(--vx-accent)] text-[var(--vx-accent)]')} />
                </Button>
              </div>

              <div className="vx-card px-4 py-1">
                <InfoRow label="Filename" value={video.fileName} />
                <Separator />
                <InfoRow label="Location" value={`${video.folder} / ${video.fileName}`} />
                <Separator />
                <InfoRow label="File size" value={formatSize(video.sizeMB)} />
                <Separator />
                <InfoRow label="Duration" value={formatDuration(video.duration)} />
                <Separator />
                <InfoRow
                  label="Resolution"
                  value={`${video.width} × ${video.height} (${video.resolutionLabel})`}
                />
                <Separator />
                <InfoRow label="Frame rate" value={`${video.frameRate} fps`} />
                <Separator />
                <InfoRow label="Video codec" value={video.codec.toUpperCase()} />
                <Separator />
                <InfoRow label="Container" value={video.container.toUpperCase()} />
                <Separator />
                <InfoRow label="Audio codec" value={video.audioCodec.toUpperCase()} />
                <Separator />
                <InfoRow label="Subtitles" value="Embedded: English (demo)" />
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
