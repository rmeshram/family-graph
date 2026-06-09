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
import { useRouter } from 'next/navigation'
import { Camera, Check, ChevronDown, ChevronUp, UserPlus, Target, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FamilyMember } from '@/lib/types'
import { getRelationshipBetweenPeople } from '@/lib/relationship-engine'
import type { QuickRelType } from '@/components/quick-add-member-dialog'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MissionStep {
  id: string
  label: string
  emoji: string
  done: boolean
  /** If true and not done, show a 'Don't have' skip button */
  skippable?: boolean
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
  onQuickAddMember: (relType: QuickRelType, anchorId: string) => void
  onAddStory: () => void
  onInviteMember: (member: FamilyMember) => void
  onEditSelf: () => void
  hasStories: boolean
  /** Step IDs the user has explicitly dismissed (from profiles.wizard_skipped, prefixed 'mission_') */
  wizardSkipped: string[]
  /** Called when user clicks "Don't have" on a skippable step. Should persist to DB. */
  onSkipStep: (stepId: string) => void
  /**
   * When provided AND selfMember is null (user is in the family but hasn't
   * claimed a node yet), the panel shows a "Claim your profile" card as the
   * primary action instead of the mission steps.
   */
  onClaimProfile?: () => void
  /** Override outer container className (e.g. full-width in mobile drawer) */
  className?: string
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

/**
 * isEffectivelyClaimed — true if a member has joined the family app,
 * regardless of which column was written by which code path.
 *
 * Defends against the legacy join-create inconsistency (ISSUE-03) where
 * claimed_by_user_id was set but is_claimed was left false, causing a real
 * member (e.g. "James Jackson") to appear as "People Waiting to Join".
 *
 * Checks all three signals:
 *   • is_claimed === true          (canonical state-machine flag)
 *   • claimed_by_user_id is set    (legacy join-create path)
 *   • claim_status === 'claimed'   (new claim flow)
 */
function isEffectivelyClaimed(m: FamilyMember): boolean {
  return m.isClaimed === true || !!m.claimedByUserId || m.claimStatus === 'claimed'
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

// ─── Tree Completeness ────────────────────────────────────────────────────────

interface TreeCompleteness {
  /** 0-100 percentage of members who have claimed their profile */
  score: number
  joinedCount: number
  totalCount: number
  waitingCount: number
}

/**
 * computeTreeCompleteness — measures how many living members have claimed
 * their profile (i.e. joined the app).
 *
 * Deceased members are excluded from the denominator: they are part of the
 * tree as historical records but cannot join the app, so they should not
 * make the participation score look artificially low.
 *
 * score = joinedCount / livingCount × 100
 * waitingCount = living members who are added but not yet claimed
 */
function computeTreeCompleteness(
  selfMember: FamilyMember | null,
  members: FamilyMember[],
): TreeCompleteness {
  const livingMembers = members.filter(m => m.isAlive !== false)
  const totalCount = livingMembers.length
  if (totalCount === 0) return { score: 0, joinedCount: 0, totalCount: 0, waitingCount: 0 }
  const joinedCount = livingMembers.filter(isEffectivelyClaimed).length
  const waitingCount = livingMembers.filter(
    m => !isEffectivelyClaimed(m) && m.id !== selfMember?.id,
  ).length
  const score = Math.round((joinedCount / totalCount) * 100)
  return { score, joinedCount, totalCount, waitingCount }
}

// ─── Mission steps builder ────────────────────────────────────────────────────

// Step IDs that can be dismissed with "Don't have" when the user explicitly
// confirms they don't have that relationship. Stored in profiles.wizard_skipped.
const SKIPPABLE_STEP_IDS = new Set([
  'add_sibling', 'add_spouse', 'add_child', 'add_paternal_gf', 'add_paternal_gm',
])

function buildMissionSteps(
  selfMember: FamilyMember | null,
  members: FamilyMember[],
  hasStories: boolean,
  hasOtherClaims: boolean,
  wizardSkipped: string[],
  onQuickAddMember: (relType: QuickRelType, anchorId: string) => void,
  onAddStory: () => void,
): MissionStep[] {
  if (!selfMember) return []

  const skipped = new Set(wizardSkipped)
  const byId = new Map(members.map(m => [m.id, m]))

  // parentIds may be empty if members were added with `relationship` field only
  // (no bidirectional parent_ids link written). Fall back to relationship-field lookup
  // so the mission reflects the real tree state.
  const parents = selfMember.parentIds.map(pid => byId.get(pid)).filter(Boolean) as FamilyMember[]
  let father = parents.find(p => p.gender === 'male')
    ?? members.find(m => m.id !== selfMember.id && m.gender === 'male' && (m.relationship === 'father' || m.relationship === 'dad'))
  let mother = parents.find(p => p.gender === 'female')
    ?? members.find(m => m.id !== selfMember.id && m.gender === 'female' && (m.relationship === 'mother' || m.relationship === 'mom'))
  // If still not found by relationship label, check if any member lists selfMember as a child
  if (!father) father = members.find(m => m.gender === 'male' && (m.parentIds ?? []).length === 0 && members.some(c => c.id === selfMember.id && c.parentIds.includes(m.id)))
  if (!mother) mother = members.find(m => m.gender === 'female' && (m.parentIds ?? []).length === 0 && members.some(c => c.id === selfMember.id && c.parentIds.includes(m.id)))

  // Merge parentIds from DB + inferred parent IDs for grandparent lookups
  const effectiveParentIds = [
    ...selfMember.parentIds,
    ...(father && !selfMember.parentIds.includes(father.id) ? [father.id] : []),
    ...(mother && !selfMember.parentIds.includes(mother.id) ? [mother.id] : []),
  ]

  const hasSpouse = (selfMember.spouseIds ?? []).some(sid => byId.has(sid))
    || members.some(m => m.id !== selfMember.id && (m.relationship === 'spouse' || m.relationship === 'wife' || m.relationship === 'husband' || m.relationship === 'partner'))
  const hasChild = members.some(m => m.parentIds.includes(selfMember.id))
    || members.some(m => m.relationship === 'son' || m.relationship === 'daughter' || m.relationship === 'child')
  const hasSibling = members.some(
    m => m.id !== selfMember.id && m.parentIds.length > 0 && m.parentIds.some(pid => effectiveParentIds.includes(pid))
  ) || members.some(m => m.id !== selfMember.id && (m.relationship === 'brother' || m.relationship === 'sister' || m.relationship === 'sibling'))

  const fatherParents = father ? father.parentIds.map(pid => byId.get(pid)).filter(Boolean) as FamilyMember[] : []
  const hasPatGrandFather = fatherParents.some(p => p.gender === 'male')
    || members.some(m => m.gender === 'male' && (m.relationship === 'paternal-grandfather' || m.relationship === 'grandfather'))
  const hasPatGrandMother = fatherParents.some(p => p.gender === 'female')
    || members.some(m => m.gender === 'female' && (m.relationship === 'paternal-grandmother' || m.relationship === 'grandmother'))

  // A step is "done" if the data is present OR the user explicitly said they don't have it.
  const done = (id: string, dataPresent: boolean) => dataPresent || skipped.has(`mission_${id}`)

  return [
    { id: 'add_self', label: 'Add yourself', emoji: '\u{1F464}', done: true },
    { id: 'add_father', label: 'Add father', emoji: '\u{1F468}', done: !!father, cta: 'Add', onAction: () => onQuickAddMember('father', selfMember.id) },
    { id: 'add_mother', label: 'Add mother', emoji: '\u{1F469}', done: !!mother, cta: 'Add', onAction: () => onQuickAddMember('mother', selfMember.id) },
    { id: 'add_sibling', label: 'Add a sibling', emoji: '\u{1F46B}', done: done('add_sibling', hasSibling), skippable: !hasSibling, cta: 'Add', onAction: () => onQuickAddMember('sibling', selfMember.id) },
    { id: 'add_spouse', label: 'Add spouse / partner', emoji: '\u{1F48D}', done: done('add_spouse', hasSpouse), skippable: !hasSpouse, cta: 'Add', onAction: () => onQuickAddMember('spouse', selfMember.id) },
    { id: 'add_child', label: 'Add a child', emoji: '\u{1F476}', done: done('add_child', hasChild), skippable: !hasChild, cta: 'Add', onAction: () => onQuickAddMember('child', selfMember.id) },
    { id: 'add_paternal_gf', label: "Father's father", emoji: '\u{1F474}', done: done('add_paternal_gf', hasPatGrandFather), skippable: !hasPatGrandFather, cta: 'Add', onAction: father ? () => onQuickAddMember('father', father.id) : () => onQuickAddMember('father', selfMember.id) },
    { id: 'add_paternal_gm', label: "Father's mother", emoji: '\u{1F475}', done: done('add_paternal_gm', hasPatGrandMother), skippable: !hasPatGrandMother, cta: 'Add', onAction: father ? () => onQuickAddMember('mother', father.id) : () => onQuickAddMember('mother', selfMember.id) },
    // { id: 'add_story', label: 'Add a memory or story', emoji: '\u{1F4D6}', done: hasStories, cta: 'Add', onAction: onAddStory },
    { id: 'family_claimed', label: 'Another member joined', emoji: '\u{1F389}', done: hasOtherClaims },
  ]
}

// ─── Main component ───────────────────────────────────────────────────────────

export function FamilyMissionPanel({
  selfMember,
  members,
  isAdmin: _isAdmin,
  familyId: _familyId,
  onAddMember: _onAddMember,
  onQuickAddMember,
  onAddStory,
  onInviteMember,
  onEditSelf,
  hasStories,
  wizardSkipped,
  onSkipStep,
  onClaimProfile,
  className,
}: FamilyMissionPanelProps) {
  const router = useRouter()
  const [missionsOpen, setMissionsOpen] = useState(true)
  const [waitingOpen, setWaitingOpen] = useState(true)

  const hasOtherClaims = members.some(
    m => isEffectivelyClaimed(m) && !!m.claimedByUserId && m.claimedByUserId !== selfMember?.id
  )

  const steps = useMemo(
    () => buildMissionSteps(selfMember, members, hasStories, hasOtherClaims, wizardSkipped, onQuickAddMember, onAddStory),
    [selfMember, members, hasStories, hasOtherClaims, wizardSkipped, onQuickAddMember, onAddStory]
  )

  const completedCount = steps.filter(s => s.done).length
  const totalCount = steps.length
  const progressPct = Math.round((completedCount / totalCount) * 100)

  const completeness = useMemo(
    () => computeTreeCompleteness(selfMember, members),
    [selfMember, members],
  )

  const waitingPeople = useMemo<WaitingPerson[]>(() => {
    return members
      // Exclude deceased — they cannot join the app; invite buttons on
      // deceased members are confusing and technically meaningless.
      .filter(m => !isEffectivelyClaimed(m) && m.id !== selfMember?.id && m.isAlive !== false)
      .slice(0, 8)
      .map(m => ({
        member: m,
        // If selfMember is unknown (unlinked), fall back to the stored relationship
        // field which is relative to the tree creator — imprecise but better than blank.
        relationship: selfMember
          ? inferRelLabel(m, selfMember, members)
          : (m.relationship ? String(m.relationship).replace(/-/g, ' ') : 'Family member'),
      }))
  }, [members, selfMember])

  const missingProfileFields = selfMember ? [
    !selfMember.photoUrl && 'photo',
    !selfMember.birthYear && 'birth year',
    !selfMember.occupation && 'occupation',
  ].filter(Boolean) as string[] : []
  const profileComplete = missingProfileFields.length === 0

  const allMissionsDone = completedCount === totalCount
  const pendingSteps = steps.filter(s => !s.done)

  return (
    <div className={cn("flex h-full flex-col border-l border-border/40 shrink-0 overflow-hidden", className ?? "w-64 lg:w-72")}
      style={{ background: 'var(--surface-header, hsl(var(--card)))' }}>

      {/* ── Complete Your Profile ── */}
      {!profileComplete && selfMember && (
        <div className="shrink-0 mx-3 mt-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2.5">
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
              <p className="text-[12px] font-semibold text-foreground">Complete your profile</p>
              <p className="text-[10px] text-amber-400/80 mt-0.5">Add {missingProfileFields.join(', ')}</p>
            </div>
            <button type="button" onClick={onEditSelf}
              className="shrink-0 rounded-lg border border-amber-500/40 bg-amber-500/15 px-2 py-1 text-[10px] font-semibold text-amber-300 hover:bg-amber-500/25 transition-colors">
              Edit →
            </button>
          </div>
        </div>
      )}

      {/* ── Claim Your Profile ── */}
      {!selfMember && onClaimProfile && (
        <div className="shrink-0 mx-3 mt-3 rounded-xl border border-blue-500/30 bg-blue-500/[0.06] px-3 py-2.5">
          <p className="text-[12px] font-semibold text-foreground mb-1">Find your place in your family</p>
          <p className="text-[10px] text-muted-foreground mb-2">Claim your profile first. Then add your close family. Community links unlock after your family base is complete.</p>
          <button type="button" onClick={onClaimProfile}
            className="w-full rounded-lg border border-blue-500/40 bg-blue-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-blue-300 hover:bg-blue-500/25 transition-colors">
            Claim my spot →
          </button>
        </div>
      )}

      {/* ── Family Mission — collapses to a single line when complete ── */}
      <div className={cn("border-b border-border/40", !profileComplete && selfMember ? "mt-2" : "mt-3")}>
        {allMissionsDone ? (
          /* All done: slim celebration bar, no list */
          <div className="flex items-center gap-2 px-4 py-2.5">
            <span className="text-sm">🌳</span>
            <span className="text-[11px] font-medium text-emerald-400">Family foundation complete</span>
            <span className="ml-auto text-[10px] text-muted-foreground/60">{completedCount}/{totalCount}</span>
          </div>
        ) : (
          <>
            <button type="button" onClick={() => setMissionsOpen(v => !v)}
              className="flex w-full items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-2">
                <Target className="h-3.5 w-3.5 text-primary" />
                <span className="text-[12px] font-semibold text-foreground">Build your branch</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] tabular-nums text-muted-foreground">{completedCount}/{totalCount}</span>
                {missionsOpen ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
              </div>
            </button>

            {missionsOpen && (
              <>
                <div className="px-4 pb-2">
                  <div className="h-1 rounded-full bg-muted/50 overflow-hidden">
                    <div className="h-full rounded-full bg-primary transition-all duration-500"
                      style={{ width: `${progressPct}%` }} />
                  </div>
                </div>
                <ul className="px-3 pb-2.5 space-y-0">
                  {/* Show only pending steps — done items are hidden to reduce noise */}
                  {pendingSteps.map(step => (
                    <li key={step.id}>
                      <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/30 transition-colors">
                        <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border/50 bg-muted/30" />
                        <span className="flex-1 text-[12px] leading-tight text-foreground truncate">
                          <span className="mr-1">{step.emoji}</span>{step.label}
                        </span>
                        {step.cta && step.onAction && (
                          <button type="button" onClick={step.onAction}
                            className="shrink-0 rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/20 transition-colors">
                            {step.cta}
                          </button>
                        )}
                        {step.skippable && SKIPPABLE_STEP_IDS.has(step.id) && (
                          <button type="button" title="Doesn't apply to me" onClick={() => onSkipStep(step.id)}
                            className="shrink-0 text-[9px] text-muted-foreground/50 hover:text-rose-400 transition-colors px-1">
                            N/A
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                  {/* Completed count hint */}
                  {completedCount > 0 && (
                    <li className="px-2 pt-1">
                      <p className="text-[10px] text-muted-foreground/50">{completedCount} step{completedCount !== 1 ? 's' : ''} done</p>
                    </li>
                  )}
                  <li className="px-2 pt-0.5">
                    <p className="text-[10px] text-muted-foreground/55">Goal: complete your family branch first. Then connect with other branches.</p>
                  </li>
                </ul>
              </>
            )}
          </>
        )}
      </div>

      {/* ── Grow Your Tree — invite section with participation score ── */}
      <div className="flex flex-col flex-1 min-h-0">
        {/* Header with score baked in */}
        <div className="shrink-0 px-4 py-2.5 border-b border-border/40">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12px] font-semibold text-foreground">Grow your family</p>
            {completeness.totalCount > 1 && (
              <div className="flex items-center gap-1.5">
                <div className="h-1 w-14 rounded-full bg-muted/50 overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-500 transition-all duration-700"
                    style={{ width: `${completeness.score}%` }} />
                </div>
                <span className="text-[11px] font-bold tabular-nums"
                  style={{ color: completeness.score >= 80 ? '#10b981' : completeness.score >= 40 ? '#f59e0b' : 'var(--muted-foreground)' }}>
                  {completeness.score}%
                </span>
              </div>
            )}
          </div>
          {waitingPeople.length > 0 ? (
              <p className="text-[10px] text-muted-foreground mt-0.5">
              {waitingPeople.length} {waitingPeople.length === 1 ? "person hasn't" : "people haven't"} joined yet
            </p>
          ) : completeness.totalCount > 1 ? (
            <p className="text-[10px] text-emerald-400/80 mt-0.5">Everyone's in! 🎉</p>
          ) : null}
          <p className="text-[10px] text-muted-foreground/60 mt-1">Each accepted invite strengthens your family graph. Community discovery unlocks after your family base is strong.</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {waitingPeople.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center px-5">
              <p className="text-2xl mb-2">🎉</p>
              <p className="text-[13px] font-semibold text-foreground">All members joined!</p>
              <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                Add more family members to keep growing the tree.
              </p>
            </div>
          ) : (
            <ul className="px-3 py-2 space-y-0.5">
              {waitingPeople.map(({ member, relationship }) => {
                const inviteSent = member.claimStatus === 'invite_sent'
                return (
                  <li key={member.id}
                    className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-muted/25 transition-colors group"
                  >
                    <div className="relative shrink-0">
                      <Avatar className="h-8 w-8">
                        {member.photoUrl && <AvatarImage src={member.photoUrl} alt={member.name} />}
                        <AvatarFallback className="text-[10px] font-bold text-white"
                          style={{ background: genderColor(member.gender) }}>
                          {getInitials(member.name)}
                        </AvatarFallback>
                      </Avatar>
                      {inviteSent && (
                        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-sky-400 border-2"
                          style={{ borderColor: 'var(--background)' }} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-foreground truncate leading-tight">{member.name}</p>
                      <p className="text-[10px] text-muted-foreground/70 truncate">{relationship}</p>
                    </div>
                    <Button size="sm" onClick={() => onInviteMember(member)}
                      className={cn(
                        "h-6 shrink-0 rounded-lg px-2.5 text-[10px] font-semibold border-0 opacity-80 group-hover:opacity-100 transition-opacity",
                        inviteSent
                          ? "bg-muted text-muted-foreground hover:bg-sky-600/80 hover:text-white"
                          : "bg-primary/90 hover:bg-primary text-primary-foreground"
                      )}>
                      {inviteSent ? 'Resend' : 'Invite'}
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}

          {waitingPeople.length > 0 && (
            <div className="px-3 pb-3">
              <button type="button" onClick={() => router.push('/invite')}
                className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-border/30 py-1.5 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:border-border/60 transition-colors">
                <UserPlus className="h-3 w-3" />
                Manage all invites
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
