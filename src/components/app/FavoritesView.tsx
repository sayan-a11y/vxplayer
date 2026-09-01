'use client'

import { Heart } from 'lucide-react'

import { useAppStore } from '@/lib/store'

import { EmptyState, ErrorState, VideoGridSkeleton, sortVideos, useVideos } from './VideosView'
import { VideoCard } from './VideoCard'

export function FavoritesView() {
  const { videos, error, reload } = useVideos()

  if (videos === null && error) {
    return (
      <div className="px-4 py-6 md:px-6">
        <ErrorState onRetry={() => void reload()} />
      </div>
    )
  }

  if (videos === null) {
    return (
      <div className="px-4 py-6 md:px-6">
        <div className="mb-5 h-7 w-40 rounded bg-white/5" />
        <VideoGridSkeleton />
      </div>
    )
  }

  const favorites = sortVideos(
    videos.filter((v) => v.favorite),
    'recent_added'
  )

  return (
    <div className="px-4 py-4 md:px-6">
      <div className="mb-4 flex min-h-11 items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Heart className="size-5 fill-[var(--vx-accent)] text-[var(--vx-accent)]" />
          Favorites
        </h1>
        <span className="vx-chip tabular-nums">{favorites.length}</span>
      </div>

      {favorites.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="No favorites yet"
          hint="Tap the heart on any video and it will show up here."
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {favorites.map((v) => (
            <VideoCard key={v.id} video={v} queue={favorites} />
          ))}
        </div>
      )}
    </div>
  )
}
