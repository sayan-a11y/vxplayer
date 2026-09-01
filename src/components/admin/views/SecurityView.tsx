'use client'

// Security — posture checklist and the role × capability permission matrix.
// Read-only informational view.

import { Check, ShieldCheck, X } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageHeader } from '../shared'

const POSTURE: { title: string; desc: string }[] = [
  { title: 'Two-factor authentication', desc: 'Every admin login requires a 6-digit 2FA code; the demo code is surfaced by the API in demo mode.' },
  { title: 'Password hashing', desc: 'Bcrypt-grade one-way password hashing (HMAC-SHA512 demo implementation, salts per user).' },
  { title: 'Rate limiting', desc: '5 login attempts per 5 minutes per email — further attempts receive HTTP 429.' },
  { title: 'Role-based access control', desc: 'Four roles (Super Admin, Admin, Ad Manager, Viewer) enforced client-side and server-side.' },
  { title: 'Audit logging', desc: 'Every mutation, login and kill-switch change is written to the audit log with admin identity.' },
  { title: 'HTTPS / TLS transport', desc: 'All traffic is served over encrypted TLS; tokens never travel in plain text.' },
  { title: 'Token expiry — 12h', desc: 'Admin session tokens are HMAC-signed and expire after 12 hours; 401 forces re-login.' },
  { title: 'No secrets in APK', desc: 'Ad keys and admin secrets live server-side only; the client bundle ships zero credentials.' },
]

const MATRIX: { feature: string; allowed: [boolean, boolean, boolean, boolean] }[] = [
  { feature: 'Dashboard & analytics (view)', allowed: [true, true, true, true] },
  { feature: 'Admin users management', allowed: [true, true, false, false] },
  { feature: 'Campaign management (create/edit/delete)', allowed: [true, true, true, false] },
  { feature: 'App settings & kill switches', allowed: [true, true, false, false] },
  { feature: 'Security administration', allowed: [true, true, false, false] },
]

const ROLE_COLS = ['Super Admin', 'Admin', 'Ad Manager', 'Viewer'] as const

function CheckCell({ ok }: { ok: boolean }) {
  return ok ? (
    <Check className="mx-auto h-4 w-4 text-emerald-400" aria-label="Allowed" />
  ) : (
    <X className="mx-auto h-4 w-4 text-red-400/70" aria-label="Not allowed" />
  )
}

export default function SecurityView() {
  return (
    <div className="space-y-6">
      <PageHeader title="Security" description="Security posture & permission matrix (read-only)" />

      {/* Posture grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {POSTURE.map((p) => (
          <div key={p.title} className="vx-card p-4">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-500/25 bg-emerald-500/10">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
              </span>
              <h3 className="text-sm font-medium leading-tight text-white/85">{p.title}</h3>
            </div>
            <p className="mt-2.5 text-xs leading-relaxed text-white/45">{p.desc}</p>
          </div>
        ))}
      </div>

      {/* Permission matrix */}
      <div className="vx-card overflow-hidden p-0">
        <div className="border-b border-white/[0.07] px-5 py-3.5">
          <h3 className="text-sm font-medium text-white/80">Role permission matrix</h3>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-white/[0.07] hover:bg-transparent">
                <TableHead className="text-white/45">Capability</TableHead>
                {ROLE_COLS.map((r) => (
                  <TableHead key={r} className="text-center text-white/45">{r}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {MATRIX.map((row) => (
                <TableRow key={row.feature} className="border-white/[0.06]">
                  <TableCell className="text-white/75">{row.feature}</TableCell>
                  {row.allowed.map((ok, i) => (
                    <TableCell key={i} className="text-center">
                      <CheckCell ok={ok} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="border-t border-white/[0.07] px-5 py-3 text-xs text-white/35">
          The Security page itself is visible to all signed-in admins (read-only). Matrix rows describe who can
          <em> change</em> things; VIEWER has read-only access across dashboards.
        </p>
      </div>
    </div>
  )
}
