'use client'

// Ad Creatives — cross-campaign inventory of creative assets with delete.

import { useCallback, useEffect, useState } from 'react'
import { ImagePlay, Info, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDuration } from '@/lib/format'
import type { CreativeDTO } from '@/lib/types'
import { adminDelete, adminGet, can, useAdminSession } from '../session'
import { CreativeTypeBadge, EmptyState, ErrorState, LoadingBlock, PageHeader } from '../shared'

/** CreativeDTO joined with campaign info (server adds campaignName). */
type CreativeRow = CreativeDTO & { campaignName?: string | null }

function skipLabel(skipAfter: number): string {
  if (skipAfter === -1) return 'Non-skippable'
  if (skipAfter > 0) return `${skipAfter}s`
  return '—'
}

export default function CreativesView() {
  const session = useAdminSession()
  const canDelete = can(session?.role, 'campaigns')
  const [creatives, setCreatives] = useState<CreativeRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [target, setTarget] = useState<CreativeRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const data = await adminGet<{ creatives: CreativeRow[] }>('/api/admin/creatives')
      setCreatives(data.creatives ?? [])
    } catch {
      /* fallback */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function confirmDelete() {
    if (!target) return
    setDeleting(true)
    try {
      await adminDelete(`/api/admin/creatives/${target.id}`)
      setCreatives((prev) => (prev ? prev.filter((c) => c.id !== target.id) : prev))
      toast.success(`Creative deleted — ${target.name}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete creative')
    } finally {
      setDeleting(false)
      setTarget(null)
    }
  }

  const [previewCreative, setPreviewCreative] = useState<CreativeRow | null>(null)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ad Creatives"
        description="All creative assets across campaigns — preview, audit and delete"
        actions={
          <span className="vx-chip">
            <Info className="h-3.5 w-3.5" /> Manage creatives in Campaigns
          </span>
        }
      />

      <div className="vx-card overflow-hidden p-0">
        {loading ? (
          <div className="p-5">
            <LoadingBlock className="h-[360px]" />
          </div>
        ) : error || !creatives ? (
          <ErrorState message={error ?? 'No creative data available.'} onRetry={() => void load()} />
        ) : creatives.length === 0 ? (
          <EmptyState icon={ImagePlay} title="No creatives found" hint="Creatives are added from the Campaigns manager." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-white/[0.07] hover:bg-transparent">
                  <TableHead className="text-white/45">Media</TableHead>
                  <TableHead className="text-white/45">Name</TableHead>
                  <TableHead className="text-white/45">Campaign</TableHead>
                  <TableHead className="text-white/45">Type</TableHead>
                  <TableHead className="text-white/45">Duration</TableHead>
                  <TableHead className="text-white/45">Skip</TableHead>
                  <TableHead className="text-white/45">Position</TableHead>
                  <TableHead className="text-white/45">Headline</TableHead>
                  <TableHead className="text-white/45">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {creatives.map((c) => (
                  <TableRow key={c.id} className="border-white/[0.06]">
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => setPreviewCreative(c)}
                        aria-label={`Preview media of ${c.name}`}
                        className="transition hover:scale-105"
                      >
                        {c.mediaUrl ? (
                          c.type === 'VIDEO' ? (
                            <video
                              src={c.mediaUrl}
                              muted
                              preload="metadata"
                              className="h-9 w-16 rounded-md border border-white/10 bg-black object-cover"
                            />
                          ) : (
                            <img
                              src={c.mediaUrl}
                              alt={`Preview of ${c.name}`}
                              className="h-9 w-16 rounded-md border border-white/10 bg-black object-cover"
                            />
                          )
                        ) : (
                          <div className="flex h-9 w-16 items-center justify-center rounded-md border border-white/[0.07] bg-white/[0.03] text-[10px] text-white/30">
                            {c.type}
                          </div>
                        )}
                      </button>
                    </TableCell>
                    <TableCell>
                      <p className="max-w-[180px] truncate text-sm font-medium text-white/85">{c.name}</p>
                    </TableCell>
                    <TableCell className="max-w-[160px] truncate text-white/60">{c.campaignName ?? '—'}</TableCell>
                    <TableCell>
                      <CreativeTypeBadge type={c.type} />
                    </TableCell>
                    <TableCell className="tabular-nums text-white/70">{formatDuration(c.duration)}</TableCell>
                    <TableCell className="whitespace-nowrap text-white/70">{skipLabel(c.skipAfter)}</TableCell>
                    <TableCell className="text-white/60">{c.position ?? '—'}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-white/60">{c.headline ?? '—'}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setPreviewCreative(c)}
                          aria-label={`Preview creative ${c.name}`}
                          className="grid size-8 place-items-center rounded-lg border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/15 hover:text-white"
                        >
                          <ImagePlay className="size-3.5" />
                        </button>
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => setTarget(c)}
                            aria-label={`Delete creative ${c.name}`}
                            className="grid size-8 place-items-center rounded-lg border border-red-400/20 bg-red-400/10 text-red-300 transition hover:border-red-400/40 hover:bg-red-400/20 hover:text-red-200"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Creative Full Preview Modal */}
      <AlertDialog open={!!previewCreative} onOpenChange={(open) => !open && setPreviewCreative(null)}>
        <AlertDialogContent className="max-w-lg border-white/10 bg-[#0c0d22] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-bold text-white">
              {previewCreative?.name}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-white/50">
              Campaign: {previewCreative?.campaignName ?? 'Unassigned'} · Type: {previewCreative?.type}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3">
            <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-black flex items-center justify-center">
              {previewCreative?.mediaUrl ? (
                previewCreative.type === 'VIDEO' ? (
                  <video
                    src={previewCreative.mediaUrl}
                    controls
                    autoPlay
                    muted
                    playsInline
                    className="size-full object-contain"
                  />
                ) : (
                  <img
                    src={previewCreative.mediaUrl}
                    alt={previewCreative.name}
                    className="size-full object-contain"
                  />
                )
              ) : (
                <div className="p-4 text-center text-xs text-white/40">No media asset uploaded</div>
              )}
            </div>

            <div className="space-y-1.5 rounded-xl border border-white/10 bg-white/5 p-3 text-xs">
              <div className="flex justify-between">
                <span className="text-white/50">Headline:</span>
                <span className="font-semibold text-white">{previewCreative?.headline || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/50">Body Text:</span>
                <span className="text-white/80">{previewCreative?.bodyText || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/50">CTA:</span>
                <span className="text-violet-300 font-medium">
                  {previewCreative?.ctaText || 'Learn more'} ({previewCreative?.ctaUrl || '—'})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/50">Duration & Skip:</span>
                <span className="text-white/70">
                  {formatDuration(previewCreative?.duration ?? 0)} · Skip: {skipLabel(previewCreative?.skipAfter ?? 0)}
                </span>
              </div>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Close Preview</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!target} onOpenChange={(open) => !open && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete creative?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes <span className="font-semibold text-white/80">{target?.name}</span>
              {target?.campaignName ? (
                <>
                  {' '}from campaign <span className="font-semibold text-white/80">{target.campaignName}</span>
                </>
              ) : null}
              , deletes its media file and stops it from being served in any placement. Existing
              analytics stay in reports. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault()
                void confirmDelete()
              }}
              className="bg-red-500/90 text-white hover:bg-red-500"
            >
              {deleting ? 'Deleting…' : 'Delete creative'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
