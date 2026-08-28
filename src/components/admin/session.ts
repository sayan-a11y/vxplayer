'use client'

// Client-side admin session helpers: cached profile (localStorage), auth-aware
// fetch wrapper with global 401 handling, RBAC capability checks.

import { useEffect, useState } from 'react'
import { useAppStore } from '@/lib/store'
import type { AdminRole } from '@/lib/types'

const SESSION_KEY = 'vx_admin_session'

export type AdminSection =
  | 'dashboard'
  | 'users'
  | 'videos'
  | 'ads-manager'
  | 'campaigns'
  | 'creatives'
  | 'placements'
  | 'analytics'
  | 'reports'
  | 'settings'
  | 'admin-users'
  | 'security'
  | 'audit'

export type AdminSession = {
  name: string
  email: string
  role: AdminRole
}

const FALLBACK_SESSION: AdminSession = { name: 'Admin', email: '', role: 'VIEWER' }

export function getAdminSession(): AdminSession | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AdminSession> | null
    if (!parsed || typeof parsed.email !== 'string' || !parsed.role) return null
    return {
      name: typeof parsed.name === 'string' ? parsed.name : 'Admin',
      email: parsed.email,
      role: parsed.role,
    }
  } catch {
    return null
  }
}

export function saveAdminSession(session: AdminSession): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function clearAdminSession(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(SESSION_KEY)
}

/** Hook: hydrated admin session (falls back to VIEWER until loaded). */
export function useAdminSession(): AdminSession {
  const [session, setSession] = useState<AdminSession>(FALLBACK_SESSION)
  useEffect(() => {
    setSession(getAdminSession() ?? FALLBACK_SESSION)
  }, [])
  return session
}

export type AdminCapability = 'campaigns' | 'settings'

/**
 * Client-side RBAC check. Server always enforces the same rules;
 * this only drives UI visibility.
 *  - campaigns: SUPER_ADMIN, ADMIN, AD_MANAGER
 *  - settings:  SUPER_ADMIN, ADMIN
 */
export function can(role: AdminRole | null | undefined, cap: AdminCapability): boolean {
  if (!role) return false
  if (role === 'SUPER_ADMIN' || role === 'ADMIN') return true
  if (cap === 'campaigns' && role === 'AD_MANAGER') return true
  return false
}

export class AdminHttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

type AdminFetchInit = RequestInit & { skipAuthRedirect?: boolean }

async function toAdminError(res: Response): Promise<AdminHttpError> {
  let message = `Request failed (${res.status})`
  try {
    const data = (await res.json()) as { error?: string } | null
    if (data && typeof data.error === 'string') message = data.error
  } catch {
    /* ignore body parse errors */
  }
  return new AdminHttpError(res.status, message)
}

/**
 * fetch wrapper for admin APIs: injects `Authorization: Bearer <token>` from
 * the store and handles 401 globally (clear token + session → back to login).
 */
export async function adminFetch<T>(url: string, init: AdminFetchInit = {}): Promise<T> {
  const { skipAuthRedirect, headers: initHeaders, ...rest } = init
  const token = useAppStore.getState().adminToken
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((initHeaders as Record<string, string>) ?? {}),
  }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(url, { ...rest, headers })
  if (!res.ok) {
    if (res.status === 401) {
      const store = useAppStore.getState()
      if (!skipAuthRedirect && store.adminToken) {
        store.setAdminToken(null)
        clearAdminSession()
        store.setAdminView('login')
      }
    }
    throw await toAdminError(res)
  }
  return (await res.json()) as T
}

export function adminGet<T>(url: string): Promise<T> {
  return adminFetch<T>(url, { method: 'GET', cache: 'no-store' })
}

export function adminPost<T>(url: string, body?: unknown): Promise<T> {
  return adminFetch<T>(url, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export function adminPatch<T>(url: string, body: unknown): Promise<T> {
  return adminFetch<T>(url, { method: 'PATCH', body: JSON.stringify(body) })
}

export function adminDelete<T>(url: string): Promise<T> {
  return adminFetch<T>(url, { method: 'DELETE' })
}
