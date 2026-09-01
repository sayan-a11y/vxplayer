'use client'

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { History as HistoryIcon, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { apiDelete, apiGet } from '@/lib/api'
import { formatDuration, timeAgo } from '@/lib/format'
import { useAppStore } from '@/lib/store'
import type { HistoryDTO } from '@/lib/types'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'

import { EmptyState, ErrorState } from './VideosView'

import { clearLocalHistory, getLocalHistory } from '@/lib/privateLibrary'

export function HistoryView() {
  const dataVersion = useAppStore((s) => s.dataVersion)
  const bumpData = useAppStore((s) => s.bumpData)
  const openPlayer = useAppStore((s) => s.openPlayer)

  const [history, setHistory] = useState<HistoryDTO[] | null>(null)
  const [error, setError] = useState(false)
  const [clearing, setClearing] = useState(false)

  const load = useCallback(async () => {
    setError(false)
    try {
      const list = await getLocalHistory()
      setHistory(list)
    } catch {
      setError(true)
      setHistory([])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, dataVersion])

  async function handleClear() {
    if (clearing) return
    setClearing(true)
    try {
      await clearLocalHistory()
      toast.success('History cleared')
      bumpData()
    } catch {
      toast.error('Could not clear history')
    } finally {
      setClearing(false)
    }
  }

  if (history === null && error) {
    return (
      <div className="px-4 py-6 md:px-6">
        <ErrorState onRetry={() => void load()} />
      </div>
    )
  }

  if (history === null) {
    return (
      <div className="px-4 py-6 md:px-6">
        <div className="mb-4 h-7 w-40 rounded bg-white/5" />
        <div className="flex flex-col gap-2.5">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[92px] w-full rounded-2xl" />
          ))}
        </div>
      </div>
    )
  }

  const queue = history.map((h) => h.video)

  return (
    <div className="px-4 py-4 md:px-6">
      <div className="mb-4 flex min-h-11 items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <HistoryIcon className="size-5 text-[var(--vx-accent-soft)]" />
          History
        </h1>
        {history.length > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                className="min-h-10 gap-2 rounded-xl text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" />
                Clear history
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear watch history?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes all resume points. Favorites and playlists are not affected.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => void handleClear()}
                  className="bg-destructive text-white hover:bg-destructive/90"
                >
                  Clear
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {history.length === 0 ? (
        <EmptyState
          icon={HistoryIcon}
          title="Nothing watched yet"
          hint="Videos you play will show up here so you can pick up where you left off."
        />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {history.map((h) => (
            <motion.li
              key={h.video.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
            >
              <button
                type="button"
                onClick={() => openPlayer(h.video, queue)}
                className="vx-card flex w-full items-center gap-3.5 p-3 text-left transition hover:border-[var(--vx-accent)]/40 hover:bg-white/[0.06]"
                aria-label={`Resume ${h.video.title}`}
              >
                <span className="relative aspect-video w-[120px] shrink-0 overflow-hidden rounded-lg bg-white/5">
                  <Image
                    src={h.video.thumbnailUrl}
                    alt={h.video.title}
                    fill
                    sizes="120px"
                    className="object-cover"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{h.video.title}</span>
                  <span className="mt-0.5 block text-xs tabular-nums text-muted-foreground">
                    {formatDuration(h.position)} / {formatDuration(h.video.duration)} • {h.watchedPct}% watched •{' '}
                    {timeAgo(h.lastPlayedAt)}
                  </span>
                  <Progress
                    value={h.watchedPct}
                    aria-label={`${h.watchedPct}% watched`}
                    className="mt-2 h-1 bg-white/10 [&_[data-slot=progress-indicator]]:bg-[var(--vx-accent)]"
                  />
                </span>
              </button>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  )
}
