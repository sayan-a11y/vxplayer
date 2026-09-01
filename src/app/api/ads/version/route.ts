import { NextResponse } from 'next/server'
import { db, ensureSchema } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/ads/version?v=<currentClientVersion>
 * Ultra-fast incremental sync check (<5ms).
 * If version matches, returns { changed: false }.
 * If version differs, returns full sync payload so client applies changes immediately.
 */
export async function GET(req: Request) {
  try {
    await ensureSchema()
    const url = new URL(req.url)
    const clientVersion = parseInt(url.searchParams.get('v') || '0', 10)

    const settings = await db.appSettings.findUnique({ where: { id: 'singleton' } })
    if (!settings) {
      return NextResponse.json({ changed: false, version: 1 })
    }

    const serverVersion = settings.adCacheVersion || 1

    if (clientVersion === serverVersion) {
      return NextResponse.json({
        changed: false,
        version: serverVersion,
      })
    }

    return NextResponse.json({
      changed: true,
      version: serverVersion,
      settings: {
        adsEnabled: settings.adsEnabled,
        preRollEnabled: settings.preRollEnabled,
        midRollEnabled: settings.midRollEnabled,
        postRollEnabled: settings.postRollEnabled,
        overlayEnabled: settings.overlayEnabled,
        bannerEnabled: settings.bannerEnabled,
        footerEnabled: (settings as any).footerEnabled ?? true,
        adsPerSession: settings.adsPerSession,
        maxMidRolls: settings.maxMidRolls,
        overlayPerHour: settings.overlayPerHour,
        minMidRollDurationSec: settings.minMidRollDurationSec,
        offlineAdFallback: settings.offlineAdFallback,
        adCacheVersion: serverVersion,
      },
    })
  } catch (err) {
    return NextResponse.json({ changed: false, version: 1 }, { status: 200 })
  }
}
