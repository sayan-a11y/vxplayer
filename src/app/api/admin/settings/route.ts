import { NextResponse } from 'next/server'
import { db, ensureSchema } from '@/lib/db'
import type { AppSettings } from '@prisma/client'
import { requireAuth } from '@/lib/admin-auth'
import type { SettingsDTO } from '@/lib/types'
import { SETTINGS_ADMIN_ROLES, writeAudit } from '../campaigns/utils'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function getSettingsRow(): Promise<AppSettings> {
  await ensureSchema()
  const existing = await db.appSettings.findUnique({ where: { id: 'singleton' } }).catch(() => null)
  if (existing) return existing
  return db.appSettings.create({ data: { id: 'singleton' } })
}

function toSettingsDTO(s: AppSettings): SettingsDTO {
  const custom = s as unknown as Record<string, unknown>
  return {
    adsEnabled: s.adsEnabled,
    heroEnabled: (custom.heroEnabled as boolean | undefined) ?? true,
    preRollEnabled: s.preRollEnabled,
    midRollEnabled: s.midRollEnabled,
    postRollEnabled: s.postRollEnabled,
    videoOverlayEnabled: (custom.videoOverlayEnabled as boolean | undefined) ?? s.overlayEnabled ?? true,
    imageOverlayEnabled: (custom.imageOverlayEnabled as boolean | undefined) ?? s.overlayEnabled ?? true,
    overlayEnabled: s.overlayEnabled,
    bannerEnabled: s.bannerEnabled,
    footerEnabled: (custom.footerEnabled as boolean | undefined) ?? true,
    homeFeedEnabled: (custom.homeFeedEnabled as boolean | undefined) ?? true,
    betweenCardsEnabled: (custom.betweenCardsEnabled as boolean | undefined) ?? true,
    upNextEnabled: (custom.upNextEnabled as boolean | undefined) ?? true,
    playerBottomEnabled: (custom.playerBottomEnabled as boolean | undefined) ?? true,
    adsPerSession: s.adsPerSession,
    maxMidRolls: s.maxMidRolls,
    overlayPerHour: s.overlayPerHour,
    minMidRollDurationSec: s.minMidRollDurationSec,
    offlineAdFallback: s.offlineAdFallback === 'SKIP_ADS' ? 'SKIP_ADS' : 'LAST_CACHED',
    adCacheVersion: s.adCacheVersion,
    defaultSpeed: s.defaultSpeed,
    autoPlayNext: s.autoPlayNext,
    resumePlayback: s.resumePlayback,
    doubleTapSeek: s.doubleTapSeek,
    hwAcceleration: s.hwAcceleration,
    defaultOrientation: (['PORTRAIT', 'LANDSCAPE', 'SENSOR', 'LOCKED'].includes(s.defaultOrientation)
      ? s.defaultOrientation
      : 'SENSOR') as SettingsDTO['defaultOrientation'],
    theme: (['dark', 'light', 'system'].includes(s.theme)
      ? s.theme
      : 'dark') as SettingsDTO['theme'],
    accent: (['violet', 'purple', 'fuchsia', 'rose'].includes(s.accent)
      ? s.accent
      : 'violet') as SettingsDTO['accent'],
    playerTheme: (['OLED', 'DIM'].includes(s.playerTheme)
      ? s.playerTheme
      : 'OLED') as SettingsDTO['playerTheme'],
    subtitleSize: (['S', 'M', 'L', 'XL'].includes(s.subtitleSize)
      ? s.subtitleSize
      : 'M') as SettingsDTO['subtitleSize'],
    subtitlePosition: s.subtitlePosition,
    subtitleBgOpacity: s.subtitleBgOpacity,
    defaultSubtitleLang: s.defaultSubtitleLang,
  }
}

const clampInt = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(v)))

/** Keys that act as ad kill switches — changes here are audited as ADS_KILL_SWITCH. */
const KILL_SWITCH_KEYS = [
  'adsEnabled',
  'heroEnabled',
  'preRollEnabled',
  'midRollEnabled',
  'postRollEnabled',
  'videoOverlayEnabled',
  'imageOverlayEnabled',
  'overlayEnabled',
  'bannerEnabled',
  'footerEnabled',
  'homeFeedEnabled',
  'betweenCardsEnabled',
  'upNextEnabled',
  'playerBottomEnabled',
]

