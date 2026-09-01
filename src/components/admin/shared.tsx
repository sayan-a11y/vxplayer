'use client'

// Shared building blocks for admin views: chart theme constants, stat cards,
// state widgets, badges and tiny utils. All admin views consume these so the
// look stays consistent across the console.

import type { CSSProperties, ReactNode } from 'react'
import {
  AlertTriangle,
  Lock,
  LogIn,
  LogOut,
  Megaphone,
  RefreshCcw,
  RefreshCw,
  ScrollText,
  Settings2,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { AdPlacement, AdminRole } from '@/lib/types'
import { cn } from '@/lib/utils'

// ── Recharts dark theme ─────────────────────────────────────────────────────

export const CHART_COLORS = ['#8b5cf6', '#ec4899', '#22d3ee', '#f59e0b', '#34d399'] as const

export const GRID_STROKE = 'rgba(255,255,255,0.06)'

export const AXIS_TICK = { fill: 'rgba(235,235,255,0.55)', fontSize: 12 } as const

export const TOOLTIP_STYLE: CSSProperties = {
  background: '#12122a',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 12,
  fontSize: 12,
  color: '#e9e9ff',
}

export const TOOLTIP_ITEM = { color: '#e9e9ff' }

export const TOOLTIP_LABEL = { color: 'rgba(235,235,255,0.65)', marginBottom: 4 }

export const CURSOR_FILL = { fill: 'rgba(255,255,255,0.05)' }

// ── Cards / states ──────────────────────────────────────────────────────────

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  accent,
  danger,
}: {
  icon: LucideIcon
  label: string
  value: string | number
  hint?: string
  accent?: boolean
  danger?: boolean
}) {
  // inline tint: vx-card's unlayered background/border would beat utilities
  const tint: CSSProperties | undefined = danger
    ? { borderColor: 'rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)' }
    : accent
      ? { borderColor: 'rgba(139,92,246,0.3)', background: 'rgba(139,92,246,0.055)' }
      : undefined
  return (
    <div className="vx-card p-4" style={tint}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs text-white/50">{label}</span>
        <Icon
          className={cn('h-4 w-4 shrink-0', danger ? 'text-red-400/80' : accent ? 'text-violet-400/90' : 'text-white/35')}
        />
      </div>
      <div className="mt-2 text-xl font-semibold tabular-nums text-white">{value}</div>
      {hint ? <div className="mt-0.5 truncate text-[11px] text-white/35">{hint}</div> : null}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="vx-card flex flex-col items-center gap-3 p-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
        <AlertTriangle className="h-6 w-6 text-red-400" />
      </div>
      <p className="max-w-sm text-sm text-white/65">{message}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-1">
          <RefreshCw className="mr-2 h-4 w-4" /> Retry
        </Button>
      ) : null}
    </div>
  )
}

import React from 'react'

export class AdminErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Admin view runtime error caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorState
          message="Failed to render this section. Please click retry."
          onRetry={() => this.setState({ hasError: false, error: null })}
        />
      )
    }
    return this.props.children
  }
}

export function EmptyState({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.04]">
        <Icon className="h-6 w-6 text-white/30" />
      </div>
      <p className="text-sm font-medium text-white/70">{title}</p>
      {hint ? <p className="max-w-sm text-xs text-white/40">{hint}</p> : null}
    </div>
  )
}

export function LoadingCards({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid gap-4', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-[84px] rounded-2xl" />
      ))}
    </div>
  )
}

