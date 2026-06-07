'use client'

import { useMemo, useState, useEffect } from 'react'
import { FamilyMember } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Check, X, TreePine, ChevronDown, ChevronUp } from 'lucide-react'

/**
 * isEffectivelyClaimed — true when a member has joined the app, regardless of
 * which column was set. Guards against the legacy join-create inconsistency
 * (ISSUE-03) that set claimed_by_user_id without setting is_claimed=true,
 * causing real members to appear as "invite pending" in the wizard.
 */
function isEffectivelyClaimed(m: FamilyMember | null | undefined): boolean {
  if (!m) return false
  return m.isClaimed === true || !!m.claimedByUserId || m.claimStatus === 'claimed'
}

export interface OnboardingChecklistProps {
  selfMember: FamilyMember | null
  members: FamilyMember[]
  /** True when at least one story has been added to any member */
  hasStories: boolean
  /** True when any member other than self is claimed by a different user */
  hasOtherClaims: boolean
  onAddMember: () => void
  onInvite: () => void
  /** Called when a specific unclaimed member should be invited — opens the invite dialog for them */
  onInviteMember?: (member: FamilyMember) => void
  onAddStory: () => void
  /** Optional — stored in localStorage to persist dismiss state */
  userId?: string
}

interface Step {
  id: string
  label: string
  detail: string
  emoji: string
  done: boolean
  cta?: string
  onCta?: () => void
}

