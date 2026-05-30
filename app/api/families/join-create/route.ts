import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { levenshtein } from '@/lib/utils'

/**
 * POST /api/families/join-create
 *
 * Server-side duplicate check + member creation for the invite join+create flow.
 * Replaces the client-side Step 4 deduplication in joinWithCode (which is limited
 * to 500 members and can be bypassed directly).
 *
 * Issue #1: Moves duplicate detection server-side with service-role (no row cap).
 *
 * Body:
 *   inviteCode      string  — the family invite code (uppercase)
 *   displayName     string  — the name to create for the new node
 *   relationship    string  — 'spouse'|'child'|'parent'|'sibling'|'relative'|'member'
 *   generation      number  — computed generation
 *   parentIds       string[] — structural parent links
 *   spouseIds       string[] — structural spouse links
 *   gender?         string
 *   networkGroup    string
 *
 * Returns:
 *   { memberId: string }  on success
 *   { error: string, message: string, duplicateId?: string }  on conflict
 */

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

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ')
}

export async function POST(req: NextRequest) {
  const supabase = await authedClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED', message: 'Please sign in.' }, { status: 401 })

  let body: {
    inviteCode?: string
    displayName?: string
    relationship?: string
    generation?: number
    parentIds?: string[]
    spouseIds?: string[]
    gender?: string
    networkGroup?: string
  }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'INVALID_REQUEST', message: 'Invalid request body.' }, { status: 400 })
  }

  const { inviteCode, displayName, relationship, generation, parentIds, spouseIds, gender, networkGroup } = body

  if (!inviteCode?.trim()) return NextResponse.json({ error: 'MISSING_INVITE_CODE' }, { status: 400 })
  if (!displayName?.trim()) return NextResponse.json({ error: 'MISSING_NAME', message: 'Name is required.' }, { status: 400 })
  if (displayName.trim().length > 200) return NextResponse.json({ error: 'NAME_TOO_LONG' }, { status: 400 })

  const admin = adminClient()

  // Validate invite
  const { data: invite } = await admin
    .from('invite_links')
    .select('id, family_id, expires_at, consumed_at, max_uses, used_count, invite_type, created_by')
    .eq('code', inviteCode.trim().toUpperCase())
    .maybeSingle()

  if (!invite) return NextResponse.json({ error: 'INVITE_NOT_FOUND', message: 'Invalid invite code.' }, { status: 404 })
  if ((invite as any).consumed_at) return NextResponse.json({ error: 'INVITE_USED', message: 'This invite has already been used.' }, { status: 410 })
  if ((invite as any).expires_at && new Date((invite as any).expires_at) < new Date()) {
    return NextResponse.json({ error: 'INVITE_EXPIRED', message: 'This invite has expired.' }, { status: 410 })
  }
  if ((invite as any).invite_type === 'node_claim') {
    return NextResponse.json({ error: 'WRONG_INVITE_TYPE', message: 'Use the node claim flow for this invite.' }, { status: 422 })
  }

  const familyId: string = (invite as any).family_id

  // Verify the caller belongs to this family OR is joining via this invite
  // (the invite itself is the authorization token)
  const { data: callerProfile } = await admin
    .from('profiles')
    .select('family_id, phone')
    .eq('id', user.id)
    .maybeSingle()
  const callerFamilyId = (callerProfile as any)?.family_id as string | null
  // Allow if already in this family, OR if arriving via a valid non-expired invite (the
  // invite code check above already validates it belongs to this family).
  // The caller must either already be in this family or be actively joining via this code.
  if (callerFamilyId && callerFamilyId !== familyId) {
    // Cross-family — allow but member_id will be cleared client-side
  }

  // ── Server-side deduplication (no row cap — service-role bypasses RLS limits) ──
  const normNew = normalizeName(displayName.trim())
  const { data: existingMembers, error: fetchErr } = await admin
    .from('family_members')
    .select('id, name, phone, normalized_phone, email, is_claimed, claimed_by_user_id')
    .eq('family_id', familyId)
  // No .limit() — service-role fetches all members to catch duplicates in large families

  if (fetchErr) {
    return NextResponse.json({ error: 'FETCH_FAILED', message: 'Could not check for duplicates.' }, { status: 500 })
  }

  const { data: authUser } = await supabase.auth.getUser()
  const userEmail = authUser.user?.email?.trim().toLowerCase() ?? null
  const userRawPhone = (callerProfile as any)?.phone?.trim() ?? null

  // Normalize user's phone to E.164
  let e164Phone: string | null = null
  if (userRawPhone) {
    try {
      const { normalizePhone } = await import('@/lib/phone-utils')
      e164Phone = normalizePhone(userRawPhone)
    } catch { e164Phone = userRawPhone }
  }

  // Strong signal: exact phone or email match on an unclaimed node → reuse it
  const strongMatch = (existingMembers ?? []).find((m: any) => {
    if (m.is_claimed) return false
    const nodeNormPhone: string | null = m.normalized_phone ?? null
    const nodeRawPhone: string | null = m.phone?.trim() ?? null
    const samePhone = e164Phone && (
      (nodeNormPhone && nodeNormPhone === e164Phone) ||
      (!nodeNormPhone && nodeRawPhone === e164Phone)
    )
    const sameEmail = userEmail && m.email?.trim().toLowerCase() === userEmail
    return !!(samePhone || sameEmail)
  })

  if (strongMatch) {
    // Auto-claim the matching node instead of creating a duplicate
    const { error: claimErr } = await admin
      .from('family_members')
      .update({ claimed_by_user_id: user.id, is_claimed: true })
      .eq('id', (strongMatch as any).id)
      .eq('is_claimed', false)
    if (claimErr) {
      return NextResponse.json({ error: 'CLAIM_FAILED', message: claimErr.message }, { status: 500 })
    }
    await admin.from('profiles').update({ member_id: (strongMatch as any).id } as any).eq('id', user.id)
    return NextResponse.json({ memberId: (strongMatch as any).id, reused: true })
  }

  // Hard blocks: exact phone/email/name duplicates
  const phoneDup = e164Phone
    ? (existingMembers ?? []).find((m: any) => {
      const nn = m.normalized_phone ?? null
      const rp = m.phone?.trim() ?? null
      return (nn && nn === e164Phone) || (!nn && rp === e164Phone)
    })
    : null
  if (phoneDup) {
    return NextResponse.json({
      error: 'PHONE_DUPLICATE',
      message: `A profile with this phone number already exists (${(phoneDup as any).name}). Please claim that profile instead.`,
      duplicateId: (phoneDup as any).id,
    }, { status: 409 })
  }

  const emailDup = userEmail
    ? (existingMembers ?? []).find((m: any) => m.email?.trim().toLowerCase() === userEmail)
    : null
  if (emailDup) {
    return NextResponse.json({
      error: 'EMAIL_DUPLICATE',
      message: `A profile with this email already exists (${(emailDup as any).name}). Please claim that profile instead.`,
      duplicateId: (emailDup as any).id,
    }, { status: 409 })
  }

  const exactNameDup = (existingMembers ?? []).find(
    (m: any) => normalizeName(m.name) === normNew
  )
  if (exactNameDup) {
    return NextResponse.json({
      error: 'NAME_DUPLICATE',
      message: `A profile named "${(exactNameDup as any).name}" already exists. Please select it above to claim it.`,
      duplicateId: (exactNameDup as any).id,
    }, { status: 409 })
  }

  if (normNew.length >= 4) {
    const fuzzyDup = (existingMembers ?? []).find((m: any) => {
      const norm = normalizeName(m.name)
      return norm.length >= 4 && levenshtein(norm, normNew) <= 2
    })
    if (fuzzyDup) {
      return NextResponse.json({
        error: 'FUZZY_NAME_DUPLICATE',
        message: `A profile with a very similar name ("${(fuzzyDup as any).name}") already exists. If that's you, please claim it.`,
        duplicateId: (fuzzyDup as any).id,
      }, { status: 409 })
    }
  }

  // ── Create the new member ────────────────────────────────────────────────────
  const { data: newMember, error: insertErr } = await admin
    .from('family_members')
    .insert({
      family_id: familyId,
      name: displayName.trim(),
      relationship: relationship ?? 'member',
      generation: generation ?? 3,
      is_alive: true,
      parent_ids: parentIds ?? [],
      spouse_ids: spouseIds ?? [],
      gender: gender ?? null,
      phone: userRawPhone,
      email: authUser.user?.email ?? null,
      network_group: networkGroup ?? 'core',
      added_by: user.id,
    } as any)
    .select('id')
    .single()

  if (insertErr) {
    return NextResponse.json({ error: 'INSERT_FAILED', message: insertErr.message }, { status: 500 })
  }

  // Link profile → new node
  await admin.from('profiles')
    .update({ member_id: (newMember as any).id } as any)
    .eq('id', user.id)

  return NextResponse.json({ memberId: (newMember as any).id, reused: false })
}
