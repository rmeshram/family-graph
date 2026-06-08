'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { scoreCandidate, isRecommendedClaimMatch } from '@/lib/match-detection'
import { formatPhoneDisplay } from '@/lib/phone-utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Loader2, TreePine, ArrowRight, Users, UserPlus, CheckCircle2,
  AlertCircle, Phone, GitBranch,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Candidate {
  id: string
  name: string
  relationship: string | null
  generation: number | null
  birthYear: number | null
  familyId: string
  familyName: string | null
}

interface ScoredCandidate extends Candidate {
  score: number
  tier: 'high' | 'medium' | 'low'
}

type PhaseType = 'loading' | 'match' | 'no-match' | 'invite-code' | 'claiming' | 'done' | 'error'

export default function PhoneOnboardingPage() {
  return (
    <Suspense>
      <PhoneOnboardingContent />
    </Suspense>
  )
}

function PhoneOnboardingContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const phone = searchParams.get('phone') ?? ''
  const displayPhone = phone ? formatPhoneDisplay(phone) : ''

  const [phase, setPhase] = useState<PhaseType>('loading')
  const [candidates, setCandidates] = useState<ScoredCandidate[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [inviteCode, setInviteCode] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  // ── On mount: discover family matches by phone ────────────────────────────
  useEffect(() => {
    if (!phone) { setPhase('no-match'); return }

    const discover = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/auth/signin'); return }

        // Check if user already has a family (shouldn't, but be safe)
        const { data: profile } = await supabase
          .from('profiles').select('family_id').eq('id', user.id).single()
        if (profile?.family_id) { router.push('/dashboard'); return }

        const res = await fetch('/api/phone-discovery', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone }),
        })

        if (!res.ok) { setPhase('no-match'); return }

        const { candidates: raw } = await res.json() as { candidates: Candidate[] }

        if (!raw || raw.length === 0) { setPhase('no-match'); return }

        // Score each candidate using the existing match-detection engine
        const userProfile = {
          name: user.user_metadata?.full_name ?? user.phone ?? '',
          birthYear: null,
          phone,
          email: user.email ?? null,
        }

        const scored: ScoredCandidate[] = raw
          .map(n => {
            const result = scoreCandidate(
              {
                nodeId: n.id,
                nodeName: n.name,
                familyId: n.familyId,
                familyName: n.familyName ?? '',
                addedByName: null,
                relationship: n.relationship,
                birthYear: n.birthYear,
                phone,
                email: null,
              },
              userProfile,
            )
            if (!result) return null
            return {
              ...n,
              score: result.confidenceScore,
              tier: result.confidenceTier as 'high' | 'medium' | 'low',
            }
          })
          .filter(Boolean) as ScoredCandidate[]

        scored.sort((a, b) => b.score - a.score)
        setCandidates(scored)

        // Auto-select if top result is high confidence
        const top = scored[0]
        if (top && isRecommendedClaimMatch({ confidenceScore: top.score, confidenceTier: top.tier } as any)) {
          setSelectedId(top.id)
        }

        setPhase('match')
      } catch {
        setPhase('no-match')
      }
    }

    discover()
  }, [phone, supabase, router])

  // ── Claim selected node ───────────────────────────────────────────────────
  const handleClaim = async () => {
    if (!selectedId) return
    setPhase('claiming')
    setErrorMsg('')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/signin'); return }

      // Submit claim via existing claim API
      const res = await fetch(`/api/nodes/${selectedId}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submittedName: user.user_metadata?.full_name ?? '',
          submittedBirthYear: null,
        }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setErrorMsg(data.message ?? data.error ?? 'Claim failed — please try again.')
        setPhase('match')
        return
      }

      // Update profile family_id from the claimed node's family
      const candidate = candidates.find(c => c.id === selectedId)
      if (candidate) {
        await supabase.from('profiles').update({
          family_id: candidate.familyId,
          role: 'contributor',
        }).eq('id', user.id)
      }

      setPhase('done')
      setTimeout(() => {
        router.push(`/dashboard?claimed=${selectedId}`)
      }, 1800)
    } catch {
      setErrorMsg('Something went wrong. Please try again.')
      setPhase('match')
    }
  }

  // ── Join via invite code ──────────────────────────────────────────────────
  const handleInviteCode = () => {
    const code = inviteCode.trim().toUpperCase()
    if (code.length < 6) return
    router.push(`/join/${code}`)
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-12">
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5" />

      <div className="relative w-full max-w-md space-y-4">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-secondary shadow-xl shadow-primary/30 mb-4">
            <TreePine className="h-7 w-7 text-white" />
          </div>
          <p className="text-sm text-muted-foreground">Outverse</p>
        </div>

        {/* ── Loading ── */}
        {phase === 'loading' && (
          <div className="rounded-3xl border border-border/50 bg-card shadow-2xl p-10 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
            <p className="font-medium text-foreground mb-1">Looking for your family…</p>
            <p className="text-sm text-muted-foreground">Searching across family trees</p>
          </div>
        )}

        {/* ── Match found ── */}
        {phase === 'match' && (
          <div className="rounded-3xl border border-border/50 bg-card shadow-2xl overflow-hidden">
            <div className="px-6 pt-7 pb-5 border-b border-border/50 bg-gradient-to-b from-primary/5 to-transparent text-center">
              <h1 className="text-xl font-bold text-foreground mb-1">We found your family 🎉</h1>
              {displayPhone && (
                <p className="text-sm text-muted-foreground">
                  Matches for <span className="font-mono text-foreground">{displayPhone}</span>
                </p>
              )}
            </div>

            {errorMsg && (
              <div className="mx-6 mt-4 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3">
                <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <p className="text-sm text-destructive">{errorMsg}</p>
              </div>
            )}

            <div className="p-4 space-y-3">
              {candidates.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id === selectedId ? null : c.id)}
                  className={cn(
                    'w-full text-left rounded-2xl border p-4 transition-all',
                    selectedId === c.id
                      ? 'border-primary/60 bg-primary/5 ring-1 ring-primary/30'
                      : 'border-border/50 bg-muted/30 hover:border-border'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarFallback className="bg-primary/20 text-primary text-sm font-bold">
                        {c.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[c.relationship, c.familyName].filter(Boolean).join(' · ')}
                        {c.birthYear ? ` · b. ${c.birthYear}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge
                        variant="outline"
                        className={cn('text-[10px] px-1.5',
                          c.tier === 'high' ? 'border-green-500/40 bg-green-500/10 text-green-400' :
                            c.tier === 'medium' ? 'border-amber-500/40 bg-amber-500/10 text-amber-400' :
                              'border-border text-muted-foreground'
                        )}
                      >
                        {c.tier === 'high' ? '✓ Strong match' : c.tier === 'medium' ? 'Possible match' : 'Weak match'}
                      </Badge>
                      {selectedId === c.id && (
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                      )}
                    </div>
                  </div>
                </button>
              ))}

              <Button
                onClick={handleClaim}
                disabled={!selectedId}
                className="w-full h-11 font-semibold"
              >
                Claim This Profile
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>

              <button
                onClick={() => setPhase('no-match')}
                className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
              >
                None of these are me
              </button>
            </div>
          </div>
        )}

        {/* ── Claiming ── */}
        {phase === 'claiming' && (
          <div className="rounded-3xl border border-border/50 bg-card shadow-2xl p-10 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
            <p className="font-medium text-foreground">Claiming your profile…</p>
          </div>
        )}

        {/* ── Done ── */}
        {phase === 'done' && (
          <div className="rounded-3xl border border-green-500/30 bg-card shadow-2xl p-10 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-400 mx-auto mb-4" />
            <p className="text-xl font-bold text-foreground mb-1">You're in! 🎉</p>
            <p className="text-sm text-muted-foreground">Taking you to your family tree…</p>
          </div>
        )}

        {/* ── No match / Start fresh ── */}
        {phase === 'no-match' && (
          <div className="rounded-3xl border border-border/50 bg-card shadow-2xl overflow-hidden">
            <div className="px-6 pt-7 pb-5 border-b border-border/50 text-center">
              <h1 className="text-xl font-bold text-foreground mb-1">Welcome to Outverse</h1>
              <p className="text-sm text-muted-foreground">
                No existing profile found for your number. How would you like to start?
              </p>
            </div>

            <div className="p-5 space-y-3">
              {/* Create family */}
              <button
                onClick={() => router.push('/onboarding')}
                className="w-full flex items-center gap-4 rounded-2xl border border-border/50 bg-muted/30 hover:border-primary/40 hover:bg-primary/5 p-4 text-left transition-all group"
              >
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                  <TreePine className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground">Start your family tree</p>
                  <p className="text-xs text-muted-foreground">Create a new family and add members</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
              </button>

              {/* Join via invite code */}
              <button
                onClick={() => setPhase('invite-code')}
                className="w-full flex items-center gap-4 rounded-2xl border border-border/50 bg-muted/30 hover:border-primary/40 hover:bg-primary/5 p-4 text-left transition-all group"
              >
                <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0 group-hover:bg-amber-500/20 transition-colors">
                  <GitBranch className="h-5 w-5 text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground">Join via invite code</p>
                  <p className="text-xs text-muted-foreground">Someone shared a code with you</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-amber-400 transition-colors shrink-0" />
              </button>

              {/* Search by name / Add self */}
              <button
                onClick={() => router.push('/onboarding')}
                className="w-full flex items-center gap-4 rounded-2xl border border-border/50 bg-muted/30 hover:border-primary/40 hover:bg-primary/5 p-4 text-left transition-all group"
              >
                <div className="h-10 w-10 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0 group-hover:bg-violet-500/20 transition-colors">
                  <UserPlus className="h-5 w-5 text-violet-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground">Add yourself first</p>
                  <p className="text-xs text-muted-foreground">Start fresh and grow the tree from you</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-violet-400 transition-colors shrink-0" />
              </button>
            </div>
          </div>
        )}

        {/* ── Invite code entry ── */}
        {phase === 'invite-code' && (
          <div className="rounded-3xl border border-border/50 bg-card shadow-2xl overflow-hidden">
            <div className="px-6 pt-7 pb-5 border-b border-border/50 text-center">
              <h1 className="text-xl font-bold text-foreground mb-1">Enter invite code</h1>
              <p className="text-sm text-muted-foreground">Paste the code a family member sent you</p>
            </div>
            <div className="p-5 space-y-3">
              <Input
                placeholder="e.g. ABC12345"
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value.toUpperCase())}
                className="h-12 text-center font-mono text-lg tracking-widest bg-muted/50 border-border"
                maxLength={12}
                autoFocus
              />
              <Button
                onClick={handleInviteCode}
                disabled={inviteCode.trim().length < 6}
                className="w-full h-11 font-semibold"
              >
                Continue
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
              <button
                onClick={() => setPhase('no-match')}
                className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
              >
                ← Back
              </button>
            </div>
          </div>
        )}

        {/* ── Error ── */}
        {phase === 'error' && (
          <div className="rounded-3xl border border-destructive/30 bg-card shadow-2xl p-8 text-center">
            <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-3" />
            <p className="font-medium text-foreground mb-1">Something went wrong</p>
            <p className="text-sm text-muted-foreground mb-4">{errorMsg || 'Please try again.'}</p>
            <Button variant="outline" onClick={() => setPhase('loading')}>Retry</Button>
          </div>
        )}

        {/* Privacy note */}
        <p className="text-center text-[11px] text-muted-foreground/60 px-4">
          <Phone className="inline h-3 w-3 mr-1" />
          Your phone number is never shown to other family members.
        </p>
      </div>
    </div>
  )
}
