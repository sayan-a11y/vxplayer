/**
 * VX Player — database seed
 * Run: bun prisma/seed.ts
 */
import { PrismaClient } from '@prisma/client'
import crypto from 'crypto'

const db = new PrismaClient()

const SECRET = 'vx-player-demo-secret-2026'
function hashPassword(password: string): string {
  return crypto.createHmac('sha256', SECRET).update(`pw:${password}`).digest('hex')
}

const BUCKET = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample'

function daysAgo(n: number, hourOffset = 0): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(9 + (hourOffset % 12), (hourOffset * 7) % 60, 0, 0)
  return d
}

async function main() {
  console.log('Seeding VX Player database…')

  // wipe (in FK-safe order)
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

  // ── Videos ──
  const videoDefs = [
    { title: 'Big Buck Bunny', fileName: 'Big.Buck.Bunny.2008.mkv', folder: 'Movies', duration: 360, w: 1920, h: 1080, res: '1080p', size: 742, codec: 'h264', container: 'mkv', src: '/media/bigbuck.mp4', thumb: '/thumbs/bigbuck.png', added: 45 },
    { title: 'Sintel', fileName: 'Sintel.2010.mkv', folder: 'Movies', duration: 420, w: 1920, h: 1080, res: '1080p', size: 1104, codec: 'hevc', container: 'mkv', src: '/media/sintel.mp4', thumb: '/thumbs/sintel.png', added: 30 },
    { title: 'Elephants Dream', fileName: 'Elephants.Dream.2006.mkv', folder: 'Movies', duration: 200, w: 1920, h: 1080, res: '1080p', size: 818, codec: 'h264', container: 'mkv', src: '/media/elephants.mp4', thumb: '/thumbs/elephants.png', added: 21 },
    { title: 'Tears of Steel', fileName: 'Tears.of.Steel.2012.mkv', folder: 'Movies', duration: 390, w: 1920, h: 1080, res: '1080p', size: 921, codec: 'hevc', container: 'mkv', src: '/media/tears.mp4', thumb: '/thumbs/tears.png', added: 12 },
    { title: 'Night Street Runners', fileName: 'Night.Street.Runners.mp4', folder: 'Trailers', duration: 46, w: 1920, h: 1080, res: '1080p', size: 62, codec: 'h264', container: 'mp4', src: '/media/bullrun.mp4', thumb: '/thumbs/bullrun.png', added: 6 },
    { title: 'Beach Day Fun', fileName: 'Beach.Day.Fun.mp4', folder: 'Trailers', duration: 60, w: 1920, h: 1080, res: '1080p', size: 81, codec: 'h264', container: 'mp4', src: '/media/forbigfun.mp4', thumb: '/thumbs/forbigfun.png', added: 4 },
    { title: 'VW Golf GTI Review', fileName: 'VW.Golf.GTI.Review.mp4', folder: 'Car Reviews', duration: 300, w: 1280, h: 720, res: '720p', size: 388, codec: 'h264', container: 'mp4', src: '/media/vw.mp4', thumb: '/thumbs/vw.png', added: 15 },
    { title: 'Subaru Outback: Street and Dirt', fileName: 'Subaru.Outback.Street.and.Dirt.mp4', folder: 'Car Reviews', duration: 320, w: 1280, h: 720, res: '720p', size: 452, codec: 'h264', container: 'mp4', src: '/media/subaru.mp4', thumb: '/thumbs/subaru.png', added: 9 },
    { title: 'What Car For A Grand?', fileName: 'What.Car.Can.You.Get.For.A.Grand.mp4', folder: 'Car Reviews', duration: 300, w: 1280, h: 720, res: '720p', size: 441, codec: 'h264', container: 'mp4', src: '/media/grand.mp4', thumb: '/thumbs/grand.png', added: 3 },
    { title: 'For Bigger Blazes', fileName: 'For.Bigger.Blazes.mp4', folder: 'Clips', duration: 15, w: 1280, h: 720, res: '720p', size: 18, codec: 'h264', container: 'mp4', src: '/media/blazes.mp4', thumb: '/thumbs/blazes.png', added: 2 },
    { title: 'For Bigger Escapes', fileName: 'For.Bigger.Escapes.mp4', folder: 'Clips', duration: 15, w: 1280, h: 720, res: '720p', size: 17, codec: 'h264', container: 'mp4', src: '/media/escapes.mp4', thumb: '/thumbs/escapes.png', added: 2 },
    { title: 'For Bigger Joyrides', fileName: 'For.Bigger.Joyrides.mp4', folder: 'Clips', duration: 15, w: 1280, h: 720, res: '720p', size: 19, codec: 'h264', container: 'mp4', src: '/media/joyrides.mp4', thumb: '/thumbs/joyrides.png', added: 1 },
    { title: 'For Bigger Meltdowns', fileName: 'For.Bigger.Meltdowns.mp4', folder: 'Clips', duration: 15, w: 854, h: 480, res: '480p', size: 11, codec: 'h264', container: 'mp4', src: '/media/meltdowns.mp4', thumb: '/thumbs/meltdowns.png', added: 1 },
  ]

  const videos = new Map<string, string>() // title -> id
  for (const v of videoDefs) {
    const audioCodec = v.container === 'mkv' ? 'ac3' : 'aac'
    const frameRate = v.folder === 'Movies' ? 24 : 30
    const row = await db.video.create({
      data: {
        title: v.title,
        fileName: v.fileName,
        folder: v.folder,
        duration: v.duration,
        width: v.w,
        height: v.h,
        resolutionLabel: v.res,
        sizeMB: v.size,
        codec: v.codec,
        audioCodec,
        container: v.container,
        frameRate,
        srcUrl: v.src,
        thumbnailUrl: v.thumb,
        addedAt: daysAgo(v.added),
      },
    })
    videos.set(v.title, row.id)
  }

  // ── History ──
  const historyDefs = [
    { title: 'Big Buck Bunny', position: 259, pct: 72, ago: 0, hour: 2 },
    { title: 'Sintel', position: 256, pct: 61, ago: 1, hour: 1 },
    { title: 'VW Golf GTI Review', position: 282, pct: 94, ago: 0, hour: 5 },
    { title: 'Tears of Steel', position: 97, pct: 25, ago: 3, hour: 3 },
    { title: 'Subaru Outback: Street and Dirt', position: 112, pct: 35, ago: 5, hour: 6 },
  ]
  for (const h of historyDefs) {
    const videoId = videos.get(h.title)!
    await db.historyEntry.create({
      data: {
        videoId,
        position: h.position,
        watchedPct: h.pct,
        lastPlayedAt: daysAgo(h.ago, h.hour),
      },
    })
  }

  // ── Favorites ──
  for (const t of ['Sintel', 'Tears of Steel', 'For Bigger Joyrides', 'Subaru Outback: Street and Dirt']) {
    await db.video.update({ where: { id: videos.get(t)! }, data: { favorite: true } })
  }

  // ── Playlists ──
  const mkPlaylist = async (name: string, titles: string[], days: number) => {
    const pl = await db.playlist.create({ data: { name, createdAt: daysAgo(days) } })
    let order = 0
    for (const t of titles) {
      await db.playlistItem.create({
        data: { playlistId: pl.id, videoId: videos.get(t)!, order: order++ },
      })
    }
  }
  await mkPlaylist('Movie Night', ['Big Buck Bunny', 'Sintel', 'Elephants Dream', 'Tears of Steel'], 20)
  await mkPlaylist('Workout Mix', ['For Bigger Blazes', 'For Bigger Escapes', 'For Bigger Joyrides', 'For Bigger Meltdowns', 'Night Street Runners'], 14)
  await mkPlaylist('Road Trips', ['VW Golf GTI Review', 'Subaru Outback: Street and Dirt', 'What Car For A Grand?'], 8)

  // ── Admin users ──
  await db.adminUser.createMany({
    data: [
      { email: 'admin@vxplayer.com', passwordHash: hashPassword('VXAdmin@2026'), name: 'Vikram Rao', role: 'SUPER_ADMIN', lastLoginAt: daysAgo(0, 1) },
      { email: 'ads@vxplayer.com', passwordHash: hashPassword('Ads@2026'), name: 'Anaya Menon', role: 'AD_MANAGER', lastLoginAt: daysAgo(1, 4) },
      { email: 'viewer@vxplayer.com', passwordHash: hashPassword('Viewer@2026'), name: 'Rohan Iyer', role: 'VIEWER', lastLoginAt: daysAgo(2, 2) },
    ],
  })

  // ── Campaigns & creatives ──
  const now = new Date()

  const c1 = await db.campaign.create({
    data: {
      name: 'VX Summer Sale',
      advertiser: 'VX Store',
      status: 'ACTIVE',
      startAt: new Date(now.getTime() - 5 * 864e5),
      endAt: new Date(now.getTime() + 25 * 864e5),
      priority: 'HIGH',
      frequencyCap: 2,
      placements: 'PRE_ROLL,OVERLAY,BANNER',
    },
  })
  await db.creative.createMany({
    data: [
      { campaignId: c1.id, name: 'Summer Blaze — 15s video', type: 'VIDEO', mediaUrl: '/media/blazes.mp4', duration: 15, skipAfter: 5, headline: 'VX Summer Sale', bodyText: 'Up to 60% off everything.', ctaText: 'Shop now' },
      { campaignId: c1.id, name: 'Summer Sale — overlay', type: 'OVERLAY', mediaUrl: '/thumbs/ad_streamflix.png', duration: 8, skipAfter: 3, position: 'BOTTOM', headline: 'VX Summer Sale', bodyText: 'Up to 60% off. Ends Aug 31.', ctaText: 'Grab the deal' },
      { campaignId: c1.id, name: 'Summer Sale — banner', type: 'BANNER', mediaUrl: null, duration: 0, skipAfter: 0, headline: 'VX Summer Sale — up to 60% off accessories', ctaText: 'Shop now' },
    ],
  })

  const c2 = await db.campaign.create({
    data: {
      name: 'StreamFlix+ Launch',
      advertiser: 'StreamFlix+',
      status: 'ACTIVE',
      startAt: new Date(now.getTime() - 10 * 864e5),
      endAt: new Date(now.getTime() + 50 * 864e5),
      priority: 'MEDIUM',
      frequencyCap: 2,
      placements: 'PRE_ROLL,MID_ROLL,POST_ROLL',
    },
  })
  await db.creative.createMany({
    data: [
      { campaignId: c2.id, name: 'StreamFlix Trailer — 15s', type: 'VIDEO', mediaUrl: '/media/escapes.mp4', duration: 15, skipAfter: 10, headline: 'StreamFlix+', bodyText: 'Thousands of movies. One subscription.', ctaText: 'Start free trial' },
      { campaignId: c2.id, name: 'StreamFlix Teaser — non-skippable', type: 'VIDEO', mediaUrl: '/media/meltdowns.mp4', duration: 15, skipAfter: -1, headline: 'StreamFlix+' },
    ],
  })

  const c3 = await db.campaign.create({
    data: {
      name: 'AudioMax Pro',
      advertiser: 'AudioMax',
      status: 'ACTIVE',
      startAt: new Date(now.getTime() - 2 * 864e5),
      endAt: new Date(now.getTime() + 12 * 864e5),
      priority: 'HIGH',
      frequencyCap: 3,
      placements: 'OVERLAY,BANNER',
    },
  })
  await db.creative.createMany({
    data: [
      { campaignId: c3.id, name: 'AudioMax Headphones — overlay', type: 'OVERLAY', mediaUrl: '/thumbs/ad_audiomax.png', duration: 8, skipAfter: 3, position: 'TOP', headline: 'AudioMax Pro', bodyText: 'Studio sound. 50% off today.', ctaText: 'Shop now' },
      { campaignId: c3.id, name: 'AudioMax — banner', type: 'BANNER', mediaUrl: null, duration: 0, skipAfter: 0, headline: 'AudioMax Pro — studio sound, 50% off today', ctaText: 'Shop now' },
    ],
  })

  const c4 = await db.campaign.create({
    data: {
      name: 'Retro Arcade',
      advertiser: 'PixelPlay',
      status: 'PAUSED',
      startAt: new Date(now.getTime() - 20 * 864e5),
      endAt: new Date(now.getTime() + 10 * 864e5),
      priority: 'LOW',
      frequencyCap: 1,
      placements: 'PRE_ROLL',
    },
  })
  await db.creative.create({
    data: { campaignId: c4.id, name: 'PixelPlay Arcade — 15s', type: 'VIDEO', mediaUrl: '/media/joyrides.mp4', duration: 15, skipAfter: 5, headline: 'Retro Arcade', bodyText: '2000+ classic games in your pocket.', ctaText: 'Download' },
  })

  const c5 = await db.campaign.create({
    data: {
      name: 'Winter Warmers',
      advertiser: 'CozyCo',
      status: 'EXPIRED',
      startAt: new Date(now.getTime() - 60 * 864e5),
      endAt: new Date(now.getTime() - 20 * 864e5),
      priority: 'MEDIUM',
      frequencyCap: 2,
      placements: 'POST_ROLL',
    },
  })
  await db.creative.create({
    data: { campaignId: c5.id, name: 'CozyCo Blankets — 15s', type: 'VIDEO', mediaUrl: '/media/blazes.mp4', duration: 15, skipAfter: 5, headline: 'Winter Warmers' },
  })

  // ── Daily stats (30 days) ──
  const dailyRows: {
    date: Date
    totalUsers: number
    activeUsers: number
    newUsers: number
    playbackSessions: number
    videosPlayed: number
    watchTimeMin: number
    adImpressions: number
    adStarts: number
    adCompletions: number
    adSkips: number
    adErrors: number
  }[] = []
  for (let i = 29; i >= 0; i--) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    date.setHours(0, 0, 0, 0)
    const growth = 1 + (29 - i) * 0.012 // gentle growth
    const dow = date.getDay()
    const weekendBoost = dow === 0 || dow === 6 ? 1.25 : 1
    const noise = 0.9 + Math.random() * 0.2
    const base = 12500 * growth * weekendBoost * noise
    const totalUsers = Math.round(150000 + (29 - i) * 1400)
    const activeUsers = Math.round(base)
    const newUsers = Math.round(base * 0.055)
    const sessions = Math.round(activeUsers * (1.7 + Math.random() * 0.5))
    const videosPlayed = Math.round(sessions * (1.6 + Math.random() * 0.6))
    const watchTimeMin = Math.round(sessions * 21 * (0.9 + Math.random() * 0.25))
    const impressions = Math.round(sessions * 0.9 * (0.85 + Math.random() * 0.3))
    const starts = Math.round(impressions * 0.96)
    const completions = Math.round(starts * (0.72 + Math.random() * 0.1))
    const skips = Math.round(starts * (0.12 + Math.random() * 0.06))
    const errors = Math.round(starts * 0.012)
    dailyRows.push({
      date, totalUsers, activeUsers, newUsers,
      playbackSessions: sessions, videosPlayed, watchTimeMin,
      adImpressions: impressions, adStarts: starts, adCompletions: completions,
      adSkips: skips, adErrors: errors,
    })
  }
  await db.dailyStat.createMany({ data: dailyRows })

  // ── Ad events (last 30 days, realistic funnel) ──
  const allCampaigns = await db.campaign.findMany({ include: { creatives: true } })
  const eventRows: {
    campaignId: string
    creativeId: string
    placement: string
    eventType: string
    sessionId: string
    videoId: string | null
    createdAt: Date
  }[] = []

  const placementWeights: Record<string, number> = {
    PRE_ROLL: 0.5, MID_ROLL: 0.2, POST_ROLL: 0.1, OVERLAY: 0.15, BANNER: 0.05,
  }

  for (const camp of allCampaigns) {
    if (camp.status !== 'ACTIVE') continue
    for (const creative of camp.creatives) {
      const placement = creative.type === 'VIDEO'
        ? (camp.placements.split(',')[0] ?? 'PRE_ROLL')
        : creative.type === 'OVERLAY' ? 'OVERLAY' : 'BANNER'
      const impressions = Math.round(1400 * placementWeights[placement] * (camp.priority === 'HIGH' ? 1.6 : camp.priority === 'MEDIUM' ? 1 : 0.55))
      const starts = Math.round(impressions * 0.95)
      const q25 = Math.round(starts * 0.88)
      const q50 = Math.round(starts * 0.8)
      const q75 = Math.round(starts * 0.74)
      const completions = Math.round(starts * 0.71)
      const skips = Math.round(starts * 0.16)
      const errors = Math.round(starts * 0.015)
      const clicks = Math.round(impressions * 0.03)

      const push = (eventType: string, count: number) => {
        for (let i = 0; i < count; i++) {
          const daysBack = Math.floor(Math.random() * 30)
          const ts = daysAgo(daysBack, Math.floor(Math.random() * 24))
          eventRows.push({
            campaignId: camp.id,
            creativeId: creative.id,
            placement,
            eventType,
            sessionId: crypto.randomUUID(),
            videoId: null,
            createdAt: ts,
          })
        }
      }
      push('IMPRESSION', impressions)
      push('START', starts)
      push('Q25', q25)
      push('Q50', q50)
      push('Q75', q75)
      push('COMPLETE', completions)
      push('SKIP', skips)
      push('ERROR', errors)
      push('CLICK', clicks)
    }
  }
  // chunked insert
  for (let i = 0; i < eventRows.length; i += 500) {
    await db.adEvent.createMany({ data: eventRows.slice(i, i + 500) })
  }
  console.log(`Inserted ${eventRows.length} ad events`)

  // ── Audit log ──
  await db.auditLog.createMany({
    data: [
      { adminName: 'Vikram Rao', adminEmail: 'admin@vxplayer.com', action: 'LOGIN', detail: 'Password + 2FA verified', createdAt: daysAgo(0, 1) },
      { adminName: 'Vikram Rao', adminEmail: 'admin@vxplayer.com', action: 'CAMPAIGN_CREATED', target: 'AudioMax Pro', detail: 'Placements: OVERLAY, BANNER · Priority: HIGH', createdAt: daysAgo(2, 3) },
      { adminName: 'Anaya Menon', adminEmail: 'ads@vxplayer.com', action: 'CAMPAIGN_UPDATED', target: 'StreamFlix+ Launch', detail: 'Skip delay changed 5s → 10s', createdAt: daysAgo(1, 6) },
      { adminName: 'Vikram Rao', adminEmail: 'admin@vxplayer.com', action: 'ADS_DISABLED', target: 'OVERLAY', detail: 'Emergency kill switch engaged for 2h', createdAt: daysAgo(4, 9) },
      { adminName: 'Vikram Rao', adminEmail: 'admin@vxplayer.com', action: 'ADS_ENABLED', target: 'OVERLAY', detail: 'Emergency kill switch released', createdAt: daysAgo(4, 11) },
      { adminName: 'Anaya Menon', adminEmail: 'ads@vxplayer.com', action: 'CAMPAIGN_PAUSED', target: 'Retro Arcade', detail: 'Paused pending new creatives', createdAt: daysAgo(6, 2) },
      { adminName: 'Vikram Rao', adminEmail: 'admin@vxplayer.com', action: 'SETTINGS_UPDATED', target: 'Ad frequency', detail: 'Max mid-rolls 3 → 2 per video', createdAt: daysAgo(3, 7) },
      { adminName: 'Vikram Rao', adminEmail: 'admin@vxplayer.com', action: 'CACHE_CLEARED', target: 'Ad cache', detail: 'Forced all clients to re-sync campaign cache', createdAt: daysAgo(2, 12) },
    ],
  })

  console.log('Seed complete ✔')
  console.log('Admin login: admin@vxplayer.com / VXAdmin@2026 (2FA code shown on screen in demo)')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
