'use client'

/**
 * MobileNodeMenu — compact bottom-sheet action menu for node taps on mobile.
 *
 * Design:
 *  • Appears on first tap of any graph node (replacing the immediate 88vh drawer).
 *  • ~50vh max, no internal scroll → Vaul swipe-to-dismiss works perfectly.
 *  • "View Full Profile" expands to the full MemberDetail drawer.
 *  • Secondary actions: Edit, Send Invite, Add Relative (inline expand).
 *  • Dismissed via: swipe down · backdrop tap · × button.
 */

import { useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent } from '@/components/ui/drawer'
import { cn } from '@/lib/utils'
import type { FamilyMember } from '@/lib/types'
import type { QuickRelType } from '@/components/quick-add-member-dialog'
import {
  X, User, Pencil, Send, UserPlus, ChevronRight,
  Calendar, MapPin, Briefcase,
} from 'lucide-react'

// ─── Quick-rel options ────────────────────────────────────────────────────────

const QUICK_REL_OPTIONS: { type: QuickRelType; label: string; emoji: string }[] = [
  { type: 'father', label: 'Father', emoji: '👨' },
  { type: 'mother', label: 'Mother', emoji: '👩' },
  { type: 'spouse', label: 'Spouse', emoji: '💑' },
  { type: 'child', label: 'Child', emoji: '👶' },
  { type: 'sibling', label: 'Sibling', emoji: '🤝' },
]

