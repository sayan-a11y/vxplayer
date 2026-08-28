'use client'

// Admin shell: desktop gate, sidebar navigation, RBAC-driven visibility,
// topbar and section switching. Renders one of the 13 views.

import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  BarChart3,
  FileText,
  Film,
  ImagePlay,
  Layers,
  LayoutDashboard,
  Lock,
  LogOut,
  Megaphone,
  Monitor,
  ScrollText,
  Settings,
  ShieldCheck,
  Target,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/lib/store'
import type { AdminRole } from '@/lib/types'
import { cn } from '@/lib/utils'
import { adminPost, can, clearAdminSession, useAdminSession, type AdminSection } from './session'
import { LockNote, RoleBadge } from './shared'
import DashboardView from './views/DashboardView'
import UsersView from './views/UsersView'
import VideosView from './views/VideosView'
import AdsManagerView from './views/AdsManagerView'
import CampaignsView from './views/CampaignsView'
import CreativesView from './views/CreativesView'
import PlacementsView from './views/PlacementsView'
import AnalyticsView from './views/AnalyticsView'
import ReportsView from './views/ReportsView'
import AppSettingsView from './views/AppSettingsView'
import AdminUsersView from './views/AdminUsersView'
import SecurityView from './views/SecurityView'
import AuditView from './views/AuditView'

type NavItem = {
  id: AdminSection
  label: string
  icon: LucideIcon
  /** capability required to see this item */
  cap?: 'settings'
  /** hide for these roles regardless of capability */
  hideFor?: AdminRole[]
}

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'Overview',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'users', label: 'Users', icon: Users },
      { id: 'videos', label: 'Videos', icon: Film },
    ],
  },
  {
    group: 'Advertising',
    items: [
      { id: 'ads-manager', label: 'Ads Manager', icon: Megaphone },
      { id: 'campaigns', label: 'Campaigns', icon: Target },
      { id: 'creatives', label: 'Ad Creatives', icon: ImagePlay },
      { id: 'placements', label: 'Ad Placements', icon: Layers },
    ],
  },
  {
    group: 'Insights',
    items: [
      { id: 'analytics', label: 'Analytics', icon: BarChart3 },
      { id: 'reports', label: 'Reports', icon: FileText },
    ],
  },
  {
    group: 'System',
    items: [
      { id: 'settings', label: 'App Settings', icon: Settings, cap: 'settings' },
      { id: 'admin-users', label: 'Admin Users', icon: ShieldCheck, cap: 'settings' },
      { id: 'security', label: 'Security', icon: Lock, hideFor: ['AD_MANAGER'] },
      { id: 'audit', label: 'Audit Logs', icon: ScrollText },
    ],
  },
]

const SECTION_META: Record<AdminSection, { title: string; sub: string }> = {
  dashboard: { title: 'Dashboard', sub: 'Platform-wide overview at a glance' },
  users: { title: 'Users', sub: 'End-user growth & engagement analytics' },
  videos: { title: 'Videos', sub: 'Library inventory (read-only)' },
  'ads-manager': { title: 'Ads Manager', sub: 'Ad engine controls & emergency kill switches' },
  campaigns: { title: 'Campaigns', sub: 'Manage ad campaigns and their creatives' },
  creatives: { title: 'Ad Creatives', sub: 'All creative assets across campaigns' },
  placements: { title: 'Ad Placements', sub: 'Placement rules, availability & flow' },
  analytics: { title: 'Analytics', sub: 'Ad funnel & delivery performance' },
  reports: { title: 'Reports', sub: 'Periodic performance reports' },
  settings: { title: 'App Settings', sub: 'Remote player defaults & preferences' },
  'admin-users': { title: 'Admin Users', sub: 'Console accounts & roles' },
  security: { title: 'Security', sub: 'Security posture & permission matrix' },
  audit: { title: 'Audit Logs', sub: 'Every admin action, recorded' },
}

function itemVisible(item: NavItem, role: AdminRole): boolean {
  if (item.cap && !can(role, item.cap)) return false
  if (item.hideFor?.includes(role)) return false
  return true
}

