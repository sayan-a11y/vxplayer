import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = (await req.json().catch(() => null)) as { favorite?: unknown } | null
    if (!body || typeof body.favorite !== 'boolean') {
      return NextResponse.json({ error: 'Body must be { favorite: boolean }' }, { status: 400 })
    }

    const video = await db.video.findUnique({ where: { id }, select: { id: true } })
    if (!video) return NextResponse.json({ error: 'Video not found' }, { status: 404 })

    await db.video.update({ where: { id }, data: { favorite: body.favorite } })
    return NextResponse.json({ favorite: body.favorite })
  } catch (err) {
    console.error('POST /api/videos/[id]/favorite failed:', err)
    return NextResponse.json({ error: 'Failed to update favorite' }, { status: 500 })
  }
}
