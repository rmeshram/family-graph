'use client'

import { useEffect, useState } from 'react'

export type AppTheme = 'dark' | 'light'

export function useAppTheme() {
  const [theme, setThemeState] = useState<AppTheme>('dark')

  // Read from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('fg-theme') as AppTheme | null
      if (stored === 'light') {
        setThemeState('light')
      }
    } catch { }
  }, [])

  const setTheme = (next: AppTheme) => {
    setThemeState(next)
    try {
      localStorage.setItem('fg-theme', next)
    } catch { }
    if (next === 'light') {
      document.documentElement.classList.add('light-theme')
    } else {
      document.documentElement.classList.remove('light-theme')
    }
  }

  const toggle = () => setTheme(theme === 'dark' ? 'light' : 'dark')

  return { theme, setTheme, toggle }
}
