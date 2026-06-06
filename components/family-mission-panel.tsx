'use client'

/**
 * FamilyMissionPanel — persistent right sidebar for the Tree view.
 *
 * Three sections:
 *  0. Complete Your Profile — primary action card (shown until photo +
 *     birth year + occupation are all filled in).
 *  1. Family Mission — gamified checklist of tree-building tasks.
 *  2. People Waiting to Join — unclaimed members with one-tap WhatsApp invite.
 */

import { useMemo, useState } from 'react'
import { Camera, Check, ChevronDown, ChevronUp, MessageCircle, UserPlus, Target, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FamilyMember } from '@/lib/types'
import { Button } from '@/components/ui/button'
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
  onAddMember: () => void
  onAddStory: () => void
  onInviteMember: (member: FamilyMember) => void
  onEditSelf: () => void
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

function inferRelLabel(member: FamilyMember, self: FamilyMember, allMembers: FamilyMember[]): string {
  if (self.parentIds.includes(member.id))
    return member.gender === 'male' ? 'Father' : member.gender === 'female' ? 'Mother' : 'Parent'
  if (member.parentIds.includes(self.id))
    return member.gender === 'male' ? 'Son' : member.gender === 'female' ? 'Daughter' : 'Child'
  if ((self.spouseIds ?? []).includes(member.id))
    return member.gender === 'male' ? 'Husband' : member.gender === 'female' ? 'Wife' : 'Spouse'
  if (self.parentIds.length > 0 && member.parentIds.some(pid => self.parentIds.includes(pid)))
    return member.gender === 'male' ? 'Brother' : member.gender === 'female' ? 'Sister' : 'Sibling'
  const parents = self.parentIds.map(pid => allMembers.find(m => m.id === pid)).filter(Boolean) as FamilyMember[]
  for (const p of parents) {
    if (p.parentIds.includes(member.id))
      return member.gender === 'male' ? 'Grandfather' : member.gender === 'female' ? 'Grandmother' : 'Grandparent'
  }
  return 'Family member'
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
    { id: 'add_self', label: 'Add yourself', emoji: '👤', done: true },
    { id: 'add_father', label: 'Add father', emoji: '👨', done: !!father, cta: 'Add', onAction: onAddMember },
    { id: 'add_mother', label: 'Add mother', emoji: '👩', done: !!mother, cta: 'Add', onAction: onAddMember },
    { id: 'add_sibling', label: 'Add a sibling', emoji: '👫', done: hasSibling, cta: 'Add', onAction: onAddMember },
    {
      id: 'invite_father',
      label: father ? `Invite ${father.name.split(' ')[0]}` : 'Invite father',
      emoji: '💌',
      done: !!father?.isClaimed,
      cta: father ? 'Invite' : undefined,
      onAction: father && !father.isClaimed ? onAddMember : undefined,
    },
    {
      id: 'invite_mother',
      label: mother ? `Invite ${mother.name.split(' ')[0]}` : 'Invite mother',
      emoji: '💌',
      done: !!mother?.isClaimed,
      cta: mother ? 'Invite' : undefined,
      onAction: mother && !mother.isClaimed ? onAddMember : undefined,
    },
    { id: 'add_spouse', label: 'Add spouse / partner', emoji: '💍', done: hasSpouse, cta: 'Add', onAction: onAddMember },
    { id: 'add_child', label: 'Add a child', emoji: '👶', done: hasChild, cta: 'Add', onAction: onAddMember },
    { id: 'add_paternal_gf', label: "Father's father", emoji: '👴', done: hasPatGrandFather, cta: 'Add', onAction: onAddMember },
    { id: 'add_paternal_gm', label: "Father's mother", emoji: '👵', done: hasPatGrandMother, cta: 'Add', onAction: onAddMember },
    { id: 'add_story', label: 'Add a memory or story', emoji: '📖', done: hasStories, cta: 'Add', onAction: onAddStory },
    { id: 'family_claimed', label: 'Another member joined', emoji: '🎉', done: hasOtherClaims },
  ]
}

// ─── Main component ───────────────────────────────────────────────────────────

