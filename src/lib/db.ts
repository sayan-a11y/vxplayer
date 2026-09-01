import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  schemaInitialized?: boolean
}

function getDatabaseUrl(): string {
  // If running on Vercel or in serverless environment
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const tmpDbPath = '/tmp/custom.db'
    if (!fs.existsSync(tmpDbPath)) {
      const candidates = [
        path.join(process.cwd(), 'db', 'custom.db'),
        path.join(process.cwd(), 'prisma', 'custom.db'),
        path.join(process.cwd(), 'custom.db'),
      ]
      for (const cand of candidates) {
        if (fs.existsSync(cand)) {
          try {
            fs.copyFileSync(cand, tmpDbPath)
            break
          } catch (e) {
            console.warn('Failed to copy initial database to /tmp:', e)
          }
        }
      }
    }
    return `file:${tmpDbPath}`
  }

  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  return 'file:../db/custom.db'
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
 * Ensure SQLite tables and baseline singleton records exist across all environments.
 * Safe to call concurrently — executes idempotent DDL with IF NOT EXISTS.
 */
export async function ensureSchema(): Promise<void> {
  if (globalForPrisma.schemaInitialized) return

  try {
    // 1. Enable WAL mode & foreign keys
    await db.$executeRawUnsafe(`PRAGMA journal_mode = WAL;`).catch(() => {})
    await db.$executeRawUnsafe(`PRAGMA foreign_keys = ON;`).catch(() => {})

    // 2. Create core tables
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Video" (
        "id" TEXT PRIMARY KEY,
        "title" TEXT NOT NULL,
        "fileName" TEXT NOT NULL,
        "folder" TEXT NOT NULL,
        "duration" INTEGER NOT NULL,
        "width" INTEGER NOT NULL,
        "height" INTEGER NOT NULL,
        "resolutionLabel" TEXT NOT NULL,
        "sizeMB" INTEGER NOT NULL,
        "codec" TEXT NOT NULL,
        "audioCodec" TEXT NOT NULL,
        "container" TEXT NOT NULL,
        "frameRate" REAL NOT NULL,
        "srcUrl" TEXT NOT NULL,
        "thumbnailUrl" TEXT NOT NULL,
        "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "favorite" BOOLEAN NOT NULL DEFAULT 0
      );
    `).catch(() => {})

    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "QualityVariant" (
        "id" TEXT PRIMARY KEY,
        "videoId" TEXT NOT NULL,
        "label" TEXT NOT NULL,
        "width" INTEGER NOT NULL,
        "height" INTEGER NOT NULL,
        "bitrateKbps" INTEGER NOT NULL DEFAULT 0,
        "filePath" TEXT NOT NULL,
        "fileSizeMB" INTEGER NOT NULL DEFAULT 0,
        "status" TEXT NOT NULL DEFAULT 'PROCESSING',
        "isSource" BOOLEAN NOT NULL DEFAULT 0,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE
      );
    `).catch(() => {})

    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "HistoryEntry" (
        "id" TEXT PRIMARY KEY,
        "videoId" TEXT NOT NULL UNIQUE,
        "position" INTEGER NOT NULL,
        "watchedPct" REAL NOT NULL,
        "sessionId" TEXT,
        "lastPlayedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE
      );
    `).catch(() => {})

    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Playlist" (
        "id" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `).catch(() => {})

    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PlaylistItem" (
        "id" TEXT PRIMARY KEY,
        "playlistId" TEXT NOT NULL,
        "videoId" TEXT NOT NULL,
        "order" INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE CASCADE,
        FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE
      );
    `).catch(() => {})

    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "AdminUser" (
        "id" TEXT PRIMARY KEY,
        "email" TEXT NOT NULL UNIQUE,
        "passwordHash" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "role" TEXT NOT NULL,
        "twoFactor" BOOLEAN NOT NULL DEFAULT 1,
        "lastLoginAt" DATETIME,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `).catch(() => {})

    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "AuditLog" (
        "id" TEXT PRIMARY KEY,
        "adminName" TEXT NOT NULL,
        "adminRole" TEXT NOT NULL,
        "action" TEXT NOT NULL,
        "details" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `).catch(() => {})

    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Campaign" (
        "id" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL,
        "advertiser" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'DRAFT',
        "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
        "startAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "endAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "frequencyCap" INTEGER NOT NULL DEFAULT 5,
        "placements" TEXT NOT NULL,
        "targeting" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `).catch(() => {})

    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Creative" (
        "id" TEXT PRIMARY KEY,
        "campaignId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "mediaUrl" TEXT NOT NULL,
        "duration" INTEGER NOT NULL,
        "skipAfter" INTEGER NOT NULL DEFAULT 5,
        "overlayPos" TEXT,
        "headline" TEXT,
        "bodyText" TEXT,
        "ctaText" TEXT,
        "ctaUrl" TEXT,
        "clickTracking" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE
      );
    `).catch(() => {})

    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "AdEvent" (
        "id" TEXT PRIMARY KEY,
        "campaignId" TEXT NOT NULL,
        "creativeId" TEXT NOT NULL,
        "eventType" TEXT NOT NULL,
        "placement" TEXT NOT NULL,
        "videoId" TEXT,
        "sessionId" TEXT,
        "country" TEXT,
        "device" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE,
        FOREIGN KEY ("creativeId") REFERENCES "Creative"("id") ON DELETE CASCADE
      );
    `).catch(() => {})

    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "DailyStat" (
        "id" TEXT PRIMARY KEY,
        "date" DATETIME NOT NULL,
        "campaignId" TEXT,
        "impressions" INTEGER NOT NULL DEFAULT 0,
        "starts" INTEGER NOT NULL DEFAULT 0,
        "firstQuartile" INTEGER NOT NULL DEFAULT 0,
        "midpoint" INTEGER NOT NULL DEFAULT 0,
        "thirdQuartile" INTEGER NOT NULL DEFAULT 0,
        "completions" INTEGER NOT NULL DEFAULT 0,
        "skips" INTEGER NOT NULL DEFAULT 0,
        "clicks" INTEGER NOT NULL DEFAULT 0,
        "errors" INTEGER NOT NULL DEFAULT 0
      );
    `).catch(() => {})

    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "AppSettings" (
        "id" TEXT PRIMARY KEY,
        "adsEnabled" BOOLEAN NOT NULL DEFAULT 1,
        "preRollEnabled" BOOLEAN NOT NULL DEFAULT 1,
        "midRollEnabled" BOOLEAN NOT NULL DEFAULT 1,
        "postRollEnabled" BOOLEAN NOT NULL DEFAULT 1,
        "overlayEnabled" BOOLEAN NOT NULL DEFAULT 1,
        "bannerEnabled" BOOLEAN NOT NULL DEFAULT 1,
        "adsPerSession" INTEGER NOT NULL DEFAULT 6,
        "maxMidRolls" INTEGER NOT NULL DEFAULT 2,
        "overlayPerHour" INTEGER NOT NULL DEFAULT 3,
        "minMidRollDurationSec" INTEGER NOT NULL DEFAULT 90,
        "offlineAdFallback" TEXT NOT NULL DEFAULT 'LAST_CACHED',
        "adCacheVersion" INTEGER NOT NULL DEFAULT 1
      );
    `).catch(() => {})

    // 3. Ensure AppSettings singleton exists
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

    // 4. Ensure Super Admin exists
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