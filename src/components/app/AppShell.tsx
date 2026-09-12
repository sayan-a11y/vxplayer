'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ArrowUpDown,
  Cast,
  Check,
  ChevronRight,
  Compass,
  Folder,
  FolderOpen,
  FolderSearch,
  Heart,
  History,
  Home,
  ListVideo,
  MoreVertical,
  Music,
  Play,
  PlaySquare,
  Plus,
  Search,
  Settings2,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'

import { refreshAdCache } from '@/lib/ads-client'
import { PICK_VIDEOS_EVENT, importVideoFiles, requestVideoPick } from '@/lib/import-client'
import { useAppStore, type AppView } from '@/lib/store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Switch } from '@/components/ui/switch'

import { ExploreView } from './ExploreView'
import { FavoritesView } from './FavoritesView'
import { FooterAd } from './FooterAd'
import { FoldersView } from './FoldersView'
import { HistoryView } from './HistoryView'
import { HomeView } from './HomeView'
import { MusicView } from './MusicView'
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

// Mobile bottom nav matching the reference image (4 items: Video, Music, Explore, Settings)
const MOBILE_NAV_ITEMS: NavItem[] = [
  { view: 'home', label: 'Video', icon: Play },
  { view: 'music', label: 'Music', icon: Music },
  { view: 'explore', label: 'Explore', icon: Compass },
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
    case 'music':
      return <MusicView />
    case 'explore':
      return <ExploreView />
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
        'flex min-h-[58px] flex-col items-center justify-center gap-1 px-2 text-[11px] font-semibold transition active:scale-95',
        active ? 'text-blue-400' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      <div
        className={cn(
          'flex h-7 w-12 items-center justify-center rounded-full transition-all duration-200',
          active
            ? 'bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 text-white shadow-[0_0_14px_rgba(0,132,255,0.6)]'
            : 'text-white/60'
        )}
      >
        <Icon className={cn('size-4 shrink-0', active && item.view === 'home' && 'fill-white')} />
      </div>
      <span>{item.label}</span>
    </button>
  )
}

function MediaPermissionDialog({
  open,
  onGrant,
  onDeny,
}: {
  open: boolean
  onGrant: () => void
  onDeny: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onDeny() }}>
      <DialogContent className="vx-card border-white/10 bg-[#080914]/95 p-6 text-white backdrop-blur-2xl sm:max-w-md">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-gradient-to-tr from-blue-600/20 to-cyan-500/20 text-cyan-400">
            <FolderOpen className="size-7 text-[var(--vx-accent-soft)]" />
          </div>
          <h3 className="text-lg font-bold tracking-tight text-white">
            Allow VX PLAYER to access photos and videos on this device?
          </h3>
          <p className="mt-2 text-xs text-white/60 leading-relaxed max-w-xs">
            VX PLAYER automatically detects and organizes your videos across folders for seamless local playback. Media files stay 100% private on your device.
          </p>
          <div className="mt-6 flex w-full flex-col gap-2.5">
            <Button
              onClick={onGrant}
              className="vx-btn-accent h-11 w-full font-semibold shadow-[0_0_20px_rgba(0,132,255,0.4)]"
            >
              Allow
            </Button>
            <Button
              variant="ghost"
              onClick={onDeny}
              className="h-10 text-xs text-white/50 hover:text-white"
            >
              Don't allow
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

const iconBtnClass =
  'grid size-10 place-items-center rounded-xl text-muted-foreground transition hover:bg-white/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vx-accent)]/60'

