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

  // Ghost-tree SVG: visible blurred tree silhouette behind the skeleton cards
  function GhostTreeBg() {
    return (
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
        {/* Blurred ghost nodes — give a "data is coming into focus" feel */}
        {[
          { l: '31%', t: '13%', s: 88 }, { l: '55%', t: '13%', s: 80 },   // grandparents
          { l: '33%', t: '30%', s: 78 }, { l: '54%', t: '30%', s: 74 },   // parents
          { l: '27%', t: '48%', s: 72 }, { l: '44%', t: '46%', s: 80 }, { l: '58%', t: '48%', s: 68 }, // self+spouse
          { l: '34%', t: '66%', s: 62 }, { l: '52%', t: '66%', s: 58 },   // children
        ].map((n, i) => (
          <div key={i} className="absolute rounded-2xl bg-muted/50 dark:bg-muted/30"
            style={{ left: n.l, top: n.t, width: n.s + 16, height: n.s + 48, transform: 'translate(-50%,-50%)', filter: 'blur(14px)' }} />
        ))}
        {/* Connector lines */}
        <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg"
          style={{ filter: 'blur(3px)', opacity: 0.18 }}>
          <line x1="33%" y1="19%" x2="36%" y2="36%" stroke="currentColor" strokeWidth="2" />
          <line x1="57%" y1="19%" x2="56%" y2="36%" stroke="currentColor" strokeWidth="2" />
          <line x1="36%" y1="36%" x2="46%" y2="52%" stroke="currentColor" strokeWidth="2" />
          <line x1="56%" y1="36%" x2="57%" y2="52%" stroke="currentColor" strokeWidth="2" />
          <line x1="46%" y1="52%" x2="36%" y2="68%" stroke="currentColor" strokeWidth="2" />
          <line x1="46%" y1="52%" x2="53%" y2="68%" stroke="currentColor" strokeWidth="2" />
        </svg>
      </div>
    )
  }

  function NodeSkel({ w, highlight = false, delay = 0 }: { w: number; highlight?: boolean; delay?: number }) {
    return (
      <div
        className={`rounded-2xl border p-3 flex flex-col items-center gap-2 shadow-sm overflow-hidden relative ${
          highlight ? 'border-primary/40 bg-primary/8' : 'border-border/70 bg-card'
        }`}
        style={{ width: w + 16 }}
      >
        {/* shimmer sweep */}
        <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" style={{ animationDelay: `${delay}ms` }} />
        <div className={`h-10 w-10 rounded-full ${highlight ? 'bg-primary/25' : 'bg-muted'}`} />
        <div className="h-2.5 rounded-full bg-muted" style={{ width: w * 0.65 }} />
        <div className="h-2 rounded-full bg-muted/70" style={{ width: w * 0.45 }} />
      </div>
    )
  }

  function AppShellSkeleton() {
    return (
      <div className="flex h-screen overflow-hidden bg-background">
        {/* Sidebar skeleton */}
        <div className="hidden lg:flex w-64 shrink-0 flex-col border-r border-border/50 bg-card">
          {/* Header */}
          <div className="flex h-14 items-center gap-3 border-b border-border/40 px-4">
            <div className="h-8 w-8 rounded-xl bg-muted animate-pulse shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-24 rounded bg-muted animate-pulse" />
              <div className="h-2 w-16 rounded bg-muted/70 animate-pulse" />
            </div>
          </div>
          {/* Health widget */}
          <div className="mx-3 mt-3 rounded-2xl border border-border/40 bg-muted/20 p-3 space-y-3">
            <div className="h-3 w-20 rounded bg-muted animate-pulse" />
            <div className="flex items-center gap-3">
              <div className="h-20 w-20 rounded-full bg-muted animate-pulse shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-2.5 w-full rounded bg-muted animate-pulse" />
                <div className="h-2.5 w-3/4 rounded bg-muted/70 animate-pulse" />
                <div className="h-2 w-1/2 rounded bg-muted/50 animate-pulse" />
              </div>
            </div>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="h-3.5 w-3.5 rounded-full bg-muted animate-pulse shrink-0" />
                <div className="h-2 w-6 rounded bg-muted animate-pulse" />
                <div className="h-2 flex-1 rounded bg-muted/60 animate-pulse" />
              </div>
            ))}
          </div>
          {/* Nav items */}
          <div className="flex-1 px-2 py-2 space-y-1">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-2">
                <div className="h-4 w-4 rounded bg-muted animate-pulse shrink-0" />
                <div className="h-3 rounded bg-muted/80 animate-pulse" style={{ width: `${55 + (i % 3) * 18}%` }} />
              </div>
            ))}
          </div>
          {/* User profile strip */}
          <div className="border-t border-border/40 px-3 py-3 flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-muted animate-pulse shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-2.5 w-20 rounded bg-muted animate-pulse" />
              <div className="h-2 w-14 rounded bg-muted/70 animate-pulse" />
            </div>
          </div>
        </div>

        {/* Main content skeleton */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Top bar */}
          <div className="h-12 shrink-0 border-b border-border/40 bg-card/80 flex items-center gap-3 px-4">
            <div className="h-7 w-28 rounded-lg bg-muted animate-pulse" />
            <div className="flex-1" />
            <div className="h-7 w-24 rounded-lg bg-muted/70 animate-pulse" />
            <div className="h-7 w-7 rounded-full bg-muted animate-pulse" />
            <div className="h-7 w-7 rounded-full bg-muted/70 animate-pulse" />
          </div>
          {/* Tree canvas */}
          <div className="flex-1 relative overflow-hidden flex flex-col items-center justify-center gap-9 px-4">
            {/* ghost blurred tree silhouette */}
            <GhostTreeBg />
            {/* skeleton cards on top */}
            <div className="flex items-end gap-16 relative z-10">
              {[88, 80].map((w, i) => <NodeSkel key={i} w={w} delay={i * 150} />)}
            </div>
            <div className="flex items-end gap-12 relative z-10">
              {[76, 72].map((w, i) => <NodeSkel key={i} w={w} delay={300 + i * 150} />)}
            </div>
            <div className="flex items-end gap-8 relative z-10">
              {[68, 64, 60].map((w, i) => <NodeSkel key={i} w={w} highlight={i === 1} delay={600 + i * 150} />)}
            </div>
            <div className="flex items-end gap-10 relative z-10">
              {[56, 52].map((w, i) => <NodeSkel key={i} w={w} delay={900 + i * 150} />)}
            </div>
          </div>
        </div>
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
