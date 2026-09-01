/**
 * VX Player — database seed (production-clean)
 * Run: bun prisma/seed.ts
 *
 * Seeds ONLY operational baseline data:
 *  - App settings singleton (kill switches, ad frequency defaults)
 *  - Admin accounts (roles: SUPER_ADMIN / AD_MANAGER / VIEWER)
 *
 * No demo videos, no demo ad campaigns/creatives, no fake analytics,
 * no seeded history/playlists. The library and ad stack start empty —
 * real content arrives via the library scanner and the Admin panel.
 */
import { PrismaClient } from '@prisma/client'
import crypto from 'crypto'

const db = new PrismaClient()

const SECRET = 'vx-player-demo-secret-2026'
function hashPassword(password: string): string {
  return crypto.createHmac('sha256', SECRET).update(`pw:${password}`).digest('hex')
}

function daysAgo(n: number, hourOffset = 0): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(9 + (hourOffset % 12), (hourOffset * 7) % 60, 0, 0)
  return d
}

async function main() {
  console.log('Seeding VX Player database (clean baseline)…')

  // wipe (in FK-safe order) — removes ALL existing content
  await db.adEvent.deleteMany()
  await db.dailyStat.deleteMany()
  await db.auditLog.deleteMany()
  await db.creative.deleteMany()
  await db.campaign.deleteMany()
  await db.playlistItem.deleteMany()
  await db.playlist.deleteMany()
  await db.historyEntry.deleteMany()
  await db.video.deleteMany()
  await db.adminUser.deleteMany()
  await db.appSettings.deleteMany()

  // ── Settings singleton ──
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
  })

  // ── Admin users ──
  await db.adminUser.createMany({
    data: [
      { email: 'admin@vxplayer.com', passwordHash: hashPassword('VXAdmin@2026'), name: 'Vikram Rao', role: 'SUPER_ADMIN', lastLoginAt: daysAgo(0, 1) },
      { email: 'ads@vxplayer.com', passwordHash: hashPassword('Ads@2026'), name: 'Anaya Menon', role: 'AD_MANAGER', lastLoginAt: daysAgo(1, 4) },
      { email: 'viewer@vxplayer.com', passwordHash: hashPassword('Viewer@2026'), name: 'Rohan Iyer', role: 'VIEWER', lastLoginAt: daysAgo(2, 2) },
    ],
  })

  console.log('Seed complete ✔ — clean baseline: 0 videos, 0 campaigns, 0 creatives, 0 analytics rows.')
  console.log('Admin login: admin@vxplayer.com / VXAdmin@2026')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
