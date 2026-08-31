'use client'

/**
 * Floating upload tray — shows live per-file progress while videos are
 * imported from device storage. Sits above the mobile bottom nav and
 * renders nothing when there is no import activity.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Loader2, TriangleAlert, X } from 'lucide-react'

import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'

export function UploadTray() {
  const uploads = useAppStore((s) => s.uploads)
  const removeUpload = useAppStore((s) => s.removeUpload)

  if (uploads.length === 0) return null

  const doneCount = uploads.filter((u) => u.status === 'done').length

  return (
    <div
      className="fixed bottom-20 right-3 z-40 w-[min(320px,calc(100vw-1.5rem))] md:bottom-6 md:right-6"
      role="status"
      aria-label="Importing videos"
    >
      <AnimatePresence initial={false}>
        <motion.div
          key="tray"
          initial={{ opacity: 0, y: 14, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 14, scale: 0.97 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="vx-card overflow-hidden p-0 shadow-2xl shadow-black/50"
        >
          <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-3.5 py-2.5">
            <p className="text-xs font-semibold tracking-tight">
              Importing videos
              <span className="ml-2 text-[10px] font-medium tabular-nums text-muted-foreground">
                {doneCount}/{uploads.length}
              </span>
            </p>
          </div>
          <div className="vx-scroll max-h-56 space-y-2.5 overflow-y-auto p-3">
            {uploads.map((u) => (
              <div key={u.id} className="min-w-0">
                <div className="flex items-center gap-2">
                  {u.status === 'uploading' && (
                    <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
                      <span className="absolute size-4 rounded-full border-2 border-[var(--vx-accent)]/25 border-t-[var(--vx-accent)] animate-spin" />
                    </span>
                  )}
                  {u.status === 'processing' && <Loader2 className="size-4 shrink-0 animate-spin text-[var(--vx-accent-soft)]" />}
                  {u.status === 'done' && <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />}
                  {u.status === 'error' && <TriangleAlert className="size-4 shrink-0 text-red-400" />}
                  <p className="min-w-0 flex-1 truncate text-xs font-medium">{u.name}</p>
                  {u.status === 'error' && (
                    <button
                      type="button"
                      onClick={() => removeUpload(u.id)}
                      aria-label="Dismiss"
                      className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
                {u.status === 'error' ? (
                  <p className="mt-0.5 pl-6 text-[11px] leading-snug text-red-300/90">{u.error}</p>
                ) : (
                  <div className="mt-1.5 ml-6 h-1 overflow-hidden rounded-full bg-white/10">
                    <div
                      className={cn(
                        'h-full rounded-full transition-[width] duration-200',
                        u.status === 'done' ? 'bg-emerald-400' : 'bg-[var(--vx-accent)]',
                      )}
                      style={{ width: `${u.pct}%` }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

export default UploadTray