function getAvailableRels(member: FamilyMember, allMembers: FamilyMember[]) {
  const parentIds = (member.parentIds as string[]) ?? []
  const spouseIds = (member.spouseIds as string[]) ?? []
  const parents = allMembers.filter(m => parentIds.includes(m.id))
  const hasFather = parents.some(p => p.gender === 'male')
  const hasMother = parents.some(p => p.gender === 'female')
  const hasSpouse = spouseIds.length > 0
  return QUICK_REL_OPTIONS.filter(({ type }) => {
    if (type === 'father') return !hasFather
    if (type === 'mother') return !hasMother
    if (type === 'spouse') return !hasSpouse
    return true
  })
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface MobileNodeMenuProps {
  member: FamilyMember | null
  open: boolean
  onClose: () => void
  onViewProfile: () => void
  onEdit?: () => void
  onInvite?: () => void
  onAddRelative?: (anchorId: string, relType: QuickRelType) => void
  allMembers: FamilyMember[]
  selfMemberId?: string | null
  isViewer?: boolean
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MobileNodeMenu({
  member,
  open,
  onClose,
  onViewProfile,
  onEdit,
  onInvite,
  onAddRelative,
  allMembers,
  selfMemberId,
  isViewer = false,
}: MobileNodeMenuProps) {
  const [relExpanded, setRelExpanded] = useState(false)

  const handleOpenChange = (v: boolean) => {
    if (!v) { setRelExpanded(false); onClose() }
  }

  if (!member) return null

  const initials = member.name.split(' ').map(n => n[0]).join('').slice(0, 2)
  const isSelf = member.id === selfMemberId
  const isDeceased = !!member.deathYear
  const lifespan = member.deathYear
    ? `${member.birthYear ?? '?'}–${member.deathYear}`
    : member.birthYear ? `b. ${member.birthYear}` : null
  const availableRels = getAvailableRels(member, allMembers)
  const canAddRelative = !isViewer && !!onAddRelative && availableRels.length > 0
  const canEdit = !isViewer && !isSelf && !!onEdit
  const canInvite = !isViewer && !member.isClaimed && !!onInvite

  return (
    <Drawer open={open} onOpenChange={handleOpenChange} direction="bottom">
      <DrawerContent className="max-h-[55vh]">
        {/* ─── Member header ─────────────────────────────────────── */}
        <div className="px-4 pt-2 pb-5 flex flex-col gap-4">

          <div className="flex items-center gap-3">
            {/* Avatar */}
            <Avatar className="h-12 w-12 border-2 border-amber-400/30 ring-2 ring-amber-400/10 shrink-0">
              {member.photoUrl && !member.showAsAnonymous && (
                <AvatarImage src={member.photoUrl} alt={member.name} className="object-cover" />
              )}
              <AvatarFallback className="bg-gradient-to-br from-amber-600/20 to-indigo-600/25 font-bold text-sm">
                {member.showAsAnonymous ? '?' : initials}
              </AvatarFallback>
            </Avatar>

            {/* Name + meta */}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-base leading-tight truncate">
                {member.showAsAnonymous ? '? Member' : member.name}
              </p>
              <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                {isSelf ? (
                  <Badge variant="secondary" className="text-[10px] px-1.5 h-4">You</Badge>
                ) : member.relationship && member.relationship !== 'self' ? (
                  <Badge variant="secondary" className="text-[10px] px-1.5 h-4 capitalize">{member.relationship}</Badge>
                ) : null}
                {isDeceased && (
                  <Badge variant="outline" className="text-[10px] px-1.5 h-4 border-muted-foreground/30 text-muted-foreground">Deceased</Badge>
                )}
                {!member.isClaimed && (
                  <Badge variant="outline" className="text-[10px] px-1.5 h-4 border-amber-500/40 text-amber-400 bg-amber-500/5">Not joined yet</Badge>
                )}
              </div>
            </div>

            {/* Explicit close × */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Quick-info chips (non-intrusive) */}
          {!member.showAsAnonymous && (
            <div className="flex flex-wrap gap-2">
              {lifespan && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted/50 border border-border/40 px-2.5 py-1 text-[11px] text-muted-foreground">
                  <Calendar className="h-3 w-3" /> {lifespan}
                </span>
              )}
              {member.birthPlace && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted/50 border border-border/40 px-2.5 py-1 text-[11px] text-muted-foreground">
                  <MapPin className="h-3 w-3" /> {member.birthPlace}
                </span>
              )}
              {member.occupation && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted/50 border border-border/40 px-2.5 py-1 text-[11px] text-muted-foreground">
                  <Briefcase className="h-3 w-3" /> {member.occupation}
                </span>
              )}
            </div>
          )}

          {/* ─── Add Relative inline expansion ─────────────────── */}
          {canAddRelative && relExpanded && (
            <div className="rounded-xl border border-border/40 bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground mb-2.5">Choose relationship to add:</p>
              <div className="flex flex-wrap gap-2">
                {availableRels.map(({ type, label, emoji }) => (
                  <button
                    key={type}
                    onClick={() => {
                      onAddRelative!(member.id, type)
                      setRelExpanded(false)
                      onClose()
                    }}
                    className="flex items-center gap-1.5 rounded-full border border-border/50 bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted/60 active:scale-95 transition-all"
                  >
                    <span role="img" aria-label={label}>{emoji}</span>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ─── Secondary actions ──────────────────────────────── */}
          {(canEdit || canInvite || canAddRelative) && (
            <div className={cn('grid gap-2', (canEdit || canInvite) && canAddRelative ? 'grid-cols-3' : 'grid-cols-2')}>
              {canEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 flex-col gap-0.5 text-[11px] font-medium"
                  onClick={() => { onEdit!(); onClose() }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Button>
              )}
              {canInvite && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 flex-col gap-0.5 text-[11px] font-medium"
                  onClick={() => { onInvite!(); onClose() }}
                >
                  <Send className="h-3.5 w-3.5" />
                  Invite
                </Button>
              )}
              {canAddRelative && (
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    'h-10 flex-col gap-0.5 text-[11px] font-medium',
                    relExpanded && 'bg-primary/10 border-primary/40 text-primary'
                  )}
                  onClick={() => setRelExpanded(v => !v)}
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Add Relative
                </Button>
              )}
            </div>
          )}

          {/* ─── Primary CTA ────────────────────────────────────── */}
          <Button
            className="w-full h-11 gap-2 text-sm font-semibold"
            onClick={() => { setRelExpanded(false); onViewProfile() }}
          >
            <User className="h-4 w-4" />
            View Full Profile
            <ChevronRight className="h-4 w-4 ml-auto" />
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
