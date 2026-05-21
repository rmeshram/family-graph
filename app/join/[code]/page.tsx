'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useJoinFamily } from '@/hooks/use-invites'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Loader2, CheckCircle2, XCircle, TreePine, ArrowRight, Share2, Heart, Users, User, GitBranch, UserPlus, Shield, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FEATURE_FLAGS } from '@/lib/feature-flags'
import { scoreCandidate, tierLabel, tierColor, isRecommendedClaimMatch } from '@/lib/match-detection'
import type { MatchResult } from '@/lib/match-detection'

type Status = 'loading' | 'preview' | 'relate' | 'claim' | 'node_claim' | 'joining' | 'success' | 'error'
type RelType = 'spouse' | 'child' | 'parent' | 'sibling' | 'relative' | 'skip'

interface FamilyPreview {
  name: string
  memberCount: number
  generationCount: number
  recentNames: string[]
  inviterName: string | null
}

const RELATIONSHIP_OPTIONS: { key: RelType; label: string; sublabel: string; icon: React.ElementType; color: string }[] = [
  { key: 'spouse', label: 'Spouse / Partner', sublabel: 'Husband, wife, or partner', icon: Heart, color: 'text-pink-400 bg-pink-500/10 border-pink-500/30' },
  { key: 'child', label: 'Son / Daughter', sublabel: 'Their child', icon: User, color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
  { key: 'parent', label: 'Father / Mother', sublabel: 'Their parent', icon: Users, color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  { key: 'sibling', label: 'Brother / Sister', sublabel: 'Their sibling', icon: GitBranch, color: 'text-green-400 bg-green-500/10 border-green-500/30' },
  { key: 'relative', label: 'Other Relative', sublabel: 'Uncle, aunt, cousin, in-law…', icon: UserPlus, color: 'text-violet-400 bg-violet-500/10 border-violet-500/30' },
  { key: 'skip', label: 'Just Browse', sublabel: 'Add details later', icon: ArrowRight, color: 'text-muted-foreground bg-muted/30 border-border/50' },
]

export default function JoinPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  const { joinWithCode } = useJoinFamily()
  const code = params.code as string

  const [status, setStatus] = useState<Status>('loading')
  const [message, setMessage] = useState('')
  const [preview, setPreview] = useState<FamilyPreview | null>(null)
  const [isAuthed, setIsAuthed] = useState(false)

  // Relationship step state
  const [selectedRel, setSelectedRel] = useState<RelType | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [selectedGender, setSelectedGender] = useState<'male' | 'female' | 'other' | null>(null)

  // Claim step state
  const [unclaimedNodes, setUnclaimedNodes] = useState<{ id: string; name: string; relationship: string; generation: number }[]>([])
  const [scoredMatches, setScoredMatches] = useState<MatchResult[]>([])
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null) // null = create new

  // node_claim invite state (B2)
  const [nodeClaim, setNodeClaim] = useState<{ nodeId: string; identityHint: string | null; familyId: string } | null>(null)
  const [ncName, setNcName] = useState('')
  const [ncBirthYear, setNcBirthYear] = useState('')
  const [ncAttempts, setNcAttempts] = useState<number | null>(null)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setIsAuthed(!!user)
      if (user) setDisplayName('') // will pre-fill below

      const { data: invite } = await supabase
        .from('invite_links')
        .select('*, families(name)')
        .eq('code', code.toUpperCase())
        .single()

      if (!invite) { setStatus('error'); setMessage('Invalid or expired invite link.'); return }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inv = invite as any

      // A4: validate expiry, consumption, and max_uses at initial load.
      if (inv.expires_at && new Date(inv.expires_at) < new Date()) {
        setStatus('error'); setMessage('This invite link has expired. Ask the sender for a new one.'); return
      }
      if (inv.consumed_at) {
        setStatus('error'); setMessage('This invite has already been used.'); return
      }
      if (inv.max_uses && inv.used_count >= inv.max_uses) {
        setStatus('error'); setMessage('This invite has reached its user limit.'); return
      }

      // B2: node_claim invites must use the verified-claim flow. Show inline
      // identity verification (name + birth year) before joining.
      if (inv.invite_type === 'node_claim' && inv.node_id) {
        setNodeClaim({ nodeId: inv.node_id, identityHint: inv.identity_hint ?? null, familyId: inv.family_id })
        setStatus('node_claim')
        return
      }

      const familyName = inv.families?.name ?? 'this family'

      // Inviter name
      let inviterName: string | null = null
      if (inv.created_by) {
        const { data: inviterProf } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', inv.created_by)
          .single()
        inviterName = (inviterProf as any)?.display_name ?? null
      }

      // Family preview stats
      const { data: members } = await supabase
        .from('family_members')
        .select('name, generation')
        .eq('family_id', inv.family_id)
        .limit(50)

      const memberCount = members?.length ?? 0
      const generations = new Set(members?.map(m => m.generation) ?? [])
      const recentNames = (members ?? []).slice(0, 4).map(m => m.name.split(' ')[0])

      setPreview({ name: familyName, memberCount, generationCount: generations.size, recentNames, inviterName })
      setStatus('preview')
    }
    init()
  }, [code, supabase])

  const handleContinueToRelate = () => {
    if (!isAuthed) { router.push(`/auth/signin?next=/join/${code}`); return }
    // Per DECISION 1: claim = join. Skip the redundant relationship picker for MVP
    // and go straight to the claim step (which already lists unclaimed nodes
    // and offers "create new"). Relationship is assigned later via add-member-dialog.
    if (!FEATURE_FLAGS.enableInviteRelationshipStep) {
      handleContinueToClaim()
      return
    }
    setStatus('relate')
  }

  // After picking their relationship, fetch unclaimed nodes that might be them
  const handleContinueToClaim = async () => {
    // When the relationship step is enabled, require a selection. Otherwise skip validation.
    if (FEATURE_FLAGS.enableInviteRelationshipStep) {
      if (!selectedRel || (selectedRel !== 'skip' && !displayName.trim())) return
    }
    setStatus('joining') // brief spinner while fetching

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push(`/auth/signin?next=/join/${code}`); return }

      // Load unclaimed members of this family for identity resolution
      const { data: invite } = await supabase
        .from('invite_links').select('family_id').eq('code', code.toUpperCase()).single()

      if (invite?.family_id) {
        const { data: nodes } = await supabase
          .from('family_members')
          .select('id, name, relationship, generation, birth_year, phone, email')
          .eq('family_id', invite.family_id)
          .eq('is_claimed', false)
          .order('generation', { ascending: true })
          .limit(30)

        const candidates = (nodes ?? []) as {
          id: string; name: string; relationship: string; generation: number;
          birth_year: number | null; phone: string | null; email: string | null
        }[]

        if (candidates.length > 0) {
          setUnclaimedNodes(candidates)

          // ── Identity Resolution: score each candidate against the joining user ──
          const { data: myProfile } = await supabase
            .from('profiles')
            .select('display_name, phone')
            .eq('id', user.id)
            .single()

          const userProfile = {
            name: displayName.trim() || myProfile?.display_name || user.email?.split('@')[0] || '',
            birthYear: null as number | null,
            phone: myProfile?.phone ?? null,
            email: user.email ?? null,
          }

          const familyName = preview?.name ?? 'Family'
          const scored = candidates
            .map(n => scoreCandidate(
              {
                nodeId: n.id,
                nodeName: n.name,
                familyId: invite.family_id,
                familyName,
                addedByName: null,
                relationship: n.relationship ?? null,
                birthYear: n.birth_year ?? null,
                phone: n.phone ?? null,
                email: n.email ?? null,
              },
              userProfile,
            ))
            .filter(Boolean) as MatchResult[]

          scored.sort((a, b) => b.confidenceScore - a.confidenceScore)
          setScoredMatches(scored)

          // Auto-pre-select if a recommended match is found.
          // Exact email/phone matches should be treated as strong claim suggestions
          // even when the generic tier ends up below "high".
          if (scored.length > 0 && isRecommendedClaimMatch(scored[0])) {
            setSelectedClaimId(scored[0].nodeId)
          } else {
            // Default to create new when no strong match
            setSelectedClaimId(null)
          }

          setStatus('claim')
          return
        }
      }
    } catch { /* fall through to join */ }

    // No unclaimed nodes — go straight to join
    handleJoin()
  }

  const handleJoin = async (claimId?: string | null) => {
    if (!isAuthed) { router.push(`/auth/signin?next=/join/${code}`); return }
    setStatus('joining')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push(`/auth/signin?next=/join/${code}`); return }
      await joinWithCode(code, user.id, {
        displayName: displayName.trim() || undefined,
        relationshipToInviter: selectedRel ?? 'skip',
        gender: selectedGender ?? undefined,
        claimMemberId: claimId ?? undefined,
      })
      setStatus('success')
      setTimeout(() => router.push('/dashboard'), 2000)
    } catch (e: unknown) {
      setStatus('error')
      setMessage(e instanceof Error ? e.message : 'Something went wrong')
    }
  }

  // B2: handler for node_claim invites — verifies identity via /api/nodes/[id]/claim,
  // then sets profile.family_id so the user lands in the family.
  const handleNodeClaim = async () => {
    if (!nodeClaim) return
    if (!isAuthed) { router.push(`/auth/signin?next=/join/${code}`); return }
    if (!ncName.trim()) return
    const by = ncBirthYear.trim() ? parseInt(ncBirthYear.trim(), 10) : undefined
    if (ncBirthYear.trim() && (Number.isNaN(by!) || by! < 1800 || by! > new Date().getFullYear())) {
      setMessage('Please enter a valid birth year'); return
    }
    setStatus('joining')
    setMessage('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push(`/auth/signin?next=/join/${code}`); return }

      const res = await fetch(`/api/nodes/${nodeClaim.nodeId}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submittedName: ncName.trim(), submittedBirthYear: by ?? null }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (typeof data.attemptsLeft === 'number') setNcAttempts(data.attemptsLeft)
        setStatus('node_claim')
        setMessage(data.message ?? data.error ?? 'Verification failed')
        return
      }

      // On success the claim API has updated user_node_links + profiles.member_id.
      // Also bind this user's profile to the family + role so RLS lets them in.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const profUpdate = supabase.from('profiles') as any
      await profUpdate.update({ family_id: nodeClaim.familyId, role: 'contributor' }).eq('id', user.id)

      // Consume the single-use node_claim invite
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inviteUpd = supabase.from('invite_links') as any
      await inviteUpd
        .update({ consumed_at: new Date().toISOString(), used_count: 1 })
        .eq('code', code.toUpperCase())
        .is('consumed_at', null)

      setStatus('success')
      setTimeout(() => router.push('/dashboard'), 2000)
    } catch (e: unknown) {
      setStatus('node_claim')
      setMessage(e instanceof Error ? e.message : 'Something went wrong')
    }
  }

  const shareUrl = typeof window !== 'undefined' ? window.location.href : ''
  const shareText = `🌳 Join the ${preview?.name ?? 'Family'} tree on Family Graph! ${shareUrl}`

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-12">
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5" />

      <div className="relative w-full max-w-md space-y-4">
        {/* Header */}
        <div className="text-center mb-2">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-secondary shadow-xl shadow-primary/30 mb-4">
            <TreePine className="h-7 w-7 text-white" />
          </div>
          <p className="text-sm text-muted-foreground">Family Graph</p>
        </div>

        <div className="rounded-3xl border border-border/50 bg-card shadow-2xl overflow-hidden">

          {/* ── Loading ───────────────────────────────────────── */}
          {status === 'loading' && (
            <div className="p-10 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">Loading family preview...</p>
            </div>
          )}

          {/* ── Preview ───────────────────────────────────────── */}
          {status === 'preview' && preview && (
            <>
              <div className="px-8 pt-8 pb-6 text-center border-b border-border/50 bg-gradient-to-b from-primary/5 to-transparent">
                <h1 className="text-2xl font-bold text-foreground mb-1">{preview.name}</h1>
                <p className="text-muted-foreground text-sm">
                  {preview.inviterName ? (
                    <><strong>{preview.inviterName}</strong> has invited you to join the family tree</>
                  ) : "You've been invited to join the family tree"}
                </p>
                <div className="flex items-center justify-center gap-6 mt-5">
                  {[
                    { v: preview.memberCount || '—', l: 'members' },
                    { v: preview.generationCount || '—', l: 'generations' },
                    { v: '🌳', l: 'live tree' },
                  ].map(({ v, l }, i, a) => (
                    <div key={l} className="flex items-center gap-6">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-primary">{v}</p>
                        <p className="text-[11px] text-muted-foreground">{l}</p>
                      </div>
                      {i < a.length - 1 && <div className="h-8 w-px bg-border/50" />}
                    </div>
                  ))}
                </div>
                {preview.recentNames.length > 0 && (
                  <div className="mt-5 flex items-center justify-center gap-1">
                    <div className="flex -space-x-2">
                      {preview.recentNames.map((name, i) => (
                        <Avatar key={i} className="h-8 w-8 border-2 border-card">
                          <AvatarFallback className="text-[10px] font-bold bg-primary/20 text-primary">{name[0]}</AvatarFallback>
                        </Avatar>
                      ))}
                    </div>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {preview.recentNames.slice(0, 2).join(', ')} & more are waiting
                    </span>
                  </div>
                )}
              </div>
              <div className="p-6 space-y-3">
                <Button onClick={handleContinueToRelate} className="w-full h-12 text-base font-semibold bg-primary hover:bg-primary/90">
                  {isAuthed ? 'Join Family Tree' : 'Sign in & Join'}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
                {!isAuthed && <p className="text-center text-xs text-muted-foreground">Free account · No app download needed</p>}
                <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 text-xs text-muted-foreground hover:text-green-400 transition-colors">
                  <Share2 className="h-3.5 w-3.5" /> Forward this invite
                </a>
              </div>
              <div className="px-6 pb-5 text-center">
                <Badge variant="outline" className="font-mono text-xs tracking-widest text-muted-foreground">CODE: {code.toUpperCase()}</Badge>
              </div>
            </>
          )}

          {/* ── Relationship Step ─────────────────────────────── */}
          {status === 'relate' && preview && (
            <div className="p-6 space-y-5">
              <div className="text-center">
                <h2 className="text-lg font-bold text-foreground">
                  How do you know {preview.inviterName ? <span className="text-primary">{preview.inviterName}</span> : 'the inviter'}?
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  This places you correctly in the family tree — the magic happens automatically ✨
                </p>
              </div>

              {/* Name field */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Your name</label>
                <Input
                  placeholder="Your full name"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  className="h-10 bg-muted/50 border-border"
                  autoFocus
                />
              </div>

              {/* Gender field */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Your gender</label>
                <div className="flex gap-2">
                  {([['male', '♂ Male'], ['female', '♀ Female'], ['other', '⚥ Other']] as const).map(([g, label]) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setSelectedGender(g)}
                      className={cn(
                        'flex-1 rounded-lg border py-2 text-xs font-medium transition-all',
                        selectedGender === g
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border/50 bg-muted/20 text-muted-foreground hover:border-border/70'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Relationship grid */}
              <div className="grid grid-cols-2 gap-2">
                {RELATIONSHIP_OPTIONS.map(({ key, label, sublabel, icon: Icon, color }) => (
                  <button
                    key={key}
                    onClick={() => setSelectedRel(key)}
                    className={cn(
                      'flex items-start gap-2.5 rounded-xl border p-3 text-left transition-all',
                      selectedRel === key ? color : 'border-border/50 bg-muted/20 hover:border-border/70'
                    )}
                  >
                    <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', selectedRel === key ? '' : 'text-muted-foreground')} />
                    <div>
                      <p className={cn('text-xs font-semibold', selectedRel === key ? '' : 'text-foreground')}>{label}</p>
                      <p className="text-[10px] text-muted-foreground">{sublabel}</p>
                    </div>
                  </button>
                ))}
              </div>

              {/* Viral explainer */}
              {selectedRel && selectedRel !== 'skip' && (
                <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 text-xs text-muted-foreground">
                  🌳 <strong className="text-foreground">Your node will be auto-linked.</strong> Anyone who joins through you will extend the tree further — creating a living, connected graph across families.
                </div>
              )}

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStatus('preview')} className="flex-1 h-11">Back</Button>
                <Button
                  onClick={handleContinueToClaim}
                  disabled={!selectedRel || (selectedRel !== 'skip' && !displayName.trim())}
                  className="flex-1 h-11 bg-primary hover:bg-primary/90"
                >
                  Continue
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* ── Claim Step (Identity Resolution) ─────────────── */}
          {status === 'claim' && (
            <div className="p-6 space-y-5">
              {/* Header — adapted based on confidence of top match */}
              {scoredMatches.length > 0 && scoredMatches[0].confidenceTier === 'high' ? (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/8 p-4 text-center space-y-1">
                  <div className="flex items-center justify-center gap-1.5 mb-1">
                    <Sparkles className="h-4 w-4 text-amber-400" />
                    <span className="text-xs font-semibold uppercase tracking-widest text-amber-400">Identity Match Found</span>
                  </div>
                  <h2 className="text-base font-bold">This looks like your existing profile</h2>
                  <p className="text-xs text-muted-foreground">Someone added you before you signed up. Claim your node instead of creating a duplicate.</p>
                </div>
              ) : (
                <div className="text-center">
                  <h2 className="text-lg font-bold">Are you already in the tree?</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Someone may have added you before you signed up. Claim your profile — or create a new one.
                  </p>
                </div>
              )}

              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {/* Scored / ranked candidates first */}
                {(() => {
                  const scoredIds = new Set(scoredMatches.map(m => m.nodeId))
                  // Scored nodes sorted by confidence
                  const sortedScored = scoredMatches.map(match => {
                    const node = unclaimedNodes.find(n => n.id === match.nodeId)
                    return node ? { node, match } : null
                  }).filter(Boolean) as { node: typeof unclaimedNodes[0]; match: MatchResult }[]
                  // Unscored nodes in original order
                  const unscored = unclaimedNodes.filter(n => !scoredIds.has(n.id))

                  return (
                    <>
                      {sortedScored.map(({ node, match }) => (
                        <button
                          key={node.id}
                          onClick={() => setSelectedClaimId(node.id)}
                          className={cn(
                            'w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-all',
                            selectedClaimId === node.id
                              ? 'border-primary bg-primary/10'
                              : match.confidenceTier === 'high'
                                ? 'border-amber-500/40 bg-amber-500/5 hover:border-amber-500/60'
                                : 'border-border/50 bg-muted/20 hover:border-border/70'
                          )}
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white">
                            {node.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-sm truncate">{node.name}</p>
                              <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded border', tierColor(match.confidenceTier))}>
                                {tierLabel(match.confidenceTier)}
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground capitalize mt-0.5">
                              {node.relationship} · {match.matchReasons.includes('email') ? 'Email match' : match.matchReasons.includes('name') ? 'Name match' : 'Possible match'}
                            </p>
                          </div>
                          {selectedClaimId === node.id
                            ? <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                            : isRecommendedClaimMatch(match) && <span className="text-[10px] text-amber-400 shrink-0">Recommended</span>
                          }
                        </button>
                      ))}

                      {unscored.map(node => (
                        <button
                          key={node.id}
                          onClick={() => setSelectedClaimId(node.id)}
                          className={cn(
                            'w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-all',
                            selectedClaimId === node.id
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border/50 bg-muted/20 hover:border-border/70'
                          )}
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary">
                            {node.name.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm truncate">{node.name}</p>
                            <p className="text-[11px] text-muted-foreground capitalize">{node.relationship} · Gen {node.generation}</p>
                          </div>
                          {selectedClaimId === node.id && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                        </button>
                      ))}

                      {/* Create new — secondary option */}
                      <button
                        onClick={() => setSelectedClaimId(null)}
                        className={cn(
                          'w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-all',
                          selectedClaimId === null
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border/40 bg-muted/10 hover:border-border/60'
                        )}
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          <UserPlus className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm">Create a separate profile</p>
                          <p className="text-[11px] text-muted-foreground">A new entry will be added to the tree</p>
                        </div>
                        {selectedClaimId === null && <CheckCircle2 className="h-4 w-4 text-primary shrink-0 ml-auto" />}
                      </button>
                    </>
                  )
                })()}
              </div>

              {/* When the relationship step is disabled (MVP default) and the user is
                  creating a new node, collect minimal identity (name + gender). */}
              {!FEATURE_FLAGS.enableInviteRelationshipStep && selectedClaimId === null && (
                <div className="space-y-3 rounded-xl border border-border/40 bg-muted/10 p-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Your name</label>
                    <Input
                      placeholder="Your full name"
                      value={displayName}
                      onChange={e => setDisplayName(e.target.value)}
                      className="h-10 bg-background/60 border-border"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Your gender (optional)</label>
                    <div className="flex gap-2">
                      {([['male', '♂ Male'], ['female', '♀ Female'], ['other', '⚥ Other']] as const).map(([g, label]) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() => setSelectedGender(prev => prev === g ? null : g)}
                          className={cn(
                            'flex-1 rounded-lg border py-2 text-xs font-medium transition-all',
                            selectedGender === g
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border/50 bg-muted/20 text-muted-foreground hover:border-border/70'
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">You can set how you’re related to others later — directly in the tree.</p>
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setStatus(FEATURE_FLAGS.enableInviteRelationshipStep ? 'relate' : 'preview')}
                  className="flex-1 h-11"
                >Back</Button>
                <Button
                  onClick={() => handleJoin(selectedClaimId)}
                  disabled={!selectedClaimId && !FEATURE_FLAGS.enableInviteRelationshipStep && !displayName.trim()}
                  className="flex-1 h-11 bg-primary hover:bg-primary/90"
                >
                  {selectedClaimId ? 'Claim & Join' : 'Create & Join'}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* ── Node Claim Verification (B2) ──────────────────── */}
          {status === 'node_claim' && nodeClaim && (
            <div className="p-6 space-y-5">
              <div className="text-center">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 border border-blue-500/30 mb-3">
                  <Shield className="h-5 w-5 text-blue-400" />
                </div>
                <h2 className="text-lg font-bold">Claim your profile</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {nodeClaim.identityHint
                    ? <>This invite is for <span className="text-foreground font-semibold">{nodeClaim.identityHint}</span>. Confirm your identity to claim this profile.</>
                    : <>Confirm your identity to claim this profile.</>}
                </p>
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Your full name (as on the tree)</label>
                  <Input
                    placeholder="e.g. Rahul Sharma"
                    value={ncName}
                    onChange={e => setNcName(e.target.value)}
                    className="h-10 bg-muted/50 border-border"
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Birth year (optional but recommended)</label>
                  <Input
                    placeholder="e.g. 1985"
                    inputMode="numeric"
                    maxLength={4}
                    value={ncBirthYear}
                    onChange={e => setNcBirthYear(e.target.value.replace(/\D/g, ''))}
                    className="h-10 bg-muted/50 border-border"
                  />
                </div>
              </div>

              {message && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-xs text-destructive">
                  {message}
                  {ncAttempts !== null && (
                    <span className="ml-1 text-destructive/70">({ncAttempts} attempt{ncAttempts === 1 ? '' : 's'} left)</span>
                  )}
                </div>
              )}

              <div className="rounded-xl bg-blue-500/5 border border-blue-500/20 p-3 text-xs text-muted-foreground">
                <Shield className="inline h-3.5 w-3.5 mr-1 text-blue-400" />
                Identity verification protects family members from impersonation. After 3 failed attempts, this claim is locked.
              </div>

              <Button
                onClick={handleNodeClaim}
                disabled={!ncName.trim()}
                className="w-full h-11 bg-primary hover:bg-primary/90"
              >
                {isAuthed ? 'Verify & Claim Profile' : 'Sign in & Claim'}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          )}

          {/* ── Joining spinner ───────────────────────────────── */}
          {status === 'joining' && (
            <div className="p-10 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Placing you in the family tree…</p>
            </div>
          )}

          {/* ── Success ───────────────────────────────────────── */}
          {status === 'success' && (
            <div className="p-10 text-center space-y-3">
              <CheckCircle2 className="h-12 w-12 text-green-400 mx-auto" />
              <h1 className="text-xl font-bold">Welcome to the family! 🙏</h1>
              <p className="text-muted-foreground text-sm">
                {selectedRel && selectedRel !== 'skip'
                  ? `You're now connected as ${preview?.inviterName ? `${preview.inviterName}'s ${selectedRel}` : 'a family member'} in the tree.`
                  : 'Redirecting to your family tree…'}
              </p>
              <p className="text-xs text-muted-foreground animate-pulse">Redirecting…</p>
            </div>
          )}

          {/* ── Error ─────────────────────────────────────────── */}
          {status === 'error' && (
            <div className="p-10 text-center">
              <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <h1 className="text-xl font-bold mb-2">Couldn't join</h1>
              <p className="text-muted-foreground text-sm mb-6">{message}</p>
              <Button variant="outline" className="w-full" onClick={() => router.push('/')}>Go home</Button>
            </div>
          )}
        </div>

        <p className="text-center text-[11px] text-muted-foreground/60">
          Family Graph · Your family story, preserved forever
        </p>
      </div>
    </div>
  )
}
