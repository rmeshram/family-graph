'use client'

/**
 * FamilyMissionPanel — persistent right sidebar for the Tree view.
 *
 * Two sections:
 *  1. Family Mission — gamified checklist of tree-building tasks.
 *     Completed items stay visible (crossed off) so users feel progress.
 *  2. People Waiting to Join — unclaimed members with one-tap WhatsApp invite.
 *
 * Design goals:
 *  - Never scroll the whole panel; each section scrolls independently.
 *  - Sections can be collapsed with a chevron to reclaim vertical space.
 *  - Invite button is always reachable without opening another dialog.
 */

import { useMemo, useState } from 'react'
import { Check, ChevronDown, ChevronUp, MessageCircle, UserPlus, Target, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FamilyMember } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MissionStep {
  id: string
  label: string
  emoji: string
  done: boolean
  cta?: string
  onAction?: () => void
}

interface WaitingPerson {
  member: FamilyMember
  relationship: string
}

export interface FamilyMissionPanelProps {
  selfMember: FamilyMember | null
  members: FamilyMember[]
  isAdmin: boolean
  familyId: string | null
  /** Called when user clicks Add Member from a mission step */
  onAddMember: () => void
  /** Called when user clicks Add Story from a mission step */
  onAddStory: () => void
  /** Opens the invite-to-claim dialog pre-populated with the target member */
  onInviteMember: (member: FamilyMember) => void
  /** Whether any story has been added — needed for "Add memory" mission step */
  hasStories: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')
}

function genderColor(gender?: string) {
  if (gender === 'male') return 'hsl(217 91% 60%)'
  if (gender === 'female') return 'hsl(330 81% 65%)'
  return 'hsl(160 45% 52%)'
}

// Build the relationship label for an unclaimed member relative to self.
function inferRelLabel(member: FamilyMember, self: FamilyMember, allMembers: FamilyMember[]): string {
  if (self.parentIds.includes(member.id)) {
    return member.gender === 'male' ? 'Father' : member.gender === 'female' ? 'Mother' : 'Parent'
  }
  if (member.parentIds.includes(self.id)) {
    return member.gender === 'male' ? 'Son' : member.gender === 'female' ? 'Daughter' : 'Child'
  }
  if ((self.spouseIds ?? []).includes(member.id)) {
    return member.gender === 'male' ? 'Husband' : member.gender === 'female' ? 'Wife' : 'Spouse'
  }
  // Sibling: shares at least one parent with self
  if (self.parentIds.length > 0 && member.parentIds.some(pid => self.parentIds.includes(pid))) {
    return member.gender === 'male' ? 'Brother' : member.gender === 'female' ? 'Sister' : 'Sibling'
  }
  // Grandparent
  const parents = self.parentIds.map(pid => allMembers.find(m => m.id === pid)).filter(Boolean) as FamilyMember[]
  for (const p of parents) {
    if (p.parentIds.includes(member.id)) {
      return member.gender === 'male' ? 'Grandfather' : member.gender === 'female' ? 'Grandmother' : 'Grandparent'
    }
  }
  return member.relationship ?? 'Family'
}

// ─── Mission steps builder ────────────────────────────────────────────────────

