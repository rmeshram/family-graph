'use client'

import { cn } from '@/lib/utils'
import type { QuickRelType } from './quick-add-member-dialog'

const ACTIONS: { type: QuickRelType; label: string }[] = [
  { type: 'father', label: 'Father' },
  { type: 'mother', label: 'Mother' },
  { type: 'spouse', label: 'Spouse' },
  { type: 'child', label: 'Child' },
  { type: 'sibling', label: 'Sibling' },
]

interface NodeActionRingProps {
  memberId: string
  onAddRelative: (anchorId: string, relType: QuickRelType) => void
  className?: string
}

export function NodeActionRing({ memberId, onAddRelative, className }: NodeActionRingProps) {
  return (
    <div
      className={cn('flex items-center gap-0.5 pointer-events-auto', className)}
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
    >
      {ACTIONS.map(({ type, label }) => (
        <button
          key={type}
          type="button"
          onClick={e => {
            e.stopPropagation()
            onAddRelative(memberId, type)
          }}
          onPointerDown={e => e.stopPropagation()}
          className={cn(
            'rounded-full border px-1.5 py-[3px] text-[8px] font-medium whitespace-nowrap',
            'border-white/10 bg-background/80 text-foreground/70 backdrop-blur-sm',
            'hover:border-primary/50 hover:bg-primary/15 hover:text-primary',
            'active:scale-95 transition-all duration-100'
          )}
          title={`Add ${label}`}
        >
          +{label}
        </button>
      ))}
    </div>
  )
}