export default function AdminApp() {
  const session = useAdminSession()
  const [section, setSection] = useState<AdminSection>('dashboard')
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null)

  // Desktop gate — re-check on resize
  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1024)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const handleLogout = useCallback(() => {
    // fire & forget — global 401 handler stays quiet because token is cleared first
    adminPost('/api/admin/logout').catch(() => {})
    const store = useAppStore.getState()
    store.setAdminToken(null)
    clearAdminSession()
    store.setAdminView(null)
  }, [])

  if (isDesktop === null) {
    return <div className="vx-root min-h-screen" aria-busy="true" />
  }

  if (!isDesktop) {
    return (
      <div className="vx-root flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="vx-card flex h-20 w-20 items-center justify-center rounded-3xl">
          <Monitor className="h-10 w-10 text-violet-400" />
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">
          <span className="vx-accent-text">VX ADMIN</span>
        </h1>
        <p className="text-lg font-medium text-white/85">Desktop required.</p>
        <p className="max-w-sm text-sm leading-relaxed text-white/45">
          Please open the Admin Panel on a PC/Desktop browser (1024px viewport or wider).
        </p>
        <Button variant="outline" onClick={handleLogout} className="mt-3 h-11 border-white/15 bg-transparent text-white/70 hover:bg-white/5 hover:text-white">
          <LogOut className="mr-2 h-4 w-4" /> Logout
        </Button>
      </div>
    )
  }

  const currentVisible = NAV.some((g) => g.items.some((it) => it.id === section && itemVisible(it, session.role)))
  const meta = SECTION_META[section]

  function renderSection() {
    if (!currentVisible) return <LockNote role={session.role} />
    switch (section) {
      case 'dashboard':
        return <DashboardView />
      case 'users':
        return <UsersView />
      case 'videos':
        return <VideosView />
      case 'ads-manager':
        return <AdsManagerView />
      case 'campaigns':
        return <CampaignsView />
      case 'creatives':
        return <CreativesView />
      case 'placements':
        return <PlacementsView />
      case 'analytics':
        return <AnalyticsView />
      case 'reports':
        return <ReportsView />
      case 'settings':
        return <AppSettingsView />
      case 'admin-users':
        return <AdminUsersView />
      case 'security':
        return <SecurityView />
      case 'audit':
        return <AuditView />
    }
  }

  return (
    <div className="vx-root flex h-screen overflow-hidden">
      {/* ── Sidebar ── */}
      <aside className="vx-panel flex w-64 shrink-0 flex-col rounded-none border-y-0 border-l-0">
        <div className="flex items-center gap-3 border-b border-white/[0.07] px-5 py-4">
          <div className="vx-btn-accent flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold">
            VX
          </div>
          <div className="text-sm font-bold tracking-tight text-white">
            VX <span className="vx-accent-text">ADMIN</span>
          </div>
        </div>

        <div className="border-b border-white/[0.07] px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-white">{session.name || 'Admin'}</span>
            <span className="relative flex h-2 w-2 shrink-0" title="Online">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
          </div>
          <div className="mt-1.5">
            <RoleBadge role={session.role} />
          </div>
        </div>

        <nav aria-label="Admin sections" className="vx-scroll flex-1 overflow-y-auto px-3 py-3">
          {NAV.map((group) => {
            const items = group.items.filter((it) => itemVisible(it, session.role))
            if (!items.length) return null
            return (
              <div key={group.group} className="mb-1">
                <div className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">
                  {group.group}
                </div>
                {items.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => setSection(it.id)}
                    aria-current={section === it.id ? 'page' : undefined}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                      section === it.id
                        ? 'bg-violet-500/15 font-medium text-violet-200'
                        : 'text-white/55 hover:bg-white/5 hover:text-white'
                    )}
                  >
                    <it.icon className={cn('h-4 w-4 shrink-0', section === it.id ? 'text-violet-300' : 'text-white/40')} />
                    {it.label}
                  </button>
                ))}
              </div>
            )
          })}
        </nav>

        <div className="border-t border-white/[0.07] p-3">
          <Button
            variant="ghost"
            onClick={handleLogout}
            className="h-10 w-full justify-start text-white/55 hover:bg-red-500/10 hover:text-red-300"
          >
            <LogOut className="mr-2 h-4 w-4" /> Logout
          </Button>
        </div>
      </aside>

      {/* ── Main column ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-white/[0.07] px-6 lg:px-8">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold tracking-tight text-white">{meta.title}</h1>
            <p className="truncate text-xs text-white/40">{meta.sub}</p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <RoleBadge role={session.role} />
            <div className="hidden items-center gap-2 border-l border-white/10 pl-3 sm:flex">
              <span className="text-sm text-white/75">{session.name || 'Admin'}</span>
              <span className="relative flex h-2 w-2" title="Online">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
            </div>
          </div>
        </header>

        <main className="vx-scroll flex-1 overflow-y-auto">
          <motion.div
            key={section}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="mx-auto max-w-[1200px] space-y-6 p-6 lg:p-8"
          >
            {renderSection()}
          </motion.div>
        </main>
      </div>
    </div>
  )
}
