import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * POST /api/scan — simulate a library rescan.
 * Counts current library entries; nothing new is added in the demo environment.
 */
export async function POST() {
  try {
    const found = await db.video.count()
    return NextResponse.json({ found, newVideos: 0 })
  } catch (err) {
    console.error('POST /api/scan failed:', err)
    return NextResponse.json({ error: 'Library scan failed' }, { status: 500 })
  }
}
