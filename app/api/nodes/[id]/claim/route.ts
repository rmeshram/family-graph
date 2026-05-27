import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { ClaimStatus } from '@/lib/claim-state-machine'

// ─── Supabase helpers ────────────────────────────────────────────────────────

function adminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => { } }, auth: { persistSession: false } }
  )
}

async function authedClient() {
  const cs = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cs.getAll(),
        setAll: (c) => {
          try { c.forEach(({ name, value, options }) => cs.set(name, value, options)) } catch { }
        },
      },
    }
  )
}

// ─── Identity scoring ────────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
  return dp[m][n]
}

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
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 })
  let body: {
    submittedName?: string
    submittedBirthYear?: number
    intentToken?: string
    isGuardianClaim?: boolean
  }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { submittedName, submittedBirthYear, intentToken, isGuardianClaim } = body
  if (!submittedName?.trim()) {
    return NextResponse.json({ error: 'MISSING_NAME' }, { status: 400 })
  }
  // Bounds-check to prevent O(m*n) Levenshtein DoS
  if (submittedName.length > 200) {
    return NextResponse.json({ error: 'INVALID_NAME' }, { status: 400 })
  }
  // Allow null (means «not provided»); only validate when an actual value is sent
  if (submittedBirthYear !== undefined && submittedBirthYear !== null &&
    (typeof submittedBirthYear !== 'number' || submittedBirthYear < 1800 || submittedBirthYear > 2200)) {
    return NextResponse.json({ error: 'INVALID_BIRTH_YEAR' }, { status: 400 })
  }

  const admin = adminClient()

  // Fetch node
  const { data: node, error: nodeErr } = await admin
    .from('family_members')
    .select('id, name, birth_year, claim_status, is_deceased, family_id, normalized_phone')
    .eq('id', nodeId)
    .single()

  if (nodeErr || !node) return NextResponse.json({ error: 'NODE_NOT_FOUND' }, { status: 404 })

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
  if (!authorized) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inviteQ = admin.from('invite_links') as any
    const { data: claimInvite } = await inviteQ
      .select('id, consumed_at, expires_at, family_id, invite_type, node_id')
      .eq('node_id', nodeId)
      .eq('invite_type', 'node_claim')
      .is('consumed_at', null)
      .gt('expires_at', new Date().toISOString())
      .eq('family_id', (node as any).family_id)
      .maybeSingle()
    if (claimInvite) {
      authorized = true
      authorizedViaNodeClaimInvite = true
    }
  }
  // (c) Phone-number match bypass: node.normalized_phone === user.phone
  // user.phone is the E.164 number verified by Supabase OTP — high confidence.
  if (!authorized && user.phone) {
    const nodePhone = (node as any).normalized_phone as string | null
    if (nodePhone && nodePhone === user.phone) authorized = true
  }
  if (!authorized) {
    return NextResponse.json(
      { error: 'FORBIDDEN', message: 'You are not authorized to claim this profile.' },
      { status: 403 }
    )
  }

  // B4: Prevent multiple node claims per family. If this user already has a
  // user_node_link in this family, reject (one-person-per-node-per-family).
  const { data: existingLink } = await admin
    .from('user_node_links')
    .select('node_id')
    .eq('user_id', user.id)
    .eq('family_id', (node as any).family_id)
    .neq('node_id', nodeId)
    .maybeSingle()
  if (existingLink) {
    return NextResponse.json(
      { error: 'ALREADY_LINKED_IN_FAMILY', claimedNodeId: existingLink.node_id, message: 'You are already linked to a different profile in this family.' },
      { status: 409 }
    )
  }

  const ns = node.claim_status as ClaimStatus
  if ((node as any).is_deceased) {
    return NextResponse.json(
      { error: 'NODE_DECEASED', message: 'This profile is marked as deceased. Contact the tree owner.' },
      { status: 409 }
    )
  }
  if (ns === 'claimed') return NextResponse.json({ error: 'ALREADY_CLAIMED' }, { status: 409 })

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
    return NextResponse.json({ error: 'RATE_LIMITED', retryAfter: 3600 }, { status: 429 })
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
      { error: 'LOCKED_OUT', lockedUntil: myRequest.locked_until },
      { status: 423 }
    )
  }

  // Score identity. node_claim invites skip scoring entirely — the admin
  // explicitly identified this person when creating the invite. Scoring only
  // applies to self-service claims initiated from within the family tree.
  const nodeBY = (node as any).birth_year ?? null
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

  const { data: upsertedReq } = await admin.from('claim_requests').upsert(
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

  // Update node state — optimistic lock ensures only one simultaneous claimant wins.
  // Two concurrent requests may both pass the identity-scoring check above, but only
  // the one that atomically flips is_claimed from false→true gets a returned row.
  // The second writer finds is_claimed=true and receives ALREADY_CLAIMED (409).
  const memberUpdate: Record<string, unknown> = {
    claim_status: newStatus,
    is_claimed: true,
    claimed_by_user_id: user.id,
    claimed_at: new Date().toISOString(),
    identity_state: 'claimed',
  }
  if (isGuardianClaim) memberUpdate.guardian_user_id = user.id

  const { data: claimUpdate } = await admin
    .from('family_members')
    .update(memberUpdate as any)
    .eq('id', nodeId)
    .eq('is_claimed', false)   // ← race-safe optimistic lock
    .select('id')

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
  await admin.from('user_node_links').upsert(
    { user_id: user.id, node_id: nodeId, family_id: (node as any).family_id, is_primary: true },
    { onConflict: 'user_id,node_id' }
  )
  await admin.from('profiles').update({ member_id: nodeId } as any).eq('id', user.id)

  return NextResponse.json({
    status: newStatus,
    confidenceScore: score,
    requiresReview: false,
    claimRequestId: (upsertedReq as any)?.id ?? null,
    message: 'Profile successfully claimed!',
  })
  } catch (err: unknown) {
    console.error('[POST /api/nodes/[id]/claim] unhandled error:', err)
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    )
  }
}
