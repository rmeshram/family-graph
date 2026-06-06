'use client'

import { useMemo, useState } from 'react'
import { Check, ChevronDown, ChevronUp, MessageCircle, UserPlus, Target, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FamilyMember } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

type MissionStep =
  | { id: string; label: string; emoji: string; done: boolean; kind: 'add'; onAction: () => void }
  | { id: string; label: string; emoji: string; done: boolean; kind: 'invite'; member: FamilyMember; onInvite: (m: FamilyMember) => void }
  | { id: string; label: string; emoji: string; done: boolean; kind: 'milestone' }

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
  hasStories: boolean
}

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
  const children = allMembers.filter(m => m.parentIds.includes(self.id))
  for (const c of children) {
    if (member.parentIds.includes(c.id))
      return member.gender === 'male' ? 'Grandson' : member.gender === 'female' ? 'Granddaughter' : 'Grandchild'
  }
  const spouses = (self.spouseIds ?? []).map(sid => allMembers.find(m => m.id === sid)).filter(Boolean) as FamilyMember[]
  for (const sp of spouses) {
    if (sp.parentIds.includes(member.id))
      return member.gender === 'male' ? 'Father-in-law' : member.gender === 'female' ? 'Mother-in-law' : 'Parent-in-law'
  }
  return 'Family member'
}

function buildMissionSteps(
  selfMember: FamilyMember,
  members: FamilyMember[],
  hasStories: boolean,
  hasOtherClaims: boolean,
  onAddMember: () => void,
  onAddStory: () => void,
  onInviteMember: (m: FamilyMember) => void,
): MissionStep[] {
  const byId = new Map(members.map(m => [m.id, m]))
  const parents = selfMember.parentIds.map(pid => byId.get(pid)).filter(Boolean) as FamilyMember[]
  const father = parents.find(p => p.gender === 'male') ?? (parents[0] as FamilyMember | undefined)
  const mother = parents.find(p => p.gender === 'female') ?? (parents.length > 1 ? parents[1] : undefined) as FamilyMember | undefined
  const hasSpouse = (selfMember.spouseIds ?? []).some(sid => byId.has(sid))
  const hasChild = members.some(m => m.parentIds.includes(selfMember.id))
  const hasSibling = parents.length > 0 && members.some(
    m => m.id !== selfMember.id && m.parentIds.some(pid => selfMember.parentIds.includes(pid))
  )
  const fatherParents = father ? father.parentIds.map(pid => byId.get(pid)).filter(Boolean) as FamilyMember[] : []
  const hasPatGF = fatherParents.some(p => p.gender === 'male')
  const hasPatGM = fatherParents.some(p => p.gender === 'female')

  const steps: MissionStep[] = []
  steps.push({ id: 'add_self', label: 'Add yourself', emoji: '👤', done: true, kind: 'milestone' })
  steps.push({ id: 'add_father', label: 'Add father', emoji: '👨', done: !!father, kind: 'add', onAction: onAddMember })
  steps.push({ id: 'add_mother', label: 'Add mother', emoji: '👩', done: !!mother, kind: 'add', onAction: onAddMember })
  if (parents.length > 0 || hasSibling)
    steps.push({ id: 'add_sibling', label: 'Add a sibling', emoji: '👫', done: hasSibling, kind: 'add', onAction: onAddMember })
  if (father)
    steps.push({ id: 'invite_father', label: `Invite ${father.name.split(' ')[0]}`, emoji: '💌', done: !!father.isClaimed, kind: 'invite', member: father, onInvite: onInviteMember })
  if (mother)
    steps.push({ id: 'invite_mother', label: `Invite ${mother.name.split(' ')[0]}`, emoji: '💌', done: !!mother.isClaimed, kind: 'invite', member: mother, onInvite: onInviteMember })
  steps.push({ id: 'add_spouse', label: 'Add spouse / partner', emoji: '💍', done: hasSpouse, kind: 'add', onAction: onAddMember })
  steps.push({ id: 'add_child', label: 'Add a child', emoji: '👶', done: hasChild, kind: 'add', onAction: onAddMember })
  if (father || hasPatGF || hasPatGM) {
    steps.push({ id: 'add_paternal_gf', label: "Father's father", emoji: '👴', done: hasPatGF, kind: 'add', onAction: onAddMember })
    steps.push({ id: 'add_paternal_gm', label: "Father's mother", emoji: '👵', done: hasPatGM, kind: 'add', onAction: onAddMember })
  }
  steps.push({ id: 'add_story', label: 'Add a memory or story', emoji: '📖', done: hasStories, kind: 'add', onAction: onAddStory })
  steps.push({ id: 'family_claimed', label: 'Another member joined', emoji: '🎉', done: hasOtherClaims, kind: 'milestone' })
  return steps
}