/** GET /api/admin/settings — full platform settings. */
export async function GET(req: Request) {
  try {
    const session = requireAuth(req)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const s = await getSettingsRow()
    return NextResponse.json({ settings: toSettingsDTO(s) })
  } catch (err) {
    console.error('GET /api/admin/settings failed:', err)
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 })
  }
}

/** PATCH /api/admin/settings — full settings update incl. ad kill switches. RBAC: SUPER_ADMIN | ADMIN. */
export async function PATCH(req: Request) {
  try {
    const session = requireAuth(req)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!SETTINGS_ADMIN_ROLES.includes(session.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const data: Partial<AppSettings> = {}
    const changes: string[] = []
    const num = (v: unknown): number | null =>
      typeof v === 'number' && Number.isFinite(v) ? v : null

    // Ad kill switches (booleans)
    for (const key of KILL_SWITCH_KEYS) {
      if (key in body) {
        if (typeof body[key] !== 'boolean') {
          return NextResponse.json({ error: `${key} must be a boolean` }, { status: 400 })
        }
        ;(data as Record<string, unknown>)[key] = body[key]
        changes.push(`${key} → ${body[key]}`)
      }
    }

    // Frequency / numeric ad settings
    const numericKeys: [keyof AppSettings, number, number][] = [
      ['adsPerSession', 0, 100],
      ['maxMidRolls', 0, 20],
      ['overlayPerHour', 0, 100],
      ['minMidRollDurationSec', 0, 7200],
      ['adCacheVersion', 1, 1000000],
      ['doubleTapSeek', 5, 60],
      ['subtitlePosition', 0, 100],
      ['subtitleBgOpacity', 0, 100],
    ]
    for (const [key, min, max] of numericKeys) {
      if (key in body) {
        const v = num(body[key as string])
        if (v === null) {
          return NextResponse.json({ error: `${String(key)} must be a number` }, { status: 400 })
        }
        ;(data as Record<string, unknown>)[key] = clampInt(v, min, max)
        changes.push(`${String(key)} → ${clampInt(v, min, max)}`)
      }
    }
    if ('defaultSpeed' in body) {
      const v = num(body.defaultSpeed)
      if (v === null || v <= 0) {
        return NextResponse.json({ error: 'defaultSpeed must be a positive number' }, { status: 400 })
      }
      const speed = clampInt(v * 100, 25, 400) / 100
      data.defaultSpeed = speed
      changes.push(`defaultSpeed → ${speed}`)
    }

    // Enum settings
    const enumKeys: [string, string[]][] = [
      ['offlineAdFallback', ['SKIP_ADS', 'LAST_CACHED']],
      ['defaultOrientation', ['PORTRAIT', 'LANDSCAPE', 'SENSOR', 'LOCKED']],
      ['theme', ['dark', 'light', 'system']],
      ['accent', ['violet', 'purple', 'fuchsia', 'rose']],
      ['playerTheme', ['OLED', 'DIM']],
      ['subtitleSize', ['S', 'M', 'L', 'XL']],
    ]
    for (const [key, allowed] of enumKeys) {
      if (key in body) {
        const v = body[key]
        if (typeof v !== 'string' || !allowed.includes(v)) {
          return NextResponse.json({ error: `Invalid value for ${key}` }, { status: 400 })
        }
        ;(data as Record<string, unknown>)[key] = v
        changes.push(`${key} → ${v}`)
      }
    }

    // Free-text
    if ('defaultSubtitleLang' in body) {
      if (typeof body.defaultSubtitleLang !== 'string') {
        return NextResponse.json({ error: 'defaultSubtitleLang must be a string' }, { status: 400 })
      }
      data.defaultSubtitleLang = body.defaultSubtitleLang.trim() || 'English'
      changes.push(`defaultSubtitleLang → ${data.defaultSubtitleLang}`)
    }

    await getSettingsRow()
    const updated = await db.appSettings.update({ where: { id: 'singleton' }, data })

    const touchedKillSwitch = KILL_SWITCH_KEYS.some((k) => k in body)
    await writeAudit(
      session.email,
      touchedKillSwitch ? 'ADS_KILL_SWITCH' : 'SETTINGS_UPDATED',
      'App Settings',
      changes.length > 0
        ? `Updated ${changes.length} setting(s): ${changes.slice(0, 8).join('; ')}${changes.length > 8 ? '; …' : ''}`
        : 'No settings changed'
    )

    return NextResponse.json({ settings: toSettingsDTO(updated) })
  } catch (err) {
    console.error('PATCH /api/admin/settings failed:', err)
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
  }
}
