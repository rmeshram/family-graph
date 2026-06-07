'use client'

import { useState, useEffect } from 'react'
import { UserCheck, Lock, Globe, Users, AlertCircle, ShieldCheck, CheckCircle2, AlertTriangle, Pencil, Bell, Eye, GitBranch } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FamilyMember } from '@/lib/types'
import { cn } from '@/lib/utils'

interface ClaimNodeDialogProps {
  member: FamilyMember | null
  userId: string | null
  /** The current user's already-claimed member id (profiles.member_id). Used for one-account-one-node guard. */
  selfMemberId?: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onClaim: (memberId: string, userId: string, opts?: { submittedName?: string; submittedBirthYear?: number; skipFamilyLink?: boolean }) => Promise<void>
  onSetVisibility?: (memberId: string, visibility: 'public' | 'family' | 'private') => Promise<void>
  /** Called after a successful "Connect Families" (Option A) so the parent can
   *  refresh linked members without a full page reload. */
  onFamilyConnected?: () => void
}

const VISIBILITY_OPTIONS: {
  value: 'public' | 'family' | 'private'
  label: string
  description: string
  icon: React.ReactNode
  color: string
}[] = [
    {
      value: 'public',
      label: 'Public',
      description: 'Anyone with a link can see your profile',
      icon: <Globe className="h-4 w-4" />,
      color: 'text-green-500',
    },
    {
      value: 'family',
      label: 'Family only',
      description: 'Only family members in this tree can see you',
      icon: <Users className="h-4 w-4" />,
      color: 'text-blue-500',
    },
    {
      value: 'private',
      label: 'Private',
      description: 'Only you can see your profile',
      icon: <Lock className="h-4 w-4" />,
      color: 'text-orange-500',
    },
  ]

function confidenceTier(score: number): { label: string; className: string } {
  if (score >= 80) return { label: 'High confidence', className: 'bg-green-500/20 text-green-400 border-green-500/30' }
  if (score >= 55) return { label: 'Medium confidence', className: 'bg-amber-500/20 text-amber-400 border-amber-500/30' }
  return { label: 'Low confidence', className: 'bg-red-500/20 text-red-400 border-red-500/30' }
}

