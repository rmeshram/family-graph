'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppSidebar } from '@/components/app-sidebar'
import { ErrorBoundary } from '@/components/error-boundary'
import { useAuth } from '@/hooks/use-auth'
import { DEMO_SESSION_KEY } from '@/hooks/use-demo-mode'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [ready, setReady] = useState(false)

  // Persist demo flag from URL query param on first render
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('demo') === '1') {
      sessionStorage.setItem(DEMO_SESSION_KEY, '1')
    }
  }, [])

  // Auth gate: redirect unauthenticated users unless they are in demo mode
  useEffect(() => {
    if (loading) return

    if (user) {
      // Authenticated: clear any leftover demo flag
      sessionStorage.removeItem(DEMO_SESSION_KEY)
      setReady(true)
      return
    }

    // Not authenticated – allow only explicit demo mode
    const isDemo =
      typeof window !== 'undefined' &&
      sessionStorage.getItem(DEMO_SESSION_KEY) === '1'

    if (isDemo) {
      setReady(true)
    } else {
      const next = encodeURIComponent(window.location.pathname)
      router.replace(`/auth/signin?next=${next}`)
    }
  }, [user, loading, router])

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar />
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </div>
    </div>
  )
}
