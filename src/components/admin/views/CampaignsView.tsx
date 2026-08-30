'use client'

// Campaigns — full CRUD table with dialog form (0..3 creatives per campaign),
// pause/resume, delete confirmation. VIEWER gets a read-only table.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Megaphone, MoreHorizontal, Pause, Pencil, Play, Plus, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/lib/store'
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
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCompact, formatDate } from '@/lib/format'
import type { AdPlacement, CampaignDTO, CreativeDTO } from '@/lib/types'
import { adminDelete, adminGet, adminPatch, adminPost, can, useAdminSession } from '../session'
import {
  ALL_PLACEMENTS,
  CampaignStatusBadge,
  EmptyState,
  ErrorState,
  LoadingBlock,
  PageHeader,
  PLACEMENT_LABELS,
  PriorityBadge,
} from '../shared'

type CreativeForm = {
  name: string
  type: CreativeDTO['type']
  mediaUrl: string
  duration: number
  skipAfter: number
  position: 'TOP' | 'BOTTOM' | 'CENTER' | 'NONE'
  headline: string
  bodyText: string
  ctaText: string
  ctaUrl: string
}

type CampaignForm = {
  name: string
  advertiser: string
  status: CampaignDTO['status']
  startAt: string
  endAt: string
  priority: CampaignDTO['priority']
  frequencyCap: number
  placements: AdPlacement[]
  creatives: CreativeForm[]
}

const EMPTY_CREATIVE: CreativeForm = {
  name: '',
  type: 'VIDEO',
  mediaUrl: '',
  duration: 15,
  skipAfter: 5,
  position: 'NONE',
  headline: '',
  bodyText: '',
  ctaText: '',
  ctaUrl: '',
}

