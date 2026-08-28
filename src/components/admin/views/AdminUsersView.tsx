'use client'

// Admin Users — console accounts, roles and 2FA status (read-only demo) plus
// an RBAC explainer card. SUPER_ADMIN / ADMIN only (server enforces).

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, ShieldCheck, XCircle } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDateTime } from '@/lib/format'
import type { AdminUserDTO } from '@/lib/types'
import { adminGet, can, useAdminSession } from '../session'
import { ErrorState, LoadingBlock, LockNote, PageHeader, RoleBadge } from '../shared'

const ROLE_EXPLAIN: { role: string; badge: 'SUPER_ADMIN' | 'ADMIN' | 'AD_MANAGER' | 'VIEWER'; perms: string[] }[] = [
  {
    role: 'Super Admin',
    badge: 'SUPER_ADMIN',
    perms: ['Full access to every section', 'Emergency kill switches & settings', 'Manage admin users & roles'],
  },
  {
    role: 'Admin',
    badge: 'ADMIN',
    perms: ['Full operational access', 'Settings, campaigns, analytics', 'View admin users'],
  },
  {
    role: 'Ad Manager',
    badge: 'AD_MANAGER',
    perms: ['Campaigns, creatives & placements', 'Ads Manager & ad insights', 'No system sections (locked)'],
  },
  {
    role: 'Viewer',
    badge: 'VIEWER',
    perms: ['Read-only dashboards & reports', 'All mutations hidden + rejected', 'Cannot manage other admins'],
  },
]

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export default function AdminUsersView() {
  const session = useAdminSession()
  const allowed = can(session.role, 'settings')

  const [admins, setAdmins] = useState<AdminUserDTO[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await adminGet<{ admins: AdminUserDTO[] }>('/api/admin/users')
      setAdmins(data.admins)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load admin users')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (allowed) void load()
    else setLoading(false)
  }, [allowed, load])

  if (!allowed) {
    return (
      <div className="space-y-6">
        <PageHeader title="Admin Users" description="Console accounts & roles" />
        <LockNote role={session.role} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Admin Users" description="Console accounts, roles and 2FA status (read-only demo)" />

      <div className="vx-card overflow-hidden p-0">
        {loading ? (
          <div className="p-5">
            <LoadingBlock className="h-[280px]" />
          </div>
        ) : error || !admins ? (
          <ErrorState message={error ?? 'No admin data available.'} onRetry={() => void load()} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-white/[0.07] hover:bg-transparent">
                  <TableHead className="text-white/45">Admin</TableHead>
                  <TableHead className="text-white/45">Role</TableHead>
                  <TableHead className="text-white/45">2FA</TableHead>
                  <TableHead className="text-white/45">Last login</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {admins.map((a) => (
                  <TableRow key={a.id} className="border-white/[0.06]">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="vx-btn-accent flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                          {initials(a.name)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-white/85">{a.name}</p>
                          <p className="truncate text-xs text-white/40">{a.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <RoleBadge role={a.role} />
                    </TableCell>
                    <TableCell>
                      {a.twoFactor ? (
                        <span className="flex items-center gap-1.5 text-xs text-emerald-300">
                          <CheckCircle2 className="h-4 w-4" /> Enabled
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-xs text-white/40">
                          <XCircle className="h-4 w-4" /> Off
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs tabular-nums text-white/60">
                      {a.lastLoginAt ? formatDateTime(a.lastLoginAt) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* RBAC explainer */}
      <div className="vx-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-violet-300" />
          <h3 className="text-sm font-medium text-white/80">Role hierarchy & permissions</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {ROLE_EXPLAIN.map((r) => (
            <div key={r.badge} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <RoleBadge role={r.badge} />
              <ul className="mt-3 space-y-1.5">
                {r.perms.map((p) => (
                  <li key={p} className="flex items-start gap-1.5 text-xs leading-relaxed text-white/55">
                    <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400/80" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-white/35">
          This demo is read-only — new accounts are seeded server-side. All role rules are enforced again by the API for
          every request.
        </p>
      </div>
    </div>
  )
}
