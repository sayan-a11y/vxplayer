'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, SearchX, X } from 'lucide-react'

import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

import { EmptyState, ErrorState, VideoGridSkeleton, useVideos } from './VideosView'
import { VideoCard } from './VideoCard'

type ResFilter = 'all' | '1080p' | '720p' | '480p'
type DurBucket = 'any' | 'lt1' | '1to15' | 'gt15'
type SizeBucket = 'any' | 'lt100' | 'gt500'

const RES_OPTIONS: { value: ResFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: '1080p', label: '1080p' },
  { value: '720p', label: '720p' },
  { value: '480p', label: '480p' },
]

const DUR_OPTIONS: { value: DurBucket; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'lt1', label: '< 1 min' },
  { value: '1to15', label: '1–15 min' },
  { value: 'gt15', label: '> 15 min' },
]

const SIZE_OPTIONS: { value: SizeBucket; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'lt100', label: '< 100 MB' },
  { value: 'gt500', label: '> 500 MB' },
]

function ChipGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              'vx-chip min-h-10 px-3.5 transition',
              value === o.value
                ? 'border-[var(--vx-accent)]/60 bg-[var(--vx-accent)]/15 font-medium text-[var(--vx-accent-soft)]'
                : 'hover:text-foreground'
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function SearchView() {
  const { videos, error, reload } = useVideos()
  const setSearchQuery = useAppStore((s) => s.setSearchQuery)

  const [q, setQ] = useState('')
  const [res, setRes] = useState<ResFilter>('all')
  const [dur, setDur] = useState<DurBucket>('any')
  const [size, setSize] = useState<SizeBucket>('any')
  const [folder, setFolder] = useState('all')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const folders = useMemo(
    () => (videos ? Array.from(new Set(videos.map((v) => v.folder))).sort((a, b) => a.localeCompare(b)) : []),
    [videos]
  )

  const results = useMemo(() => {
    if (!videos) return []
    const needle = q.trim().toLowerCase()
    return videos.filter((v) => {
      if (needle && ![v.title, v.folder, v.fileName].some((s) => s.toLowerCase().includes(needle))) return false
      if (res !== 'all' && v.resolutionLabel !== res) return false
      if (dur === 'lt1' && v.duration >= 60) return false
      if (dur === '1to15' && (v.duration < 60 || v.duration > 900)) return false
      if (dur === 'gt15' && v.duration <= 900) return false
      if (size === 'lt100' && v.sizeMB >= 100) return false
      if (size === 'gt500' && v.sizeMB <= 500) return false
      if (folder !== 'all' && v.folder !== folder) return false
      return true
    })
  }, [videos, q, res, dur, size, folder])

  const hasFilters = q.trim() !== '' || res !== 'all' || dur !== 'any' || size !== 'any' || folder !== 'all'

  function handleQuery(value: string) {
    setQ(value)
    setSearchQuery(value)
  }

  function resetFilters() {
    setQ('')
    setSearchQuery('')
    setRes('all')
    setDur('any')
    setSize('any')
    setFolder('all')
  }

  if (videos === null && error) {
    return (
      <div className="px-4 py-6 md:px-6">
        <ErrorState onRetry={() => void reload()} />
      </div>
    )
  }

  return (
    <div className="px-4 py-4 md:px-6">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={q}
          onChange={(e) => handleQuery(e.target.value)}
          placeholder="Search videos, folders, file names…"
          aria-label="Search videos"
          className="min-h-11 rounded-xl border-white/10 bg-white/5 pl-10 text-sm"
        />
      </div>

      <div className="mt-4 flex flex-col gap-3.5">
        <ChipGroup label="Resolution" value={res} options={RES_OPTIONS} onChange={setRes} />
        <ChipGroup label="Duration" value={dur} options={DUR_OPTIONS} onChange={setDur} />
        <ChipGroup label="Size" value={size} options={SIZE_OPTIONS} onChange={setSize} />
        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Folder</p>
          <Select value={folder} onValueChange={setFolder}>
            <SelectTrigger className="min-h-10 w-full sm:w-56" aria-label="Filter by folder">
              <SelectValue placeholder="All folders" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All folders</SelectItem>
              {folders.map((f) => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-5 flex min-h-9 items-center justify-between gap-3">
        <p className="text-xs tabular-nums text-muted-foreground">
          {results.length} result{results.length === 1 ? '' : 's'}
          {q.trim() ? ` for “${q.trim()}”` : ''}
        </p>
        {hasFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted-foreground transition hover:text-[var(--vx-accent-soft)]"
          >
            <X className="size-3.5" />
            Reset filters
          </button>
        )}
      </div>

      {videos === null ? (
        <VideoGridSkeleton count={4} />
      ) : results.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No matches"
          hint="Try different keywords or clear some filters."
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {results.map((v) => (
            <VideoCard key={v.id} video={v} queue={results} />
          ))}
        </div>
      )}
    </div>
  )
}
