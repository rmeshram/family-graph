'use client'

import { useEffect, useState } from 'react'
import { useAuth } from './use-auth'

export const DEMO_SESSION_KEY = 'fg_demo'

/**
 * Returns true when the user is browsing in explicit demo mode
 * (not logged in and came via the "See Live Demo" CTA with ?demo=1).
 *
 * Demo mode is stored in sessionStorage so it persists across page
 * navigations within the same session, but clears when the tab closes
 * or the user signs in.
 */
export function useDemoMode(): boolean {
  const { user, loading } = useAuth()
  const [isDemo, setIsDemo] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Activate demo mode from URL query param
    const params = new URLSearchParams(window.location.search)
    if (params.get('demo') === '1') {
      sessionStorage.setItem(DEMO_SESSION_KEY, '1')
    }

    if (loading) return

    if (user) {
      // Authenticated users are never in demo mode
      sessionStorage.removeItem(DEMO_SESSION_KEY)
      setIsDemo(false)
    } else {
      setIsDemo(sessionStorage.getItem(DEMO_SESSION_KEY) === '1')
    }
  }, [user, loading])

  return isDemo
}