function buildMissionSteps(
  selfMember: FamilyMember | null,
  members: FamilyMember[],
  hasStories: boolean,
  hasOtherClaims: boolean,
  onAddMember: () => void,
  onAddStory: () => void,
): MissionStep[] {
  if (!selfMember) return []

  const byId = new Map(members.map(m => [m.id, m]))
  const parents = selfMember.parentIds.map(pid => byId.get(pid)).filter(Boolean) as FamilyMember[]
  const father = parents.find(p => p.gender === 'male')
  const mother = parents.find(p => p.gender === 'female')
  const hasSpouse = (selfMember.spouseIds ?? []).some(sid => byId.has(sid))
  const hasChild = members.some(m => m.parentIds.includes(selfMember.id))
  const hasSibling = members.some(
    m => m.id !== selfMember.id && m.parentIds.length > 0 && m.parentIds.some(pid => selfMember.parentIds.includes(pid))
  )
  const fatherParents = father ? father.parentIds.map(pid => byId.get(pid)).filter(Boolean) as FamilyMember[] : []
  const hasPatGrandFather = fatherParents.some(p => p.gender === 'male')
  const hasPatGrandMother = fatherParents.some(p => p.gender === 'female')

  return [
    {
      id: 'add_self',
      label: 'Add yourself',
      emoji: '👤',
      done: true, // always done — they're using the app
    },
    {
      id: 'add_father',
      label: 'Add father',
      emoji: '👨',
      done: !!father,
      cta: 'Add',
      onAction: onAddMember,
    },
    {
      id: 'add_mother',
      label: 'Add mother',
      emoji: '👩',
      done: !!mother,
      cta: 'Add',
      onAction: onAddMember,
    },
    {
      id: 'add_sibling',
      label: 'Add a sibling',
      emoji: '👫',
      done: hasSibling,
      cta: 'Add',
      onAction: onAddMember,
    },
    {
      id: 'invite_father',
      label: father ? `Invite ${father.name.split(' ')[0]}` : 'Invite father',
      emoji: '💌',
      done: !!father?.isClaimed,
      cta: father ? 'Invite' : undefined,
      onAction: father && !father.isClaimed ? onAddMember : undefined, // replaced in panel with per-member invite
    },
    {
      id: 'invite_mother',
      label: mother ? `Invite ${mother.name.split(' ')[0]}` : 'Invite mother',
      emoji: '💌',
      done: !!mother?.isClaimed,
      cta: mother ? 'Invite' : undefined,
      onAction: mother && !mother.isClaimed ? onAddMember : undefined,
    },
    {
      id: 'add_spouse',
      label: 'Add spouse / partner',
      emoji: '💍',
      done: hasSpouse,
      cta: 'Add',
      onAction: onAddMember,
    },
    {
      id: 'add_child',
      label: 'Add a child',
      emoji: '👶',
      done: hasChild,
      cta: 'Add',
      onAction: onAddMember,
    },
    {
      id: 'add_paternal_gf',
      label: "Father's father",
      emoji: '👴',
      done: hasPatGrandFather,
      cta: 'Add',
      onAction: onAddMember,
    },
    {
      id: 'add_paternal_gm',
      label: "Father's mother",
      emoji: '👵',
      done: hasPatGrandMother,
      cta: 'Add',
      onAction: onAddMember,
    },
    {
      id: 'add_story',
      label: 'Add a memory or story',
      emoji: '📖',
      done: hasStories,
      cta: 'Add',
      onAction: onAddStory,
    },
    {
      id: 'family_claimed',
      label: 'Another member joined',
      emoji: '🎉',
      done: hasOtherClaims,
    },
  ]
}

// ─── Main component ───────────────────────────────────────────────────────────

