'use client'

import { useEffect } from 'react'
import { Toaster } from 'sonner'
import AppShell from '@/components/app/AppShell'
import PlayerScreen from '@/components/player/PlayerScreen'
import AdminLogin from '@/components/admin/AdminLogin'
import AdminApp from '@/components/admin/AdminApp'
import { initClientSession, useAppStore } from '@/lib/store'
import { apiGet } from '@/lib/api'
import { refreshAdCache } from '@/lib/ads-client'
import type { SettingsDTO } from '@/lib/types'

/** Apply theme + accent to <html> from settings (dark-first). */
function applyAppearance(settings: SettingsDTO | null) {
  if (typeof document === 'undefined') return
  const theme = settings?.theme ?? 'dark'
  const dark =
    theme === 'dark' ||
    (theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  if (settings && settings.accent !== 'violet') {
    document.documentElement.dataset.accent = settings.accent
  } else {
    delete document.documentElement.dataset.accent
  }
}

export default function Home() {
  const adminView = useAppStore((s) => s.adminView)
  const playerVideo = useAppStore((s) => s.playerVideo)
  const setSettings = useAppStore((s) => s.setSettings)

  // boot: client session, settings, ad cache prefetch, admin session restore
  useEffect(() => {
    initClientSession()

    // restore admin panel if a token is still valid
    const token = useAppStore.getState().adminToken
    if (token) {
      void (async () => {
        try {
          const res = await fetch('/api/admin/audit?limit=1', {
            headers: { Authorization: `Bearer ${token}` },
          })
          if (res.ok) useAppStore.getState().setAdminView('panel')
        } catch {
          /* stay on player app */
        }
      })()
    }

    let cancelled = false
    void (async () => {
      try {
        const { settings } = await apiGet<{ settings: SettingsDTO }>('/api/settings')
        if (cancelled) return
        useAppStore.getState().setSettings(settings)
        applyAppearance(settings)
        void refreshAdCache(false)
      } catch {
        applyAppearance(null)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [setSettings])

  return (
    <>
      {adminView === 'panel' ? (
        <AdminApp />
      ) : (
        <AppShell />
      )}

      {adminView === 'login' && <AdminLogin />}

      {playerVideo && <PlayerScreen />}

      <Toaster
        position="top-center"
        theme="dark"
        toastOptions={{
          style: {
            background: 'rgba(18, 18, 34, 0.92)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#eee',
            backdropFilter: 'blur(12px)',
          },
        }}
      />
    </>
  )
}
