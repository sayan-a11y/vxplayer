'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  Captions,
  Check,
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  FolderSearch,
  Loader2,
  Palette,
  PlayCircle,
  ShieldCheck,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'

import { apiDelete, apiGet, apiPatch } from '@/lib/api'
import { clearCache, readCache, refreshAdCache } from '@/lib/ads-client'
import { requestVideoPick } from '@/lib/import-client'
import { useAppStore } from '@/lib/store'
import { SPEED_OPTIONS, type SettingsDTO, type VideoDTO } from '@/lib/types'
import { cn } from '@/lib/utils'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'

import { ErrorState, type LibrarySort } from './VideosView'

const SEEK_OPTIONS = [5, 10, 15, 30] as const

const THEME_OPTIONS: { value: SettingsDTO['theme']; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
]

const ACCENT_SWATCHES: { value: SettingsDTO['accent']; label: string; hex: string }[] = [
  { value: 'violet', label: 'Violet', hex: '#8b5cf6' },
  { value: 'purple', label: 'Purple', hex: '#a855f7' },
  { value: 'fuchsia', label: 'Fuchsia', hex: '#d946ef' },
  { value: 'rose', label: 'Rose', hex: '#f43f5e' },
]

const PLAYER_THEME_OPTIONS: { value: SettingsDTO['playerTheme']; label: string }[] = [
  { value: 'OLED', label: 'OLED — true black' },
  { value: 'DIM', label: 'DIM — soft gray' },
]

const SUBTITLE_SIZE_OPTIONS: { value: SettingsDTO['subtitleSize']; label: string }[] = [
  { value: 'S', label: 'S — Small' },
  { value: 'M', label: 'M — Normal' },
  { value: 'L', label: 'L — Large' },
  { value: 'XL', label: 'XL — Extra large' },
]

const SUBTITLE_LANGS = ['English', 'Hindi', 'Spanish'] as const

const SORT_OPTIONS: { value: LibrarySort; label: string }[] = [
  { value: 'recent_added', label: 'Recently added' },
  { value: 'recent_played', label: 'Recently played' },
  { value: 'name', label: 'Name' },
  { value: 'duration', label: 'Duration' },
  { value: 'size', label: 'Size' },
]

/** Reflect the theme choice onto <html> for instant feedback. */
function applyTheme(theme: SettingsDTO['theme']) {
  const root = document.documentElement
  if (theme === 'dark') root.classList.add('dark')
  else if (theme === 'light') root.classList.remove('dark')
  else root.classList.toggle('dark', window.matchMedia('(prefers-color-scheme: dark)').matches)
}

/** Reflect the accent choice onto <html> (violet is the default — no attribute). */
function applyAccent(accent: SettingsDTO['accent']) {
  if (accent === 'violet') delete document.documentElement.dataset.accent
  else document.documentElement.dataset.accent = accent
}

function SectionCard({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: ReactNode }) {
  return (
    <section className="vx-card p-5">
      <div className="mb-2 flex items-center gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--vx-accent)]/15 text-[var(--vx-accent-soft)]">
          <Icon className="size-[18px]" />
        </span>
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
      </div>
      <div className="divide-y divide-white/5">{children}</div>
    </section>
  )
}

