'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AppSidebar } from '@/components/app-sidebar'
import { ErrorBoundary } from '@/components/error-boundary'
import { useAuth } from '@/hooks/use-auth'
import { DEMO_SESSION_KEY } from '@/hooks/use-demo-mode'
import { Loader2 } from 'lucide-react'

export default function AppLayout({ children }: { children: React.ReactNode }) {
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

  // Show a minimal spinner while auth resolves to avoid flashing unauthenticated UI
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