export function ClaimNodeDialog({
  member,
  userId,
  selfMemberId,
  open,
  onOpenChange,
  onClaim,
  onSetVisibility,
  onFamilyConnected,
}: ClaimNodeDialogProps) {
  const [submittedName, setSubmittedName] = useState('')
  const [submittedBirthYear, setSubmittedBirthYear] = useState('')
  const [claiming, setClaiming] = useState(false)
  const [claimingDirect, setClaimingDirect] = useState(false)
  const [visibilityLoading, setVisibilityLoading] = useState<string | null>(null)
  const [claimError, setClaimError] = useState<{
    code: string
    message?: string
    mismatchFields?: string[]
    attemptsLeft?: number
    lockedUntil?: string
    claimedNodeId?: string
    // SUGGEST_FAMILY_LINK fields
    existingNodeId?: string
    existingNodeName?: string
    existingFamilyName?: string
    targetNodeId?: string
    targetFamilyName?: string
  } | null>(null)
  const [connectingFamilies, setConnectingFamilies] = useState(false)
  const [familyLinkResult, setFamilyLinkResult] = useState<{ autoAccepted: boolean; existingFamilyName: string } | null>(null)
  const [justClaimed, setJustClaimed] = useState(false)
  const [confidenceScore, setConfidenceScore] = useState<number | null>(null)

  // Reset state when dialog opens / member changes
  useEffect(() => {
    if (open && member) {
      setSubmittedName(member.name)
      setSubmittedBirthYear(member.birthYear ? String(member.birthYear) : '')
      setClaimError(null)
      setJustClaimed(false)
      setConfidenceScore(null)
    }
  }, [open, member?.id])

  if (!member) return null

  const alreadyClaimed = !!member.isClaimed
  const claimedByMe = alreadyClaimed && member.claimedByUserId === userId
  // User already has a DIFFERENT claimed node in this family
  const alreadyLinkedElsewhere = !!(selfMemberId && selfMemberId !== member.id)

  const showVisibilityControls = (claimedByMe || justClaimed) && onSetVisibility

  const handleClaim = async () => {
    if (!userId || !submittedName.trim()) return
    setClaimError(null)
    setClaiming(true)
    try {
      await onClaim(member.id, userId, {
        submittedName: submittedName.trim(),
        submittedBirthYear: submittedBirthYear ? parseInt(submittedBirthYear, 10) : undefined,
      })
      setJustClaimed(true)
    } catch (err: any) {
      setClaimError({
        code: err.error ?? 'UNKNOWN',
        message: err.message,
        mismatchFields: err.mismatchFields,
        attemptsLeft: err.attemptsLeft,
        lockedUntil: err.lockedUntil,
        claimedNodeId: err.claimedNodeId,
        existingNodeId: err.existingNodeId,
        existingNodeName: err.existingNodeName,
        existingFamilyName: err.existingFamilyName,
        targetNodeId: err.targetNodeId,
        targetFamilyName: err.targetFamilyName,
      })
      if (err.confidenceScore != null) setConfidenceScore(err.confidenceScore)
    } finally {
      setClaiming(false)
    }
  }

  // Option B: claim directly without creating a family link.
  // Passes skipFamilyLink:true so the API bypasses the SUGGEST_FAMILY_LINK gate.
  const handleClaimDirect = async () => {
    if (!userId || !submittedName.trim()) return
    setClaimError(null)
    setClaimingDirect(true)
    try {
      await onClaim(member.id, userId, {
        submittedName: submittedName.trim(),
        submittedBirthYear: submittedBirthYear ? parseInt(submittedBirthYear, 10) : undefined,
        skipFamilyLink: true,
      })
      setJustClaimed(true)
    } catch (err: any) {
      setClaimError({
        code: err.error ?? 'UNKNOWN',
        message: err.message,
        mismatchFields: err.mismatchFields,
        attemptsLeft: err.attemptsLeft,
        lockedUntil: err.lockedUntil,
        claimedNodeId: err.claimedNodeId,
        existingNodeId: err.existingNodeId,
        existingNodeName: err.existingNodeName,
        existingFamilyName: err.existingFamilyName,
        targetNodeId: err.targetNodeId,
        targetFamilyName: err.targetFamilyName,
      })
      if (err.confidenceScore != null) setConfidenceScore(err.confidenceScore)
    } finally {
      setClaimingDirect(false)
    }
  }

  const handleConnectFamilies = async () => {
    if (!claimError?.existingNodeId || !claimError?.targetNodeId) return
    setConnectingFamilies(true)
    try {
      const res = await fetch('/api/family-links/cross-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claimNodeId: claimError.targetNodeId,
          existingNodeId: claimError.existingNodeId,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setClaimError(prev => prev ? { ...prev, message: data.message ?? 'Could not connect families. Please try again.' } : prev)
        return
      }
      setFamilyLinkResult({ autoAccepted: data.autoAccepted, existingFamilyName: claimError.existingFamilyName ?? 'your family' })
      setClaimError(null)
      // Notify parent to refresh linked members so the other family's members
      // appear in the tree immediately without a full page reload.
      onFamilyConnected?.()
    } catch {
      setClaimError(prev => prev ? { ...prev, message: 'Network error. Please try again.' } : prev)
    } finally {
      setConnectingFamilies(false)
    }
  }

  const handleVisibility = async (v: 'public' | 'family' | 'private') => {
    if (!onSetVisibility) return
    setVisibilityLoading(v)
    try {
      await onSetVisibility(member.id, v)
    } finally {
      setVisibilityLoading(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-primary" />
            {showVisibilityControls
              ? 'Your profile node'
              : alreadyClaimed
                ? 'Already claimed'
                : 'Is this you?'}
          </DialogTitle>
          <DialogDescription>
            {showVisibilityControls
              ? 'This is your node in the family tree. Manage visibility below.'
              : alreadyClaimed
                ? 'This person has already been claimed by another family member.'
                : `Verify your identity to claim "${member.name}"`}
          </DialogDescription>
        </DialogHeader>

        {/* ── Why claim? benefits block ─────────────────────── */}
        {!alreadyClaimed && !claimedByMe && !alreadyLinkedElsewhere && !member.isDeceased && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
            <p className="text-xs font-semibold text-primary/80 uppercase tracking-wide">What you get by claiming</p>
            <ul className="space-y-1.5">
              {([
                { icon: <Pencil className="h-3.5 w-3.5 text-violet-400" />, text: 'Edit your own bio, photo & details' },
                { icon: <Eye className="h-3.5 w-3.5 text-blue-400" />, text: 'Control who sees your profile (public / family / private)' },
                { icon: <GitBranch className="h-3.5 w-3.5 text-green-400" />, text: 'Add your spouse, children & relatives' },
                { icon: <Bell className="h-3.5 w-3.5 text-amber-400" />, text: 'Get notified about family updates & birthdays' },
              ] as { icon: React.ReactNode; text: string }[]).map(({ icon, text }) => (
                <li key={text} className="flex items-center gap-2 text-xs text-muted-foreground">
                  {icon}
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── One-account guard ─────────────────────────────── */}
        {!alreadyClaimed && !claimedByMe && alreadyLinkedElsewhere && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <p>You already have a claimed profile in this family. Go to Settings → Privacy to unlink it first.</p>
          </div>
        )}

        {/* ── Deceased / unauthenticated ────────────────────── */}
        {member.isDeceased && !claimedByMe && (
          <div className="flex items-start gap-2 rounded-lg border border-border/50 bg-muted/30 p-3 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <p>This profile is marked as deceased. Contact the tree owner to make changes.</p>
          </div>
        )}

        {/* ── Identity form for unclaimed node ─────────────── */}
        {!alreadyClaimed && userId && !alreadyLinkedElsewhere && !member.isDeceased && !showVisibilityControls && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="claim-name" className="text-xs">Your full name</Label>
              <Input
                id="claim-name"
                value={submittedName}
                onChange={e => setSubmittedName(e.target.value)}
                placeholder="As it appears on official documents"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="claim-year" className="text-xs">Birth year <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                id="claim-year"
                type="number"
                value={submittedBirthYear}
                onChange={e => setSubmittedBirthYear(e.target.value)}
                placeholder="e.g. 1985"
                min={1800}
                max={2100}
                className="h-9 text-sm"
              />
            </div>

            {/* Error states — hidden for SUGGEST_FAMILY_LINK which has its own card UI */}
            {claimError && claimError.code !== 'SUGGEST_FAMILY_LINK' && (
              <div className={cn(
                'flex items-start gap-2 rounded-lg border p-3 text-xs',
                claimError.code === 'IDENTITY_MISMATCH'
                  ? 'border-red-500/30 bg-red-500/10 text-red-400'
                  : claimError.code === 'LOCKED_OUT'
                    ? 'border-destructive/30 bg-destructive/10 text-destructive'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
              )}>
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  {claimError.code === 'IDENTITY_MISMATCH' && (
                    <>
                      <p className="font-medium">Identity mismatch</p>
                      {claimError.mismatchFields?.includes('name') && <p>• Name does not match the profile</p>}
                      {claimError.mismatchFields?.includes('birth_year') && <p>• Birth year does not match</p>}
                      {claimError.attemptsLeft != null && claimError.attemptsLeft > 0 && (
                        <p className="text-muted-foreground">{claimError.attemptsLeft} attempt{claimError.attemptsLeft !== 1 ? 's' : ''} remaining</p>
                      )}
                    </>
                  )}
                  {claimError.code === 'LOCKED_OUT' && (
                    <p>Too many failed attempts. Try again after {claimError.lockedUntil ? new Date(claimError.lockedUntil).toLocaleString() : 'tomorrow'}.</p>
                  )}
                  {claimError.code === 'ALREADY_CLAIMED' && <p>This profile has already been claimed.</p>}
                  {claimError.code === 'RATE_LIMITED' && <p>Too many requests — try again in an hour.</p>}
                  {claimError.code === 'ALREADY_LINKED_IN_FAMILY' && <p>You already have a claimed profile in this family. Unlink it via Settings → Privacy first.</p>}
                  {!['IDENTITY_MISMATCH', 'LOCKED_OUT', 'ALREADY_CLAIMED', 'RATE_LIMITED', 'ALREADY_LINKED_IN_FAMILY', 'SUGGEST_FAMILY_LINK'].includes(claimError.code) && (
                    <p>{claimError.message ?? 'Something went wrong. Please try again.'}</p>
                  )}
                </div>
              </div>
            )}

            {/* Connect Families card — shown when user already has a node in another family */}
            {claimError?.code === 'SUGGEST_FAMILY_LINK' && (
              <div className="space-y-3">
                {/* Option A — Connect families */}
                <div className="rounded-xl bg-indigo-500/10 border border-indigo-500/30 p-4 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/20">
                      <GitBranch className="h-4 w-4 text-indigo-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-indigo-300">Option A — Connect both family trees</p>
                        <span className="rounded-full bg-indigo-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-indigo-300 uppercase tracking-wide">Recommended</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        Your account is already linked to{' '}
                        <strong className="text-foreground">{claimError.existingNodeName}</strong>{' '}
                        in <strong className="text-foreground">{claimError.existingFamilyName}</strong>.
                        Link both families — your profile becomes the bridge between the two trees.
                      </p>
                    </div>
                  </div>
                  <ul className="space-y-1 pl-1">
                    {[
                      '🌳  Both family trees stay intact — no data is lost',
                      '🔗  Members from both families will appear linked',
                      `🪢  "${claimError.targetFamilyName}" will see your family as connected relatives`,
                    ].map(t => (
                      <li key={t} className="text-xs text-muted-foreground">{t}</li>
                    ))}
                  </ul>
                  <Button
                    size="sm"
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5"
                    onClick={handleConnectFamilies}
                    disabled={connectingFamilies}
                  >
                    {connectingFamilies
                      ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />Connecting…</>
                      : <><GitBranch className="h-3.5 w-3.5" />Connect Families</>
                    }
                  </Button>
                </div>

                {/* Divider */}
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1 bg-border/50" />
                  <span className="text-[11px] font-medium text-muted-foreground px-1">or</span>
                  <div className="h-px flex-1 bg-border/50" />
                </div>

                {/* Option B — Just claim, no family link */}
                <div className="rounded-xl border border-border/50 bg-muted/20 p-3 space-y-2.5">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Option B — Switch to this family</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      Claim this profile and move your account to <strong className="text-foreground">{claimError?.targetFamilyName ?? 'this family'}</strong>. Your <strong className="text-foreground">{claimError?.existingFamilyName ?? 'current'}</strong> profile will become unclaimed. The two trees stay separate.
                    </p>
                  </div>
                  <Button
                    onClick={handleClaimDirect}
                    disabled={claimingDirect || !submittedName.trim()}
                    variant="outline"
                    className="w-full"
                  >
                    <ShieldCheck className="h-4 w-4 mr-2" />
                    {claimingDirect ? 'Claiming…' : `Claim as ${member.name.split(' ')[0]} (no family link)`}
                  </Button>
                </div>
              </div>
            )}

            {/* Family link success */}
            {familyLinkResult && (
              <div className="flex items-start gap-2 rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-xs text-green-400">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <p>{familyLinkResult.autoAccepted
                  ? 'Both family trees are now connected!'
                  : `A connection request has been sent to ${familyLinkResult.existingFamilyName} admins. Once accepted, both trees will be linked.`
                }</p>
              </div>
            )}

            <Button
              onClick={handleClaim}
              disabled={claiming || !submittedName.trim()}
              className={cn("w-full", claimError?.code === 'SUGGEST_FAMILY_LINK' && "hidden")}
            >
              <ShieldCheck className="h-4 w-4 mr-2" />
              {claiming ? 'Verifying…' : `Claim as ${member.name.split(' ')[0]}`}
            </Button>
          </div>
        )}

        {/* ── Just claimed — success banner ─────────────────── */}
        {justClaimed && (
          <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Profile claimed!</p>
              {confidenceScore != null && (
                <Badge variant="outline" className={cn('text-[10px] px-1.5 mt-1', confidenceTier(confidenceScore).className)}>
                  {confidenceTier(confidenceScore).label} · {confidenceScore}%
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* ── Visibility controls (own node) ────────────────── */}
        {showVisibilityControls && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Who can see your profile?</p>
              {VISIBILITY_OPTIONS.map(opt => {
                const isActive = (member.visibility ?? 'family') === opt.value
                return (
                  <button
                    key={opt.value}
                    onClick={() => handleVisibility(opt.value)}
                    disabled={visibilityLoading !== null}
                    className={cn(
                      'w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors',
                      isActive
                        ? 'border-primary/60 bg-primary/10'
                        : 'border-border/50 hover:border-primary/30 hover:bg-muted/30'
                    )}
                  >
                    <span className={cn('flex-shrink-0', opt.color, isActive && 'opacity-100')}>
                      {opt.icon}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{opt.label}</span>
                        {isActive && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            current
                          </Badge>
                        )}
                        {visibilityLoading === opt.value && (
                          <span className="text-[10px] text-muted-foreground">saving…</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </>
        )}

        {!userId && (
          <p className="text-sm text-muted-foreground text-center">
            Sign in to claim your node in the family tree.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
