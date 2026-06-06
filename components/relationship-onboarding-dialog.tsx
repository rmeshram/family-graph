'use client'

/**
 * RelationshipOnboardingDialog
 *
 * Shown to new users who joined via a general invite and haven't claimed a node yet.
 * Instead of asking "what is your name?", we ask "who do you know in the family?"
 * and derive all other relationships from that one anchor.
 *
 * Flow:
 *  Step 1 — "Who do you know?" — search + pick a reference person
 *  Step 2 — "How are you related?" — pick relationship type
 *  Step 3 — "Is one of these you?" — graph-derived candidates + claim or create
 */

import { useState, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { FamilyMember } from '@/lib/types'
import { Search, ChevronLeft, ChevronRight, UserCheck, UserPlus } from 'lucide-react'

// ─── Relationship options ──────────────────────────────────────────────────────

const REL_OPTIONS = [
  { value: 'child', label: 'Son / Daughter', desc: 'I am their child' },
  { value: 'parent', label: 'Father / Mother', desc: 'I am their parent' },
  { value: 'sibling', label: 'Brother / Sister', desc: 'I am their sibling' },
  { value: 'spouse', label: 'Husband / Wife', desc: 'I am their spouse / partner' },
  { value: 'grandchild', label: 'Grandchild', desc: 'I am their grandchild' },
  { value: 'grandparent', label: 'Grandparent', desc: 'I am their grandparent' },
  { value: 'aunt_uncle', label: 'Aunt / Uncle', desc: "Parent's sibling" },
  { value: 'nephew_niece', label: 'Nephew / Niece', desc: "Sibling's child" },
  { value: 'cousin', label: 'Cousin', desc: "Parent's sibling's child" },
] as const

export type RelOnboardingType = (typeof REL_OPTIONS)[number]['value']

// ─── Graph candidate finder ────────────────────────────────────────────────────

function findCandidates(
  members: FamilyMember[],
  refId: string,
  rel: RelOnboardingType
): FamilyMember[] {
  const ref = members.find(m => m.id === refId)
  if (!ref) return []
  const parentIds = (ref.parentIds as string[]) ?? []
  const spouseIds = (ref.spouseIds as string[]) ?? []

  switch (rel) {
    case 'parent':
      return members.filter(m => parentIds.includes(m.id))

    case 'child':
      return members.filter(m => (m.parentIds as string[]).includes(refId))

    case 'sibling':
      return members.filter(
        m => m.id !== refId &&
          (m.parentIds as string[]).some(pid => parentIds.includes(pid))
      )

    case 'spouse':
      return members.filter(m => spouseIds.includes(m.id))

    case 'grandparent': {
      const parents = members.filter(m => parentIds.includes(m.id))
      const gpIds = new Set(parents.flatMap(p => (p.parentIds as string[]) ?? []))
      return members.filter(m => gpIds.has(m.id))
    }

    case 'grandchild': {
      const children = members.filter(m => (m.parentIds as string[]).includes(refId))
      const gcIds = new Set(
        children.flatMap(c =>
          members.filter(gc => (gc.parentIds as string[]).includes(c.id)).map(gc => gc.id)
        )
      )
      return members.filter(m => gcIds.has(m.id))
    }

    case 'aunt_uncle': {
      const parents = members.filter(m => parentIds.includes(m.id))
      const auIds = new Set<string>()
      parents.forEach(p => {
        const pParents = (p.parentIds as string[]) ?? []
        members
          .filter(m => m.id !== p.id && (m.parentIds as string[]).some(pid => pParents.includes(pid)))
          .forEach(m => auIds.add(m.id))
      })
      return members.filter(m => auIds.has(m.id))
    }

    case 'nephew_niece': {
      const siblings = members.filter(
        m => m.id !== refId && (m.parentIds as string[]).some(pid => parentIds.includes(pid))
      )
      const nnIds = new Set(
        siblings.flatMap(s =>
          members.filter(c => (c.parentIds as string[]).includes(s.id)).map(c => c.id)
        )
      )
      return members.filter(m => nnIds.has(m.id))
    }

    case 'cousin': {
      const parents = members.filter(m => parentIds.includes(m.id))
      const auntsUncles = parents.flatMap(p => {
        const pParents = (p.parentIds as string[]) ?? []
        return members.filter(m => m.id !== p.id && (m.parentIds as string[]).some(pid => pParents.includes(pid)))
      })
      const coIds = new Set(
        auntsUncles.flatMap(au =>
          members.filter(c => (c.parentIds as string[]).includes(au.id)).map(c => c.id)
        )
      )
      return members.filter(m => coIds.has(m.id))
    }

    default:
      return []
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface RelationshipOnboardingDialogProps {
  open: boolean
  onClose: () => void
  members: FamilyMember[]
  /** Claim an existing node as self. Should throw on failure. */
  onClaim: (nodeId: string) => Promise<void>
  /**
   * No matching node found — open the AddMember dialog pre-seeded with the
   * reference person + relationship so the user can add themselves.
   */
  onCreateNew: (referenceId: string, relType: RelOnboardingType) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

type Step = 'search' | 'relationship' | 'candidates'

export function RelationshipOnboardingDialog({
  open,
  onClose,
  members,
  onClaim,
  onCreateNew,
}: RelationshipOnboardingDialogProps) {
  const [step, setStep] = useState<Step>('search')
  const [query, setQuery] = useState('')
  const [referenceId, setReferenceId] = useState<string | null>(null)
  const [relType, setRelType] = useState<RelOnboardingType | null>(null)
  const [claiming, setClaiming] = useState<string | null>(null)
  const [claimError, setClaimError] = useState<string | null>(null)

  const refMember = members.find(m => m.id === referenceId)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const pool = q
      ? members.filter(m => !m.showAsAnonymous && m.name.toLowerCase().includes(q))
      : members.filter(m => !m.showAsAnonymous)
    return pool.slice(0, 20)
  }, [members, query])

  const candidates = useMemo(() => {
    if (!referenceId || !relType) return []
    return findCandidates(members, referenceId, relType)
  }, [members, referenceId, relType])

  const handleBack = () => {
    setClaimError(null)
    if (step === 'relationship') { setStep('search'); setRelType(null) }
    else if (step === 'candidates') { setStep('relationship'); setRelType(null) }
  }

  const handleClaim = async (nodeId: string) => {
    setClaimError(null)
    setClaiming(nodeId)
    try {
      await onClaim(nodeId)
      handleReset()
      onClose()
    } catch (err: unknown) {
      setClaimError(err instanceof Error ? err.message : 'Could not claim this profile. Please try again.')
    } finally {
      setClaiming(null)
    }
  }

  const handleReset = () => {
    setStep('search')
    setQuery('')
    setReferenceId(null)
    setRelType(null)
    setClaiming(null)
    setClaimError(null)
  }

  const handleOpenChange = (v: boolean) => {
    if (!v) { handleReset(); onClose() }
  }

  const relLabel = REL_OPTIONS.find(o => o.value === relType)?.label.toLowerCase()

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md gap-0 p-0 overflow-hidden">

        {/* ── Header ───────────────────────────────────────────────── */}
        <DialogHeader className="px-5 pt-5 pb-4 border-b border-border/30">
          <div className="flex items-start gap-2">
            {step !== 'search' && (
              <button
                onClick={handleBack}
                className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <div>
              <DialogTitle className="text-base font-semibold leading-snug">
                {step === 'search' && 'Find your place in the family tree'}
                {step === 'relationship' && `How are you related to ${refMember?.name.split(' ')[0]}?`}
                {step === 'candidates' && (candidates.length > 0 ? 'Is one of these you?' : 'You\'re not in the tree yet')}
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {step === 'search' && 'Search for someone already in this family — we\'ll use them as a reference to locate your node.'}
                {step === 'relationship' && 'Select the relationship that best describes you.'}
                {step === 'candidates' && candidates.length > 0
                  ? `Found ${candidates.length} possible match${candidates.length > 1 ? 'es' : ''} as ${refMember?.name.split(' ')[0]}'s ${relLabel}.`
                  : step === 'candidates'
                    ? `No existing node found for ${refMember?.name.split(' ')[0]}'s ${relLabel}. You can add yourself.`
                    : ''}
              </p>
            </div>
          </div>
        </DialogHeader>

        {/* ── Step 1: Search for reference person ──────────────────── */}
        {step === 'search' && (
          <div className="p-4 space-y-3">
            {/* Step indicator */}
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60 font-medium tracking-wide uppercase">
              <span className="flex items-center justify-center h-4 w-4 rounded-full bg-primary/20 text-primary text-[10px] font-bold">1</span>
              <span>Step 1 of 3 — Pick someone you know</span>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                autoFocus
                placeholder="Search by name…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="pl-8 h-9 text-sm"
              />
            </div>

            <div className="space-y-0.5 max-h-64 overflow-y-auto -mx-1 px-1">
              {filtered.map(m => (
                <button
                  key={m.id}
                  onClick={() => { setReferenceId(m.id); setStep('relationship') }}
                  className={cn(
                    'flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-left',
                    'hover:bg-muted/50 active:scale-[0.99] transition-all duration-100',
                  )}
                >
                  <Avatar className="h-9 w-9 shrink-0">
                    {m.photoUrl && <AvatarImage src={m.photoUrl} alt={m.name} className="object-cover" />}
                    <AvatarFallback className="text-[10px] font-semibold bg-gradient-to-br from-indigo-600/20 to-violet-600/20 text-indigo-300">
                      {m.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-tight truncate">{m.name}</p>
                    {m.birthYear && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">b. {m.birthYear}</p>
                    )}
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                </button>
              ))}

              {filtered.length === 0 && query && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No members match "{query}"
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Step 2: Pick relationship type ───────────────────────── */}
        {step === 'relationship' && refMember && (
          <div className="p-4 space-y-3">
            {/* Step indicator */}
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60 font-medium tracking-wide uppercase">
              <span className="flex items-center justify-center h-4 w-4 rounded-full bg-primary/20 text-primary text-[10px] font-bold">2</span>
              <span>Step 2 of 3 — Select your relationship</span>
            </div>
            {/* Reference person reminder */}
            <div className="flex items-center gap-2.5 rounded-xl bg-muted/40 border border-border/30 px-3 py-2.5">
              <Avatar className="h-8 w-8 shrink-0">
                {refMember.photoUrl && <AvatarImage src={refMember.photoUrl} className="object-cover" />}
                <AvatarFallback className="text-[10px] font-semibold">
                  {refMember.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-semibold">{refMember.name}</p>
                <p className="text-[11px] text-muted-foreground">I am their…</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {REL_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => { setRelType(opt.value); setStep('candidates') }}
                  className={cn(
                    'flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-left',
                    'border-border/40 bg-muted/20',
                    'hover:border-primary/40 hover:bg-primary/5',
                    'active:scale-[0.98] transition-all duration-100',
                  )}
                >
                  <p className="text-sm font-semibold leading-tight">{opt.label}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 3: Pick candidate node ──────────────────────────── */}
        {step === 'candidates' && (
          <div className="p-4 space-y-3">
            {/* Step indicator */}
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60 font-medium tracking-wide uppercase">
              <span className="flex items-center justify-center h-4 w-4 rounded-full bg-primary/20 text-primary text-[10px] font-bold">3</span>
              <span>Step 3 of 3 — Claim your profile</span>
            </div>
            {claimError && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
                {claimError}
              </div>
            )}

            {candidates.length > 0 ? (
              <>
                <div className="space-y-2">
                  {candidates.map(m => (
                    <div
                      key={m.id}
                      className="flex items-center gap-3 rounded-xl border border-border/40 bg-muted/20 px-3 py-3"
                    >
                      <Avatar className="h-10 w-10 shrink-0">
                        {m.photoUrl && <AvatarImage src={m.photoUrl} alt={m.name} className="object-cover" />}
                        <AvatarFallback className="text-xs font-semibold bg-gradient-to-br from-amber-600/20 to-indigo-600/20 text-amber-300">
                          {m.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold leading-tight truncate">{m.name}</p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                          {m.birthYear && (
                            <span className="text-[10px] text-muted-foreground">b. {m.birthYear}</span>
                          )}
                          {m.isClaimed ? (
                            <Badge variant="outline" className="text-[9px] px-1 h-4 border-green-500/40 text-green-400 bg-green-500/5">
                              Already joined
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[9px] px-1 h-4 border-amber-500/40 text-amber-400 bg-amber-500/5">
                              Unclaimed
                            </Badge>
                          )}
                        </div>
                      </div>

                      <Button
                        size="sm"
                        variant={m.isClaimed ? 'ghost' : 'default'}
                        disabled={!!m.isClaimed || claiming === m.id}
                        onClick={() => handleClaim(m.id)}
                        className="shrink-0 h-8 px-3 text-xs gap-1.5"
                      >
                        {claiming === m.id ? (
                          <span className="h-3 w-3 rounded-full border-2 border-current/30 border-t-current animate-spin" />
                        ) : (
                          <UserCheck className="h-3.5 w-3.5" />
                        )}
                        {m.isClaimed ? 'Taken' : 'This is me'}
                      </Button>
                    </div>
                  ))}
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full h-9 gap-2 text-xs text-muted-foreground hover:text-foreground border border-border/30"
                  onClick={() => referenceId && relType && onCreateNew(referenceId, relType)}
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  None of these — add me as a new member
                </Button>
              </>
            ) : (
              /* No candidates found */
              <div className="text-center py-4 space-y-3">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  There's no existing profile for {refMember?.name.split(' ')[0]}'s {relLabel} in the tree yet.
                </p>
                <Button
                  size="sm"
                  className="gap-2"
                  onClick={() => referenceId && relType && onCreateNew(referenceId, relType)}
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Add me to the family
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── Footer: skip ─────────────────────────────────────────── */}
        <div className="px-5 py-3 border-t border-border/20 flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground/60">
            Step {step === 'search' ? 1 : step === 'relationship' ? 2 : 3} of 3
          </p>
          <button
            onClick={() => { handleReset(); onClose() }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            I'll do this later
          </button>
        </div>

      </DialogContent>
    </Dialog>
  )
}
