'use client'

import { useEffect, useState } from 'react'
import { Check, Eye, EyeOff, Lock, Play, ShieldAlert, Trash2, Unlock, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatDuration } from '@/lib/format'
import { useAppStore } from '@/lib/store'
import type { VideoDTO } from '@/lib/types'

const PIN_KEY = 'vx_private_folder_pin'

export function PrivateFolderDialog({
  open,
  onOpenChange,
  videos = [],
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  videos?: VideoDTO[]
}) {
  const [hasPin, setHasPin] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [isSettingPin, setIsSettingPin] = useState(false)
  const [confirmPin, setConfirmPin] = useState('')
  const [privateIds, setPrivateIds] = useState<string[]>([])
  const openPlayer = useAppStore((s) => s.openPlayer)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const storedPin = window.localStorage.getItem(PIN_KEY)
    setHasPin(Boolean(storedPin))
    try {
      const storedIds = JSON.parse(window.localStorage.getItem('vx_private_video_ids') || '[]')
      setPrivateIds(storedIds)
    } catch {
      setPrivateIds([])
    }
  }, [open])

  const handleDigit = (digit: string) => {
    if (pinInput.length < 4) {
      const next = pinInput + digit
      setPinInput(next)
      if (next.length === 4) {
        if (!hasPin) {
          if (!isSettingPin) {
            setConfirmPin(next)
            setIsSettingPin(true)
            setPinInput('')
            toast('Re-enter your 4-digit PIN to confirm')
          } else {
            if (next === confirmPin) {
              window.localStorage.setItem(PIN_KEY, next)
              setHasPin(true)
              setIsUnlocked(true)
              setIsSettingPin(false)
              setPinInput('')
              toast.success('Private Folder PIN set successfully')
            } else {
              toast.error('PINs did not match. Please try again.')
              setPinInput('')
              setIsSettingPin(false)
            }
          }
        } else {
          const actualPin = window.localStorage.getItem(PIN_KEY)
          if (next === actualPin) {
            setIsUnlocked(true)
            setPinInput('')
          } else {
            toast.error('Incorrect PIN')
            setPinInput('')
          }
        }
      }
    }
  }

  const handleDeleteDigit = () => {
    setPinInput((prev) => prev.slice(0, -1))
  }

  const privateVideos = videos.filter((v) => privateIds.includes(v.id))

  const handleRemoveFromPrivate = (id: string) => {
    const updated = privateIds.filter((i) => i !== id)
    setPrivateIds(updated)
    window.localStorage.setItem('vx_private_video_ids', JSON.stringify(updated))
    toast.success('Video removed from Private Folder')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="vx-card border-white/10 bg-[#080914]/95 p-6 text-white backdrop-blur-2xl sm:max-w-md">
        <DialogHeader className="text-center">
          <div className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-[var(--vx-accent)]/20 text-[var(--vx-accent-soft)]">
            {isUnlocked ? <Unlock className="size-6" /> : <Lock className="size-6" />}
          </div>
          <DialogTitle className="text-xl font-bold tracking-tight">Private Folder</DialogTitle>
          <DialogDescription className="text-xs text-white/60">
            {isUnlocked
              ? 'Your private encrypted vault. Hidden from general browsing.'
              : !hasPin
              ? isSettingPin
                ? 'Confirm your 4-digit vault PIN'
                : 'Create a 4-digit security PIN for your private folder'
              : 'Enter your 4-digit PIN to access private videos'}
          </DialogDescription>
        </DialogHeader>

        {!isUnlocked ? (
          <div className="mt-4 flex flex-col items-center gap-6">
            {/* PIN Dots */}
            <div className="flex gap-4">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`size-3.5 rounded-full transition-all duration-200 ${
                    pinInput.length > i
                      ? 'scale-110 bg-[var(--vx-accent)] shadow-[0_0_12px_var(--vx-accent)]'
                      : 'border border-white/20 bg-white/5'
                  }`}
                />
              ))}
            </div>

            {/* Keypad */}
            <div className="grid w-full max-w-[260px] grid-cols-3 gap-3">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handleDigit(num)}
                  className="flex h-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-lg font-semibold transition hover:bg-white/10 active:scale-95"
                >
                  {num}
                </button>
              ))}
              <div />
              <button
                type="button"
                onClick={() => handleDigit('0')}
                className="flex h-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-lg font-semibold transition hover:bg-white/10 active:scale-95"
              >
                0
              </button>
              <button
                type="button"
                onClick={handleDeleteDigit}
                className="flex h-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-sm font-medium text-white/70 transition hover:bg-white/10 active:scale-95"
              >
                Delete
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {privateVideos.length === 0 ? (
              <div className="py-8 text-center text-sm text-white/50">
                <ShieldAlert className="mx-auto mb-2 size-8 text-white/30" />
                No private videos yet.
                <p className="mt-1 text-xs text-white/40">
                  Tap the three dots on any video in your library to move it here.
                </p>
              </div>
            ) : (
              <div className="vx-scroll max-h-72 space-y-2 overflow-y-auto pr-1">
                {privateVideos.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-2.5 transition hover:bg-white/5"
                  >
                    <div
                      onClick={() => {
                        openPlayer(v, privateVideos)
                        onOpenChange(false)
                      }}
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-3"
                    >
                      <div className="relative size-11 shrink-0 overflow-hidden rounded-lg bg-black">
                        {v.thumbnailUrl ? (
                          <img src={v.thumbnailUrl} alt={v.title} className="size-full object-cover" />
                        ) : (
                          <Play className="m-auto size-5 text-white/40" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-white">{v.title}</p>
                        <p className="text-[10px] text-white/50">
                          {formatDuration(v.duration)} · {v.resolutionLabel}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleRemoveFromPrivate(v.id)}
                      className="size-8 rounded-lg text-white/40 hover:text-red-400"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <Button
              onClick={() => setIsUnlocked(false)}
              variant="outline"
              className="w-full border-white/10 text-xs"
            >
              Lock Vault
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default PrivateFolderDialog
