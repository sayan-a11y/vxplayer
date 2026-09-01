import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  schemaInitialized?: boolean
}

function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  return 'postgresql://postgres.iypddnhvedcumpclkrxv:VXPlayer%402026Db@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true'
}

const resolvedDbUrl = getDatabaseUrl()
if (resolvedDbUrl) {
  process.env.DATABASE_URL = resolvedDbUrl
}

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
    // 1. Ensure AppSettings singleton exists
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

    // 2. Ensure Super Admin exists
    const admin = await db.adminUser.findUnique({ where: { email: 'admin@vxplayer.com' } }).catch(() => null)
    if (!admin) {
      const crypto = await import('crypto')
      const passwordHash = crypto.createHmac('sha256', 'vx-player-demo-secret-2026').update('pw:VXAdmin@2026').digest('hex')
      await db.adminUser.create({
        data: {
          email: 'admin@vxplayer.com',
          passwordHash,
          name: 'Super Admin',
          role: 'SUPER_ADMIN',
          twoFactor: true,
        },
      }).catch(() => {})
    }

    globalForPrisma.schemaInitialized = true
  } catch (err) {
    console.warn('Database ensureSchema notice:', err)
  }
}