'use client'

import { useEffect, useState } from 'react'
import {
  ArrowUpDown,
  Check,
  ChevronRight,
  FolderOpen,
  Heart,
  History,
  Home,
  ListVideo,
  Loader2,
  MoreHorizontal,
  MoreVertical,
  PlaySquare,
  RefreshCw,
  Search,
  Settings2,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'

import { apiPost } from '@/lib/api'
import { useAppStore, type AppView } from '@/lib/store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'

import { FavoritesView } from './FavoritesView'
import { FoldersView } from './FoldersView'
import { HistoryView } from './HistoryView'
import { HomeView } from './HomeView'
import { PlaylistsView } from './PlaylistsView'
import { SearchView } from './SearchView'
import { SettingsView } from './SettingsView'
import { VideosView, type LibrarySort } from './VideosView'

type NavItem = { view: AppView; label: string; icon: LucideIcon }

const NAV_ITEMS: NavItem[] = [
  { view: 'home', label: 'Home', icon: Home },
  { view: 'videos', label: 'Videos', icon: PlaySquare },
  { view: 'folders', label: 'Folders', icon: FolderOpen },
  { view: 'favorites', label: 'Favorites', icon: Heart },
  { view: 'playlists', label: 'Playlists', icon: ListVideo },
  { view: 'history', label: 'History', icon: History },
  { view: 'settings', label: 'Settings', icon: Settings2 },
]

const MOBILE_NAV_ITEMS: NavItem[] = [
  { view: 'home', label: 'Home', icon: Home },
  { view: 'videos', label: 'Videos', icon: PlaySquare },
  { view: 'folders', label: 'Folders', icon: FolderOpen },
  { view: 'playlists', label: 'Playlists', icon: ListVideo },
]

const MORE_SHEET_ITEMS: NavItem[] = [
  { view: 'favorites', label: 'Favorites', icon: Heart },
  { view: 'history', label: 'History', icon: History },
  { view: 'settings', label: 'Settings', icon: Settings2 },
]

const SORT_ITEMS: { key: LibrarySort; label: string }[] = [
  { key: 'recent_added', label: 'Recently added' },
  { key: 'recent_played', label: 'Recently played' },
  { key: 'name', label: 'Name' },
  { key: 'duration', label: 'Duration' },
  { key: 'size', label: 'Size' },
]

function renderView(view: AppView) {
  switch (view) {
    case 'home':
      return <HomeView />
    case 'videos':
      return <VideosView />
    case 'folders':
      return <FoldersView />
    case 'favorites':
      return <FavoritesView />
    case 'playlists':
      return <PlaylistsView />
    case 'history':
      return <HistoryView />
    case 'settings':
      return <SettingsView />
    case 'search':
      return <SearchView />
  }
}

function SideNavItem({
  item,
  active,
  onSelect,
}: {
  item: NavItem
  active: boolean
  onSelect: () => void
}) {
  const Icon = item.icon
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-[44px] w-full items-center gap-3 rounded-lg border-l-2 px-3.5 text-left text-sm font-medium transition',
        active
          ? 'border-[var(--vx-accent)] bg-[var(--vx-accent)]/15 text-[var(--vx-accent-soft)]'
          : 'border-transparent text-muted-foreground hover:bg-white/5 hover:text-foreground'
      )}
    >
      <Icon className="size-[18px] shrink-0" />
      {item.label}
    </button>
  )
}

function MobileNavItem({
  item,
  active,
  onSelect,
}: {
  item: NavItem
  active: boolean
  onSelect: () => void
}) {
  const Icon = item.icon
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 text-[10px] font-medium transition',
        active ? 'text-[var(--vx-accent-soft)]' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      <Icon className={cn('size-5 shrink-0', active && 'text-[var(--vx-accent)]')} />
      {item.label}
    </button>
  )
}

const iconBtnClass =
  'grid size-11 place-items-center rounded-xl text-muted-foreground transition hover:bg-white/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vx-accent)]/60'