export function OnboardingChecklist({
  selfMember,
  members,
  hasStories,
  hasOtherClaims,
  onAddMember,
  onInvite,
  onInviteMember,
  onAddStory,
  userId,
}: OnboardingChecklistProps) {
  const [dismissed, setDismissed] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  // Persist dismiss state in sessionStorage — survives page refresh within a session
  // but reappears on the next visit so users always have a path forward.
  const storageKey = userId ? `fg_checklist_dismissed_${userId}` : null

  useEffect(() => {
    if (!storageKey) return
    try {
      const val = sessionStorage.getItem(storageKey)
      if (val === '1') setDismissed(true)
    } catch { /* sessionStorage may be unavailable */ }
  }, [storageKey])

  const handleDismiss = () => {
    setDismissed(true)
    if (storageKey) {
      try { sessionStorage.setItem(storageKey, '1') } catch { /* ignore */ }
    }
  }

  const selfParentIds = selfMember?.parentIds ?? []
  const selfSpouseIds = selfMember?.spouseIds ?? []

  const hasParent = useMemo(() =>
    selfParentIds.some(pid => members.some(m => m.id === pid)) ||
    members.some(m => (m.relationship === 'father' || m.relationship === 'mother') &&
      (m.spouseIds?.some(s => selfSpouseIds.includes(s)) || false)),
    [members, selfParentIds, selfSpouseIds]
  )

  const hasChildOrSpouse = useMemo(() => {
    if (selfSpouseIds.length > 0) return true
    return members.some(m => m.parentIds?.includes(selfMember?.id ?? ''))
  }, [members, selfMember, selfSpouseIds])

  const hasSibling = useMemo(() =>
    selfParentIds.length > 0 &&
    members.some(m => m.id !== selfMember?.id && m.parentIds?.some(pid => selfParentIds.includes(pid))),
    [members, selfMember, selfParentIds]
  )

  // Resolve specific family members so step labels can use real names.
  // Detection uses three layers (mirrors FamilyMissionPanel logic):
  //   1. Structural: selfMember.parentIds → look up member by id
  //   2. Relationship field: any member with relationship === 'father'/'dad' etc.
  // Both layers are needed because parentIds may be empty when a parent was
  // added with only the relationship field set (pre-bidirectional-link writes).
  const father = useMemo(() => {
    // Layer 1 — structural parentIds
    const byParentId = selfParentIds.length > 0
      ? (members.find(m => selfParentIds.includes(m.id) && m.gender === 'male')
        ?? members.find(m => selfParentIds.includes(m.id)))
      : undefined
    if (byParentId) return byParentId
    // Layer 2 — relationship field fallback
    return members.find(
      m => m.id !== selfMember?.id && m.gender === 'male' &&
        (m.relationship === 'father' || m.relationship === 'dad'),
    ) ?? undefined
  }, [members, selfMember, selfParentIds])

  const mother = useMemo(() => {
    // Layer 1 — structural parentIds
    const byParentId = selfParentIds.length > 0
      ? members.find(m => selfParentIds.includes(m.id) && m.gender === 'female')
      : undefined
    if (byParentId) return byParentId
    // Layer 2 — relationship field fallback
    return members.find(
      m => m.id !== selfMember?.id && m.gender === 'female' &&
        (m.relationship === 'mother' || m.relationship === 'mom'),
    ) ?? undefined
  }, [members, selfMember, selfParentIds])
  const paternalGf = useMemo(() => {
    if (!father) return null
    const fps = father.parentIds ?? []
    return members.find(m => fps.includes(m.id) && m.gender === 'male') ?? null
  }, [father, members])
  const paternalGm = useMemo(() => {
    if (!father) return null
    const fps = father.parentIds ?? []
    return members.find(m => fps.includes(m.id) && m.gender === 'female') ?? null
  }, [father, members])
  const firstUnclaimedSibling = useMemo(() =>
    members.find(m =>
      !isEffectivelyClaimed(m) && m.id !== selfMember?.id &&
      m.id !== father?.id && m.id !== mother?.id &&
      selfParentIds.length > 0 && m.parentIds?.some(pid => selfParentIds.includes(pid))
    ) ?? null,
    [members, selfMember, father, mother, selfParentIds]
  )

  const steps: Step[] = [
    {
      id: 'created',
      label: "You're added",
      detail: 'Profile created',
      emoji: '🌱',
      done: !!selfMember,
    },
    {
      id: 'father',
      label: 'Add your father',
      detail: 'Paternal ancestry',
      emoji: '👨',
      done: !!father,
      cta: 'Add',
      onCta: onAddMember,
    },
    {
      id: 'mother',
      label: 'Add your mother',
      detail: 'Maternal ancestry',
      emoji: '👩',
      done: !!mother,
      cta: 'Add',
      onCta: onAddMember,
    },
    ...(father ? [{
      id: 'paternal_gf',
      label: `Add ${father.name.split(' ')[0]}'s father`,
      detail: 'Your paternal grandfather',
      emoji: '👴',
      done: !!paternalGf,
      cta: 'Add',
      onCta: onAddMember,
    }] : []),
    ...(father ? [{
      id: 'paternal_gm',
      label: `Add ${father.name.split(' ')[0]}'s mother`,
      detail: 'Your paternal grandmother',
      emoji: '👵',
      done: !!paternalGm,
      cta: 'Add',
      onCta: onAddMember,
    }] : []),
    {
      id: 'sibling',
      label: 'Add a sibling or spouse',
      detail: 'Immediate family',
      emoji: '👫',
      done: hasChildOrSpouse || hasSibling,
      cta: 'Add',
      onCta: onAddMember,
    },
    ...(father ? [{
      id: 'invite_father',
      label: `Invite ${father.name.split(' ')[0]} to join`,
      detail: 'They can edit their profile & add relatives',
      emoji: '💌',
      done: isEffectivelyClaimed(father),
      cta: 'Invite',
      onCta: onInviteMember ? () => onInviteMember(father!) : onInvite,
    }] : []),
    ...(mother ? [{
      id: 'invite_mother',
      label: `Invite ${mother.name.split(' ')[0]} to join`,
      detail: 'They can edit their profile & add relatives',
      emoji: '💌',
      done: isEffectivelyClaimed(mother),
      cta: 'Invite',
      onCta: onInviteMember ? () => onInviteMember(mother!) : onInvite,
    }] : []),
    ...(firstUnclaimedSibling ? [{
      id: 'invite_sibling',
      label: `Invite ${firstUnclaimedSibling.name.split(' ')[0]} to join`,
      detail: 'The tree grows when they add their branch',
      emoji: '📨',
      done: false,
      cta: 'Invite',
      onCta: onInviteMember ? () => onInviteMember(firstUnclaimedSibling) : onInvite,
    }] : []),
    {
      id: 'story',
      label: 'Add a memory',
      detail: 'Story, photo or voice',
      emoji: '📸',
      done: hasStories,
      cta: 'Add memory',
      onCta: onAddStory,
    },
  ]

  const completedCount = steps.filter(s => s.done).length
  const allDone = completedCount === steps.length
  const progressPct = (completedCount / steps.length) * 100

  // Hide when all steps complete or manually dismissed
  if (dismissed || allDone) return null

  // Find the first incomplete step (for the CTA)
  const nextStep = steps.find(s => !s.done)

  return (
    <div
      className={cn(
        'fixed z-40 bottom-4 right-4 w-72 rounded-2xl border border-border bg-card shadow-xl shadow-black/20 transition-all duration-200',
        // On mobile, show at bottom with full width
        'max-sm:left-4 max-sm:right-4 max-sm:w-auto max-sm:bottom-3',
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/60">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 shrink-0">
          <TreePine className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground">Complete your tree</p>
          {/* Progress bar */}
          <div className="mt-1 h-1 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
        <span className="shrink-0 text-xs font-bold text-primary tabular-nums">{completedCount}/{steps.length}</span>
        <button
          onClick={() => setCollapsed(v => !v)}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors ml-0.5"
          aria-label={collapsed ? 'Expand checklist' : 'Collapse checklist'}
        >
          {collapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={handleDismiss}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Dismiss checklist"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Steps */}
      {!collapsed && (
        <div className="px-3 py-2 space-y-0.5">
          {steps.map((step) => (
            <div
              key={step.id}
              className={cn(
                'flex items-center gap-3 rounded-xl px-2 py-2 transition-colors',
                step.done ? 'opacity-50' : 'hover:bg-muted/40',
              )}
            >
              {/* Status indicator */}
              <div className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold',
                step.done
                  ? 'border-green-500/40 bg-green-500/15 text-green-400'
                  : 'border-border bg-muted/40 text-muted-foreground',
              )}>
                {step.done ? <Check className="h-3 w-3" /> : <span>{step.emoji}</span>}
              </div>

              <div className="flex-1 min-w-0">
                <p className={cn('text-xs font-medium leading-tight', step.done ? 'line-through text-muted-foreground' : 'text-foreground')}>
                  {step.label}
                </p>
                <p className="text-[10px] text-muted-foreground/70">{step.detail}</p>
              </div>

              {!step.done && step.cta && step.onCta && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[10px] font-semibold shrink-0 border-primary/30 text-primary hover:bg-primary/10"
                  onClick={step.onCta}
                >
                  {step.cta}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Quick CTA footer when collapsed — shows next action */}
      {collapsed && nextStep && nextStep.onCta && (
        <div className="px-3 py-2">
          <Button
            size="sm"
            className="w-full h-8 text-xs gap-1.5"
            onClick={nextStep.onCta}
          >
            <span>{nextStep.emoji}</span>
            {nextStep.cta}
          </Button>
        </div>
      )}
    </div>
  )
}