function Row({
  id,
  label,
  hint,
  children,
}: {
  id?: string
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        {hint && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function SettingsSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Skeleton className="h-7 w-36" />
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="vx-card space-y-4 p-5">
          <div className="flex items-center gap-2.5">
            <Skeleton className="size-9 rounded-xl" />
            <Skeleton className="h-5 w-28" />
          </div>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>
  )
}

export function SettingsView() {
  const setSettings = useAppStore((s) => s.setSettings)
  const librarySort = useAppStore((s) => s.librarySort)
  const setLibrarySort = useAppStore((s) => s.setLibrarySort)
  const hiddenFolders = useAppStore((s) => s.hiddenFolders)
  const setHiddenFolders = useAppStore((s) => s.setHiddenFolders)
  const offlineMode = useAppStore((s) => s.offlineMode)
  const setOfflineMode = useAppStore((s) => s.setOfflineMode)
  const bumpData = useAppStore((s) => s.bumpData)

  const [draft, setDraft] = useState<SettingsDTO | null>(() => useAppStore.getState().settings)
  const [error, setError] = useState(false)
  const [folders, setFolders] = useState<string[]>([])
  const [syncing, setSyncing] = useState(false)

  const load = useCallback(async () => {
    setError(false)
    try {
      const res = await apiGet<{ settings: SettingsDTO }>('/api/settings')
      setSettings(res.settings)
      setDraft(res.settings)
    } catch {
      setError(true)
      toast.error('Could not load settings')
    }
  }, [setSettings])

  useEffect(() => {
    void load()
  }, [load])

  // Unique library folders for the hidden-folder chips (fetched once, non-critical).
  useEffect(() => {
    let cancelled = false
    void apiGet<{ videos: VideoDTO[] }>('/api/videos')
      .then((res) => {
        if (cancelled) return
        setFolders(Array.from(new Set(res.videos.map((v) => v.folder))).sort((a, b) => a.localeCompare(b)))
      })
      .catch(() => {
        /* non-critical */
      })
    return () => {
      cancelled = true
    }
  }, [])

  function setDraftKey<K extends keyof SettingsDTO>(key: K, value: SettingsDTO[K]) {
    setDraft((d) => (d === null ? d : { ...d, [key]: value }))
  }

  /** Optimistically update the draft, then persist ONLY the changed key. Silent — switches/sliders fire often. */
  function update<K extends keyof SettingsDTO>(key: K, value: SettingsDTO[K]) {
    setDraftKey(key, value)
    void apiPatch<{ settings: SettingsDTO }>('/api/settings', { [key]: value })
      .then((res) => setSettings(res.settings))
      .catch(() => {
        toast.error('Could not save your change')
        void load()
      })
  }

  function handleScanStorage() {
    requestVideoPick()
  }

  async function handleSyncAdCache() {
    if (syncing) return
    setSyncing(true)
    try {
      await refreshAdCache(true)
      toast.success(readCache() ? 'Ad cache synced' : 'No ads available to cache')
    } finally {
      setSyncing(false)
    }
  }

  async function handleClearHistory() {
    try {
      await apiDelete('/api/history')
      toast.success('History cleared')
      bumpData()
    } catch {
      toast.error('Could not clear history')
    }
  }

  function handleClearAdCache() {
    clearCache()
    toast.success('Offline ad cache cleared')
  }

  function toggleFolder(name: string) {
    setHiddenFolders(
      hiddenFolders.includes(name) ? hiddenFolders.filter((f) => f !== name) : [...hiddenFolders, name]
    )
  }

  if (draft === null && error) {
    return (
      <div className="mx-auto max-w-2xl">
        <ErrorState onRetry={() => void load()} />
      </div>
    )
  }

  if (draft === null) {
    return <SettingsSkeleton />
  }

  const d = draft

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-lg font-semibold tracking-tight">Settings</h1>

      {/* ── Playback ─────────────────────────────────────────── */}
      <SectionCard title="Playback" icon={PlayCircle}>
        <Row id="set-default-speed" label="Default speed">
          <Select
            value={String(d.defaultSpeed)}
            onValueChange={(v) => update('defaultSpeed', Number(v))}
          >
            <SelectTrigger id="set-default-speed" className="w-28" aria-label="Default speed">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SPEED_OPTIONS.map((o) => (
                <SelectItem key={o} value={String(o)}>
                  {o}×
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Autoplay next" hint="Continue with the next video in the queue">
          <Switch
            checked={d.autoPlayNext}
            onCheckedChange={(v) => update('autoPlayNext', v)}
            aria-label="Autoplay next"
          />
        </Row>
        <Row label="Resume playback" hint="Pick up where you left off">
          <Switch
            checked={d.resumePlayback}
            onCheckedChange={(v) => update('resumePlayback', v)}
            aria-label="Resume playback"
          />
        </Row>
        <Row id="set-double-tap-seek" label="Double-tap seek">
          <Select
            value={String(d.doubleTapSeek)}
            onValueChange={(v) => update('doubleTapSeek', Number(v))}
          >
            <SelectTrigger id="set-double-tap-seek" className="w-28" aria-label="Double-tap seek">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEEK_OPTIONS.map((o) => (
                <SelectItem key={o} value={String(o)}>
                  {o}s
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Hardware acceleration" hint="Use device decoding when available">
          <Switch
            checked={d.hwAcceleration}
            onCheckedChange={(v) => update('hwAcceleration', v)}
            aria-label="Hardware acceleration"
          />
        </Row>
      </SectionCard>

      {/* ── Appearance ───────────────────────────────────────── */}
      <SectionCard title="Appearance" icon={Palette}>
        <Row id="set-theme" label="Theme">
          <Select
            value={d.theme}
            onValueChange={(v) => {
              const theme = v as SettingsDTO['theme']
              update('theme', theme)
              applyTheme(theme)
            }}
          >
            <SelectTrigger id="set-theme" className="w-36" aria-label="Theme">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {THEME_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <div className="py-4 first:pt-0 last:pb-0">
          <Label className="text-sm font-medium">Accent color</Label>
          <div className="mt-2.5 flex gap-3">
            {ACCENT_SWATCHES.map((a) => (
              <button
                key={a.value}
                type="button"
                aria-label={`${a.label} accent`}
                aria-pressed={d.accent === a.value}
                onClick={() => {
                  update('accent', a.value)
                  applyAccent(a.value)
                }}
                className={cn(
                  'grid size-9 place-items-center rounded-full transition',
                  d.accent === a.value
                    ? 'ring-2 ring-[var(--vx-accent-soft)] ring-offset-2 ring-offset-transparent'
                    : 'hover:scale-105'
                )}
                style={{ backgroundColor: a.hex }}
              >
                {d.accent === a.value && <Check className="size-4 text-white" />}
              </button>
            ))}
          </div>
        </div>
        <Row id="set-player-theme" label="Player theme">
          <Select
            value={d.playerTheme}
            onValueChange={(v) => update('playerTheme', v as SettingsDTO['playerTheme'])}
          >
            <SelectTrigger id="set-player-theme" className="w-44" aria-label="Player theme">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLAYER_THEME_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
      </SectionCard>

      {/* ── Library ──────────────────────────────────────────── */}
      <SectionCard title="Library" icon={FolderOpen}>
        <Row id="set-library-sort" label="Sort order" hint="Sort applies to library views">
          <Select value={librarySort} onValueChange={(v) => setLibrarySort(v as LibrarySort)}>
            <SelectTrigger id="set-library-sort" className="w-44" aria-label="Sort order">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <div className="py-4 first:pt-0 last:pb-0">
          <Label className="text-sm font-medium">Hidden folders</Label>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Hidden folders are excluded from Home, Videos and Folders.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {folders.length === 0 && (
              <p className="text-xs text-muted-foreground">No folders detected yet.</p>
            )}
            {folders.map((f) => {
              const hidden = hiddenFolders.includes(f)
              return (
                <button
                  key={f}
                  type="button"
                  aria-pressed={hidden}
                  onClick={() => toggleFolder(f)}
                  className={cn(
                    'vx-chip min-h-10 px-3.5 transition',
                    hidden
                      ? 'border-[var(--vx-accent)]/60 bg-[var(--vx-accent)]/15 text-[var(--vx-accent-soft)]'
                      : 'hover:text-foreground'
                  )}
                >
                  {hidden ? <EyeOff className="size-3.5 shrink-0" /> : <Eye className="size-3.5 shrink-0" />}
                  {f}
                </button>
              )
            })}
          </div>
        </div>
        <div className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
          <div className="min-w-0">
            <Label className="text-sm font-medium">Scan device storage</Label>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Import videos from this device's storage into your library.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={handleScanStorage}
            className="min-h-10 gap-2 rounded-xl"
          >
            <FolderSearch className="size-4" />
            Scan
          </Button>
        </div>
      </SectionCard>

      {/* ── Subtitles ────────────────────────────────────────── */}
      <SectionCard title="Subtitles" icon={Captions}>
        <Row id="set-subtitle-size" label="Default size">
          <Select
            value={d.subtitleSize}
            onValueChange={(v) => update('subtitleSize', v as SettingsDTO['subtitleSize'])}
          >
            <SelectTrigger id="set-subtitle-size" className="w-44" aria-label="Subtitle size">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUBTITLE_SIZE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <div className="py-4 first:pt-0 last:pb-0">
          <div className="mb-3 flex items-center justify-between gap-4">
            <Label className="text-sm font-medium">Position</Label>
            <span className="vx-chip tabular-nums">{d.subtitlePosition}%</span>
          </div>
          <Slider
            value={[d.subtitlePosition]}
            min={50}
            max={95}
            step={1}
            aria-label="Subtitle position"
            onValueChange={(v) => {
              const val = v[0]
              if (val !== undefined) setDraftKey('subtitlePosition', val)
            }}
            onValueCommit={(v) => {
              const val = v[0]
              if (val !== undefined) update('subtitlePosition', val)
            }}
          />
        </div>
        <div className="py-4 first:pt-0 last:pb-0">
          <div className="mb-3 flex items-center justify-between gap-4">
            <Label className="text-sm font-medium">Background opacity</Label>
            <span className="vx-chip tabular-nums">{d.subtitleBgOpacity}%</span>
          </div>
          <Slider
            value={[d.subtitleBgOpacity]}
            min={0}
            max={100}
            step={1}
            aria-label="Subtitle background opacity"
            onValueChange={(v) => {
              const val = v[0]
              if (val !== undefined) setDraftKey('subtitleBgOpacity', val)
            }}
            onValueCommit={(v) => {
              const val = v[0]
              if (val !== undefined) update('subtitleBgOpacity', val)
            }}
          />
        </div>
        <Row id="set-subtitle-lang" label="Default language">
          <Select
            value={d.defaultSubtitleLang}
            onValueChange={(v) => update('defaultSubtitleLang', v)}
          >
            <SelectTrigger id="set-subtitle-lang" className="w-44" aria-label="Default language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUBTITLE_LANGS.map((lang) => (
                <SelectItem key={lang} value={lang}>
                  {lang}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
      </SectionCard>

      {/* ── Privacy & Data ───────────────────────────────────── */}
      <SectionCard title="Privacy & Data" icon={ShieldCheck}>
        <Row
          label="Offline ad mode"
          hint="Simulate no internet — ads serve from local cache"
        >
          <Switch
            checked={offlineMode}
            onCheckedChange={setOfflineMode}
            aria-label="Offline ad mode"
          />
        </Row>
        <div className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
          <div className="min-w-0">
            <Label className="text-sm font-medium">Sync ad cache now</Label>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Download ads for offline playback.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => void handleSyncAdCache()}
            disabled={syncing}
            className="min-h-10 gap-2 rounded-xl"
          >
            {syncing ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            Sync
          </Button>
        </div>
        <div className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
          <div className="min-w-0">
            <Label className="text-sm font-medium">Clear watch history</Label>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Removes all resume points.
            </p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="min-h-10 gap-2 rounded-xl">
                <Trash2 className="size-4" />
                Clear
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear watch history?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes all resume points. Favorites and playlists are not affected.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => void handleClearHistory()}
                  className="bg-destructive text-white hover:bg-destructive/90"
                >
                  Clear
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        <div className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
          <div className="min-w-0">
            <Label className="text-sm font-medium">Clear offline ad cache</Label>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Frees cached ad creatives on this device.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={handleClearAdCache}
            className="min-h-10 gap-2 rounded-xl"
          >
            <Trash2 className="size-4" />
            Clear
          </Button>
        </div>
      </SectionCard>
    </div>
  )
}

export default SettingsView
