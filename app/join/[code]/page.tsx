'use client'

import { useEffect, useRef, useState } from 'react'
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

type Status = 'loading' | 'preview' | 'relate' | 'claim' | 'node_claim' | 'post_claim' | 'joining' | 'success' | 'error'
type RelType = 'spouse' | 'child' | 'parent' | 'sibling' | 'relative' | 'skip'

interface FamilyPreview {
  name: string
  memberCount: number
  generationCount: number
  recentNames: string[]
  inviterName: string | null
  privacyMode?: 'open' | 'protected' | 'closed'
}

const RELATIONSHIP_OPTIONS: { key: RelType; label: string; sublabel: (name: string) => string; icon: React.ElementType; color: string }[] = [
  { key: 'spouse', label: 'Spouse / Partner', sublabel: (n) => `${n}'s husband, wife, or partner`, icon: Heart, color: 'text-pink-400 bg-pink-500/10 border-pink-500/30' },
  { key: 'child', label: 'Son / Daughter', sublabel: (n) => `${n}'s child`, icon: User, color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
  { key: 'parent', label: 'Father / Mother', sublabel: (n) => `${n}'s parent`, icon: Users, color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  { key: 'sibling', label: 'Brother / Sister', sublabel: (n) => `${n}'s sibling`, icon: GitBranch, color: 'text-green-400 bg-green-500/10 border-green-500/30' },
  { key: 'relative', label: 'Other Relative', sublabel: (n) => `${n}'s uncle, aunt, cousin, in-law…`, icon: UserPlus, color: 'text-violet-400 bg-violet-500/10 border-violet-500/30' },
  { key: 'skip', label: 'Just Browse', sublabel: () => 'Add details later', icon: ArrowRight, color: 'text-muted-foreground bg-muted/30 border-border/50' },
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
  const [selectedClaimId, setSelectedClaimId] = useState<string | null | undefined>(undefined) // undefined = no selection yet; null = create new
  // Explicit confirmation required when user picks "create new" despite a
  // medium-confidence match being shown (prevents accidental duplicates).
  const [confirmedCreateNew, setConfirmedCreateNew] = useState(false)

  // node_claim invite state (B2)
  const [nodeClaim, setNodeClaim] = useState<{
    nodeId: string
    identityHint: string | null
    familyId: string
    birthYear: number | null
    birthYearHint: number | null
    parentNames: string[]
  } | null>(null)
  const [ncBirthYear, setNcBirthYear] = useState('')
  const nodeClaimSubmittingRef = useRef(false)
  // Post-claim profile completion (birth year prompt when node had none)
  const [pcBirthYear, setPcBirthYear] = useState('')
  // Cross-family switch: set when the claim API returns CROSS_FAMILY_CLAIM
  // to show an explicit confirmation before proceeding.
  const [crossFamilyConfirmData, setCrossFamilyConfirmData] = useState<{
    currentFamilyName: string
    targetFamilyName: string
  } | null>(null)
  // Bug B: set when joinWithCode throws CROSS_FAMILY_JOIN — user has active claimed
  // node in another family and must explicitly confirm before we overwrite family_id.
  const [crossFamilyJoinConfirm, setCrossFamilyJoinConfirm] = useState<{
    existingNodeName: string
    claimIdPending: string | null | undefined
  } | null>(null)
  // Two-tree connection: set when the claim API returns SUGGEST_FAMILY_LINK
  // to show the "Connect Families" card instead of a dead-end error.
  const [familyLinkSuggestion, setFamilyLinkSuggestion] = useState<{
    existingNodeId: string
    existingNodeName: string
    existingFamilyName: string
    targetNodeId: string
    targetFamilyName: string
  } | null>(null)
  const [familyLinkSubmitting, setFamilyLinkSubmitting] = useState(false)
  const [familyLinkResult, setFamilyLinkResult] = useState<{ autoAccepted: boolean; claimFamilyName: string; existingFamilyName: string } | null>(null)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setIsAuthed(!!user)
      if (user) {
        // Pre-fill display name from the user's profile
        const { data: myProfile } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', user.id)
          .single()
        const prefillName = (myProfile as any)?.display_name || user.email?.split('@')[0] || ''
        setDisplayName(prefillName)
      }

      // HIGH-05: combined single read — validates and routes in one fetch.
      // The original two-read pattern (freshInvite check then full invite fetch) had a
      // TOCTOU gap: another user could consume the invite between the two reads.
      // Now we do one authoritative read and validate from that single snapshot.
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

      // B2: node_claim invites use a confirmation flow (no manual name entry).
      // Fetch node preview (name, birth year, parents) via service-role endpoint.
      if (inv.invite_type === 'node_claim' && inv.node_id) {
        let birthYear: number | null = null
        let birthYearHint: number | null = null
        let parentNames: string[] = []
        try {
          const previewRes = await fetch(`/api/invite/${code.toUpperCase()}/unclaimed`)
          if (previewRes.ok) {
            const previewData = await previewRes.json()
            if (previewData.nodePreview) {
              birthYear = previewData.nodePreview.birthYear ?? null
              parentNames = previewData.nodePreview.parentNames ?? []
            }
            birthYearHint = previewData.inviteBirthYearHint ?? null
          }
        } catch { /* non-fatal — show profile card without parent context */ }
        setNodeClaim({
          nodeId: inv.node_id,
          identityHint: inv.identity_hint ?? null,
          familyId: inv.family_id,
          birthYear,
          birthYearHint,
          parentNames,
        })
        setNcBirthYear(String(birthYear ?? birthYearHint ?? ''))
        setStatus('node_claim')
        return
      }

      // Phone-invite auto-match: if the invite has an invited_phone and the
      // current user's verified phone matches it, treat this as a node_claim
      // invite and route directly to the claim flow for the linked node (if any).
      if (inv.invited_phone && inv.node_id) {
        const { data: { user: currentUser } } = await supabase.auth.getUser()
        const userPhone = currentUser?.phone ?? null
        // Compare E.164 values — both Supabase OTP and our normalizer produce E.164
        if (userPhone && userPhone === inv.invited_phone) {
          let birthYear: number | null = null
          let birthYearHint: number | null = null
          let parentNames: string[] = []
          try {
            const previewRes = await fetch(`/api/invite/${code.toUpperCase()}/unclaimed`)
            if (previewRes.ok) {
              const previewData = await previewRes.json()
              if (previewData.nodePreview) {
                birthYear = previewData.nodePreview.birthYear ?? null
                parentNames = previewData.nodePreview.parentNames ?? []
              }
              birthYearHint = previewData.inviteBirthYearHint ?? null
            }
          } catch { /* non-fatal */ }
          setNodeClaim({
            nodeId: inv.node_id,
            identityHint: inv.identity_hint ?? null,
            familyId: inv.family_id,
            birthYear,
            birthYearHint,
            parentNames,
          })
          setNcBirthYear(String(birthYear ?? birthYearHint ?? ''))
          setStatus('node_claim')
          return
        }
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

      // Family preview stats — respect family privacy_mode
      const { data: familyData } = await supabase
        .from('families')
        .select('privacy_mode')
        .eq('id', inv.family_id)
        .single()
      const familyPrivacyMode = (familyData as any)?.privacy_mode as 'open' | 'protected' | 'closed' | undefined ?? 'protected'

      // Member count (exact) + name/generation sample for display
      const { count: exactCount } = await supabase
        .from('family_members')
        .select('*', { count: 'exact', head: true })
        .eq('family_id', inv.family_id)

      const { data: members } = await supabase
        .from('family_members')
        .select('name, generation')
        .eq('family_id', inv.family_id)
        .limit(50)

      const memberCount = exactCount ?? members?.length ?? 0
      const generations = new Set(members?.map(m => m.generation) ?? [])
      // Enforce privacy mode: 'closed' shows no names, 'protected' shows count only
      const recentNames = familyPrivacyMode === 'open'
        ? (members ?? []).slice(0, 4).map(m => m.name.split(' ')[0])
        : []

      setPreview({ name: familyName, memberCount, generationCount: generations.size, recentNames, inviterName, privacyMode: familyPrivacyMode })
      setStatus('preview')
    }
    init()

    // Re-run init when auth state changes (e.g. user completes signup in another tab
    // and the token is injected via the Supabase auth listener). This ensures we
    // re-validate invite expiry and update isAuthed without requiring a page reload.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) init()
    })
    return () => subscription.unsubscribe()
  }, [code, supabase])

  const handleContinueToRelate = () => {
    if (!isAuthed) {
      // Save invite code as resilience backup in case the ?next chain breaks (e.g. mid-flow refresh)
      if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('fg_invite_return', code)
      router.push(`/auth/signin?next=/join/${code}`)
      return
    }
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

      // Load unclaimed members via server API (bypasses RLS — new users have no family_id yet)
      const apiRes = await fetch(`/api/invite/${code.toUpperCase()}/unclaimed`)
      const apiData = apiRes.ok ? await apiRes.json() : null

      const familyId: string | null = apiData?.familyId ?? null

      if (familyId && Array.isArray(apiData?.nodes) && apiData.nodes.length > 0) {
        const candidates = apiData.nodes as {
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
                familyId: familyId,
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
            // No strong match — require the user to explicitly pick a profile or
            // tap "Create a separate profile". Prevents silent duplicate creation.
            setSelectedClaimId(undefined)
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
    // A3: Block creating a new node when a high-confidence unclaimed match exists.
    // Allowing "None of these are me" in that case would silently create a duplicate
    // node and break tree integrity. The user must claim the matched node or contact admin.
    if (claimId === null && scoredMatches.length > 0 && isRecommendedClaimMatch(scoredMatches[0])) {
      setMessage('Please select the profile above that matches you. If you believe none are correct, contact the family admin to add you separately.')
      return
    }
    // A3b: Medium-confidence block — require explicit acknowledgement before
    // creating a new node, because a similar profile already exists and
    // duplicating it breaks the tree.  The UI renders a confirmation checkbox;
    // we double-check that it was actually ticked here.
    if (claimId === null && scoredMatches.length > 0 &&
      scoredMatches[0].confidenceTier === 'medium' && !confirmedCreateNew) {
      setMessage('Please confirm that none of the profiles shown are you before creating a new one.')
      return
    }
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
      if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('fg_invite_return')
      setStatus('success')
      // Full page navigation forces AuthProvider to re-fetch updated profile (new member_id)
      setTimeout(() => { window.location.href = '/dashboard' }, 2000)
    } catch (e: unknown) {
      // Bug B: User has an active claimed node in another family — require confirmation
      // before overwriting their family_id. Show an inline prompt instead of an error.
      if (e instanceof Error && (e as any).code === 'CROSS_FAMILY_JOIN') {
        const typedErr = e as any
        setCrossFamilyJoinConfirm({ existingNodeName: typedErr.existingNodeName ?? '', claimIdPending: claimId })
        setStatus('claim') // stay on the claim screen behind the prompt
        return
      }
      setStatus('error')
      setMessage(e instanceof Error ? e.message : 'Something went wrong')
    }
  }

  // B2: handler for node_claim invites — confirms identity and claims the specific node.
  // No manual name entry: the admin already identified this person by creating
  // the invite for their specific node. We send the node's own name as the
  // submitted name (always scores ≥ 60 → passes the identity threshold).
  // The real security comes from the single-use, admin-created invite itself.
  const handleNodeClaim = async (confirmCrossFamily = false) => {
    if (!nodeClaim?.identityHint) {
      setMessage('This invite is missing profile information. Contact the family admin.')
      return
    }
    const birthYearRaw = ncBirthYear.trim()
    const submittedBirthYear = parseInt(birthYearRaw, 10)
    const currentYear = new Date().getFullYear() + 1
    if (!birthYearRaw || Number.isNaN(submittedBirthYear) || submittedBirthYear < 1800 || submittedBirthYear > currentYear) {
      setMessage('Please enter a valid birth year to continue.')
      return
    }
    if (!isAuthed) {
      if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('fg_invite_return', code)
      router.push(`/auth/signin?next=/join/${code}`)
      return
    }
    if (nodeClaimSubmittingRef.current) return
    nodeClaimSubmittingRef.current = true
    setStatus('joining')
    setMessage('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push(`/auth/signin?next=/join/${code}`); return }

      const res = await fetch(`/api/nodes/${nodeClaim.nodeId}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submittedName: nodeClaim.identityHint,
          submittedBirthYear,
          inviteCode: code.toUpperCase(),
          confirmCrossFamily,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setStatus('node_claim')
        const errorCode: string = data.error ?? 'UNKNOWN'
        // C1: Cross-family switch — show a confirmation step instead of an error message.
        if (errorCode === 'CROSS_FAMILY_CLAIM') {
          setCrossFamilyConfirmData({
            currentFamilyName: data.currentFamilyName ?? 'your current family',
            targetFamilyName: data.targetFamilyName ?? 'the new family',
          })
          return
        }
        // Prefer the server's own message; only fall back to per-code defaults when absent.
        const serverMsg: string | undefined = data.message
        let userMessage: string
        switch (errorCode) {
          case 'DOB_MISMATCH_INVITE':
            userMessage = serverMsg ?? 'The birth year you entered does not match this invited profile. Double-check your year of birth or ask the family admin to confirm the correct one.'
            break
          case 'MISSING_BIRTH_YEAR':
            userMessage = serverMsg ?? 'Please enter your birth year to verify this invite.'
            break
          case 'FORBIDDEN':
          case 'INVITE_INVALID_TYPE':
            userMessage = serverMsg ?? 'This invite is no longer valid for claiming this profile. Ask the family admin to send a fresh invite link.'
            break
          case 'INVITE_ALREADY_USED':
            userMessage = serverMsg ?? 'This invite link has already been used. Each invite can only be used once — ask the family admin to generate a new one.'
            break
          case 'INVITE_EXPIRED':
            userMessage = serverMsg ?? 'This invite link has expired. Ask the family admin to generate a fresh invite.'
            break
          case 'INVITE_NODE_MISMATCH':
            userMessage = serverMsg ?? 'This invite link does not match the profile it was intended for. Make sure you opened the exact link the family admin shared with you.'
            break
          case 'INVITE_LOOKUP_FAILED':
            userMessage = serverMsg ?? 'Could not verify this invite right now. Please wait a moment and try again.'
            break
          case 'ALREADY_CLAIMED':
            userMessage = serverMsg ?? 'This profile has already been claimed by someone else. Ask the family admin if this is a mistake.'
            break
          case 'ALREADY_LINKED_ACCOUNT':
            userMessage = serverMsg ?? 'Your account is already linked to a different profile in the family tree. Sign in with a different account, or ask the family admin to unlink your current profile first.'
            break
          case 'SUGGEST_FAMILY_LINK': {
            // The user already has a claimed node in another family. Instead of
            // showing a dead-end error, surface the "Connect Families" card.
            const raw = data as any
            setFamilyLinkSuggestion({
              existingNodeId: raw.existingNodeId,
              existingNodeName: raw.existingNodeName,
              existingFamilyName: raw.existingFamilyName,
              targetNodeId: raw.targetNodeId,
              targetFamilyName: raw.targetFamilyName,
            })
            setStatus('node_claim') // keep the node_claim UI visible behind the card
            return
          }
          case 'CLAIM_PENDING_ANOTHER_USER':
            userMessage = serverMsg ?? 'Another person is currently in the process of claiming this profile. Try again later or contact the family admin.'
            break
          case 'IDENTITY_MISMATCH':
            userMessage = serverMsg ?? 'The details you entered do not match this profile. Check your name and birth year and try again.'
            break
          case 'RATE_LIMITED':
            userMessage = serverMsg ?? 'Too many claim attempts in the last hour. Please wait 1 hour and try again.'
            break
          case 'LOCKED_OUT':
            userMessage = serverMsg ?? 'Too many failed verification attempts — this profile is temporarily locked. Ask the family admin to reset the lock.'
            break
          case 'NODE_NOT_FOUND':
            userMessage = serverMsg ?? 'The profile you are trying to claim no longer exists in the family tree. Ask the family admin for an updated invite link.'
            break
          case 'NODE_DECEASED':
            userMessage = serverMsg ?? 'This profile is marked as deceased and cannot be claimed.'
            break
          case 'SCHEMA_ERROR':
            userMessage = serverMsg ?? 'The server database is out of date. Ask the family admin to run the latest migrations, then try again.'
            break
          case 'NODE_QUERY_FAILED':
            userMessage = serverMsg ?? 'Could not load this profile right now. Please try again in a moment. If the problem persists, contact the family admin.'
            break
          case 'UNAUTHENTICATED':
            userMessage = 'Your session expired. Please sign in and then open the invite link again.'
            break
          case 'CONFIG_ERROR':
          case 'INTERNAL_ERROR':
          case 'CLAIM_REQUEST_WRITE_FAILED':
          case 'CLAIM_UPDATE_FAILED':
          case 'LINK_WRITE_FAILED':
          case 'PROFILE_UPDATE_FAILED':
            userMessage = serverMsg ?? 'A server error occurred. Please try again in a few minutes. If the problem persists, share this error with the family admin: ' + errorCode
            break
          default:
            // Show the server message when available; otherwise include the code so the user can report it.
            userMessage = serverMsg ?? ('An unexpected error occurred (' + errorCode + '). Please try again or share this code with the family admin.')
        }
        setMessage(userMessage)
        return
      }

      // family_id, role, and member_id are now set server-side by the claim API
      // using the service-role client — this is the authoritative update.
      // Update display_name client-side only (not security-sensitive, lower RLS risk).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const profUpdate = supabase.from('profiles') as any
      await profUpdate.update({
        display_name: nodeClaim.identityHint,
      }).eq('id', user.id)

      // Invite consumption is handled server-side by the claim API.
      // No client-side consume needed here.

      if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('fg_invite_return')
      // If the node had no birth year, show a quick completion step before
      // landing in the dashboard — avoids an empty DOB forever.
      if (!nodeClaim.birthYear && !submittedBirthYear) {
        setStatus('post_claim')
      } else {
        setStatus('success')
        setTimeout(() => { window.location.href = '/dashboard' }, 2000)
      }
    } catch (e: unknown) {
      setStatus('node_claim')
      setMessage(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      nodeClaimSubmittingRef.current = false
    }
  }

  // Two-tree connection: called when user clicks "Connect Families" on the
  // SUGGEST_FAMILY_LINK card. Calls /api/family-links/cross-claim which creates
  // a family_links row using the bridge node + the user's existing claimed node.
  const handleConnectFamilies = async () => {
    if (!familyLinkSuggestion) return
    setFamilyLinkSubmitting(true)
    setMessage('')
    try {
      const res = await fetch('/api/family-links/cross-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claimNodeId: familyLinkSuggestion.targetNodeId,
          existingNodeId: familyLinkSuggestion.existingNodeId,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage(data.message ?? 'Could not connect the family trees. Please try again.')
        return
      }
      setFamilyLinkResult({
        autoAccepted: data.autoAccepted,
        claimFamilyName: data.claimFamilyName,
        existingFamilyName: data.existingFamilyName,
      })
      setFamilyLinkSuggestion(null)
      setStatus('success')
      setTimeout(() => { window.location.href = '/dashboard' }, 3000)
    } catch {
      setMessage('Something went wrong. Please try again.')
    } finally {
      setFamilyLinkSubmitting(false)
    }
  }

  // Post-claim: user can optionally supply a birth year that was missing from
  // their node. Updates the node directly (user now has RLS access as claimer).
  const handlePostClaimSave = async () => {
    const yr = pcBirthYear.trim()
    const birthYearNum = yr ? parseInt(yr, 10) : null
    if (yr && (Number.isNaN(birthYearNum!) || birthYearNum! < 1800 || birthYearNum! > new Date().getFullYear() + 1)) {
      setMessage('Please enter a valid birth year (e.g. 1985)')
      return
    }
    if (nodeClaim && birthYearNum !== null) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyClient = supabase.from('family_members') as any
      await anyClient.update({ birth_year: birthYearNum }).eq('id', nodeClaim.nodeId)
    }
    window.location.href = '/dashboard'
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

                {/* Privacy mode indicator */}
                {preview.privacyMode === 'closed' && (
                  <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-[11px] text-red-400 font-medium">
                    <Shield className="h-3 w-3" />
                    Private family — only members of this family can see its tree
                  </div>
                )}
                {preview.privacyMode === 'protected' && (
                  <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] text-amber-400 font-medium">
                    <Shield className="h-3 w-3" />
                    Protected family — join to see the full tree
                  </div>
                )}

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
                {preview.recentNames.length === 0 && preview.memberCount > 0 && (
                  <p className="mt-4 text-xs text-muted-foreground">
                    {preview.memberCount} member{preview.memberCount !== 1 ? 's' : ''} — join to see who's in the tree
                  </p>
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
                {/* Always show who invited them so the relation options make sense */}
                {preview.inviterName && (
                  <p className="text-xs text-muted-foreground mb-1">
                    Invited by <span className="font-semibold text-foreground">{preview.inviterName}</span>
                  </p>
                )}
                <h2 className="text-lg font-bold text-foreground">
                  What is your relation to{' '}
                  {preview.inviterName
                    ? <span className="text-primary">{preview.inviterName}</span>
                    : 'the person who invited you'}?
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  This places you correctly in the {preview.name} tree ✨
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
                      <p className="text-[10px] text-muted-foreground">{sublabel(preview.inviterName ?? 'the inviter')}</p>
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

              {/* Bug B: Cross-family join confirmation — user already has a claimed node
                  in another family and must explicitly confirm before we switch them. */}
              {crossFamilyJoinConfirm && (
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-4 space-y-3">
                  <p className="text-sm font-semibold text-amber-400">⚠️ You&apos;re already in another tree</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Your account is linked to <strong className="text-foreground">{crossFamilyJoinConfirm.existingNodeName || 'a profile'}</strong> in a different family tree.
                    Joining this tree will move your account here. Your data in the other tree stays intact — its members can still see it.
                  </p>
                  <div className="flex gap-2">
                    <button
                      className="flex-1 rounded-lg border border-border/60 bg-transparent py-2 text-xs font-medium text-muted-foreground hover:bg-muted/20"
                      onClick={() => setCrossFamilyJoinConfirm(null)}
                    >
                      Cancel
                    </button>
                    <button
                      className="flex-1 rounded-lg bg-amber-500 hover:bg-amber-600 py-2 text-xs font-medium text-white"
                      onClick={async () => {
                        const pending = crossFamilyJoinConfirm.claimIdPending
                        setCrossFamilyJoinConfirm(null)
                        setStatus('joining')
                        try {
                          const { data: { user } } = await supabase.auth.getUser()
                          if (!user) return
                          await joinWithCode(code, user.id, {
                            displayName: displayName.trim() || undefined,
                            relationshipToInviter: selectedRel ?? 'skip',
                            gender: selectedGender ?? undefined,
                            claimMemberId: pending ?? undefined,
                            confirmCrossFamily: true,
                          })
                          setStatus('success')
                          setTimeout(() => { window.location.href = '/dashboard' }, 2000)
                        } catch (err: unknown) {
                          setStatus('error')
                          setMessage(err instanceof Error ? err.message : 'Something went wrong')
                        }
                      }}
                    >
                      Switch &amp; Join
                    </button>
                  </div>
                </div>
              )}
              {scoredMatches.length > 0 ? (
                <>
                  <div className="text-center space-y-1">
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/30 mb-2">
                      <Sparkles className="h-5 w-5 text-amber-400" />
                    </div>
                    <h2 className="text-lg font-bold">Do you recognise yourself?</h2>
                    <p className="text-sm text-muted-foreground">
                      Someone added you to the tree before you signed up.
                    </p>
                  </div>

                  {/* Ranked candidates — show up to 3 */}
                  <div className="space-y-2">
                    {scoredMatches.slice(0, 3).map((match, idx) => {
                      const node = unclaimedNodes.find(n => n.id === match.nodeId)
                      if (!node) return null
                      return (
                        <button
                          key={node.id}
                          onClick={() => { setSelectedClaimId(selectedClaimId === node.id ? undefined : node.id); setConfirmedCreateNew(false) }}
                          className={cn(
                            'w-full flex items-center gap-3 rounded-2xl border-2 p-3 text-left transition-all',
                            selectedClaimId === node.id
                              ? 'border-primary bg-primary/5 shadow-sm shadow-primary/10'
                              : match.confidenceTier === 'high'
                                ? 'border-amber-500/50 bg-amber-500/5 hover:border-amber-500/70'
                                : match.confidenceTier === 'medium'
                                  ? 'border-border/60 bg-muted/20 hover:border-border/80'
                                  : 'border-border/30 bg-muted/10 hover:border-border/50'
                          )}
                        >
                          {/* Rank badge */}
                          <div className={cn(
                            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                            idx === 0 ? 'bg-amber-500/20 text-amber-400' :
                              idx === 1 ? 'bg-muted text-muted-foreground' :
                                'bg-muted/50 text-muted-foreground/60'
                          )}>
                            {idx + 1}
                          </div>
                          {/* Avatar */}
                          <div className={cn(
                            'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white',
                            idx === 0 ? 'bg-gradient-to-br from-indigo-500 to-violet-600' :
                              idx === 1 ? 'bg-gradient-to-br from-slate-500 to-slate-700' :
                                'bg-gradient-to-br from-slate-600 to-slate-800'
                          )}>
                            {node.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm truncate">{node.name}</p>
                            <p className="text-xs text-muted-foreground capitalize mt-0.5">
                              {node.relationship}{node.generation !== undefined ? ` · Gen ${node.generation}` : ''}
                            </p>
                            <span className={cn('mt-1 inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded border', tierColor(match.confidenceTier))}>
                              {tierLabel(match.confidenceTier)} match · {match.confidenceScore}pts
                            </span>
                          </div>
                          {selectedClaimId === node.id
                            ? <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                            : <div className="h-5 w-5 rounded-full border-2 border-border/50 shrink-0" />}
                        </button>
                      )
                    })}
                  </div>

                  {/* "That's not me" option — blocked when a high-confidence match exists.
                      Allowing "create new" for high-confidence matches would produce a
                      duplicate node. Users must claim the matched node or contact admin. */}
                  {isRecommendedClaimMatch(scoredMatches[0]) ? (
                    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-center space-y-1">
                      <Shield className="h-4 w-4 mx-auto text-amber-400 opacity-80" />
                      <p className="text-xs text-amber-400 leading-relaxed">
                        Based on your details, one of the profiles above likely represents you in this tree.
                        If none are correct, contact the family admin to add you separately.
                      </p>
                    </div>
                  ) : scoredMatches[0]?.confidenceTier === 'medium' ? (
                    /* Medium-confidence: show "create new" but require explicit confirmation */
                    <div className="space-y-2">
                      <button
                        onClick={() => { setSelectedClaimId(null); setConfirmedCreateNew(false) }}
                        className={cn(
                          'w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-all',
                          selectedClaimId === null
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border/30 bg-muted/10 hover:border-border/50'
                        )}
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          <UserPlus className="h-4 w-4" />
                        </div>
                        <p className="flex-1 text-sm font-medium text-muted-foreground">
                          None of these are me — create a new profile
                        </p>
                        {selectedClaimId === null && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                      </button>
                      {/* Confirmation required for medium matches to prevent accidental duplicates */}
                      {selectedClaimId === null && (
                        <label className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={confirmedCreateNew}
                            onChange={e => setConfirmedCreateNew(e.target.checked)}
                            className="mt-0.5 h-4 w-4 accent-amber-500"
                          />
                          <p className="text-xs text-amber-400 leading-relaxed">
                            I confirm that the profiles shown above are not me, and I understand
                            that creating a duplicate profile may need to be merged later.
                          </p>
                        </label>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => setSelectedClaimId(null)}
                      className={cn(
                        'w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-all',
                        selectedClaimId === null
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border/30 bg-muted/10 hover:border-border/50'
                      )}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <UserPlus className="h-4 w-4" />
                      </div>
                      <p className="flex-1 text-sm font-medium text-muted-foreground">
                        None of these are me — create a new profile
                      </p>
                      {selectedClaimId === null && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                    </button>
                  )}

                  {/* Name + gender when creating new — only relevant for low-confidence matches */}
                  {!FEATURE_FLAGS.enableInviteRelationshipStep && selectedClaimId === null && !isRecommendedClaimMatch(scoredMatches[0]) && (
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
                      <div className="flex gap-2">
                        {(['male', 'female', 'other'] as const).map(g => (
                          <button key={g} type="button"
                            onClick={() => setSelectedGender(prev => prev === g ? null : g)}
                            className={cn('flex-1 rounded-lg border py-2 text-xs font-medium transition-all',
                              selectedGender === g ? 'border-primary bg-primary/10 text-primary' : 'border-border/50 bg-muted/20 text-muted-foreground hover:border-border/70'
                            )}>
                            {g === 'male' ? '♂ Male' : g === 'female' ? '♀ Female' : '⚥ Other'}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedClaimId === undefined && (
                    <p className="text-center text-xs text-muted-foreground">
                      {isRecommendedClaimMatch(scoredMatches[0])
                        ? 'Tap the profile above that represents you in the family tree.'
                        : 'Select your profile above, or choose "None of these are me".'}
                    </p>
                  )}

                  <div className="flex gap-3">
                    <Button variant="outline"
                      onClick={() => setStatus(FEATURE_FLAGS.enableInviteRelationshipStep ? 'relate' : 'preview')}
                      className="flex-1 h-11">Back</Button>
                    <Button
                      onClick={() => handleJoin(selectedClaimId ?? null)}
                      disabled={
                        selectedClaimId === undefined ||
                        (selectedClaimId === null && !FEATURE_FLAGS.enableInviteRelationshipStep && !displayName.trim()) ||
                        (selectedClaimId === null && scoredMatches.length > 0 && isRecommendedClaimMatch(scoredMatches[0])) ||
                        (selectedClaimId === null && scoredMatches.length > 0 && scoredMatches[0].confidenceTier === 'medium' && !confirmedCreateNew)
                      }
                      className="flex-1 h-11 bg-primary hover:bg-primary/90"
                    >
                      {selectedClaimId ? 'Claim & Join' : 'Create & Join'}
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </>
              ) : (
                /* Case B: no scored matches — new member joining */
                <>
                  <div className="text-center">
                    <h2 className="text-lg font-bold">Join the family tree</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      You'll be added as a new member. Connections can be set later.
                    </p>
                  </div>

                  {!FEATURE_FLAGS.enableInviteRelationshipStep && (
                    <div className="space-y-3 rounded-xl border border-border/40 bg-muted/10 p-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Your name</label>
                        <Input
                          placeholder="Your full name"
                          value={displayName}
                          onChange={e => setDisplayName(e.target.value)}
                          className="h-10 bg-background/60 border-border"
                          autoFocus
                        />
                      </div>
                      <div className="flex gap-2">
                        {(['male', 'female', 'other'] as const).map(g => (
                          <button key={g} type="button"
                            onClick={() => setSelectedGender(prev => prev === g ? null : g)}
                            className={cn('flex-1 rounded-lg border py-2 text-xs font-medium transition-all',
                              selectedGender === g ? 'border-primary bg-primary/10 text-primary' : 'border-border/50 bg-muted/20 text-muted-foreground hover:border-border/70'
                            )}>
                            {g === 'male' ? '♂ Male' : g === 'female' ? '♀ Female' : '⚥ Other'}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <Button variant="outline"
                      onClick={() => setStatus(FEATURE_FLAGS.enableInviteRelationshipStep ? 'relate' : 'preview')}
                      className="flex-1 h-11">Back</Button>
                    <Button
                      onClick={() => { setSelectedClaimId(null); handleJoin(null) }}
                      disabled={!FEATURE_FLAGS.enableInviteRelationshipStep && !displayName.trim()}
                      className="flex-1 h-11 bg-primary hover:bg-primary/90"
                    >
                      Join Family Tree
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Node Claim Confirmation (B2) ──────────────────── */}
          {status === 'node_claim' && nodeClaim && (
            <div className="p-6 space-y-5">
              <div className="text-center">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 border border-blue-500/30 mb-3">
                  <Shield className="h-5 w-5 text-blue-400" />
                </div>
                <h2 className="text-lg font-bold">Is this you?</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {preview?.inviterName
                    ? <><strong className="text-foreground">{preview.inviterName}</strong> added you to the{' '}
                      <strong className="text-foreground">{preview?.name ?? 'family'}</strong> tree and sent you this link.</>
                    : 'Someone added you to this family tree and sent you this link to claim your profile.'}
                </p>
              </div>

              {/* What you get by claiming */}
              <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 space-y-1.5">
                <p className="text-[10px] font-semibold text-primary/70 uppercase tracking-wide">Once you claim your profile</p>
                <ul className="space-y-1">
                  {[
                    '✏️  Edit your own bio, photo & details',
                    '👁  Control who can see your profile',
                    '🌿  Add your spouse, children & relatives',
                    '🔔  Get birthday & family update notifications',
                  ].map(t => (
                    <li key={t} className="text-xs text-muted-foreground">{t}</li>
                  ))}
                </ul>
              </div>

              {/* Profile identity card */}
              <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white text-base font-bold">
                    {(nodeClaim.identityHint ?? '?').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="space-y-0.5">
                    <p className="font-bold text-foreground text-base leading-tight">
                      {nodeClaim.identityHint ?? 'Unknown'}
                    </p>
                    {nodeClaim.parentNames.length > 0 && (
                      <p className="text-sm text-muted-foreground">
                        Child of {nodeClaim.parentNames.join(' & ')}
                      </p>
                    )}
                    {nodeClaim.birthYear && (
                      <p className="text-xs text-muted-foreground">Born {nodeClaim.birthYear}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Birth year</label>
                <Input
                  type="number"
                  placeholder={String(nodeClaim.birthYear ?? nodeClaim.birthYearHint ?? 'e.g. 1985')}
                  inputMode="numeric"
                  min={1800}
                  max={new Date().getFullYear()}
                  maxLength={4}
                  value={ncBirthYear}
                  onChange={e => { setNcBirthYear(e.target.value.replace(/\D/g, '')); setMessage('') }}
                  className="h-10 bg-muted/50 border-border"
                />
                <p className="text-[11px] text-muted-foreground">
                  Enter your birth year to verify and claim this profile.
                </p>
              </div>

              {message && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-xs text-destructive">
                  {message}
                </div>
              )}

              {/* ── Two-tree connection suggestion ── */}
              {familyLinkSuggestion && (
                <div className="rounded-xl bg-indigo-500/10 border border-indigo-500/30 p-4 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/20">
                      <GitBranch className="h-4 w-4 text-indigo-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-indigo-300">Link both family trees</p>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        Your account is already linked to{' '}
                        <strong className="text-foreground">{familyLinkSuggestion.existingNodeName}</strong>{' '}
                        in the <strong className="text-foreground">{familyLinkSuggestion.existingFamilyName}</strong> tree.
                        Instead of claiming a separate profile, you can link both trees together —
                        your profile will serve as the bridge connecting the two.
                      </p>
                    </div>
                  </div>
                  <ul className="space-y-1 pl-1">
                    {[
                      '🌳  Both trees stay intact — no data is lost',
                      '🔗  Members from both trees will appear linked',
                      `🪢  The "${familyLinkSuggestion.targetFamilyName}" tree will see your tree as connected relatives`,
                    ].map(t => (
                      <li key={t} className="text-xs text-muted-foreground">{t}</li>
                    ))}
                  </ul>
                  {message && (
                    <p className="text-xs text-destructive">{message}</p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => { setFamilyLinkSuggestion(null); setMessage('') }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5"
                      onClick={handleConnectFamilies}
                      disabled={familyLinkSubmitting}
                    >
                      {familyLinkSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitBranch className="h-3.5 w-3.5" />}
                      Connect Families
                    </Button>
                  </div>
                </div>
              )}

              {/* ── Cross-family confirmation ── */}
              {!familyLinkSuggestion && crossFamilyConfirmData ? (
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-4 space-y-3">
                  <p className="text-sm font-semibold text-amber-400">⚠️ You&apos;re in a different tree</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Your account is currently linked to the <strong className="text-foreground">{crossFamilyConfirmData.currentFamilyName}</strong> tree.
                    Claiming this profile will switch you to the <strong className="text-foreground">{crossFamilyConfirmData.targetFamilyName}</strong> tree.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Your data in the other tree stays intact — its members can still see it.
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => setCrossFamilyConfirmData(null)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 bg-amber-500 hover:bg-amber-600 text-white"
                      onClick={() => { setCrossFamilyConfirmData(null); handleNodeClaim(true) }}
                    >
                      Switch &amp; Claim
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="rounded-xl bg-blue-500/5 border border-blue-500/20 p-3 text-xs text-muted-foreground">
                    <Shield className="inline h-3.5 w-3.5 mr-1 text-blue-400" />
                    Claiming links your account to this profile. You can update your name and details after joining.
                  </div>

                  <Button
                    onClick={() => handleNodeClaim()}
                    className="w-full h-11 bg-primary hover:bg-primary/90"
                  >
                    {isAuthed ? "Yes, that's me — Claim this profile" : 'Sign in & Claim'}
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>

                  <p className="text-center text-xs text-muted-foreground">
                    Not you? Contact the person who sent this invite.
                  </p>
                </>
              )}
            </div>
          )}

          {/* ── Post-claim: fill in missing birth year ────────── */}
          {status === 'post_claim' && nodeClaim && (
            <div className="p-6 space-y-5">
              <div className="text-center">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-green-500/10 border border-green-500/30 mb-3">
                  <CheckCircle2 className="h-5 w-5 text-green-400" />
                </div>
                <h2 className="text-lg font-bold">You're in! 🎉</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  One quick thing — your birth year isn't on the tree yet.
                  Adding it helps family members find and identify you.
                </p>
              </div>

              {/* Claimed node mini-card */}
              <div className="rounded-2xl border border-border/50 bg-muted/30 p-3 flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white text-sm font-bold">
                  {(nodeClaim.identityHint ?? '?').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-sm leading-tight">{nodeClaim.identityHint}</p>
                  <p className="text-xs text-green-500">Profile claimed ✓</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Your birth year</label>
                <Input
                  placeholder="e.g. 1985"
                  inputMode="numeric"
                  maxLength={4}
                  value={pcBirthYear}
                  onChange={e => { setPcBirthYear(e.target.value.replace(/\D/g, '')); setMessage('') }}
                  className="h-10 bg-muted/50 border-border"
                  autoFocus
                />
                {message && <p className="text-xs text-destructive mt-1">{message}</p>}
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => { window.location.href = '/dashboard' }}
                  className="flex-1 h-11"
                >
                  Skip for now
                </Button>
                <Button
                  onClick={handlePostClaimSave}
                  disabled={!pcBirthYear.trim()}
                  className="flex-1 h-11 bg-primary hover:bg-primary/90"
                >
                  Save & Continue
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
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
              {familyLinkResult ? (
                <>
                  <h1 className="text-xl font-bold">Trees linked! 🌳</h1>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {familyLinkResult.autoAccepted
                      ? <>The <strong>{familyLinkResult.existingFamilyName}</strong> and <strong>{familyLinkResult.claimFamilyName}</strong> trees are now linked. Members from both trees will appear connected.</>
                      : <>A connection request has been sent to the admins of <strong>{familyLinkResult.existingFamilyName}</strong>. Once accepted, both trees will be linked.</>}
                  </p>
                </>
              ) : (
                <>
                  <h1 className="text-xl font-bold">Welcome to the family! 🙏</h1>
                  <p className="text-muted-foreground text-sm">
                    {selectedRel && selectedRel !== 'skip'
                      ? `You're now connected as ${preview?.inviterName ? `${preview.inviterName}'s ${selectedRel}` : 'a family member'} in the tree.`
                      : 'Redirecting to your family tree…'}
                  </p>
                </>
              )}
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
