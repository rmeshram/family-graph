import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

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

const GRACE_DAYS = 7

// ─── POST /api/nodes/[id]/unclaim ────────────────────────────────────────────
//
// Severs the account ↔ node binding without touching the graph node itself.
// The node returns to 'unclaimed' so it can be re-claimed later.
//
// Allowed by:
//   • The current claimer (self-service) — must be within the 7-day grace window
//   • A family admin — no time restriction; can revoke at any time
//
// Body: { confirm: true, reason?: string }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: 'SERVER_MISCONFIGURED', message: 'SUPABASE_SERVICE_ROLE_KEY is not set on this server.' },
      { status: 503 }
    )
  }

  const { id: nodeId } = await params
  const supabase = await authedClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json(
      { error: 'UNAUTHENTICATED', message: 'Your session has expired. Please sign in again.' },
      { status: 401 }
    )
  }

  let body: { confirm?: boolean; reason?: string }
  try { body = await req.json() } catch { body = {} }

  if (body.confirm !== true) {
    return NextResponse.json(
      { error: 'CONFIRMATION_REQUIRED', message: 'Pass { confirm: true } in the request body to confirm this action.' },
      { status: 400 }
    )
  }

  const admin = adminClient()

  const { data: node, error: nodeErr } = await admin
    .from('family_members')
    .select('id, name, family_id, is_claimed, claimed_by_user_id, claim_status, claimed_at')
    .eq('id', nodeId)
    .single()

  if (nodeErr || !node) {
    return NextResponse.json({ error: 'NODE_NOT_FOUND', details: nodeErr?.message }, { status: 404 })
  }
  if (!(node as any).is_claimed) {
    return NextResponse.json(
      { error: 'NOT_CLAIMED', message: 'This profile is not currently claimed.' },
      { status: 409 }
    )
  }

  const previousClaimantId = (node as any).claimed_by_user_id as string | null
  const isSelfUnclaim = previousClaimantId === user.id

  // Check if caller is a family admin (allows admin revoke without grace window)
  let isAdmin = false
  if (!isSelfUnclaim) {
    const { data: callerProfile } = await admin
      .from('profiles')
      .select('role, family_id')
      .eq('id', user.id)
      .single()
    isAdmin =
      (callerProfile as any)?.role === 'admin' &&
      (callerProfile as any)?.family_id === (node as any).family_id
  }

  if (!isSelfUnclaim && !isAdmin) {
    return NextResponse.json(
      { error: 'FORBIDDEN', message: 'Only the profile owner or a family admin can unlink a claimed profile.' },
      { status: 403 }
    )
  }

  // Enforce 7-day grace window for self-unclaims only — admins are exempt.
  if (isSelfUnclaim) {
    const claimedAt = (node as any).claimed_at ? new Date((node as any).claimed_at) : null
    if (claimedAt && Date.now() - claimedAt.getTime() > GRACE_DAYS * 86_400_000) {
      return NextResponse.json(
        {
          error: 'GRACE_PERIOD_EXPIRED',
          message: `The ${GRACE_DAYS}-day self-unclaim window has passed. Contact a family admin to have your profile unlinked.`,
        },
        { status: 409 }
      )
    }
  }

  // 1. Reset the node's claim fields.
  await admin
    .from('family_members')
    .update({
      is_claimed: false,
      claimed_by_user_id: null,
      claim_status: 'unclaimed',
      claimed_at: null,
    } as any)
    .eq('id', nodeId)

  // 2. Mark existing claim_requests as abandoned (preserves audit trail).
  if (previousClaimantId) {
    await admin
      .from('claim_requests')
      .update({ status: 'abandoned', updated_at: new Date().toISOString() } as any)
      .eq('node_id', nodeId)
      .eq('claimant_user_id', previousClaimantId)
      .in('status', ['verified', 'pending'])
  }

  // 3. Remove user_node_links for the previous claimer.
  if (previousClaimantId) {
    await admin
      .from('user_node_links')
      .delete()
      .eq('node_id', nodeId)
      .eq('user_id', previousClaimantId)
  }

  // 4. Clear profiles.member_id so the app immediately stops treating this node
  //    as the user's identity. Without this step, the UI shows stale claim data
  //    and the "Unlink My Profile" button stays visible even after revoke.
  if (previousClaimantId) {
    await admin
      .from('profiles')
      .update({ member_id: null } as any)
      .eq('id', previousClaimantId)
      .eq('member_id', nodeId) // guard: only clear if still pointing at this node
  }

  // 5. Audit log
  const auditAction = isAdmin && !isSelfUnclaim ? 'admin_revoke' : 'claim_unclaimed'
  await admin.from('claim_audit_log').insert({
    node_id: nodeId,
    family_id: (node as any).family_id,
    actor_id: user.id,
    action: auditAction,
    metadata: {
      previous_claimant_id: previousClaimantId,
      reason: body.reason ?? null,
      admin_action: isAdmin && !isSelfUnclaim,
    },
  })

  return NextResponse.json({
    success: true,
    nodeId,
    previousClaimantId,
    action: auditAction,
  })
}