export function AppShell() {
  const view = useAppStore((s) => s.view)
  const setView = useAppStore((s) => s.setView)
  const librarySort = useAppStore((s) => s.librarySort)
  const setLibrarySort = useAppStore((s) => s.setLibrarySort)
  const offlineMode = useAppStore((s) => s.offlineMode)
  const setOfflineMode = useAppStore((s) => s.setOfflineMode)
  const tapCount = useAppStore((s) => s.tapCount)
  const registerLogoTap = useAppStore((s) => s.registerLogoTap)
  const bumpData = useAppStore((s) => s.bumpData)

  const [scanning, setScanning] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [tapChipVisible, setTapChipVisible] = useState(false)

  // Auto-hide the "taps to admin" chip 2.5s after the last tap.
  // The store keeps its own consecutive-tap counting — this only controls visibility.
  useEffect(() => {
    if (tapCount >= 3 && tapCount < 7) {
      setTapChipVisible(true)
      const timer = window.setTimeout(() => setTapChipVisible(false), 2500)
      return () => window.clearTimeout(timer)
    }
    setTapChipVisible(false)
  }, [tapCount])

  async function handleRescan() {
    if (scanning) return
    setScanning(true)
    try {
      const res = await apiPost<{ found: number; newVideos: number }>('/api/scan')
      toast.success(`Found ${res.found} videos in library`)
      if (res.newVideos > 0) bumpData()
    } catch {
      toast.error('Could not rescan the library')
    } finally {
      setScanning(false)
    }
  }

  const currentSortLabel = SORT_ITEMS.find((s) => s.key === librarySort)?.label ?? 'Sort'

  return (
    <div className="vx-root flex min-h-screen flex-col text-foreground">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-white/5 bg-black/30 backdrop-blur-xl">
        <div className="flex h-16 items-center justify-between gap-2 px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={registerLogoTap}
              aria-label="VX Player home — admin access"
              className="flex min-h-11 items-center gap-2.5 rounded-xl px-0.5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--vx-accent)]/60"
            >
              <span
                aria-hidden="true"
                className="vx-glow grid size-9 shrink-0 place-items-center rounded-xl text-sm font-black tracking-tight text-white"
                style={{ background: 'linear-gradient(135deg, var(--vx-accent), #ec4899)' }}
              >
                VX
              </span>
              <span className="min-w-0 text-left leading-tight">
                <span className="block text-[15px] font-bold tracking-tight">VX Player</span>
                <span className="hidden text-[10px] text-muted-foreground sm:block">
                  Play Everything. Anywhere. Offline.
                </span>
              </span>
            </button>
            {tapChipVisible && tapCount >= 3 && tapCount < 7 && (
              <span
                className="vx-chip shrink-0 border-[var(--vx-accent)]/40 bg-[var(--vx-accent)]/10 text-[10px] font-medium text-[var(--vx-accent-soft)]"
                role="status"
              >
                {7 - tapCount} taps to admin
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={() => setView('search')}
              aria-label="Search videos"
              className={iconBtnClass}
            >
              <Search className="size-[18px]" />
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  aria-label="Sort library"
                  className="min-h-11 gap-2 rounded-xl px-2.5 text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground md:px-3"
                >
                  <ArrowUpDown className="size-4" />
                  <span className="hidden md:inline">{currentSortLabel}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {SORT_ITEMS.map((item) => (
                  <DropdownMenuItem
                    key={item.key}
                    onSelect={() => setLibrarySort(item.key)}
                    className="justify-between gap-2"
                  >
                    {item.label}
                    {librarySort === item.key && (
                      <Check className="size-4 text-[var(--vx-accent-soft)]" aria-hidden="true" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label="More options" className={iconBtnClass}>
                  <MoreVertical className="size-[18px]" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem onSelect={() => void handleRescan()} disabled={scanning} className="gap-2.5">
                  {scanning ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                  Rescan library
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setView('settings')} className="gap-2.5">
                  <Settings2 className="size-4" />
                  Settings
                </DropdownMenuItem>
                <div
                  className="flex items-center justify-between gap-4 px-2 py-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Offline mode</p>
                    <p className="text-xs text-muted-foreground">Serve ads from cache</p>
                  </div>
                  <Switch
                    checked={offlineMode}
                    onCheckedChange={setOfflineMode}
                    aria-label="Offline mode"
                  />
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  Admin access: tap logo 7×
                </DropdownMenuLabel>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────── */}
      <div className="flex w-full flex-1">
        {/* Tablet / desktop sidebar */}
        <aside className="vx-panel sticky top-16 hidden h-[calc(100vh-4rem)] w-60 shrink-0 flex-col rounded-none md:flex">
          <nav aria-label="Primary" className="flex flex-col gap-0.5 px-3 py-4">
            {NAV_ITEMS.map((item) => (
              <SideNavItem
                key={item.view}
                item={item}
                active={view === item.view}
                onSelect={() => setView(item.view)}
              />
            ))}
          </nav>
          <div className="vx-card mx-3 mb-4 mt-auto p-3">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Offline-first · No account needed
            </p>
          </div>
        </aside>

        {/* Main content */}
        <main className="vx-scroll min-w-0 flex-1 px-4 pt-6 pb-28 md:px-8 md:pb-10">
          {renderView(view)}
        </main>
      </div>

      {/* ── Mobile bottom nav ──────────────────────────────────── */}
      <nav
        aria-label="Primary mobile"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-black/70 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-5">
          {MOBILE_NAV_ITEMS.map((item) => (
            <MobileNavItem
              key={item.view}
              item={item}
              active={view === item.view}
              onSelect={() => setView(item.view)}
            />
          ))}
          <MobileNavItem
            item={{ view: 'settings', label: 'More', icon: MoreHorizontal }}
            active={view === 'favorites' || view === 'history' || view === 'settings'}
            onSelect={() => setMoreOpen(true)}
          />
        </div>
      </nav>

      {/* Mobile "More" sheet */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          className="vx-scroll rounded-t-2xl px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        >
          <SheetHeader className="p-0 text-left">
            <SheetTitle>More</SheetTitle>
            <SheetDescription className="sr-only">Favorites, history and settings</SheetDescription>
          </SheetHeader>
          <div className="mt-3 flex flex-col gap-1">
            {MORE_SHEET_ITEMS.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.view}
                  type="button"
                  onClick={() => {
                    setMoreOpen(false)
                    setView(item.view)
                  }}
                  className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2.5 text-left text-sm font-medium transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vx-accent)]/60"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--vx-accent)]/15 text-[var(--vx-accent-soft)]">
                    <Icon className="size-4" />
                  </span>
                  {item.label}
                  <ChevronRight className="ml-auto size-4 shrink-0 text-muted-foreground" />
                </button>
              )
            })}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

export default AppShell