export function LoadingBlock({ className }: { className?: string }) {
  return <Skeleton className={cn('h-[280px] rounded-2xl', className)} />
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-white">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-white/45">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function LockNote({ role }: { role?: AdminRole }) {
  return (
    <div className="vx-card flex flex-col items-center gap-3 p-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10">
        <Lock className="h-6 w-6 text-amber-400" />
      </div>
      <p className="text-sm font-medium text-white/80">Access restricted</p>
      <p className="max-w-sm text-xs text-white/45">
        Your role{role ? ` (${role.replace('_', ' ').toLowerCase()})` : ''} does not have permission to view or change
        this section. Ask a Super Admin if you believe this is a mistake.
      </p>
    </div>
  )
}

// ── Badges ──────────────────────────────────────────────────────────────────

const ROLE_BADGE: Record<AdminRole, { label: string; className: string }> = {
  SUPER_ADMIN: { label: 'Super Admin', className: 'border-violet-500/40 bg-violet-500/15 text-violet-300' },
  ADMIN: { label: 'Admin', className: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300' },
  AD_MANAGER: { label: 'Ad Manager', className: 'border-amber-500/40 bg-amber-500/15 text-amber-300' },
  VIEWER: { label: 'Viewer', className: 'border-white/15 bg-white/5 text-white/60' },
}

export function RoleBadge({ role }: { role: AdminRole }) {
  const meta = ROLE_BADGE[role] ?? ROLE_BADGE.VIEWER
  return (
    <Badge variant="outline" className={meta.className}>
      {meta.label}
    </Badge>
  )
}

const STATUS_BADGE: Record<'ACTIVE' | 'PAUSED' | 'EXPIRED' | 'DRAFT', string> = {
  ACTIVE: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
  PAUSED: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
  EXPIRED: 'border-white/15 bg-white/5 text-white/50',
  DRAFT: 'border-slate-500/40 bg-slate-500/15 text-slate-300',
}

export function CampaignStatusBadge({ status }: { status: 'ACTIVE' | 'PAUSED' | 'EXPIRED' | 'DRAFT' }) {
  return (
    <Badge variant="outline" className={STATUS_BADGE[status]}>
      {status}
    </Badge>
  )
}

const PRIORITY_BADGE: Record<'HIGH' | 'MEDIUM' | 'LOW', string> = {
  HIGH: 'border-red-500/40 bg-red-500/15 text-red-300',
  MEDIUM: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
  LOW: 'border-white/15 bg-white/5 text-white/50',
}

export function PriorityBadge({ priority }: { priority: 'HIGH' | 'MEDIUM' | 'LOW' }) {
  return (
    <Badge variant="outline" className={PRIORITY_BADGE[priority]}>
      {priority}
    </Badge>
  )
}

const CREATIVE_TYPE_BADGE: Record<'VIDEO' | 'IMAGE' | 'OVERLAY' | 'BANNER' | 'TEXT', string> = {
  VIDEO: 'border-violet-500/40 bg-violet-500/15 text-violet-300',
  IMAGE: 'border-pink-500/40 bg-pink-500/15 text-pink-300',
  OVERLAY: 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300',
  BANNER: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
  TEXT: 'border-white/15 bg-white/5 text-white/60',
}

export function CreativeTypeBadge({ type }: { type: 'VIDEO' | 'IMAGE' | 'OVERLAY' | 'BANNER' | 'TEXT' }) {
  return (
    <Badge variant="outline" className={CREATIVE_TYPE_BADGE[type]}>
      {type}
    </Badge>
  )
}

// ── Audit action mapping (Dashboard recent activity + Audit view) ───────────

export function actionMeta(action: string): { icon: LucideIcon; className: string } {
  if (action === 'LOGIN') return { icon: LogIn, className: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300' }
  if (action === 'LOGOUT') return { icon: LogOut, className: 'border-white/15 bg-white/5 text-white/50' }
  if (action.startsWith('CAMPAIGN')) return { icon: Megaphone, className: 'border-violet-500/40 bg-violet-500/15 text-violet-300' }
  if (action.startsWith('ADS')) return { icon: Zap, className: 'border-red-500/40 bg-red-500/15 text-red-300' }
  if (action.startsWith('SETTINGS')) return { icon: Settings2, className: 'border-amber-500/40 bg-amber-500/15 text-amber-300' }
  if (action.startsWith('CACHE')) return { icon: RefreshCcw, className: 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300' }
  return { icon: ScrollText, className: 'border-white/15 bg-white/5 text-white/50' }
}

// ── Placements / utils ──────────────────────────────────────────────────────

export const PLACEMENT_LABELS: Record<AdPlacement, string> = {
  PRE_ROLL: 'Pre-Roll',
  MID_ROLL: 'Mid-Roll',
  POST_ROLL: 'Post-Roll',
  OVERLAY: 'Overlay',
  BANNER: 'Banner',
  FOOTER: 'Footer',
}

export const ALL_PLACEMENTS: AdPlacement[] = [
  'PRE_ROLL',
  'MID_ROLL',
  'POST_ROLL',
  'OVERLAY',
  'BANNER',
  'FOOTER',
]

/** '2026-01-05' | ISO → '05 Jan' */
export function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

export function ratePct(part: number, total: number): number {
  if (!total || !Number.isFinite(total)) return 0
  return Math.min(100, Math.round((part / total) * 1000) / 10)
}

/** Client-side CSV export (Blob + programmatic anchor click). */
export function downloadCsv(filename: string, rows: Record<string, string | number>[]): void {
  if (!rows.length) {
    return
  }
  const headers = Object.keys(rows[0])
  const escape = (v: string | number) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
