'use client'

// VX Admin login — two-step flow: credentials → demo 2FA code → panel.

import { useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Loader2, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { useAppStore } from '@/lib/store'
import type { AdminRole } from '@/lib/types'
import { saveAdminSession } from './session'

export default function AdminLogin() {
  const [step, setStep] = useState<1 | 2>(1)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [devCode, setDevCode] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (res.ok) {
        const data = (await res.json()) as { ok?: boolean; needs2fa?: boolean; devCode?: string }
        setDevCode(data.devCode ?? '')
        setCode('')
        setStep(2)
      } else if (res.status === 429) {
        setError('Too many attempts — please wait 5 minutes before trying again.')
      } else {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        setError(data?.error ?? 'Invalid email or password.')
      }
    } catch {
      setError('Network error — please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function handleVerify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (code.length !== 6) {
      setError('Enter the 6-digit verification code.')
      return
    }
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/admin/verify-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      })
      if (res.ok) {
        const data = (await res.json()) as {
          ok?: boolean
          token: string
          admin: { name: string; email: string; role: AdminRole }
        }
        saveAdminSession({ name: data.admin.name, email: data.admin.email, role: data.admin.role })
        useAppStore.getState().setAdminToken(data.token)
        useAppStore.getState().setAdminView('panel')
      } else {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        setError(data?.error ?? 'Invalid verification code. Please try again.')
      }
    } catch {
      setError('Network error — please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="vx-root fixed inset-0 z-[60] flex min-h-screen items-center justify-center overflow-y-auto p-4">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="vx-card relative w-full max-w-md p-8"
      >
        <Button
          variant="ghost"
          size="icon"
          aria-label="Back to VX Player"
          onClick={() => useAppStore.getState().setAdminView(null)}
          className="absolute left-3 top-3 h-9 w-9 text-white/50 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        {/* Branding */}
        <div className="flex flex-col items-center text-center">
          <div className="vx-btn-accent flex h-14 w-14 items-center justify-center rounded-2xl text-xl font-bold tracking-tight">
            VX
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">
            <span className="vx-accent-text">VX ADMIN</span>
          </h1>
          <p className="mt-1 text-sm text-white/50">
            {step === 1 ? 'Sign in to the VX Player admin console' : `Two-factor verification for ${email}`}
          </p>
        </div>

        {step === 1 ? (
          <motion.form key="step1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onSubmit={handleLogin} className="mt-8 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="admin-email" className="text-white/70">
                Email
              </Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
                <Input
                  id="admin-email"
                  type="email"
                  autoComplete="username"
                  placeholder="admin@vxplayer.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-11 border-white/10 bg-white/[0.04] pl-9 text-white placeholder:text-white/25"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-password" className="text-white/70">
                Password
              </Label>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
                <Input
                  id="admin-password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-11 border-white/10 bg-white/[0.04] pl-9 text-white placeholder:text-white/25"
                />
              </div>
            </div>
            {error ? (
              <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={busy} className="vx-btn-accent h-11 w-full rounded-xl font-semibold tracking-widest">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {busy ? 'SIGNING IN…' : 'LOGIN'}
            </Button>
          </motion.form>
        ) : (
          <motion.form key="step2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onSubmit={handleVerify} className="mt-8 space-y-4">
            {devCode ? (
              <div className="flex items-center justify-center gap-2 rounded-lg border border-violet-500/25 bg-violet-500/10 px-3 py-2 text-center text-xs text-violet-200">
                <ShieldCheck className="h-3.5 w-3.5" />
                Demo 2FA code: <span className="font-mono font-semibold tracking-[0.25em]">{devCode}</span>
              </div>
            ) : null}
            <div className="flex justify-center py-2">
              <InputOTP maxLength={6} value={code} onChange={setCode} containerClassName="justify-center">
                <InputOTPGroup>
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <InputOTPSlot key={i} index={i} className="h-11 w-10 border-white/15 bg-white/[0.04] text-lg text-white" />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>
            {error ? (
              <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-center text-xs text-red-300">
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={busy} className="vx-btn-accent h-11 w-full rounded-xl font-semibold tracking-widest">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {busy ? 'VERIFYING…' : 'VERIFY'}
            </Button>
            <button
              type="button"
              onClick={() => {
                setStep(1)
                setError(null)
                setCode('')
              }}
              className="mx-auto block text-xs text-white/40 underline-offset-4 hover:text-white/70 hover:underline"
            >
              Use a different account
            </button>
          </motion.form>
        )}

        {/* Demo hint */}
        <div className="mt-6 rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-3 text-xs leading-relaxed text-white/50">
          <span className="font-medium text-white/70">Demo accounts</span> — admin@vxplayer.com / VXAdmin@2026 ·
          ads@vxplayer.com / Ads@2026 · viewer@vxplayer.com / Viewer@2026. 2FA code appears after login (demo mode).
        </div>
        <p className="mt-3 text-center text-[11px] text-white/25">Protected area · All sign-ins are audit-logged</p>
      </motion.div>
    </div>
  )
}
