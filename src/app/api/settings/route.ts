import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { AppSettings } from '@prisma/client'
import type { SettingsDTO } from '@/lib/types'

export const dynamic = 'force-dynamic'

/** Fetch (or lazily create) the settings singleton row. */
async function getSettingsRow(): Promise<AppSettings> {
  const existing = await db.appSettings.findUnique({ where: { id: 'singleton' } })
  if (existing) return existing
  return db.appSettings.create({ data: { id: 'singleton' } })
}

function toSettingsDTO(s: AppSettings): SettingsDTO {
  return {
    adsEnabled: s.adsEnabled,
    preRollEnabled: s.preRollEnabled,
    midRollEnabled: s.midRollEnabled,
    postRollEnabled: s.postRollEnabled,
    overlayEnabled: s.overlayEnabled,
    bannerEnabled: s.bannerEnabled,
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

/** Player-facing editable keys only — ad/kill-switch keys are ignored on this route. */
const PLAYER_KEYS = [
  'defaultSpeed',
  'autoPlayNext',
  'resumePlayback',
  'doubleTapSeek',
  'hwAcceleration',
  'defaultOrientation',
  'theme',
  'accent',
  'playerTheme',
  'subtitleSize',
  'subtitlePosition',
  'subtitleBgOpacity',
  'defaultSubtitleLang',
] as const

const clampInt = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(v)))

export async function GET() {
  try {
    const s = await getSettingsRow()
    return NextResponse.json({ settings: toSettingsDTO(s) })
  } catch (err) {
    console.error('GET /api/settings failed:', err)
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 })
  }
}

/** PATCH /api/settings — update player defaults; silently ignores ad/kill-switch keys. */
export async function PATCH(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const data: Partial<AppSettings> = {}

    if ('defaultSpeed' in body && typeof body.defaultSpeed === 'number' && body.defaultSpeed > 0) {
      data.defaultSpeed = clampInt(body.defaultSpeed * 100, 25, 400) / 100
    }
    if ('autoPlayNext' in body && typeof body.autoPlayNext === 'boolean') {
      data.autoPlayNext = body.autoPlayNext
    }
    if ('resumePlayback' in body && typeof body.resumePlayback === 'boolean') {
      data.resumePlayback = body.resumePlayback
    }
    if ('doubleTapSeek' in body && typeof body.doubleTapSeek === 'number') {
      data.doubleTapSeek = clampInt(body.doubleTapSeek, 5, 60)
    }
    if ('hwAcceleration' in body && typeof body.hwAcceleration === 'boolean') {
      data.hwAcceleration = body.hwAcceleration
    }
    if (
      'defaultOrientation' in body &&
      typeof body.defaultOrientation === 'string' &&
      ['PORTRAIT', 'LANDSCAPE', 'SENSOR', 'LOCKED'].includes(body.defaultOrientation)
    ) {
      data.defaultOrientation = body.defaultOrientation
    }
    if ('theme' in body && typeof body.theme === 'string' && ['dark', 'light', 'system'].includes(body.theme)) {
      data.theme = body.theme
    }
    if (
      'accent' in body &&
      typeof body.accent === 'string' &&
      ['violet', 'purple', 'fuchsia', 'rose'].includes(body.accent)
    ) {
      data.accent = body.accent
    }
    if (
      'playerTheme' in body &&
      typeof body.playerTheme === 'string' &&
      ['OLED', 'DIM'].includes(body.playerTheme)
    ) {
      data.playerTheme = body.playerTheme
    }
    if (
      'subtitleSize' in body &&
      typeof body.subtitleSize === 'string' &&
      ['S', 'M', 'L', 'XL'].includes(body.subtitleSize)
    ) {
      data.subtitleSize = body.subtitleSize
    }
    if ('subtitlePosition' in body && typeof body.subtitlePosition === 'number') {
      data.subtitlePosition = clampInt(body.subtitlePosition, 0, 100)
    }
    if ('subtitleBgOpacity' in body && typeof body.subtitleBgOpacity === 'number') {
      data.subtitleBgOpacity = clampInt(body.subtitleBgOpacity, 0, 100)
    }
    if ('defaultSubtitleLang' in body && typeof body.defaultSubtitleLang === 'string') {
      data.defaultSubtitleLang = body.defaultSubtitleLang.trim() || 'English'
    }

    const ignored = Object.keys(body).filter(
      (k) => !(PLAYER_KEYS as readonly string[]).includes(k)
    )
    if (ignored.length > 0) {
      console.warn('PATCH /api/settings ignored non-player keys:', ignored.join(', '))
    }

    await getSettingsRow()
    const updated = await db.appSettings.update({ where: { id: 'singleton' }, data })
    return NextResponse.json({ settings: toSettingsDTO(updated) })
  } catch (err) {
    console.error('PATCH /api/settings failed:', err)
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
  }
}