export function FamilyMissionPanel({
  selfMember,
  members,
  isAdmin,
  familyId,
  onAddMember,
  onAddStory,
  onInviteMember,
  hasStories,
}: FamilyMissionPanelProps) {
  const [missionsOpen, setMissionsOpen] = useState(true)
  const [waitingOpen, setWaitingOpen] = useState(true)

  // ── Mission steps ────────────────────────────────────────────────────────
  const hasOtherClaims = members.some(
    m => m.isClaimed && m.claimedByUserId && m.claimedByUserId !== selfMember?.id
  )

  const steps = useMemo(
    () => buildMissionSteps(selfMember, members, hasStories, hasOtherClaims, onAddMember, onAddStory),
    [selfMember, members, hasStories, hasOtherClaims, onAddMember, onAddStory]
  )

  const completedCount = steps.filter(s => s.done).length
  const totalCount = steps.length
  const progressPct = Math.round((completedCount / totalCount) * 100)

  // ── People Waiting to Join ───────────────────────────────────────────────
  const waitingPeople = useMemo<WaitingPerson[]>(() => {
    if (!selfMember) return []
    return members
      .filter(m => !m.isClaimed && m.id !== selfMember.id)
      .slice(0, 8) // cap at 8 to keep the list focused
      .map(m => ({
        member: m,
        relationship: inferRelLabel(m, selfMember, members),
      }))
  }, [members, selfMember])

  return (
    <div className="flex h-full flex-col border-l border-border/40 w-72 shrink-0 overflow-hidden" style={{ background: 'var(--surface-header, hsl(var(--card)))' }}>

      {/* ── Family Mission ──────────────────────────────────────────────── */}
      <div className="border-b border-border/40">
        {/* Header */}
        <button
          type="button"
          onClick={() => setMissionsOpen(v => !v)}
          className="flex w-full items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Family Mission</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
              {completedCount} / {totalCount} completed
            </span>
            {missionsOpen ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
          </div>
        </button>

        {missionsOpen && (
          <>
            {/* Progress bar */}
            <div className="px-4 pb-2">
              <div className="h-1.5 rounded-full bg-muted/60 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            {/* Steps list */}
            <ScrollArea className="max-h-64">
              <ul className="px-3 pb-3 space-y-0.5">
                {steps.map(step => (
                  <li key={step.id}>
                    <div className={cn(
                      'flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[12px] group',
                      step.done ? 'opacity-60' : 'hover:bg-muted/30',
                    )}>
                      {/* Check circle */}
                      <div className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors',
                        step.done
                          ? 'border-emerald-500/60 bg-emerald-500/15'
                          : 'border-border/50 bg-muted/30',
                      )}>
                        {step.done && <Check className="h-2.5 w-2.5 text-emerald-400" />}
                      </div>

                      <span className={cn(
                        'flex-1 leading-tight',
                        step.done ? 'line-through text-muted-foreground' : 'text-foreground',
                      )}>
                        <span className="mr-1">{step.emoji}</span>
                        {step.label}
                      </span>

                      {!step.done && step.cta && step.onAction && (
                        <button
                          type="button"
                          onClick={step.onAction}
                          className="shrink-0 rounded-md border border-border/40 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
                        >
                          {step.cta}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </>
        )}
      </div>

      {/* ── People Waiting to Join ──────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-h-0">
        {/* Header */}
        <button
          type="button"
          onClick={() => setWaitingOpen(v => !v)}
          className="flex w-full items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors border-b border-border/40"
        >
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-semibold text-foreground">People Waiting to Join</span>
          </div>
          <div className="flex items-center gap-2">
            {waitingPeople.length > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500/20 px-1 text-[10px] font-semibold text-amber-400 tabular-nums">
                {waitingPeople.length}
              </span>
            )}
            {waitingOpen ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
          </div>
        </button>

        {waitingOpen && (
          <ScrollArea className="flex-1">
            {waitingPeople.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 mb-2">
                  <Check className="h-5 w-5 text-emerald-400" />
                </div>
                <p className="text-xs font-medium text-foreground">Everyone's joined!</p>
                <p className="text-[11px] text-muted-foreground mt-1">All added members have claimed their profiles.</p>
              </div>
            ) : (
              <ul className="px-3 py-2 space-y-1">
                {waitingPeople.map(({ member, relationship }) => {
                  const initials = getInitials(member.name)
                  const color = genderColor(member.gender)
                  return (
                    <li key={member.id} className="flex items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-muted/30 transition-colors group">
                      {/* Avatar */}
                      <Avatar className="h-8 w-8 shrink-0">
                        {member.photoUrl && <AvatarImage src={member.photoUrl} alt={member.name} />}
                        <AvatarFallback
                          className="text-[11px] font-bold text-white"
                          style={{ background: color }}
                        >
                          {initials}
                        </AvatarFallback>
                      </Avatar>

                      {/* Name + relationship */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold text-foreground truncate">{member.name}</p>
                        <p className="text-[10px] text-muted-foreground">{relationship}</p>
                      </div>

                      {/* Invite button — WhatsApp green */}
                      <Button
                        size="sm"
                        onClick={() => onInviteMember(member)}
                        className="h-6 shrink-0 gap-1 rounded-lg px-2 text-[10px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white border-0"
                      >
                        <MessageCircle className="h-3 w-3" />
                        Invite
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}

            {/* Footer link — only show if there are people waiting */}
            {waitingPeople.length > 0 && (
              <div className="px-4 pb-3">
                <button
                  type="button"
                  onClick={() => {
                    // Open first unclaimed member in invite dialog as shortcut
                    if (waitingPeople[0]) onInviteMember(waitingPeople[0].member)
                  }}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-border/40 py-2 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-border/70 transition-colors"
                >
                  <UserPlus className="h-3 w-3" />
                  View all invites
                </button>
              </div>
            )}
          </ScrollArea>
        )}
      </div>
    </div>
  )
}