function StepRow({ step }: { step: MissionStep }) {
  return (
    <div className={cn(
      'flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[12px]',
      step.done ? 'opacity-55' : 'hover:bg-muted/30',
    )}>
      <div className={cn(
        'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
        step.done ? 'border-emerald-500/60 bg-emerald-500/15' : 'border-border/50 bg-muted/20',
      )}>
        {step.done && <Check className="h-2.5 w-2.5 text-emerald-400" />}
      </div>
      <span className={cn(
        'flex-1 min-w-0 truncate leading-tight',
        step.done ? 'line-through text-muted-foreground' : 'text-foreground',
      )}>
        <span className="mr-1">{step.emoji}</span>
        {step.label}
      </span>
      {!step.done && step.kind === 'add' && (
        <button type="button" onClick={step.onAction}
          className="shrink-0 rounded-md border border-border/40 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors">
          Add
        </button>
      )}
      {!step.done && step.kind === 'invite' && (
        <button type="button" onClick={() => step.onInvite(step.member)}
          className="shrink-0 flex items-center gap-1 rounded-md border border-emerald-700/40 bg-emerald-900/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 hover:bg-emerald-800/30 transition-colors">
          <MessageCircle className="h-2.5 w-2.5" />
          Invite
        </button>
      )}
    </div>
  )
}

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

  const hasOtherClaims = useMemo(
    () => members.some(m => m.isClaimed && m.claimedByUserId && m.claimedByUserId !== selfMember?.id),
    [members, selfMember]
  )

  const steps = useMemo(() => {
    if (!selfMember) return []
    return buildMissionSteps(selfMember, members, hasStories, hasOtherClaims, onAddMember, onAddStory, onInviteMember)
  }, [selfMember, members, hasStories, hasOtherClaims, onAddMember, onAddStory, onInviteMember])

  const completedCount = steps.filter(s => s.done).length
  const totalCount = steps.length
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  const waitingPeople = useMemo<WaitingPerson[]>(() => {
    if (!selfMember) return []
    return members
      .filter(m => !m.isClaimed && m.id !== selfMember.id)
      .slice(0, 10)
      .map(m => ({ member: m, relationship: inferRelLabel(m, selfMember, members) }))
  }, [members, selfMember])

  const BORDER = '1px solid hsl(var(--border) / 0.4)'

  return (
    <div className="flex h-full flex-col w-72 shrink-0 overflow-hidden"
      style={{ borderLeft: BORDER, background: 'var(--surface-header, hsl(var(--card)))' }}>

      {/* ── Family Mission ───────────────────────────────────────────── */}
      <div className="flex flex-col shrink-0" style={{ borderBottom: BORDER }}>
        <button type="button" onClick={() => setMissionsOpen(v => !v)}
          className="flex w-full shrink-0 items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
          style={{ borderBottom: missionsOpen ? BORDER : 'none' }}>
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Family Mission</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
              {completedCount} / {totalCount}
            </span>
            {missionsOpen ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
          </div>
        </button>

        {missionsOpen && (
          <>
            <div className="px-4 pt-2.5 pb-2 shrink-0">
              <div className="h-1.5 rounded-full bg-muted/60 overflow-hidden">
                <div className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${progressPct}%` }} />
              </div>
            </div>
            {/* Hard pixel cap — never taller than 268px so Waiting section is always visible */}
            <div className="overflow-y-auto" style={{ maxHeight: '268px' }}>
              <ul className="px-3 pb-3 space-y-0.5">
                {steps.map(step => <li key={step.id}><StepRow step={step} /></li>)}
              </ul>
            </div>
          </>
        )}
      </div>

      {/* ── People Waiting to Join ───────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-h-0">
        <button type="button" onClick={() => setWaitingOpen(v => !v)}
          className="flex w-full shrink-0 items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
          style={{ borderBottom: BORDER }}>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-semibold text-foreground">People Waiting to Join</span>
          </div>
          <div className="flex items-center gap-2">
            {waitingPeople.length > 0 && (
              <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-amber-500/20 px-1 text-[10px] font-semibold text-amber-400 tabular-nums">
                {waitingPeople.length}
              </span>
            )}
            {waitingOpen ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
          </div>
        </button>

        {waitingOpen && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            {waitingPeople.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center px-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 mb-2">
                  <Check className="h-5 w-5 text-emerald-400" />
                </div>
                <p className="text-xs font-medium text-foreground">Everyone's joined!</p>
                <p className="text-[11px] text-muted-foreground mt-1">All members have claimed their profiles.</p>
              </div>
            ) : (
              <ul className="px-3 py-2 space-y-0.5">
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
          </div>
        )}
      </div>
    </div>
  )
}
