import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

function adminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} }, auth: { persistSession: false } }
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
          try { c.forEach(({ name, value, options }) => cs.set(name, value, options)) } catch {}
        },
      },
    }
  )
}

/**
 * POST /api/family-links/cross-claim
 *
 * Called when a user who already has a claimed node in Family B tries to
 * claim (or was invited to claim) a node in Family A. Rather than blocking
 * them with ALREADY_LINKED_ACCOUNT, this endpoint connects the two family
 * trees via the existing family_links infrastructure.
 *
 * Body:
 *   claimNodeId   — the unclaimed node in Family A (the "bridge" node)
 *   existingNodeId — the caller's already-claimed node in Family B
 *
 * Result:
 *   Creates a family_links row with:
 *     junction_member_a = claimNodeId   (bridge node in inviting family)
 *     junction_member_b = existingNodeId (caller's real node in their family)
 *   Auto-accepts if caller is admin of the family that owns existingNodeId.
 *   Otherwise creates a pending request for that family's admin to accept.
 *
 * Rate limit: max 5 cross-claim attempts per user per hour (DB-level counter).
 */
export async function POST(req: NextRequest) {
  const supabase = await authedClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 })

  let body: { claimNodeId?: string; existingNodeId?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 })
  }

  const { claimNodeId, existingNodeId } = body
  if (!claimNodeId?.trim() || !existingNodeId?.trim()) {
    return NextResponse.json({ error: 'MISSING_FIELDS', message: 'Both claimNodeId and existingNodeId are required.' }, { status: 400 })
  }
  if (claimNodeId === existingNodeId) {
    return NextResponse.json({ error: 'SAME_NODE', message: 'The two nodes must be different.' }, { status: 400 })
  }

  const admin = adminClient()

  // ── Rate limit: 5 cross-claim attempts per user per hour ─────────────────
  // EC-25: sentinel row is written AFTER node validation (we need family IDs for
  // NOT NULL cols). Count check runs after the write so the limiter actually fires.
  // See the rate-limit enforcement block below, after node + family validation.
  const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString()

  // ── Fetch both nodes ──────────────────────────────────────────────────────
  const [{ data: claimNode, error: claimErr }, { data: existingNode, error: existingErr }] = await Promise.all([
    admin.from('family_members').select('id, name, family_id, is_claimed, claimed_by_user_id').eq('id', claimNodeId).maybeSingle() as any,
    admin.from('family_members').select('id, name, family_id, is_claimed, claimed_by_user_id').eq('id', existingNodeId).maybeSingle() as any,
  ])

  if (claimErr || !claimNode) {
    return NextResponse.json({ error: 'CLAIM_NODE_NOT_FOUND', message: 'The bridge profile does not exist.' }, { status: 404 })
  }
  if (existingErr || !existingNode) {
    return NextResponse.json({ error: 'EXISTING_NODE_NOT_FOUND', message: 'Your existing profile could not be found.' }, { status: 404 })
  }

  // ── Validate claimNode is unclaimed ───────────────────────────────────────
  if ((claimNode as any).is_claimed) {
    return NextResponse.json(
      { error: 'BRIDGE_NODE_ALREADY_CLAIMED', message: 'The bridge profile in the other family has already been claimed by someone else.' },
      { status: 409 }
    )
  }

  // ── Validate existingNode is claimed by this user ─────────────────────────
  if (
    !(existingNode as any).is_claimed ||
    (existingNode as any).claimed_by_user_id !== user.id
  ) {
    return NextResponse.json(
      { error: 'NOT_YOUR_NODE', message: 'The existing profile is not claimed by your account.' },
      { status: 403 }
    )
  }

  const claimFamilyId = (claimNode as any).family_id as string
  const existingFamilyId = (existingNode as any).family_id as string

  // ── Families must be different ────────────────────────────────────────────
  if (claimFamilyId === existingFamilyId) {
    return NextResponse.json(
      { error: 'SAME_FAMILY', message: 'Both profiles are in the same family — no link needed.' },
      { status: 400 }
    )
  }

  // EC-25: Write the rate-limit sentinel NOW (we have family IDs) then check the
  // count. Writing first ensures every attempt—including ones that fail below—
  // is counted. If the count exceeds the limit we delete the just-inserted row
  // (clean up) and return RATE_LIMITED, so it doesn't permanently consume a slot.
  const { data: sentinelRow } = await admin
    .from('family_link_notifications')
    .insert({
      initiated_by_user_id: user.id,
      event_type: 'cross_claim_attempt',
      source_family_id: existingFamilyId,
      new_member_id: existingNodeId,
    } as any)
    .select('id')
    .single()

  const { count: recentAttempts } = await admin
    .from('family_link_notifications')
    .select('*', { count: 'exact', head: true })
    .eq('initiated_by_user_id', user.id)
    .eq('event_type', 'cross_claim_attempt')
    .gt('created_at', oneHourAgo)

  if ((recentAttempts ?? 0) > 5) {
    // Over limit — delete the sentinel we just inserted to avoid inflating the
    // counter past the true number of attempts, then reject the request.
    if (sentinelRow) {
      await admin.from('family_link_notifications').delete().eq('id', (sentinelRow as any).id)
    }
    return NextResponse.json(
      { error: 'RATE_LIMITED', message: 'Too many connection attempts. Please wait an hour and try again.' },
      { status: 429 }
    )
  }

  // ── Check existing link between the two families ──────────────────────────
  const [fA, fB] = claimFamilyId < existingFamilyId
    ? [claimFamilyId, existingFamilyId]
    : [existingFamilyId, claimFamilyId]

  const { data: existingFamilyLink } = await admin
    .from('family_links')
    .select('id, status')
    .eq('family_a_id', fA)
    .eq('family_b_id', fB)
    .maybeSingle()

  if (existingFamilyLink) {
    if ((existingFamilyLink as any).status === 'accepted') {
      return NextResponse.json({ error: 'ALREADY_LINKED', message: 'These two families are already connected.' }, { status: 409 })
    }
    if ((existingFamilyLink as any).status === 'pending') {
      return NextResponse.json({ error: 'REQUEST_PENDING', message: 'A connection request between these families is already pending.' }, { status: 409 })
    }
    // Revoked/rejected — delete and allow a fresh link
    await admin.from('family_links').delete().eq('id', (existingFamilyLink as any).id)
  }

  // ── Determine junction_member_a/b (normalized to family_a/b order) ────────
  // family_a_id = fA, family_b_id = fB
  const junctionA = fA === claimFamilyId ? claimNodeId : existingNodeId   // node in family_a
  const junctionB = fB === existingFamilyId ? existingNodeId : claimNodeId // node in family_b

  // ── Check if caller is admin of the existing-node family (for auto-accept) ─
  const { data: callerProfile } = await admin
    .from('profiles')
    .select('family_id, role')
    .eq('id', user.id)
    .maybeSingle()

  const callerIsAdminOfExistingFamily =
    (callerProfile as any)?.family_id === existingFamilyId &&
    (callerProfile as any)?.role === 'admin'

  const now = new Date().toISOString()
  const linkStatus = callerIsAdminOfExistingFamily ? 'accepted' : 'pending'

  // ── Create the family_links row ───────────────────────────────────────────
  const { data: link, error: linkErr } = await admin
    .from('family_links')
    .insert({
      family_a_id: fA,
      family_b_id: fB,
      status: linkStatus,
      initiated_by: user.id,
      accepted_by: callerIsAdminOfExistingFamily ? user.id : null,
      junction_member_a: junctionA,
      junction_member_b: junctionB,
      link_note: 'Connected via shared family member',
      created_at: now,
      updated_at: now,
    } as any)
    .select('id')
    .single()

  if (linkErr || !link) {
    console.error('[cross-claim] family_links insert error:', linkErr)
    return NextResponse.json({ error: 'DB_ERROR', message: 'Could not create the family connection. Please try again.' }, { status: 500 })
  }

  const linkId = (link as any).id as string

  // ── Fetch family names for the response ──────────────────────────────────
  const [{ data: claimFamily }, { data: existingFamily }] = await Promise.all([
    admin.from('families').select('name').eq('id', claimFamilyId).maybeSingle() as any,
    admin.from('families').select('name').eq('id', existingFamilyId).maybeSingle() as any,
  ])

  // ── Notify BOTH families ──────────────────────────────────────────────────
  // The event type is the same for both: pending → link_requested (needs action),
  // accepted → link_accepted (informational). The existing-node family must be
  // notified even on auto-accept so their admins know the connection was made.
  const notifEvent = linkStatus === 'accepted' ? 'link_accepted' : 'link_requested'
  await Promise.all([
    // RF-12: Rate-limit sentinel — tracks per-user cross-claim attempts.
    // Previously missing source_family_id + new_member_id (NOT NULL cols) caused
    // all three inserts to fail silently, so the rate counter was always 0.
    admin.from('family_link_notifications').insert({
      link_id: linkId,
      event_type: 'cross_claim_attempt',
      recipient_family_id: claimFamilyId,
      source_family_id: existingFamilyId,
      new_member_id: claimNodeId,
      initiated_by_user_id: user.id,
      created_at: now,
    } as any),
    // Inviting family notification
    admin.from('family_link_notifications').insert({
      link_id: linkId,
      event_type: notifEvent,
      recipient_family_id: claimFamilyId,
      source_family_id: existingFamilyId,
      new_member_id: claimNodeId,
      created_at: now,
    } as any),
    // Existing-node family notification — always, even on auto-accept
    admin.from('family_link_notifications').insert({
      link_id: linkId,
      event_type: notifEvent,
      recipient_family_id: existingFamilyId,
      source_family_id: claimFamilyId,
      new_member_id: claimNodeId,
      created_at: now,
    } as any),
  ])

  return NextResponse.json({
    linkId,
    status: linkStatus,
    autoAccepted: callerIsAdminOfExistingFamily,
    claimFamilyName: (claimFamily as any)?.name ?? 'the other family',
    existingFamilyName: (existingFamily as any)?.name ?? 'your family',
    message: callerIsAdminOfExistingFamily
      ? `Both family trees are now connected! Members from "${(claimFamily as any)?.name}" will appear in your family tree.`
      : `Connection request sent to "${(existingFamily as any)?.name ?? 'your family'}" admins. Once they accept, both trees will be linked.`,
  })
}
