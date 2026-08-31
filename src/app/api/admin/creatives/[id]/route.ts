import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/admin-auth'
import { CAMPAIGN_MUTATION_ROLES, writeAudit } from '../../campaigns/utils'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Resolve a creative mediaUrl (/ads/<file>) to a safe path inside public/ads. */
function mediaFilePath(mediaUrl: string | null): string | null {
  if (!mediaUrl || !mediaUrl.startsWith('/ads/')) return null
  const base = path.basename(mediaUrl)
  if (!base || base === '.' || base === '..') return null
  return path.join(process.cwd(), 'public', 'ads', base)
}

/**
 * DELETE /api/admin/creatives/[id] — permanently remove a creative and its
 * media file. RBAC: SUPER_ADMIN | ADMIN | AD_MANAGER.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = requireAuth(req)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!CAMPAIGN_MUTATION_ROLES.includes(session.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { id } = await params
    const existing = await db.creative.findUnique({
      where: { id },
      include: { campaign: { select: { name: true } } },
    })
    if (!existing) return NextResponse.json({ error: 'Creative not found' }, { status: 404 })

    await db.creative.delete({ where: { id } })

    // Best-effort media file removal (creative is already gone either way).
    const file = mediaFilePath(existing.mediaUrl)
    if (file) {
      await fs.rm(file, { force: true }).catch(() => {})
    }

    await writeAudit(
      session.email,
      'CREATIVE_DELETE',
      `${existing.campaign.name} — ${existing.name}`,
      `Deleted ${existing.type.toLowerCase()} creative${existing.mediaUrl ? ` (media: ${existing.mediaUrl})` : ''}`
    )

    return NextResponse.json({ ok: true, id, name: existing.name })
  } catch (err) {
    console.error('DELETE /api/admin/creatives/[id] failed:', err)
    return NextResponse.json({ error: 'Failed to delete creative' }, { status: 500 })
  }
}
