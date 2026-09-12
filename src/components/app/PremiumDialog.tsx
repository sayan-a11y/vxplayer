'use client'

import { Check, Crown, Sparkles, Volume2, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function PremiumDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const handleUpgrade = () => {
    toast.success('VX Player Pro unlocked for this session!')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="vx-card border-white/10 bg-[#080914]/95 p-6 text-white backdrop-blur-2xl sm:max-w-md">
        <DialogHeader className="text-center">
          <div className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-gradient-to-tr from-amber-500/20 via-blue-500/20 to-[var(--vx-accent)]/30 text-amber-300">
            <Crown className="size-6 text-amber-400" />
          </div>
          <DialogTitle className="text-xl font-bold tracking-tight">VX PLAYER PRO</DialogTitle>
          <DialogDescription className="text-xs text-white/60">
            Unlock the ultimate cinema-grade mobile media playback experience.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-3">
          <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-[var(--vx-accent)]/20 text-[var(--vx-accent-soft)]">
              <Volume2 className="size-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">Dolby Atmos & Spatial Audio</p>
              <p className="text-[11px] text-white/50">Multi-channel immersive surround sound for headphones and speakers.</p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-[var(--vx-accent)]/20 text-[var(--vx-accent-soft)]">
              <Zap className="size-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">120 FPS & Pure 4K HDR</p>
              <p className="text-[11px] text-white/50">Hardware-accelerated rendering engine with zero buffering.</p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-[var(--vx-accent)]/20 text-[var(--vx-accent-soft)]">
              <Sparkles className="size-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">100% Ad-Free Experience</p>
              <p className="text-[11px] text-white/50">Continuous uninterrupted local and network playback.</p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <Button
            onClick={handleUpgrade}
            className="vx-btn-accent h-11 w-full font-semibold shadow-[0_0_24px_rgba(0,132,255,0.4)]"
          >
            Upgrade Now — Lifetime Access
          </Button>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-xs text-white/50 hover:text-white"
          >
            Maybe Later
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default PremiumDialog
