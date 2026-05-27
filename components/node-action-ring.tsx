'use client'

import { cn } from '@/lib/utils'
import { User2, GitBranch, Send } from 'lucide-react'
import type { FamilyMember } from '@/lib/types'
import type { QuickRelType } from './quick-add-member-dialog'

const ADD_ACTIONS: { type: QuickRelType; label: string }[] = [
  { type: 'father', label: 'Father' },
  { type: 'mother', label: 'Mother' },
  { type: 'spouse', label: 'Spouse' },
  { type: 'child', label: 'Child' },
  { type: 'sibling', label: 'Sibling' },
]

function getAvailableActions(member: FamilyMember, allMembers: FamilyMember[]) {
  const parentIds: string[] = (member.parentIds as string[]) ?? []
  const spouseIds: string[] = (member.spouseIds as string[]) ?? []
  const parents = allMembers.filter(m => parentIds.includes(m.id))
  const hasFather = parents.some(p => p.gender === 'male')
  const hasMother = parents.some(p => p.gender === 'female')
  const hasSpouse = spouseIds.length > 0

  return ADD_ACTIONS.filter(({ type }) => {
    if (type === 'father') return !hasFather
    if (type === 'mother') return !hasMother
    if (type === 'spouse') return !hasSpouse
    return true
  })
}

interface NodeActionRingProps {
  member: FamilyMember
  allMembers: FamilyMember[]
  /** Open/focus the member detail panel (closes competing panels) */
  onViewProfile?: (id: string) => void
  /** Open path finder with this member pre-filled as source */
  onFindRelationship?: (id: string) => void
  /** Send claim invite for this unclaimed node */
  onInvite?: (id: string) => void
  /** Add a relative to this node */
  onAddRelative?: (anchorId: string, relType: QuickRelType) => void
  /** compact=true hides +Relative pills (used at lower zoom levels) */
  compact?: boolean
  className?: string
}

export function NodeActionRing({
  member,
  allMembers,
  onViewProfile,
  onFindRelationship,
  onInvite,
  onAddRelative,
  compact = false,
  className,
}: NodeActionRingProps) {
  const addActions = onAddRelative && !compact ? getAvailableActions(member, allMembers) : []
  const showInvite = !member.isClaimed && !!onInvite

  const hasPrimary = !!onViewProfile || !!onFindRelationship || showInvite
  const hasAdd = addActions.length > 0

  if (!hasPrimary && !hasAdd) return null

  return (
    <div
      className={cn('flex items-center gap-0.5 pointer-events-auto', className)}
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
    >
      {/* ── Primary contextual actions ───────────────────────── */}
      {onViewProfile && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onViewProfile(member.id) }}
          onPointerDown={e => e.stopPropagation()}
          className={cn(
            'flex items-center gap-1 rounded-full border px-1.5 py-[3px] text-[8px] font-medium whitespace-nowrap',
            'border-primary/40 bg-primary/10 text-primary',
            'hover:bg-primary/25 active:scale-95 transition-all duration-100',
          )}
          title="View Profile"
        >
          <User2 className="h-2.5 w-2.5" />
          Profile
        </button>
      )}

      {onFindRelationship && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onFindRelationship(member.id) }}
          onPointerDown={e => e.stopPropagation()}
          className={cn(
            'flex items-center gap-1 rounded-full border px-1.5 py-[3px] text-[8px] font-medium whitespace-nowrap',
            'border-violet-500/40 bg-violet-500/10 text-violet-400',
            'hover:bg-violet-500/25 active:scale-95 transition-all duration-100',
          )}
          title="Find Relationship"
        >
          <GitBranch className="h-2.5 w-2.5" />
          Relation
        </button>
      )}

      {showInvite && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onInvite!(member.id) }}
          onPointerDown={e => e.stopPropagation()}
          className={cn(
            'flex items-center gap-1 rounded-full border px-1.5 py-[3px] text-[8px] font-medium whitespace-nowrap',
            'border-green-500/40 bg-green-500/10 text-green-400',
            'hover:bg-green-500/25 active:scale-95 transition-all duration-100',
          )}
          title="Send Invite"
        >
          <Send className="h-2.5 w-2.5" />
          Invite
        </button>
      )}

      {/* ── Separator ────────────────────────────────────────── */}
      {hasPrimary && hasAdd && (
        <div className="w-px h-3 bg-white/15 mx-0.5 shrink-0" aria-hidden />
      )}

      {/* ── Add Relative pills ───────────────────────────────── */}
      {addActions.map(({ type, label }) => (
        <button
          key={type}
          type="button"
          onClick={e => { e.stopPropagation(); onAddRelative!(member.id, type) }}
          onPointerDown={e => e.stopPropagation()}
          className={cn(
            'rounded-full border px-1.5 py-[3px] text-[8px] font-medium whitespace-nowrap',
            'border-white/10 bg-background/80 text-foreground/60 backdrop-blur-sm',
            'hover:border-amber-500/40 hover:bg-amber-500/10 hover:text-amber-400',
            'active:scale-95 transition-all duration-100',
          )}
          title={`Add ${label}`}
        >
          +{label}
        </button>
      ))}
    </div>
  )
}
