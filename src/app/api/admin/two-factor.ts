// Demo 2FA code store (in-memory Map; codes valid for 10 minutes).
// Shared by the login and verify-2fa routes.
//
// The Map is anchored on globalThis (same pattern as src/lib/db.ts) so that all
// route bundles — and their hot-reloaded replacements — share ONE instance in
// the dev server process.

import crypto from 'crypto'

const CODE_TTL_MS = 10 * 60 * 1000

type CodeEntry = { code: string; expiresAt: number }

const globalForTwoFactor = globalThis as unknown as {
  __vxTwoFactorCodes: Map<string, CodeEntry> | undefined
}

const twoFactorCodes: Map<string, CodeEntry> =
  globalForTwoFactor.__vxTwoFactorCodes ?? new Map<string, CodeEntry>()
globalForTwoFactor.__vxTwoFactorCodes = twoFactorCodes

export function issueTwoFactorCode(email: string): string {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
  twoFactorCodes.set(email, { code, expiresAt: Date.now() + CODE_TTL_MS })
  // opportunistic cleanup of expired entries
  const now = Date.now()
  for (const [k, v] of twoFactorCodes) {
    if (now > v.expiresAt) twoFactorCodes.delete(k)
  }
  return code
}

export function verifyTwoFactorCode(email: string, code: string): boolean {
  const entry = twoFactorCodes.get(email)
  if (!entry) return false
  if (Date.now() > entry.expiresAt) {
    twoFactorCodes.delete(email)
    return false
  }
  if (entry.code !== code) return false
  twoFactorCodes.delete(email)
  return true
}
