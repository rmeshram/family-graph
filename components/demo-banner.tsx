'use client'

import Link from 'next/link'
import { useAuth } from '@/hooks/use-auth'

/**
 * Shows a banner when the user is NOT authenticated.
 * Only renders in demo mode (unauthenticated access that was explicitly opted-in).
 * The layout guard ensures authenticated-only access to app pages.
 */
export function DemoBanner() {
  const { user, loading } = useAuth()

  // Only show for unauthenticated users (demo mode, as the layout guard allows)
  if (loading || user) return null

  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-amber-500/20 bg-amber-500/[0.07] px-4 py-2">
      <div className="flex items-center gap-2 text-[12px] text-amber-400/90">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
        <span>You&apos;re viewing <strong>demo data</strong> — sign up to build your real family tree</span>
      </div>
      <Link
        href="/auth/signup"
        className="shrink-0 rounded-lg bg-amber-500/15 border border-amber-500/30 px-3 py-1 text-[11px] font-semibold text-amber-400 hover:bg-amber-500/25 transition-colors"
      >
        Get started free →
      </Link>
    </div>
  )
}
