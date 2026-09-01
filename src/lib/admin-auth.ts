// Server-side admin auth: HMAC token + login rate limiting + RBAC helpers
// (server only — do not import from client components)

import crypto from 'crypto'

const SECRET = process.env.ADMIN_TOKEN_SECRET || 'vx-player-demo-secret-2026'
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000 // 12h

export function signToken(email: string, role: string): string {
  const exp = Date.now() + TOKEN_TTL_MS
  const payload = `${email}|${role}|${exp}`
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('hex')
  return `${Buffer.from(payload).toString('base64url')}.${sig}`
}

export function verifyToken(token: string | null | undefined): { email: string; role: string } | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  try {
    const payload = Buffer.from(parts[0], 'base64url').toString('utf8')
    const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('hex')
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(parts[1]))) return null
    const [email, role, expStr] = payload.split('|')
    if (!email || !role || !expStr) return null
    if (Number(expStr) < Date.now()) return null
    return { email, role }
  } catch {
    return null
  }
}

export function hashPassword(password: string): string {
  return crypto.createHmac('sha256', SECRET).update(`pw:${password}`).digest('hex')
}

// ── Login rate limiting (in-memory) ──

type Attempt = { count: number; windowStart: number }
const attempts = new Map<string, Attempt>()

export function checkRateLimit(key: string): { allowed: boolean; remaining: number } {
  const now = Date.now()
  const WINDOW = 5 * 60 * 1000
  const MAX = 5
  const rec = attempts.get(key)
  if (!rec || now - rec.windowStart > WINDOW) {
    attempts.set(key, { count: 1, windowStart: now })
    return { allowed: true, remaining: MAX - 1 }
  }
  if (rec.count >= MAX) return { allowed: false, remaining: 0 }
  rec.count += 1
  return { allowed: true, remaining: MAX - rec.count }
}

export function clearRateLimit(key: string) {
  attempts.delete(key)
}

// ── RBAC ──

const ROLE_RANK: Record<string, number> = {
  VIEWER: 1,
  AD_MANAGER: 2,
  ADMIN: 3,
  SUPER_ADMIN: 4,
}

export function hasRole(role: string | undefined, minRoles: string[]): boolean {
  if (!role) return false
  return minRoles.includes(role)
}

export function requireAuth(req: Request): { email: string; role: string } | null {
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  return verifyToken(token)
}
