import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { ClaimStatus } from '@/lib/claim-state-machine'
import { levenshtein } from '@/lib/utils'

// ─── Supabase helpers ────────────────────────────────────────────────────────

function getSupabaseConfig(kind: 'admin' | 'anon') {
  const urlCandidate = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const keyCandidate = kind === 'admin'
    ? (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY)
    : (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY)

  const missing: string[] = []
  if (!urlCandidate) missing.push('NEXT_PUBLIC_SUPABASE_URL(or SUPABASE_URL)')
  if (!keyCandidate) {
    missing.push(
      kind === 'admin'
        ? 'SUPABASE_SERVICE_ROLE_KEY(or SUPABASE_SERVICE_KEY)'
        : 'NEXT_PUBLIC_SUPABASE_ANON_KEY(or SUPABASE_ANON_KEY)'
    )
  }
  if (missing.length > 0) {
    throw new Error(`CONFIG_ERROR: Missing ${missing.join(', ')}`)
  }
  const url = urlCandidate as string
  const key = keyCandidate as string
  return { url, key }
}

function adminClient() {
  const { url, key } = getSupabaseConfig('admin')
  return createServerClient(
    url,
    key,
    { cookies: { getAll: () => [], setAll: () => { } }, auth: { persistSession: false } }
  )
}

async function authedClient() {
  const { url, key } = getSupabaseConfig('anon')
  const cs = await cookies()
  return createServerClient(
    url,
    key,
    {
      cookies: {
        getAll: () => cs.getAll(),
        setAll: (c: Array<{ name: string; value: string; options: any }>) => {
          try { c.forEach(({ name, value, options }) => cs.set(name, value, options)) } catch { }
        },
      },
    }
  )
}

// ─── Identity scoring ────────────────────────────────────────────────────────

function scoreIdentity(
  nodeName: string,
  nodeBirthYear: number | null,
  submittedName: string,
  submittedBirthYear: number | null
): { score: number; reasons: string[]; mismatches: string[] } {
  let score = 0
  const reasons: string[] = []
  const mismatches: string[] = []

  const a = nodeName.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()
  const b = submittedName.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()

  if (a && b) {
    if (a === b) {
      // Perfect full-name match
      score += 60; reasons.push('name')
    } else if (levenshtein(a, b) <= 2 && Math.max(a.length, b.length) >= 4) {
      // Minor typo / transliteration difference
      score += 45; reasons.push('name_fuzzy')
    } else {
      // First-name-only match (handles "Rahul" vs "Rahul Sharma" or vice-versa)
      const aFirst = a.split(' ')[0]
      const bFirst = b.split(' ')[0]
      if (aFirst.length >= 3 && aFirst === bFirst) {
        score += 30; reasons.push('name_partial')
      } else {
        mismatches.push('name')
      }
    }
  }

  if (nodeBirthYear && submittedBirthYear) {
    const diff = Math.abs(nodeBirthYear - submittedBirthYear)
    if (diff === 0) {
      score += 40; reasons.push('birth_year_exact')
    } else if (diff <= 2) {
      score += 25; reasons.push('birth_year_approx')
    } else {
      mismatches.push('birth_year')
    }
  }

  return { score: Math.min(100, score), reasons, mismatches }
}

