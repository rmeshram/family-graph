'use client'

import { cn } from '@/lib/utils'
import type { FamilyMember } from '@/lib/types'
import type { QuickRelType } from './quick-add-member-dialog'

const ALL_ACTIONS: { type: QuickRelType; label: string }[] = [
  { type: 'father', label: 'Father' },
  { type: 'mother', label: 'Mother' },
  { type: 'spouse', label: 'Spouse' },
  { type: 'child', label: 'Child' },
  { type: 'sibling', label: 'Sibling' },
]

/** Returns which quick-add actions are still relevant for this member. */
function getAvailableActions(
  member: FamilyMember,
  allMembers: FamilyMember[]
): { type: QuickRelType; label: string }[] {
  const parentIds: string[] = (member.parentIds as string[]) ?? []
  const spouseIds: string[] = (member.spouseIds as string[]) ?? []
  const parents = allMembers.filter(m => parentIds.includes(m.id))
  const hasFather = parents.some(p => p.gender === 'male')
  const hasMother = parents.some(p => p.gender === 'female')
  const hasSpouse = spouseIds.length > 0

  return ALL_ACTIONS.filter(({ type }) => {
    if (type === 'father') return !hasFather
    if (type === 'mother') return !hasMother
    if (type === 'spouse') return !hasSpouse
    return true // child and sibling are always available
  })
}

interface NodeActionRingProps {
  member: FamilyMember
  allMembers: FamilyMember[]
  onAddRelative: (anchorId: string, relType: QuickRelType) => void
  className?: string
}

export function NodeActionRing({ member, allMembers, onAddRelative, className }: NodeActionRingProps) {
  const actions = getAvailableActions(member, allMembers)

  if (actions.length === 0) return null

  return (
    <div
      className={cn('flex items-center gap-0.5 pointer-events-auto', className)}
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
    >
      {actions.map(({ type, label }) => (
        <button
          key={type}
          type="button"
          onClick={e => {
            e.stopPropagation()
            onAddRelative(member.id, type)
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
