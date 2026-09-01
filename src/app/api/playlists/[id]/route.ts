import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** DELETE /api/playlists/[id] — remove a playlist (items cascade). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const existing = await db.playlist.findUnique({ where: { id }, select: { id: true } })
    if (!existing) return NextResponse.json({ error: 'Playlist not found' }, { status: 404 })

    await db.playlist.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/playlists/[id] failed:', err)
    return NextResponse.json({ error: 'Failed to delete playlist' }, { status: 500 })
  }
}
