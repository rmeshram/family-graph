'use client'

import { Moon, Sun } from 'lucide-react'
import { useAppTheme } from '@/hooks/use-theme'
import { cn } from '@/lib/utils'

interface ThemeToggleProps {
  className?: string
  showLabel?: boolean
}

export function ThemeToggle({ className, showLabel = false }: ThemeToggleProps) {
  const { theme, toggle } = useAppTheme()
  const isDark = theme === 'dark'

  return (
    <button
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={cn(
        'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
        'text-muted-foreground hover:bg-muted/50 hover:text-foreground w-full',
        className
      )}
    >
      {/* Pill toggle track */}
      <div
        className={cn(
          'relative flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-300',
          isDark
            ? 'border-primary/40 bg-primary/20'
            : 'border-amber-400/40 bg-amber-400/20'
        )}
      >
        <div
          className={cn(
            'absolute h-3.5 w-3.5 rounded-full transition-all duration-300 shadow-sm',
            isDark
              ? 'left-0.5 bg-primary'
              : 'left-[18px] bg-amber-400'
          )}
        />
      </div>

      {isDark ? (
        <Moon className="h-4 w-4 text-primary shrink-0" />
      ) : (
        <Sun className="h-4 w-4 text-amber-500 shrink-0" />
      )}

      {showLabel && (
        <span>{isDark ? 'Dark mode' : 'Light mode'}</span>
      )}
    </button>
  )
}