export function AppShell() {
  const view = useAppStore((s) => s.view)
  const setView = useAppStore((s) => s.setView)
  const librarySort = useAppStore((s) => s.librarySort)
  const setLibrarySort = useAppStore((s) => s.setLibrarySort)
  const offlineMode = useAppStore((s) => s.offlineMode)
  const setOfflineMode = useAppStore((s) => s.setOfflineMode)
  const tapCount = useAppStore((s) => s.tapCount)
  const registerLogoTap = useAppStore((s) => s.registerLogoTap)
  const mediaPermission = useAppStore((s) => s.mediaPermission)
  const setMediaPermission = useAppStore((s) => s.setMediaPermission)

  const [tapChipVisible, setTapChipVisible] = useState(false)
  const [permissionDialogOpen, setPermissionDialogOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Show permission modal on initial mount if permission has not been decided yet
  useEffect(() => {
    if (mediaPermission === 'prompt') {
      const timer = setTimeout(() => setPermissionDialogOpen(true), 600)
      return () => clearTimeout(timer)
    }
  }, [mediaPermission])

  // "Scan device storage" opens the device video picker (gallery on Android).
  useEffect(() => {
    void refreshAdCache()
    const open = () => fileInputRef.current?.click()
    window.addEventListener(PICK_VIDEOS_EVENT, open)
    return () => window.removeEventListener(PICK_VIDEOS_EVENT, open)
  }, [])

  // Auto-scan on startup if permission is already granted
  useEffect(() => {
    if (mediaPermission === 'granted') {
      import('@/lib/privateLibrary').then(({ initializeAutoScan }) => {
        initializeAutoScan().then(({ added }) => {
          if (added > 0) {
            useAppStore.getState().bumpData()
            toast.success(`Found ${added} new video${added === 1 ? '' : 's'} on device`)
          }
        }).catch(() => {})
      })
    }
  }, [mediaPermission])

  // Lightweight background sync on window focus/resume
  useEffect(() => {
    const onFocus = () => {
      if (mediaPermission === 'granted') {
        import('@/lib/privateLibrary').then(({ performQuickScan }) => {
          performQuickScan({ maxAgeHours: 0.5 }).then((added) => {
            if (added > 0) {
              useAppStore.getState().bumpData()
              toast.success(`Library updated: +${added} video${added === 1 ? '' : 's'}`)
            }
          }).catch(() => {})
        })
      }
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [mediaPermission])

  async function handleFilesChosen(files: FileList | null) {
    if (!files || files.length === 0) return
    try {
      const { scanFilesBatch } = await import('@/lib/privateLibrary')
      const count = await scanFilesBatch(files)
      if (count > 0) {
        useAppStore.getState().bumpData()
        toast.success(`Detected ${count} video${count === 1 ? '' : 's'} across your folders`)
      }
    } catch {
      await importVideoFiles(Array.from(files))
    }
  }

  const handleGrantPermission = async () => {
    setPermissionDialogOpen(false)
    setMediaPermission('granted')
    try {
      const { scanDeviceDirectory } = await import('@/lib/privateLibrary')
      const count = await scanDeviceDirectory()
      if (count > 0) {
        useAppStore.getState().bumpData()
        toast.success(`Detected ${count} videos across your device folders`)
      }
    } catch {
      fileInputRef.current?.click()
    }
  }

  const handleDenyPermission = () => {
    setPermissionDialogOpen(false)
    setMediaPermission('denied')
  }

  // Auto-hide the "taps to admin" chip 3.5s after the last tap.
  useEffect(() => {
    if (tapCount >= 2 && tapCount < 7) {
      setTapChipVisible(true)
      const timer = window.setTimeout(() => setTapChipVisible(false), 3500)
      return () => window.clearTimeout(timer)
    }
    setTapChipVisible(false)
  }, [tapCount])

  const currentSortLabel = SORT_ITEMS.find((s) => s.key === librarySort)?.label ?? 'Sort'

  return (
    <div className="vx-root flex min-h-screen flex-col text-foreground">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-white/5 bg-black/40 backdrop-blur-xl">
        <div className="flex h-16 items-center justify-between gap-2 px-3 sm:px-4 md:px-6">
          {/* MOBILE HEADER: VX PLAYER with "Play Everything. Anytime." + Cast + Search + More */}
          <div className="flex md:hidden w-full items-center justify-between">
            <div className="flex flex-col">
              <button
                type="button"
                onClick={registerLogoTap}
                aria-label="VX Player — tap 7 times for admin access"
                className="text-left outline-none transition active:scale-95"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-xl font-black tracking-wider bg-gradient-to-r from-blue-500 via-cyan-400 to-white bg-clip-text text-transparent">
                    VX
                  </span>
                  <span className="text-xl font-bold tracking-tight text-white">
                    PLAYER
                  </span>
                </div>
                <p className="text-[10px] text-white/50 -mt-0.5 tracking-wide">
                  Play Everything. Anytime.
                </p>
              </button>
              {tapChipVisible && tapCount >= 2 && tapCount < 7 && (
                <span
                  className="vx-chip mt-1 shrink-0 animate-pulse border-[var(--vx-accent)]/40 bg-[var(--vx-accent)]/15 text-[9px] font-semibold text-[var(--vx-accent-soft)]"
                  role="status"
                >
                  {7 - tapCount} taps to Admin
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => toast.info('Cast: Searching for Chromecast and Smart TVs on Wi-Fi...')}
                aria-label="Cast to TV"
                className={iconBtnClass}
              >
                <Cast className="size-[19px]" />
              </button>

              <button
                type="button"
                onClick={() => setView('search')}
                aria-label="Search videos"
                className={iconBtnClass}
              >
                <Search className="size-[19px]" />
              </button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" aria-label="More options" className={iconBtnClass}>
                    <MoreVertical className="size-[19px]" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-[#090b1c] border-white/10 text-xs">
                  <DropdownMenuItem onSelect={() => requestVideoPick()} className="gap-2.5">
                    <FolderSearch className="size-4" />
                    Scan device storage
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-white/10" />
                  <DropdownMenuItem onSelect={() => setView('settings')} className="gap-2.5">
                    <Settings2 className="size-4" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setView('history')} className="gap-2.5">
                    <History className="size-4" />
                    Recently Played
                  </DropdownMenuItem>
                  <div
                    className="flex items-center justify-between gap-4 px-2 py-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium">Offline mode</p>
                      <p className="text-[10px] text-muted-foreground">Serve ads from cache</p>
                    </div>
                    <Switch
                      checked={offlineMode}
                      onCheckedChange={setOfflineMode}
                      aria-label="Offline mode"
                    />
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* DESKTOP HEADER (>=768px): Full controls & logo */}
          <div className="hidden md:flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={registerLogoTap}
              aria-label="VX Player — tap 7 times for admin access"
              className="flex min-h-11 items-center gap-2 rounded-xl px-1 py-1 outline-none transition active:scale-95 focus-visible:ring-2 focus-visible:ring-[var(--vx-accent)]/60"
            >
              <img
                src="/logo.png"
                alt="VX Player"
                className="h-8 sm:h-9 w-auto max-w-[160px] sm:max-w-[210px] object-contain drop-shadow"
              />
            </button>
            {tapChipVisible && tapCount >= 2 && tapCount < 7 && (
              <span
                className="vx-chip shrink-0 animate-pulse border-[var(--vx-accent)]/40 bg-[var(--vx-accent)]/15 text-[10px] font-semibold text-[var(--vx-accent-soft)]"
                role="status"
              >
                {7 - tapCount} taps to Admin
              </span>
            )}
          </div>

          <div className="hidden md:flex shrink-0 items-center gap-1 sm:gap-1.5">
            <Button
              onClick={() => requestVideoPick()}
              size="sm"
              className="vx-btn-accent h-9 gap-1.5 rounded-xl px-2.5 text-xs font-semibold sm:px-3"
              aria-label="Add videos from device"
            >
              <Plus className="size-3.5" />
              <span>+ Add Video</span>
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
                  className="min-h-11 gap-1.5 rounded-xl px-2 text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground md:px-3"
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

        {/* Main column — content + footer */}
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="vx-scroll min-w-0 flex-1 px-3.5 py-4 pb-6 sm:px-5 sm:py-6 md:px-8 md:pb-8">
            {renderView(view)}
          </main>

          {/* ── Footer (ad banner + branding) ─────────────────────── */}
          <footer className="mt-auto border-t border-white/5 bg-black/40 backdrop-blur-xl">
            <div className="px-3.5 pt-4 sm:px-5 md:px-8">
              <FooterAd />
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-3.5 pb-[calc(1.25rem+4rem+env(safe-area-inset-bottom))] pt-3 sm:px-5 md:px-8 md:pb-5">
              <p className="text-[11px] text-muted-foreground text-center sm:text-left">
                © {new Date().getFullYear()} VX Player · Play Everything. Anywhere. Offline.
              </p>
              <p className="hidden text-[11px] text-muted-foreground sm:block">
                Offline-first · No account needed
              </p>
            </div>
          </footer>
        </div>
      </div>

      {/* ── Mobile bottom nav — 4 tabs (Video, Music, Explore, Settings) ── */}
      <nav
        aria-label="Primary mobile"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-black/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-2xl md:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-4 px-2">
          {MOBILE_NAV_ITEMS.map((item) => (
            <MobileNavItem
              key={item.view}
              item={item}
              active={
                (item.view === 'home' && (view === 'home' || view === 'videos' || view === 'folders')) ||
                view === item.view
              }
              onSelect={() => setView(item.view)}
            />
          ))}
        </div>
      </nav>

      {/* Native-style media permission dialog */}
      <MediaPermissionDialog
        open={permissionDialogOpen}
        onGrant={handleGrantPermission}
        onDeny={handleDenyPermission}
      />

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
