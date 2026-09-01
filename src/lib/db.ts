import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  schemaInitialized?: boolean
}

const SUPABASE_DB_URL =
  'postgresql://postgres.iypddnhvedcumpclkrxv:VXPlayer%402026Db@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true'

function getDatabaseUrl(): string {
  const envUrl = process.env.DATABASE_URL?.trim()
  if (envUrl && (envUrl.startsWith('postgresql://') || envUrl.startsWith('postgres://'))) {
    return envUrl
  }
  return SUPABASE_DB_URL
}

const resolvedDbUrl = getDatabaseUrl()
process.env.DATABASE_URL = resolvedDbUrl

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: resolvedDbUrl,
      },
    },
    log: ['error', 'warn'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

/**
 * Ensure baseline singleton records exist across all environments.
 */
export async function ensureSchema(): Promise<void> {
  if (globalForPrisma.schemaInitialized) return

  try {
    // 1. Ensure AppSettings singleton exists & all placement columns exist
    await db.$executeRawUnsafe(`
      ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "heroEnabled" BOOLEAN DEFAULT true;
      ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "footerEnabled" BOOLEAN DEFAULT true;
      ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "videoOverlayEnabled" BOOLEAN DEFAULT true;
      ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "imageOverlayEnabled" BOOLEAN DEFAULT true;
      ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "homeFeedEnabled" BOOLEAN DEFAULT true;
      ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "betweenCardsEnabled" BOOLEAN DEFAULT true;
      ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "upNextEnabled" BOOLEAN DEFAULT true;
      ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "playerBottomEnabled" BOOLEAN DEFAULT true;
    `).catch(() => {})

    const settings = await db.appSettings.findFirst().catch(() => null)
    if (!settings) {
      await db.appSettings.create({
        data: {
          id: 'singleton',
          adsEnabled: true,
          preRollEnabled: true,
          midRollEnabled: true,
          postRollEnabled: true,
          overlayEnabled: true,
          bannerEnabled: true,
          adsPerSession: 6,
          maxMidRolls: 2,
          overlayPerHour: 3,
          minMidRollDurationSec: 90,
          offlineAdFallback: 'LAST_CACHED',
          adCacheVersion: 1,
        },
      }).catch(() => {})
    }

    // 2. Ensure Super Admin accounts exist
    const crypto = await import('crypto')
    const secret = process.env.ADMIN_TOKEN_SECRET || 'vx-player-demo-secret-2026'
    const hash = (pw: string) => crypto.createHmac('sha256', secret).update(`pw:${pw}`).digest('hex')

    const defaultAdmins = [
      { email: 'admin@vxplayer.com', name: 'Super Admin', role: 'SUPER_ADMIN', pw: 'VXAdmin@2026' },
      { email: 'sayankarmakar159@gmail.com', name: 'Sayan Karmakar', role: 'SUPER_ADMIN', pw: 'VXPlayer@2026Db' },
      { email: 'ads@vxplayer.com', name: 'Ad Manager', role: 'AD_MANAGER', pw: 'Ads@2026' },
      { email: 'viewer@vxplayer.com', name: 'Analyst', role: 'VIEWER', pw: 'Viewer@2026' },
    ]

    for (const a of defaultAdmins) {
      const existing = await db.adminUser.findUnique({ where: { email: a.email } }).catch(() => null)
      if (!existing) {
        await db.adminUser.create({
          data: {
            email: a.email,
            passwordHash: hash(a.pw),
            name: a.name,
            role: a.role,
            twoFactor: true,
          },
        }).catch(() => {})
      }
    }

    globalForPrisma.schemaInitialized = true
  } catch (err) {
    console.warn('Database ensureSchema notice:', err)
  }
}