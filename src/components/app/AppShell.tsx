'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ArrowUpDown,
  Check,
  ChevronRight,
  FolderOpen,
  FolderSearch,
  Heart,
  History,
  Home,
  ListVideo,
  MoreHorizontal,
  MoreVertical,
  PlaySquare,
  Plus,
  Search,
  Settings2,
  type LucideIcon,
} from 'lucide-react'

import { refreshAdCache } from '@/lib/ads-client'
import { PICK_VIDEOS_EVENT, importVideoFiles, requestVideoPick } from '@/lib/import-client'
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
import { FooterAd } from './FooterAd'
import { FoldersView } from './FoldersView'
import { HistoryView } from './HistoryView'
import { HomeView } from './HomeView'
import { PlaylistsView } from './PlaylistsView'
import { SearchView } from './SearchView'
import { SettingsView } from './SettingsView'
import { UploadTray } from './UploadTray'
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

  const [moreOpen, setMoreOpen] = useState(false)
  const [tapChipVisible, setTapChipVisible] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // "Scan device storage" opens the device video picker (gallery on Android).
  useEffect(() => {
    void refreshAdCache()
    const open = () => fileInputRef.current?.click()
    window.addEventListener(PICK_VIDEOS_EVENT, open)
    return () => window.removeEventListener(PICK_VIDEOS_EVENT, open)
  }, [])

  async function handleFilesChosen(files: FileList | null) {
    if (!files || files.length === 0) return
    await importVideoFiles(Array.from(files))
  }

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

          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              onClick={() => requestVideoPick()}
              size="sm"
              className="vx-btn-accent h-9 gap-1.5 rounded-xl px-3 text-xs font-semibold"
              aria-label="Add videos from device"
            >
              <Plus className="size-3.5" />
              <span className="hidden sm:inline">+ Add Video</span>
              <span className="sm:hidden">+ Video</span>
            </Button>

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
                <DropdownMenuItem onSelect={() => requestVideoPick()} className="gap-2.5">
                  <FolderSearch className="size-4" />
                  Scan device storage
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

        {/* Main column — content + footer stacked so the footer pins to the
            viewport bottom on short pages and is pushed down on long ones
            (on mobile the sidebar is hidden, so this is the full width). */}
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="vx-scroll min-w-0 flex-1 px-4 pt-6 pb-8 md:px-8 md:pb-10">
            {renderView(view)}
          </main>

          {/* ── Footer (ad banner + branding) ─────────────────────── */}
          <footer className="mt-auto border-t border-white/5 bg-black/40 backdrop-blur-xl">
            <div className="px-4 pt-4 md:px-6">
              <FooterAd />
            </div>
            <div className="flex items-center justify-between gap-3 px-4 pb-[calc(1.25rem+4rem+env(safe-area-inset-bottom))] pt-3 md:px-6 md:pb-5">
              <p className="text-[11px] text-muted-foreground">
                © {new Date().getFullYear()} VX Player · Play Everything. Anywhere. Offline.
              </p>
              <p className="hidden text-[11px] text-muted-foreground sm:block">
                Offline-first · No account needed
              </p>
            </div>
          </footer>
        </div>
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

      {/* Hidden device video picker (opened via header menu / empty states / settings) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        multiple
        className="sr-only"
        aria-label="Import videos from device storage"
        data-testid="video-import-input"
        onChange={(e) => {
          void handleFilesChosen(e.target.files)
          e.target.value = ''
        }}
      />

      {/* Live import progress */}
      <UploadTray />
    </div>
  )
}

export default AppShell