// ─── POST /api/nodes/[id]/claim ───────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: nodeId } = await params
    const supabase = await authedClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED', message: 'Your session has expired. Please sign in and try the invite link again.' }, { status: 401 })
    let body: {
      submittedName?: string
      submittedBirthYear?: number | null
      intentToken?: string
      isGuardianClaim?: boolean
      inviteCode?: string
      confirmCrossFamily?: boolean
    }
    try { body = await req.json() } catch {
      return NextResponse.json({ error: 'INVALID_REQUEST', message: 'The request body could not be parsed. Please try again.' }, { status: 400 })
    }

    const { submittedName, submittedBirthYear, intentToken, isGuardianClaim, inviteCode, confirmCrossFamily } = body
    if (!submittedName?.trim()) {
      return NextResponse.json({ error: 'MISSING_NAME', message: 'A name is required to claim this profile.' }, { status: 400 })
    }
    // Bounds-check to prevent O(m*n) Levenshtein DoS
    if (submittedName.length > 200) {
      return NextResponse.json({ error: 'INVALID_NAME', message: 'The name provided is too long.' }, { status: 400 })
    }
    // Allow null (means «not provided»); only validate when an actual value is sent
    if (submittedBirthYear !== undefined && submittedBirthYear !== null) {
      const currentYear = new Date().getFullYear()
      if (typeof submittedBirthYear !== 'number' || submittedBirthYear < 1800 || submittedBirthYear > currentYear) {
        return NextResponse.json({ error: 'INVALID_BIRTH_YEAR', message: `Please enter a valid birth year (1800–${currentYear}).` }, { status: 400 })
      }
    }

    const admin = adminClient()

    // Fetch node — intentionally does NOT select normalized_phone here so that
    // a missing migration (018_phone_auth) doesn't block the entire claim flow.
    // The phone-bypass check does a separate targeted query below.
    const { data: node, error: nodeErr } = await admin
      .from('family_members')
      .select('id, name, birth_year, claim_status, is_deceased, family_id')
      .eq('id', nodeId)
      .single()

    if (nodeErr) {
      const dbMsg = nodeErr.message ?? ''
      console.error('[claim] family_members lookup failed — nodeId:', nodeId, 'error:', dbMsg)
      // PGRST116 = "no rows" — the node genuinely does not exist
      if ((nodeErr as any).code === 'PGRST116') {
        return NextResponse.json(
          { error: 'NODE_NOT_FOUND', message: 'This profile does not exist in the family tree. The invite link may be stale — ask the family admin to send a fresh invite.' },
          { status: 404 }
        )
      }
      // Schema gap: a column we SELECT doesn't exist yet in this deployment
      if (/column .* does not exist|does not exist/i.test(dbMsg)) {
        return NextResponse.json(
          { error: 'SCHEMA_ERROR', message: 'Server schema is out of date. Please ask the family admin to run the latest Supabase migrations.' },
          { status: 500 }
        )
      }
      // Any other DB error (network, RLS misconfiguration, etc.)
      return NextResponse.json(
        { error: 'NODE_QUERY_FAILED', message: 'Could not load this profile right now. Please try again in a moment.' },
        { status: 500 }
      )
    }
    if (!node) {
      return NextResponse.json(
        { error: 'NODE_NOT_FOUND', message: 'This profile does not exist in the family tree. The invite link may be stale — ask the family admin to send a fresh invite.' },
        { status: 404 }
      )
    }

    // B1: Family boundary check. A user may only claim a node if EITHER (a) they
    // already belong to the same family, OR (b) an active, unconsumed, non-expired
    // node_claim invite exists for this specific node, OR (c) the node's
    // normalized_phone exactly matches the caller's verified phone number
    // (allows phone-onboarding users to claim their profile without an invite).
    // Otherwise reject.
    const { data: callerProfile } = await admin
      .from('profiles')
      .select('family_id')
      .eq('id', user.id)
      .maybeSingle()
    const callerFamilyId = (callerProfile as any)?.family_id as string | null

    let authorized = callerFamilyId && callerFamilyId === (node as any).family_id
    // Track whether auth came from a node_claim invite — used below to skip
    // identity scoring (admin's explicit invitation is sufficient verification).
    let authorizedViaNodeClaimInvite = false
    let activeNodeClaimInvite: {
      id: string
      birth_year_hint?: number | null
    } | null = null
    if (!authorized) {
      // SECURITY: An invite code is mandatory for cross-family claims.
      // Without a code we cannot verify the caller was the intended recipient —
      // any user who discovers a nodeId could otherwise claim it as long as any
      // outstanding invite exists for that node. Require the explicit code so
      // that only the person who received the specific invite link can proceed.
      if (!inviteCode?.trim()) {
        // No code supplied — skip invite-based auth entirely.
        // Phone-number bypass (gate C below) is still evaluated.
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const inviteQ = admin.from('invite_links') as any
        const claimInviteQuery = inviteQ
          .select('id, consumed_at, expires_at, family_id, invite_type, node_id, birth_year_hint, code')
          .eq('node_id', nodeId)
          .eq('invite_type', 'node_claim')
          .is('consumed_at', null)
          .eq('family_id', (node as any).family_id)
          .eq('code', inviteCode.trim().toUpperCase())
        const { data: inviteRows, error: claimInviteErr } = await claimInviteQuery
          .order('created_at', { ascending: false })
          .limit(5)
        if (claimInviteErr) {
          return NextResponse.json(
            { error: 'INVITE_LOOKUP_FAILED', message: 'Could not verify this invite right now. Please try again in a minute.' },
            { status: 500 }
          )
        }
        const now = Date.now()
        const claimInvite = (inviteRows ?? []).find((row: any) => {
          if (!row.expires_at) return true
          return new Date(row.expires_at).getTime() > now
        })
        if (claimInvite) {
          authorized = true
          authorizedViaNodeClaimInvite = true
          activeNodeClaimInvite = claimInvite
        } else {
          // Code was provided but no active invite matched — look up the code
          // specifically to return a precise error (expired / consumed / wrong node).
          const { data: suppliedInvite } = await inviteQ
            .select('id, consumed_at, expires_at, node_id, family_id, invite_type')
            .eq('code', inviteCode.trim().toUpperCase())
            .maybeSingle()
          if (suppliedInvite) {
            if ((suppliedInvite as any).invite_type !== 'node_claim') {
              return NextResponse.json(
                { error: 'INVALID_INVITE_TYPE', message: 'This invite cannot be used to claim a profile.' },
                { status: 422 }
              )
            }
            if ((suppliedInvite as any).node_id !== nodeId || (suppliedInvite as any).family_id !== (node as any).family_id) {
              return NextResponse.json(
                { error: 'INVITE_NODE_MISMATCH', message: 'This invite is for a different profile. Please open the exact invite link shared with you.' },
                { status: 422 }
              )
            }
            if ((suppliedInvite as any).consumed_at) {
              return NextResponse.json(
                { error: 'INVITE_ALREADY_USED', message: 'This invite has already been used. Ask the family admin to send a fresh invite.' },
                { status: 410 }
              )
            }
            if ((suppliedInvite as any).expires_at && new Date((suppliedInvite as any).expires_at).getTime() <= now) {
              return NextResponse.json(
                { error: 'INVITE_EXPIRED', message: 'This invite has expired. Ask the family admin to refresh it.' },
                { status: 410 }
              )
            }
          }
        }
      }
    }
    // (c) Phone-number match bypass: node.normalized_phone === user.phone
    // user.phone is the E.164 number verified by Supabase OTP — high confidence.
    // Uses a separate query so that if migration 018_phone_auth hasn't been applied
    // (column doesn't exist) the rest of the claim flow continues unaffected.
    if (!authorized && user.phone) {
      try {
        const { data: phoneRow } = await admin
          .from('family_members')
          .select('normalized_phone')
          .eq('id', nodeId)
          .maybeSingle()
        const nodePhone = (phoneRow as any)?.normalized_phone as string | null
        if (nodePhone && nodePhone === user.phone) authorized = true
      } catch { /* normalized_phone column not yet present — skip phone bypass */ }
    }
    if (!authorized) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'You are not authorized to claim this profile.' },
        { status: 403 }
      )
    }

    // C1: Cross-family switch guard.
    // If the claimer already belongs to a DIFFERENT family, require explicit
    // confirmation before switching. Without this, a user who accidentally created
    // their own tree would silently lose access to it when claiming via invite.
    // The join page shows a confirmation dialog and re-sends with confirmCrossFamily=true.
    const isCrossFamily = !!(callerFamilyId && callerFamilyId !== (node as any).family_id)
    if (isCrossFamily && !confirmCrossFamily) {
      const [{ data: currentFamily }, { data: targetFamily }] = await Promise.all([
        admin.from('families').select('name').eq('id', callerFamilyId!).maybeSingle() as any,
        admin.from('families').select('name').eq('id', (node as any).family_id).maybeSingle() as any,
      ])
      return NextResponse.json({
        error: 'CROSS_FAMILY_CLAIM',
        currentFamilyId: callerFamilyId,
        currentFamilyName: (currentFamily as any)?.name ?? 'your current family',
        targetFamilyName: (targetFamily as any)?.name ?? 'the new family',
        message: `You\'re currently a member of \"${(currentFamily as any)?.name ?? 'another family'}\". Claiming this profile will move your account to \"${(targetFamily as any)?.name ?? 'the new family'}\".`,
      }, { status: 409 })
    }
    // B4: One account can be linked to only one active primary node globally.
    // Auto-heal stale links first (e.g. after admin revoke that didn't fully clean up)
    // before hard-blocking — avoids permanently locking out users after a revoke.
    const { data: profileLink } = await admin
      .from('profiles')
      .select('member_id')
      .eq('id', user.id)
      .maybeSingle()
    const profileMemberId = (profileLink as any)?.member_id as string | null
    if (profileMemberId && profileMemberId !== nodeId) {
      // Check if the stale link is still actively claimed by this user.
      const { data: staleMemberNode } = await admin
        .from('family_members')
        .select('is_claimed, claimed_by_user_id')
        .eq('id', profileMemberId)
        .maybeSingle()
      const isStale = !staleMemberNode ||
        !(staleMemberNode as any).is_claimed ||
        (staleMemberNode as any).claimed_by_user_id !== user.id
      if (isStale) {
        // Auto-heal: clear the stale member_id so the claim can proceed.
        await admin.from('profiles').update({ member_id: null } as any).eq('id', user.id)
      } else {
        return NextResponse.json(
          {
            error: 'ALREADY_LINKED_ACCOUNT',
            claimedNodeId: profileMemberId,
            message: 'This account is already linked to another profile. Unclaim that profile first to switch.',
          },
          { status: 409 }
        )
      }
    }

    const { data: existingLink } = await admin
      .from('user_node_links')
      .select('node_id')
      .eq('user_id', user.id)
      .neq('node_id', nodeId)
      .maybeSingle()
    if (existingLink) {
      // Check if the stale link is still actively claimed by this user.
      const { data: staleLinkedNode } = await admin
        .from('family_members')
        .select('is_claimed, claimed_by_user_id')
        .eq('id', (existingLink as any).node_id)
        .maybeSingle()
      const isStale = !staleLinkedNode ||
        !(staleLinkedNode as any).is_claimed ||
        (staleLinkedNode as any).claimed_by_user_id !== user.id
      if (isStale) {
        // Auto-heal: remove the stale link so the claim can proceed.
        await admin.from('user_node_links').delete().eq('user_id', user.id).eq('node_id', (existingLink as any).node_id)
      } else {
        return NextResponse.json(
          {
            error: 'ALREADY_LINKED_ACCOUNT',
            claimedNodeId: (existingLink as any).node_id,
            message: 'This account is already linked to another profile. Unclaim that profile first to switch.',
          },
          { status: 409 }
        )
      }
    }

    const ns = node.claim_status as ClaimStatus
    if ((node as any).is_deceased) {
      return NextResponse.json(
        { error: 'NODE_DECEASED', message: 'This profile is marked as deceased. Contact the tree owner.' },
        { status: 409 }
      )
    }
    // Only block re-claim on revoked nodes when there is no valid node_claim invite.
    // When an admin re-sends an invite after revoking, authorizedViaNodeClaimInvite
    // is true — that explicit act of re-inviting means the admin wants to allow
    // the person to reclaim, so we skip the revoke wall.
    if (ns === 'revoked' && !authorizedViaNodeClaimInvite) {
      return NextResponse.json(
        { error: 'NODE_REVOKED', message: 'This profile was revoked by an admin. Contact the family admin to have access reinstated.' },
        { status: 409 }
      )
    }
    if (ns === 'claimed') return NextResponse.json({ error: 'ALREADY_CLAIMED', message: 'This profile has already been claimed by someone else. If this is a mistake, ask the family admin to release the claim.' }, { status: 409 })

    // Check for pending claim by a different user
    const { data: rivalClaim } = await admin
      .from('claim_requests')
      .select('id')
      .eq('node_id', nodeId)
      .eq('status', 'pending')
      .neq('claimant_user_id', user.id)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()
    if (rivalClaim) {
      return NextResponse.json(
        { error: 'CLAIM_PENDING_ANOTHER_USER', message: 'This profile has a pending claim from another user.' },
        { status: 409 }
      )
    }

    // Rate limit: 5 claim attempts per user per hour
    const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString()
    const { count: recentAttempts } = await admin
      .from('claim_requests')
      .select('*', { count: 'exact', head: true })
      .eq('claimant_user_id', user.id)
      .gt('created_at', oneHourAgo)
    if ((recentAttempts ?? 0) >= 5) {
      return NextResponse.json({ error: 'RATE_LIMITED', retryAfter: 3600, message: 'Too many claim attempts in the last hour. Please wait 1 hour and try again.' }, { status: 429 })
    }

    // Check existing claim request for lockout
    const { data: myRequest } = await admin
      .from('claim_requests')
      .select('attempts, locked_until')
      .eq('node_id', nodeId)
      .eq('claimant_user_id', user.id)
      .maybeSingle()

    if (myRequest?.locked_until && new Date(myRequest.locked_until) > new Date()) {
      return NextResponse.json(
        { error: 'LOCKED_OUT', lockedUntil: myRequest.locked_until, message: 'Too many failed attempts. This profile is locked for 24 hours. Ask the family admin to reset the lock if needed.' },
        { status: 423 }
      )
    }

    // Score identity. node_claim invites skip scoring entirely — the admin
    // explicitly identified this person when creating the invite. Scoring only
    // applies to self-service claims initiated from within the family tree.
    const nodeBY = (node as any).birth_year ?? null
    // Invite-based claims require an exact DOB match when the tree already has
    // a DOB (or an inviter provided DOB hint). This gives a clear explanation
    // instead of falling back to a generic error.
    const inviteExpectedBirthYear = nodeBY ?? (activeNodeClaimInvite?.birth_year_hint ?? null)
    if (authorizedViaNodeClaimInvite && inviteExpectedBirthYear !== null) {
      if (submittedBirthYear === undefined || submittedBirthYear === null) {
        return NextResponse.json(
          {
            error: 'MISSING_BIRTH_YEAR',
            message: 'Please enter your birth year to verify this invite.',
          },
          { status: 422 }
        )
      }
      if (submittedBirthYear !== inviteExpectedBirthYear) {
        return NextResponse.json(
          {
            error: 'DOB_MISMATCH_INVITE',
            message: 'Birth year does not match this invited profile. Please check with the family admin.',
          },
          { status: 422 }
        )
      }
    }
    const { score, reasons, mismatches } = authorizedViaNodeClaimInvite
      ? { score: 100, reasons: ['node_claim_invite'], mismatches: [] as string[] }
      : scoreIdentity(node.name, nodeBY, submittedName, submittedBirthYear ?? null)

    const attempts = (myRequest?.attempts ?? 0) + 1
    const MAX_ATTEMPTS = 3
    const lockedUntil =
      attempts >= MAX_ATTEMPTS ? new Date(Date.now() + 86_400_000).toISOString() : null

    // Identity check — only enforced for self-service (non-invite) claims.
    if (!authorizedViaNodeClaimInvite && (mismatches.includes('name') || score < 40)) {
      await admin.from('claim_requests').upsert(
        {
          node_id: nodeId,
          claimant_user_id: user.id,
          status: 'pending',
          submitted_name: submittedName,
          submitted_birth_year: submittedBirthYear ?? null,
          confidence_score: score,
          attempts,
          locked_until: lockedUntil,
          updated_at: new Date().toISOString(),
          ...(intentToken ? { intent_token: intentToken } : {}),
        },
        { onConflict: 'node_id,claimant_user_id' }
      )
      return NextResponse.json(
        {
          error: 'IDENTITY_MISMATCH',
          mismatchFields: mismatches,
          attemptsLeft: Math.max(0, MAX_ATTEMPTS - attempts),
          lockedUntil,
          message: [
            mismatches.includes('name') ? 'Name does not match.' : '',
            mismatches.includes('birth_year') ? 'Birth year does not match.' : '',
          ].filter(Boolean).join(' ') || 'Identity verification failed.',
        },
        { status: 422 }
      )
    }

    // Success path — for MVP, auto-approve all identity-verified claims.
    // The claim review queue (admin approval) is reserved for edge cases flagged
    // by external signals. requiresReview=false means instant claim.
    const requiresReview = false
    const newStatus = 'claimed'

    const { data: upsertedReq, error: upsertReqErr } = await admin.from('claim_requests').upsert(
      {
        node_id: nodeId,
        claimant_user_id: user.id,
        status: 'verified',
        submitted_name: submittedName,
        submitted_birth_year: submittedBirthYear ?? null,
        confidence_score: score,
        attempts,
        locked_until: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'node_id,claimant_user_id' }
    ).select('id').single()

    // Handle race condition where another user's claim triggered the unique constraint
    if (upsertReqErr) {
      // 23505 = unique_violation: one-pending-per-node constraint fired, meaning
      // another user already holds a pending/verified claim on this node.
      if (upsertReqErr.code === '23505') {
        return NextResponse.json(
          {
            error: 'CLAIM_PENDING_ANOTHER_USER',
            message: 'Another user is already claiming this profile. Please wait for their claim to be reviewed or contact a family admin.',
          },
          { status: 409 }
        )
      }
      return NextResponse.json(
        { error: 'CLAIM_REQUEST_WRITE_FAILED', message: 'Could not record your claim request. Please try again.' },
        { status: 500 }
      )
    }

    // Update node state — optimistic lock ensures only one simultaneous claimant wins.
    // Two concurrent requests may both pass the identity-scoring check above, but only
    // the one that atomically flips is_claimed from false→true gets a returned row.
    // The second writer finds is_claimed=true and receives ALREADY_CLAIMED (409).
    const memberUpdate: Record<string, unknown> = {
      claim_status: newStatus,
      is_claimed: true,
      claimed_by_user_id: user.id,
      claimed_at: new Date().toISOString(),
    }
    if (!nodeBY && submittedBirthYear !== undefined && submittedBirthYear !== null) {
      memberUpdate.birth_year = submittedBirthYear
    }
    if (isGuardianClaim) memberUpdate.guardian_user_id = user.id

    const { data: claimUpdate, error: claimUpdateErr } = await admin
      .from('family_members')
      .update(memberUpdate as any)
      .eq('id', nodeId)
      .eq('is_claimed', false)   // ← race-safe optimistic lock
      .select('id')

    if (claimUpdateErr) {
      const dbMsg = claimUpdateErr.message || ''
      const message =
        /identity_state|column .* does not exist/i.test(dbMsg)
          ? 'Server schema is out of date. Please ask admin to run latest Supabase migrations (including migration 024).'
          : 'Could not finalize this claim. Please try again.'
      return NextResponse.json(
        { error: 'CLAIM_UPDATE_FAILED', message },
        { status: 500 }
      )
    }

    if (!(claimUpdate as any[])?.length) {
      return NextResponse.json(
        { error: 'ALREADY_CLAIMED', message: 'This profile was just claimed by someone else.' },
        { status: 409 }
      )
    }

    // Audit
    await admin.from('claim_audit_log').insert({
      node_id: nodeId,
      family_id: (node as any).family_id,
      actor_id: user.id,
      action: 'claim_completed',
      metadata: { score, reasons, requiresReview: false },
    })

    // Link user → node (always for MVP auto-approve flow)
    const { error: linkErr } = await admin.from('user_node_links').upsert(
      { user_id: user.id, node_id: nodeId, family_id: (node as any).family_id, is_primary: true },
      { onConflict: 'user_id,node_id' }
    )
    if (linkErr) {
      return NextResponse.json(
        { error: 'LINK_WRITE_FAILED', message: 'Your claim was verified but account linking failed. Please contact the family admin.' },
        { status: 500 }
      )
    }

    // Set member_id, family_id, and role server-side so the user is immediately
    // recognised as a contributor even if the client-side profile update fails.
    const { error: profileUpdateErr } = await admin.from('profiles').update({
      member_id: nodeId,
      family_id: (node as any).family_id,
      role: 'contributor',
    } as any).eq('id', user.id)
    if (profileUpdateErr) {
      return NextResponse.json(
        { error: 'PROFILE_UPDATE_FAILED', message: 'Your claim was verified but profile linking failed. Please contact the family admin.' },
        { status: 500 }
      )
    }

    // Consume the single-use invite atomically on the server side.
    // Doing this here (rather than client-side) prevents a race condition where
    // two simultaneous requests both succeed before either consumes the invite.
    if (inviteCode && authorizedViaNodeClaimInvite) {
      await (admin.from('invite_links') as any)
        .update({ consumed_at: new Date().toISOString(), used_count: 1 })
        .eq('code', inviteCode.trim().toUpperCase())
        .is('consumed_at', null)
        .eq('node_id', nodeId)
    }

    return NextResponse.json({
      status: newStatus,
      confidenceScore: score,
      requiresReview: false,
      claimRequestId: (upsertedReq as any)?.id ?? null,
      message: 'Profile successfully claimed!',
    })
  } catch (err: unknown) {
    console.error('[POST /api/nodes/[id]/claim] unhandled error:', err)
    const errMsg = err instanceof Error ? err.message : ''
    const message =
      /duplicate key|violates|conflict/i.test(errMsg)
        ? 'This profile was updated by someone else. Please refresh and try again.'
        : /^CONFIG_ERROR:/i.test(errMsg)
          ? errMsg.replace(/^CONFIG_ERROR:\s*/i, '')
          : /identity_state|birth_year_hint|column .* does not exist/i.test(errMsg)
            ? 'Server schema is out of date. Please ask admin to run latest Supabase migrations.'
            : errMsg
              ? `Unexpected server error: ${errMsg}`
              : 'An unexpected error occurred. Please try again.'
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message },
      { status: 500 }
    )
  }
}