function isoDay(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

function emptyForm(): CampaignForm {
  return {
    name: '',
    advertiser: '',
    status: 'DRAFT',
    startAt: isoDay(0),
    endAt: isoDay(30),
    priority: 'MEDIUM',
    frequencyCap: 2,
    placements: ['PRE_ROLL'],
    creatives: [],
  }
}

function formFromCampaign(c: CampaignDTO): CampaignForm {
  return {
    name: c.name,
    advertiser: c.advertiser,
    status: c.status,
    startAt: c.startAt.slice(0, 10),
    endAt: c.endAt.slice(0, 10),
    priority: c.priority,
    frequencyCap: c.frequencyCap,
    placements: [...c.placements],
    creatives: c.creatives.map((cr) => ({
      name: cr.name,
      type: cr.type,
      mediaUrl: cr.mediaUrl ?? '',
      duration: cr.duration,
      skipAfter: cr.skipAfter,
      position: cr.position ?? 'NONE',
      headline: cr.headline ?? '',
      bodyText: cr.bodyText ?? '',
      ctaText: cr.ctaText ?? '',
      ctaUrl: cr.ctaUrl ?? '',
    })),
  }
}

export default function CampaignsView() {
  const session = useAdminSession()
  const canMutate = can(session.role, 'campaigns')

  const [campaigns, setCampaigns] = useState<CampaignDTO[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<CampaignDTO | null>(null)
  const [form, setForm] = useState<CampaignForm>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [toDelete, setToDelete] = useState<CampaignDTO | null>(null)
  const [mediaUpload, setMediaUpload] = useState<{ idx: number; pct: number } | null>(null)
  const uploadInputRefs = useRef<Record<number, HTMLInputElement | null>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await adminGet<{ campaigns: CampaignDTO[] }>('/api/admin/campaigns')
      setCampaigns(data.campaigns)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load campaigns')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function openNew() {
    setEditing(null)
    setForm(emptyForm())
    setOpen(true)
  }

  function openEdit(c: CampaignDTO) {
    setEditing(c)
    setForm(formFromCampaign(c))
    setOpen(true)
  }

  function togglePlacement(p: AdPlacement) {
    setForm((f) => ({
      ...f,
      placements: f.placements.includes(p) ? f.placements.filter((x) => x !== p) : [...f.placements, p],
    }))
  }

  function updateCreative(idx: number, patch: Partial<CreativeForm>) {
    setForm((f) => ({
      ...f,
      creatives: f.creatives.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    }))
  }

  /** Upload a creative asset (video/image from device storage) with progress. */
  function uploadCreativeMedia(idx: number, file: File) {
    const token = useAppStore.getState().adminToken
    const xhr = new XMLHttpRequest()
    setMediaUpload({ idx, pct: 0 })
    xhr.open('POST', `/api/admin/creatives/upload?name=${encodeURIComponent(file.name)}`)
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setMediaUpload({ idx, pct: Math.round((e.loaded / e.total) * 100) })
    }
    xhr.onload = () => {
      setMediaUpload(null)
      try {
        const body = JSON.parse(xhr.responseText) as {
          url?: string
          kind?: string
          duration?: number | null
          error?: string
        }
        if (xhr.status >= 200 && xhr.status < 300 && body.url) {
          const patch: Partial<CreativeForm> = { mediaUrl: body.url }
          if (body.kind === 'video' && typeof body.duration === 'number' && body.duration > 0) {
            patch.duration = body.duration
          }
          const autoName = file.name.replace(/\.[^.]+$/, '').replace(/[._]+/g, ' ').trim()
          setForm((f) => ({
            ...f,
            creatives: f.creatives.map((c, i) =>
              i === idx
                ? { ...c, ...patch, name: c.name.trim() ? c.name : autoName || c.name }
                : c,
            ),
          }))
          toast.success(`Media uploaded${body.kind === 'video' && body.duration ? ` · ${body.duration}s detected` : ''}`)
        } else {
          toast.error(body.error || 'Upload failed')
        }
      } catch {
        toast.error('Upload failed')
      }
    }
    xhr.onerror = () => {
      setMediaUpload(null)
      toast.error('Network error during upload')
    }
    xhr.send(file)
  }

  async function save() {
    if (!form.name.trim() || !form.advertiser.trim()) {
      toast.error('Campaign name and advertiser are required.')
      return
    }
    if (!form.startAt || !form.endAt) {
      toast.error('Start and end dates are required.')
      return
    }
    if (!form.placements.length) {
      toast.error('Pick at least one placement.')
      return
    }
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      advertiser: form.advertiser.trim(),
      status: form.status,
      priority: form.priority,
      frequencyCap: Number(form.frequencyCap) || 0,
      startAt: new Date(`${form.startAt}T00:00:00`).toISOString(),
      endAt: new Date(`${form.endAt}T23:59:59`).toISOString(),
      placements: form.placements,
      creatives: form.creatives.map((c) => ({
        name: c.name.trim(),
        type: c.type,
        mediaUrl: c.mediaUrl.trim() || null,
        duration: Number(c.duration) || 0,
        skipAfter: Number.isFinite(c.skipAfter) ? c.skipAfter : -1,
        position: c.position === 'NONE' ? null : c.position,
        headline: c.headline.trim() || null,
        bodyText: c.bodyText.trim() || null,
        ctaText: c.ctaText.trim() || null,
        ctaUrl: c.ctaUrl.trim() || null,
      })),
    }
    try {
      if (editing) {
        await adminPatch(`/api/admin/campaigns/${editing.id}`, payload)
        toast.success(`Campaign "${payload.name}" updated`)
      } else {
        await adminPost('/api/admin/campaigns', payload)
        toast.success(`Campaign "${payload.name}" created`)
      }
      setOpen(false)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save campaign')
    } finally {
      setSaving(false)
    }
  }

  async function toggleStatus(c: CampaignDTO) {
    try {
      const next = c.status === 'PAUSED' ? 'ACTIVE' : 'PAUSED'
      await adminPatch(`/api/admin/campaigns/${c.id}`, { status: next })
      toast.success(next === 'PAUSED' ? `Campaign "${c.name}" paused` : `Campaign "${c.name}" resumed`)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update campaign')
    }
  }

  async function confirmDelete() {
    if (!toDelete) return
    try {
      await adminDelete(`/api/admin/campaigns/${toDelete.id}`)
      toast.success(`Campaign "${toDelete.name}" deleted`)
      setToDelete(null)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete campaign')
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campaigns"
        description={canMutate ? 'Create, edit and control ad campaigns' : 'Read-only view — your role cannot manage campaigns'}
        actions={
          canMutate ? (
            <Button onClick={openNew} className="vx-btn-accent h-10 rounded-xl font-medium">
              <Plus className="mr-2 h-4 w-4" /> New campaign
            </Button>
          ) : null
        }
      />

      <div className="vx-card overflow-hidden p-0">
        {loading ? (
          <div className="p-5">
            <LoadingBlock className="h-[360px]" />
          </div>
        ) : error || !campaigns ? (
          <ErrorState message={error ?? 'No campaign data available.'} onRetry={() => void load()} />
        ) : campaigns.length === 0 ? (
          <EmptyState icon={Megaphone} title="No campaigns yet" hint="Create your first campaign to start serving ads." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-white/[0.07] hover:bg-transparent">
                  <TableHead className="text-white/45">Name</TableHead>
                  <TableHead className="text-white/45">Advertiser</TableHead>
                  <TableHead className="text-white/45">Status</TableHead>
                  <TableHead className="text-white/45">Priority</TableHead>
                  <TableHead className="text-white/45">Placements</TableHead>
                  <TableHead className="text-white/45">Schedule</TableHead>
                  <TableHead className="text-white/45">Freq cap</TableHead>
                  <TableHead className="text-right text-white/45">Impr.</TableHead>
                  <TableHead className="text-white/45">Completion</TableHead>
                  {canMutate ? (
                    <TableHead className="w-12 text-white/45">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((c) => {
                  const rate = c.stats?.completionRate ?? 0
                  return (
                    <TableRow key={c.id} className="border-white/[0.06]">
                      <TableCell>
                        <p className="max-w-[200px] truncate text-sm font-medium text-white/85">{c.name}</p>
                        <p className="text-[11px] text-white/35">{c.creatives.length} creative{c.creatives.length === 1 ? '' : 's'}</p>
                      </TableCell>
                      <TableCell className="max-w-[140px] truncate text-white/65">{c.advertiser}</TableCell>
                      <TableCell>
                        <CampaignStatusBadge status={c.status} />
                      </TableCell>
                      <TableCell>
                        <PriorityBadge priority={c.priority} />
                      </TableCell>
                      <TableCell>
                        <div className="flex max-w-[190px] flex-wrap gap-1">
                          {c.placements.map((p) => (
                            <span key={p} className="vx-chip">
                              {PLACEMENT_LABELS[p]}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs tabular-nums text-white/55">
                        {formatDate(c.startAt)} – {formatDate(c.endAt)}
                      </TableCell>
                      <TableCell className="tabular-nums text-white/65">{c.frequencyCap}/session</TableCell>
                      <TableCell className="text-right tabular-nums text-white/80">{formatCompact(c.stats?.impressions ?? 0)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={Math.min(100, rate)} className="h-1.5 w-16" />
                          <span className="text-xs tabular-nums text-white/55">{rate}%</span>
                        </div>
                      </TableCell>
                      {canMutate ? (
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label={`Actions for ${c.name}`} className="h-8 w-8 text-white/50">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="border-white/10 bg-[#12122a]">
                              <DropdownMenuItem onClick={() => openEdit(c)}>
                                <Pencil className="mr-2 h-4 w-4" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => void toggleStatus(c)}>
                                {c.status === 'PAUSED' ? (
                                  <>
                                    <Play className="mr-2 h-4 w-4" /> Resume
                                  </>
                                ) : (
                                  <>
                                    <Pause className="mr-2 h-4 w-4" /> Pause
                                  </>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator className="bg-white/10" />
                              <DropdownMenuItem onClick={() => setToDelete(c)} className="text-red-300 focus:text-red-300">
                                <Trash2 className="mr-2 h-4 w-4" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Create / edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="vx-scroll max-h-[85vh] max-w-2xl overflow-y-auto border-white/10 bg-[#0b0b1e]">
          <DialogHeader>
            <DialogTitle className="text-white">{editing ? 'Edit campaign' : 'New campaign'}</DialogTitle>
            <DialogDescription className="text-white/45">
              Configure targeting, flight dates and up to 3 creatives. Changes are audit-logged.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-white/70">Name</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Summer Splash Promo" className="border-white/10 bg-white/[0.04] text-white" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/70">Advertiser</Label>
              <Input value={form.advertiser} onChange={(e) => setForm((f) => ({ ...f, advertiser: e.target.value }))} placeholder="Acme Corp" className="border-white/10 bg-white/[0.04] text-white" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/70">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as CampaignForm['status'] }))}>
                <SelectTrigger className="border-white/10 bg-white/[0.04] text-white"><SelectValue /></SelectTrigger>
                <SelectContent className="border-white/10 bg-[#12122a] text-white">
                  {(['ACTIVE', 'PAUSED', 'EXPIRED', 'DRAFT'] as const).map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/70">Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v as CampaignForm['priority'] }))}>
                <SelectTrigger className="border-white/10 bg-white/[0.04] text-white"><SelectValue /></SelectTrigger>
                <SelectContent className="border-white/10 bg-[#12122a] text-white">
                  {(['HIGH', 'MEDIUM', 'LOW'] as const).map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-start" className="text-white/70">Start date</Label>
              <Input id="c-start" type="date" value={form.startAt} onChange={(e) => setForm((f) => ({ ...f, startAt: e.target.value }))} className="border-white/10 bg-white/[0.04] text-white [color-scheme:dark]" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-end" className="text-white/70">End date</Label>
              <Input id="c-end" type="date" value={form.endAt} onChange={(e) => setForm((f) => ({ ...f, endAt: e.target.value }))} className="border-white/10 bg-white/[0.04] text-white [color-scheme:dark]" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-freq" className="text-white/70">Frequency cap (per session)</Label>
              <Input id="c-freq" type="number" min={0} value={form.frequencyCap} onChange={(e) => setForm((f) => ({ ...f, frequencyCap: Number(e.target.value) }))} className="border-white/10 bg-white/[0.04] text-white" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-white/70">Placements</Label>
              <div className="flex flex-wrap gap-x-5 gap-y-2.5 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
                {ALL_PLACEMENTS.map((p) => (
                  <label key={p} className="flex cursor-pointer items-center gap-2 text-sm text-white/75">
                    <Checkbox checked={form.placements.includes(p)} onCheckedChange={() => togglePlacement(p)} />
                    {PLACEMENT_LABELS[p]}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Creatives */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-white/70">Creatives ({form.creatives.length}/3)</Label>
            </div>
            {form.creatives.map((cr, idx) => (
              <div key={idx} className="relative space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove creative ${idx + 1}`}
                  onClick={() => setForm((f) => ({ ...f, creatives: f.creatives.filter((_, i) => i !== idx) }))}
                  className="absolute right-2 top-2 h-7 w-7 text-white/40 hover:text-red-300"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-white/55">Creative name</Label>
                    <Input value={cr.name} onChange={(e) => updateCreative(idx, { name: e.target.value })} placeholder="15s teaser" className="h-8 border-white/10 bg-white/[0.04] text-sm text-white" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-white/55">Type</Label>
                    <Select value={cr.type} onValueChange={(v) => updateCreative(idx, { type: v as CreativeForm['type'] })}>
                      <SelectTrigger className="h-8 border-white/10 bg-white/[0.04] text-sm text-white"><SelectValue /></SelectTrigger>
                      <SelectContent className="border-white/10 bg-[#12122a] text-white">
                        {(['VIDEO', 'IMAGE', 'OVERLAY', 'BANNER', 'TEXT'] as const).map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-white/55">Media — URL or upload</Label>
                    <div className="flex gap-1.5">
                      <Input
                        value={cr.mediaUrl}
                        onChange={(e) => updateCreative(idx, { mediaUrl: e.target.value })}
                        placeholder="https://cdn.example.com/ad.mp4"
                        className="h-8 min-w-0 border-white/10 bg-white/[0.04] text-sm text-white"
                      />
                      {cr.type !== 'TEXT' && (
                        <>
                          <input
                            ref={(el) => {
                              uploadInputRefs.current[idx] = el
                            }}
                            type="file"
                            accept={cr.type === 'VIDEO' ? 'video/*' : 'image/*'}
                            className="sr-only"
                            data-testid={`creative-upload-${idx}`}
                            tabIndex={-1}
                            title="Upload creative media from device"
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              e.target.value = ''
                              if (file) uploadCreativeMedia(idx, file)
                            }}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            disabled={mediaUpload?.idx === idx}
                            onClick={() => uploadInputRefs.current[idx]?.click()}
                            className="h-8 shrink-0 border-white/15 bg-white/[0.04] px-2.5 text-xs text-white/80 hover:bg-white/10 hover:text-white"
                          >
                            {mediaUpload?.idx === idx ? (
                              `${mediaUpload.pct}%`
                            ) : (
                              <>
                                <Upload className="mr-1 h-3.5 w-3.5" /> Upload
                              </>
                            )}
                          </Button>
                        </>
                      )}
                    </div>
                    {mediaUpload?.idx === idx && <Progress value={mediaUpload.pct} className="h-1" />}
                    {cr.mediaUrl && cr.type !== 'TEXT' && (
                      <div className="flex items-center gap-2 pt-0.5">
                        {cr.type === 'VIDEO' ? (
                          <video
                            src={cr.mediaUrl}
                            muted
                            preload="metadata"
                            className="h-14 w-24 rounded-md border border-white/10 bg-black object-cover"
                          />
                        ) : (
                          <img
                            src={cr.mediaUrl}
                            alt="Creative preview"
                            className="h-14 w-24 rounded-md border border-white/10 bg-black object-cover"
                          />
                        )}
                        <span className="text-[10px] text-white/35">
                          {cr.type === 'VIDEO' ? 'Video preview' : 'Image preview'}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-white/55">Duration (s)</Label>
                      <Input type="number" min={0} value={cr.duration} onChange={(e) => updateCreative(idx, { duration: Number(e.target.value) })} className="h-8 border-white/10 bg-white/[0.04] text-sm text-white" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-white/55">Skip after</Label>
                      <Input type="number" min={-1} value={cr.skipAfter} onChange={(e) => updateCreative(idx, { skipAfter: Number(e.target.value) })} className="h-8 border-white/10 bg-white/[0.04] text-sm text-white" />
                      <p className="text-[10px] text-white/30">-1 = non-skippable</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-white/55">Position</Label>
                      <Select value={cr.position} onValueChange={(v) => updateCreative(idx, { position: v as CreativeForm['position'] })}>
                        <SelectTrigger className="h-8 border-white/10 bg-white/[0.04] text-sm text-white"><SelectValue /></SelectTrigger>
                        <SelectContent className="border-white/10 bg-[#12122a] text-white">
                          {(['NONE', 'TOP', 'CENTER', 'BOTTOM'] as const).map((p) => (
                            <SelectItem key={p} value={p}>{p}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-white/55">Headline</Label>
                    <Input value={cr.headline} onChange={(e) => updateCreative(idx, { headline: e.target.value })} placeholder="Big summer sale" className="h-8 border-white/10 bg-white/[0.04] text-sm text-white" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-white/55">Body text</Label>
                    <Input value={cr.bodyText} onChange={(e) => updateCreative(idx, { bodyText: e.target.value })} placeholder="Up to 50% off everything" className="h-8 border-white/10 bg-white/[0.04] text-sm text-white" />
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:col-span-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-white/55">CTA text</Label>
                      <Input value={cr.ctaText} onChange={(e) => updateCreative(idx, { ctaText: e.target.value })} placeholder="Shop now" className="h-8 border-white/10 bg-white/[0.04] text-sm text-white" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-white/55">CTA URL</Label>
                      <Input value={cr.ctaUrl} onChange={(e) => updateCreative(idx, { ctaUrl: e.target.value })} placeholder="https://example.com/offer" className="h-8 border-white/10 bg-white/[0.04] text-sm text-white" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              disabled={form.creatives.length >= 3}
              onClick={() => setForm((f) => ({ ...f, creatives: [...f.creatives, { ...EMPTY_CREATIVE }] }))}
              className="h-10 w-full border-dashed border-white/15 bg-transparent text-white/60 hover:bg-white/5 hover:text-white"
            >
              <Plus className="mr-2 h-4 w-4" /> Add creative {form.creatives.length >= 3 ? '(max 3)' : ''}
            </Button>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} className="text-white/60 hover:text-white">
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={saving} className="vx-btn-accent rounded-xl font-medium">
              {editing ? 'Save changes' : 'Create campaign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={toDelete !== null} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent className="border-white/10 bg-[#0b0b1e]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete campaign?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/50">
              {toDelete ? `"${toDelete.name}" and its ${toDelete.creatives.length} creative(s) will be permanently removed. This action is audit-logged.` : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 bg-transparent text-white/70 hover:text-white">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()} className="bg-red-600 text-white hover:bg-red-500">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
