// VX Player — shared contract types (single source of truth)

export type QualityStatus = 'READY' | 'PROCESSING' | 'FAILED'

export type QualityVariantDTO = {
  label: string // "140p" … "1440p"; "<height>p" for non-tier originals
  width: number
  height: number
  bitrateKbps: number // 0 = original source (no transcode cap)
  filePath: string
  fileSizeMB: number
  status: QualityStatus
  isSource: boolean
}

export type VideoDTO = {
  id: string
  title: string
  fileName: string
  folder: string
  duration: number // seconds
  width: number
  height: number
  resolutionLabel: string // "1080p"
  sizeMB: number
  codec: string
  audioCodec: string
  container: string
  frameRate: number
  srcUrl: string
  thumbnailUrl: string
  addedAt: string
  favorite: boolean
  history: {
    position: number
    watchedPct: number
    lastPlayedAt: string
  } | null
  qualities?: QualityVariantDTO[]
}

export type HistoryDTO = {
  video: VideoDTO
  position: number
  watchedPct: number
  lastPlayedAt: string
}

export type PlaylistDTO = {
  id: string
  name: string
  createdAt: string
  videos: VideoDTO[]
}

export type AdPlacement = 'PRE_ROLL' | 'MID_ROLL' | 'POST_ROLL' | 'OVERLAY' | 'BANNER'

export type ServedAd = {
  campaignId: string
  campaignName: string
  advertiser: string
  priority: string
  placement: AdPlacement
  creativeId: string
  creativeName: string
  type: 'VIDEO' | 'IMAGE' | 'OVERLAY' | 'BANNER' | 'TEXT'
  mediaUrl: string | null
  duration: number
  skipAfter: number // -1 = non-skippable
  position: 'TOP' | 'BOTTOM' | 'CENTER' | null
  headline: string | null
  bodyText: string | null
  ctaText: string | null
  ctaUrl: string | null
}

export type ServeAdResponse = { ad: ServedAd | null }

export type AdEventType =
  | 'IMPRESSION'
  | 'START'
  | 'Q25'
  | 'Q50'
  | 'Q75'
  | 'COMPLETE'
  | 'SKIP'
  | 'CLICK'
  | 'ERROR'

export type AdCacheBundle = {
  version: number
  expiresAt: string
  ads: ServedAd[]
}

export type SettingsDTO = {
  adsEnabled: boolean
  preRollEnabled: boolean
  midRollEnabled: boolean
  postRollEnabled: boolean
  overlayEnabled: boolean
  bannerEnabled: boolean
  adsPerSession: number
  maxMidRolls: number
  overlayPerHour: number
  minMidRollDurationSec: number
  offlineAdFallback: 'SKIP_ADS' | 'LAST_CACHED'
  adCacheVersion: number
  defaultSpeed: number
  autoPlayNext: boolean
  resumePlayback: boolean
  doubleTapSeek: number
  hwAcceleration: boolean
  defaultOrientation: 'PORTRAIT' | 'LANDSCAPE' | 'SENSOR' | 'LOCKED'
  theme: 'dark' | 'light' | 'system'
  accent: 'violet' | 'purple' | 'fuchsia' | 'rose'
  playerTheme: 'OLED' | 'DIM'
  subtitleSize: 'S' | 'M' | 'L' | 'XL'
  subtitlePosition: number
  subtitleBgOpacity: number
  defaultSubtitleLang: string
}

export type AdminRole = 'SUPER_ADMIN' | 'ADMIN' | 'AD_MANAGER' | 'VIEWER'

export type AdminSessionDTO = {
  name: string
  email: string
  role: AdminRole
}

export type CampaignDTO = {
  id: string
  name: string
  advertiser: string
  status: 'ACTIVE' | 'PAUSED' | 'EXPIRED' | 'DRAFT'
  startAt: string
  endAt: string
  priority: 'HIGH' | 'MEDIUM' | 'LOW'
  frequencyCap: number
  placements: AdPlacement[]
  createdAt: string
  creatives: CreativeDTO[]
  stats?: {
    impressions: number
    starts: number
    completions: number
    skips: number
    errors: number
    completionRate: number
  }
}

export type CreativeDTO = {
  id: string
  campaignId: string
  name: string
  type: 'VIDEO' | 'IMAGE' | 'OVERLAY' | 'BANNER' | 'TEXT'
  mediaUrl: string | null
  duration: number
  skipAfter: number
  position: 'TOP' | 'BOTTOM' | 'CENTER' | null
  headline: string | null
  bodyText: string | null
  ctaText: string | null
  ctaUrl: string | null
}

export type AuditLogDTO = {
  id: string
  adminName: string
  adminEmail: string
  action: string
  target: string | null
  detail: string | null
  createdAt: string
}

export type DailyStatDTO = {
  date: string
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
}

export type DashboardDTO = {
  cards: {
    totalUsers: number
    activeUsers: number
    newUsers: number
    videosPlayed: number
    sessions: number
    watchTimeMin: number
    adImpressions: number
    adStarts: number
    adCompletions: number
    adSkips: number
    adErrors: number
  }
  charts: {
    daily: DailyStatDTO[]
    adDaily: { date: string; impressions: number; completions: number; skips: number }[]
    placementSplit: { placement: string; impressions: number }[]
  }
  recentAudit: AuditLogDTO[]
}

export type AnalyticsDTO = {
  totals: {
    impressions: number
    starts: number
    q25: number
    q50: number
    q75: number
    completions: number
    skips: number
    clicks: number
    errors: number
    completionRate: number
  }
  funnel: { label: string; value: number }[]
  byDay: { date: string; impressions: number; completions: number; skips: number }[]
  byPlacement: { placement: string; impressions: number; completions: number; skips: number }[]
  byCampaign: {
    campaignId: string
    campaignName: string
    impressions: number
    starts: number
    completions: number
    skips: number
    completionRate: number
  }[]
}

export type AdminUserDTO = {
  id: string
  name: string
  email: string
  role: AdminRole
  twoFactor: boolean
  lastLoginAt: string | null
  createdAt: string
}

export type ReportsDTO = {
  summary: {
    days: number
    impressions: number
    starts: number
    completions: number
    skips: number
    errors: number
    completionRate: number
    watchTimeMin: number
    sessions: number
  }
  topCampaigns: {
    campaignId: string
    campaignName: string
    advertiser: string
    impressions: number
    completions: number
    skips: number
    completionRate: number
  }[]
  byDay: { date: string; impressions: number; completions: number; skips: number }[]
}

export const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4] as const

export const ASPECT_MODES = ['Fit', 'Crop', 'Stretch', 'Zoom', '100%'] as const
export type AspectMode = (typeof ASPECT_MODES)[number]