export function FamilyMissionPanel({
  selfMember,
  members,
  isAdmin: _isAdmin,
  familyId: _familyId,
  onAddMember,
  onAddStory,
  onInviteMember,
  onEditSelf,
  hasStories,
}: FamilyMissionPanelProps) {
  const [missionsOpen, setMissionsOpen] = useState(true)
  const [waitingOpen, setWaitingOpen] = useState(true)

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

  const waitingPeople = useMemo<WaitingPerson[]>(() => {
    if (!selfMember) return []
    return members
      .filter(m => !m.isClaimed && m.id !== selfMember.id)
      .slice(0, 8)
      .map(m => ({ member: m, relationship: inferRelLabel(m, selfMember, members) }))
  }, [members, selfMember])

  const missingProfileFields = selfMember ? [
    !selfMember.photoUrl && 'photo',
    !selfMember.birthYear && 'birth year',
    !selfMember.occupation && 'occupation',
  ].filter(Boolean) as string[] : []
  const profileComplete = missingProfileFields.length === 0

  return (
    <div className="flex h-full flex-col border-l border-border/40 w-72 shrink-0 overflow-hidden"
      style={{ background: 'var(--surface-header, hsl(var(--card)))' }}>

      {/* ── Complete Your Profile — primary action, hidden once done ── */}
      {!profileComplete && selfMember && (
        <div className="shrink-0 mx-3 mt-3 mb-1 rounded-xl border border-amber-500/30 bg-amber-500/[0.08] px-3 py-2.5">
          <div className="flex items-center gap-2.5">
            <div className="relative shrink-0">
              <Avatar className="h-9 w-9">
                {selfMember.photoUrl && <AvatarImage src={selfMember.photoUrl} alt={selfMember.name} />}
                <AvatarFallback className="text-[11px] font-bold text-white"
                  style={{ background: genderColor(selfMember.gender) }}>
                  {getInitials(selfMember.name)}
                </AvatarFallback>
              </Avatar>
              {!selfMember.photoUrl && (
                <div className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500">
                  <Camera className="h-2 w-2 text-white" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold text-foreground leading-snug">Complete your profile</p>
              <p className="text-[10px] text-amber-400/80 leading-tight mt-0.5">
                Missing: {missingProfileFields.join(', ')}
              </p>
            </div>
            <button type="button" onClick={onEditSelf}
              className="shrink-0 rounded-lg border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-[10px] font-semibold text-amber-300 hover:bg-amber-500/25 transition-colors whitespace-nowrap">
              Update →
            </button>
          </div>
        </div>
      )}

      {/* ── Family Mission ──────────────────────────────────────────────── */}
      <div className="border-b border-border/40">
        <button type="button" onClick={() => setMissionsOpen(v => !v)}
          className="flex w-full items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
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
            <div className="px-4 pb-2">
              <div className="h-1.5 rounded-full bg-muted/60 overflow-hidden">
                <div className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${progressPct}%` }} />
              </div>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: '240px' }}>
              <ul className="px-3 pb-3 space-y-0.5">
                {steps.map(step => (
                  <li key={step.id}>
                    <div className={cn(
                      'flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[12px]',
                      step.done ? 'opacity-60' : 'hover:bg-muted/30',
                    )}>
                      <div className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                        step.done ? 'border-emerald-500/60 bg-emerald-500/15' : 'border-border/50 bg-muted/30',
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
                        <button type="button" onClick={step.onAction}
                          className="shrink-0 rounded-md border border-border/40 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors">
                          {step.cta}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>

      {/* ── People Waiting to Join ──────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-h-0">
        <button type="button" onClick={() => setWaitingOpen(v => !v)}
          className="flex w-full items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors border-b border-border/40">
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
          <div className="flex-1 overflow-y-auto">
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
                {waitingPeople.map(({ member, relationship }) => (
                  <li key={member.id} className="flex items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-muted/30 transition-colors">
                    <Avatar className="h-8 w-8 shrink-0">
                      {member.photoUrl && <AvatarImage src={member.photoUrl} alt={member.name} />}
                      <AvatarFallback className="text-[11px] font-bold text-white"
                        style={{ background: genderColor(member.gender) }}>
                        {getInitials(member.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-foreground truncate">{member.name}</p>
                      <p className="text-[10px] text-muted-foreground">{relationship}</p>
                    </div>
                    <Button size="sm" onClick={() => onInviteMember(member)}
                      className="h-6 shrink-0 gap-1 rounded-lg px-2 text-[10px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white border-0">
                      <MessageCircle className="h-3 w-3" />
                      Invite
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {waitingPeople.length > 0 && (
              <div className="px-4 pb-3">
                <button type="button"
                  onClick={() => { if (waitingPeople[0]) onInviteMember(waitingPeople[0].member) }}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-border/40 py-2 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-border/70 transition-colors">
                  <UserPlus className="h-3 w-3" />
                  View all invites
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
