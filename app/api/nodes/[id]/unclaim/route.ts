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

// ─── POST /api/nodes/[id]/unclaim ─────────────────────────────────────────────
//
// Severs the account ↔ node binding without touching the graph node itself
// (parent_ids / spouse_ids / stories / relationships all remain intact).
// The node returns to 'unclaimed' state and can be reclaimed at any time.
//
// Allowed by:
//   • The current claimer — self-service, requires { confirm: true } in body
//   • A family admin — administrative revoke, also requires { confirm: true }
//
// Returns: { success: true, nodeId, previousClaimantId, action }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: 'SERVER_MISCONFIGURED', message: 'SUPABASE_SERVICE_ROLE_KEY is not set.' },
      { status: 503 }
    )
  }

  const { id: nodeId } = await params
  const supabase = await authedClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 })

  let body: { confirm?: boolean; reason?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Require explicit { confirm: true } to prevent accidental unclaims from
  // double-taps or mis-fired API calls.
  if (body.confirm !== true) {
    return NextResponse.json(
      { error: 'CONFIRMATION_REQUIRED', message: 'Pass { confirm: true } in the request body to confirm.' },
      { status: 400 }
    )
  }

  const admin = adminClient()

  // Load the node (use admin client to read regardless of current RLS state)
  const { data: node, error: nodeErr } = await admin
    .from('family_members')
    .select('id, name, family_id, is_claimed, claimed_by_user_id, claim_status, claimed_at')
    .eq('id', nodeId)
    .single()

  if (nodeErr || !node) {
    return NextResponse.json({ error: 'NODE_NOT_FOUND', details: nodeErr?.message }, { status: 404 })
  }
  if (!(node as any).is_claimed) {
    return NextResponse.json({ error: 'NOT_CLAIMED', message: 'This profile is not currently claimed.' }, { status: 409 })
  }

  const previousClaimantId = (node as any).claimed_by_user_id as string | null
  const isSelfUnclaim = previousClaimantId === user.id

  // Check if caller is a family admin (for admin revoke path)
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

  // ── Atomic writes — graph structure is never modified ────────────────────
  // 1. Reset the node's claim fields.  The WHERE is_claimed=true guard prevents
  //    a double-unclaim race from producing inconsistent state.
  const { error: nodeUpdateErr } = await admin
    .from('family_members')
    .update({
      is_claimed: false,
      claimed_by_user_id: null,
      claim_status: 'unclaimed',
      identity_state: 'unclaimed',
      claimed_at: null,
    } as any)
    .eq('id', nodeId)
    .eq('is_claimed', true)  // optimistic guard

  if (nodeUpdateErr) {
    return NextResponse.json({ error: 'UPDATE_FAILED', message: nodeUpdateErr.message }, { status: 500 })
  }

  // 2. Mark existing claim_requests for this user as abandoned (not deleted —
  //    preserves audit trail for admin review).
  if (previousClaimantId) {
    await admin
      .from('claim_requests')
      .update({ status: 'abandoned', updated_at: new Date().toISOString() } as any)
      .eq('node_id', nodeId)
      .eq('claimant_user_id', previousClaimantId)
      .in('status', ['verified', 'pending'])
  }

  // 3. Soft-deactivate the user_node_link (status='inactive' preserves history)
  if (previousClaimantId) {
    await admin
      .from('user_node_links')
      .update({ status: 'inactive' } as any)
      .eq('node_id', nodeId)
      .eq('user_id', previousClaimantId)
      .eq('is_primary', true)
  }

  // 4. Clear profiles.member_id for the previous claimer so the app stops
  //    treating this node as their identity.
  if (previousClaimantId) {
    await admin
      .from('profiles')
      .update({ member_id: null } as any)
      .eq('id', previousClaimantId)
      .eq('member_id', nodeId)  // guard: only clear if still pointing at this node
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

