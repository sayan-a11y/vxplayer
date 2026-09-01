'use client'

import { useEffect } from 'react'
import { RefreshCcw, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('App Error Boundary caught:', error)
  }, [error])

  return (
    <div className="vx-root flex min-h-screen flex-col items-center justify-center bg-[#07070d] p-6 text-center text-white">
      <div className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 text-2xl font-black shadow-xl shadow-violet-500/20">
        VX
      </div>
      <h1 className="text-xl font-bold tracking-tight">Something went wrong</h1>
      <p className="mt-2 max-w-md text-xs text-white/50">
        An unexpected error occurred while loading this view. You can reload or return to the player library.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button
          onClick={() => reset()}
          className="vx-btn-accent h-11 gap-2 rounded-xl px-5 font-semibold"
        >
          <RefreshCcw className="h-4 w-4" /> Try Again
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            if (typeof window !== 'undefined') {
              window.localStorage.removeItem('vx_admin_view')
              window.location.href = '/'
            }
          }}
          className="h-11 gap-2 rounded-xl border-white/10 bg-white/5 px-5 font-semibold text-white hover:bg-white/10"
        >
          <ArrowLeft className="h-4 w-4" /> Go to Library
        </Button>
      </div>
    </div>
  )
}
