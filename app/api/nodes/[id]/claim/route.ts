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
      score += 15; reasons.push('name')
    } else if (levenshtein(a, b) <= 2 && Math.max(a.length, b.length) >= 4) {
      score += 10; reasons.push('name_fuzzy')
    } else {
      mismatches.push('name')
    }
  }

  if (nodeBirthYear && submittedBirthYear) {
    const diff = Math.abs(nodeBirthYear - submittedBirthYear)
    if (diff === 0) {
      score += 20; reasons.push('birth_year_exact')
    } else if (diff <= 2) {
      score += 12; reasons.push('birth_year_approx')
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
  if (submittedBirthYear !== undefined && (typeof submittedBirthYear !== 'number' || submittedBirthYear < 1800 || submittedBirthYear > 2200)) {
    return NextResponse.json({ error: 'INVALID_BIRTH_YEAR' }, { status: 400 })
  }

  const admin = adminClient()

  // Fetch node
  const { data: node, error: nodeErr } = await admin
    .from('family_members')
    .select('id, name, birth_year, claim_status, is_deceased, family_id')
    .eq('id', nodeId)
    .single()

  if (nodeErr || !node) return NextResponse.json({ error: 'NODE_NOT_FOUND' }, { status: 404 })

  // B1: Family boundary check. A user may only claim a node if EITHER (a) they
  // already belong to the same family, OR (b) an active, unconsumed, non-expired
  // node_claim invite exists for this specific node. Otherwise reject.
  const { data: callerProfile } = await admin
    .from('profiles')
    .select('family_id')
    .eq('id', user.id)
    .maybeSingle()
  const callerFamilyId = (callerProfile as any)?.family_id as string | null

  let authorized = callerFamilyId && callerFamilyId === (node as any).family_id
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
    authorized = !!claimInvite
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
      { error: 'ALREADY_LINKED_IN_FAMILY', message: 'You are already linked to a different profile in this family.' },
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

  // Score identity
  const nodeBY = (node as any).birth_year ?? null
  const { score, reasons, mismatches } = scoreIdentity(
    node.name, nodeBY, submittedName, submittedBirthYear ?? null
  )

  const attempts = (myRequest?.attempts ?? 0) + 1
  const MAX_ATTEMPTS = 3
  const lockedUntil =
    attempts >= MAX_ATTEMPTS ? new Date(Date.now() + 86_400_000).toISOString() : null

  // Identity check failed
  if (score < 40 || (mismatches.length > 0 && score < 65)) {
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

  // Success path
  const requiresReview = score < 70
  const newStatus = requiresReview ? 'claim_pending' : 'claimed'

  const { data: upsertedReq } = await admin.from('claim_requests').upsert(
    {
      node_id: nodeId,
      claimant_user_id: user.id,
      status: requiresReview ? 'pending' : 'verified',
      submitted_name: submittedName,
      submitted_birth_year: submittedBirthYear ?? null,
      confidence_score: score,
      attempts,
      locked_until: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'node_id,claimant_user_id' }
  ).select('id').single()

  // Update node state
  const memberUpdate: Record<string, unknown> = { claim_status: newStatus }
  if (!requiresReview) {
    memberUpdate.is_claimed = true
    memberUpdate.claimed_by_user_id = user.id
    memberUpdate.claimed_at = new Date().toISOString()
    if (isGuardianClaim) memberUpdate.guardian_user_id = user.id
  }
  await admin.from('family_members').update(memberUpdate as any).eq('id', nodeId)

  // Audit
  await admin.from('claim_audit_log').insert({
    node_id: nodeId,
    family_id: (node as any).family_id,
    actor_id: user.id,
    action: requiresReview ? 'claim_initiated' : 'claim_completed',
    metadata: { score, reasons, requiresReview },
  })

  // Link user → node
  if (!requiresReview) {
    await admin.from('user_node_links').upsert(
      { user_id: user.id, node_id: nodeId, family_id: (node as any).family_id, is_primary: true },
      { onConflict: 'user_id,node_id' }
    )
    await admin.from('profiles').update({ member_id: nodeId } as any).eq('id', user.id)
  }

  return NextResponse.json({
    status: newStatus,
    confidenceScore: score,
    requiresReview,
    claimRequestId: (upsertedReq as any)?.id ?? null,
    message: requiresReview
      ? 'Your claim is pending manual review by the tree owner.'
      : 'Profile successfully claimed!',
  })
}
