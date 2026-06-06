'use client'

import { createContext, useContext, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AppSidebar } from '@/components/app-sidebar'
import { ErrorBoundary } from '@/components/error-boundary'
import { useAuth } from '@/hooks/use-auth'
import { DEMO_SESSION_KEY } from '@/hooks/use-demo-mode'

// ── Focus-mode context ─────────────────────────────────────────────────────────
// When focusMode=true the sidebar is hidden so new users see only the canvas.
// The dashboard page sets this to true when members.length === 0.
const FocusModeCtx = createContext<{
  focusMode: boolean
  setFocusMode: (v: boolean) => void
}>({ focusMode: false, setFocusMode: () => { } })

export function useFocusMode() { return useContext(FocusModeCtx) }

// ── Inner shell — reads context, owns the auth gate ───────────────────────────
function AppShell({ children }: { children: React.ReactNode }) {
  const { focusMode } = useFocusMode()
  const { user, loading } = useAuth()
  const router = useRouter()

  // Persist demo flag from URL query param on first render
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('demo') === '1') {
      sessionStorage.setItem(DEMO_SESSION_KEY, '1')
    }
  }, [])

  // Auth gate: fires async — does NOT block render so the shell appears immediately.
  useEffect(() => {
    if (loading) return

    if (user) {
      sessionStorage.removeItem(DEMO_SESSION_KEY)
      return
    }

    const isDemo =
      typeof window !== 'undefined' &&
      sessionStorage.getItem(DEMO_SESSION_KEY) === '1'

    if (!isDemo) {
      const next = encodeURIComponent(window.location.pathname)
      router.replace(`/auth/signin?next=${next}`)
    }
  }, [user, loading, router])

  // ── App shell skeleton — shown while auth resolves ────────────────────────────
  // Mirrors the real sidebar + tree canvas so there's no layout shift.
  function AppShellSkeleton() {
    return (
      <div className="flex h-screen overflow-hidden bg-background animate-pulse">
        {/* Sidebar skeleton */}
        <div className="hidden lg:flex w-64 shrink-0 flex-col border-r border-border/40 bg-card/60">
          {/* Header */}
          <div className="flex h-14 items-center gap-3 border-b border-border/40 px-4">
            <div className="h-8 w-8 rounded-xl bg-muted/60 shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-24 rounded bg-muted/60" />
              <div className="h-2 w-16 rounded bg-muted/40" />
            </div>
          </div>
          {/* Health widget */}
          <div className="mx-3 mt-3 rounded-2xl border border-border/30 bg-muted/10 p-3 space-y-3">
            <div className="h-3 w-20 rounded bg-muted/50" />
            <div className="flex items-center gap-3">
              <div className="h-20 w-20 rounded-full bg-muted/40 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-2.5 w-full rounded bg-muted/40" />
                <div className="h-2.5 w-3/4 rounded bg-muted/30" />
              </div>
            </div>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="h-3.5 w-3.5 rounded-full bg-muted/50 shrink-0" />
                <div className="h-2 w-6 rounded bg-muted/50" />
                <div className="h-2 flex-1 rounded bg-muted/30" />
              </div>
            ))}
          </div>
          {/* Nav items */}
          <div className="flex-1 px-2 py-2 space-y-1">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-2">
                <div className="h-4 w-4 rounded bg-muted/50 shrink-0" />
                <div className="h-3 rounded bg-muted/40" style={{ width: `${55 + (i % 3) * 18}%` }} />
              </div>
            ))}
          </div>
          {/* User profile strip */}
          <div className="border-t border-border/40 px-3 py-3 flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-muted/50 shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-2.5 w-20 rounded bg-muted/50" />
              <div className="h-2 w-14 rounded bg-muted/30" />
            </div>
          </div>
        </div>

        {/* Main content skeleton — mimics tree view */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Top bar */}
          <div className="h-12 shrink-0 border-b border-border/30 flex items-center gap-3 px-4">
            <div className="h-7 w-28 rounded-lg bg-muted/40" />
            <div className="flex-1" />
            <div className="h-7 w-7 rounded-lg bg-muted/30" />
            <div className="h-7 w-7 rounded-lg bg-muted/30" />
          </div>
          {/* Tree canvas */}
          <div className="flex-1 relative overflow-hidden flex flex-col items-center justify-center gap-10 px-4">
            {/* grandparents row */}
            <div className="flex items-end gap-16">
              {[88, 80].map((w, i) => <NodeSkel key={i} w={w} />)}
            </div>
            {/* parents row */}
            <div className="flex items-end gap-12">
              {[76, 72].map((w, i) => <NodeSkel key={i} w={w} />)}
            </div>
            {/* self + spouse row */}
            <div className="flex items-end gap-8">
              {[68, 64, 60].map((w, i) => <NodeSkel key={i} w={w} highlight={i === 1} />)}
            </div>
            {/* children row */}
            <div className="flex items-end gap-10">
              {[56, 52].map((w, i) => <NodeSkel key={i} w={w} />)}
            </div>
            {/* connector lines (decorative) */}
            <div className="absolute inset-0 pointer-events-none" aria-hidden>
              <svg className="absolute inset-0 w-full h-full opacity-20" xmlns="http://www.w3.org/2000/svg">
                <line x1="50%" y1="0%" x2="50%" y2="100%" stroke="currentColor" strokeWidth="1" strokeDasharray="4 6" className="text-border" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    )
  }

  function NodeSkel({ w, highlight = false }: { w: number; highlight?: boolean }) {
    return (
      <div
        className={`rounded-2xl border p-3 flex flex-col items-center gap-2 ${highlight ? 'border-primary/30 bg-primary/5' : 'border-border/30 bg-muted/15'}`}
        style={{ width: w + 16 }}
      >
        <div className={`h-10 w-10 rounded-full ${highlight ? 'bg-primary/20' : 'bg-muted/50'}`} />
        <div className="h-2.5 rounded-full bg-muted/50" style={{ width: w * 0.6 }} />
        <div className="h-2 rounded-full bg-muted/30" style={{ width: w * 0.4 }} />
      </div>
    )
  }

  // Show a full shell skeleton while auth resolves — no jarring spinner
  if (loading) {
    return <AppShellSkeleton />
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {!focusMode && <AppSidebar />}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </div>
    </div>
  )
}

// ── Layout — provides context, wraps shell ────────────────────────────────────
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [focusMode, setFocusMode] = useState(false)

  return (
    <FocusModeCtx.Provider value={{ focusMode, setFocusMode }}>
      <AppShell>{children}</AppShell>
    </FocusModeCtx.Provider>
  )
}
