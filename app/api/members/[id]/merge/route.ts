/**
 * POST /api/members/[id]/merge
 *
 * Merges a duplicate node (targetId) into the primary node (id).
 *
 * Steps:
 *  1. Load both nodes — validate they belong to the same family.
 *  2. Merge scalar fields: primary wins; nulls are filled from duplicate.
 *  3. Merge array fields: union of parentIds and spouseIds (deduplicated, self-refs removed).
 *  4. Update all OTHER members that reference the duplicate ID in parentIds/spouseIds.
 *  5. Transfer user claim: if duplicate is claimed but primary is not, move the claim.
 *  6. Transfer stories (if stories table exists) from duplicate → primary.
 *  7. Delete the duplicate node.
 *  8. Return the updated primary.
 *
 * Security: caller must be authenticated and belong to the same family as both nodes.
 */

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

// Fields that can be merged (primary wins if non-null, fills from duplicate if null)
const MERGEABLE_SCALAR_FIELDS = [
  'birth_year', 'birth_month', 'birth_day', 'death_year',
  'birth_place', 'current_place', 'photo_url', 'bio',
  'occupation', 'relationship', 'gender', 'generation',
  'gotra', 'caste', 'hometown', 'native_language', 'religion',
  'phone', 'email', 'instagram_handle', 'is_alive', 'is_deceased',
  'date_of_birth',
] as const

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: primaryId } = await params
  const supabase = await authedClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 })

  let body: { targetId?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { targetId } = body
  if (!targetId) return NextResponse.json({ error: 'targetId is required' }, { status: 400 })
  if (primaryId === targetId) return NextResponse.json({ error: 'Cannot merge a node into itself' }, { status: 400 })

  // Use admin client for cross-RLS operations
  const admin = adminClient()

  // ── 1. Load both nodes ──────────────────────────────────────────────────────
  const [{ data: primary, error: pe }, { data: duplicate, error: de }] = await Promise.all([
    admin.from('family_members').select('*').eq('id', primaryId).single(),
    admin.from('family_members').select('*').eq('id', targetId).single(),
  ])

  if (pe || !primary) return NextResponse.json({ error: 'Primary node not found' }, { status: 404 })
  if (de || !duplicate) return NextResponse.json({ error: 'Duplicate node not found' }, { status: 404 })

  // Verify same family — prevent cross-family merges
  if ((primary as any).family_id !== (duplicate as any).family_id) {
    return NextResponse.json({ error: 'Cannot merge nodes from different families' }, { status: 403 })
  }

  // Verify caller belongs to this family
  const { data: profile } = await admin.from('profiles').select('family_id, role').eq('id', user.id).single()
  if (!profile || (profile as any).family_id !== (primary as any).family_id) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  }
  // Only admins can perform irreversible merge operations
  if ((profile as any).role !== 'admin') {
    return NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 })
  }

  // ── 2. Merge scalar fields ──────────────────────────────────────────────────
  const merged: Record<string, unknown> = {}
  for (const field of MERGEABLE_SCALAR_FIELDS) {
    const pVal = (primary as any)[field]
    const dVal = (duplicate as any)[field]
    merged[field] = pVal !== null && pVal !== undefined ? pVal : dVal
  }

  // ── 3. Merge array fields ──────────────────────────────────────────────────
  const pParents: string[] = (primary as any).parent_ids ?? []
  const dParents: string[] = (duplicate as any).parent_ids ?? []
  const pSpouses: string[] = (primary as any).spouse_ids ?? []
  const dSpouses: string[] = (duplicate as any).spouse_ids ?? []

  const mergedParents = [...new Set([...pParents, ...dParents])].filter(id => id !== primaryId && id !== targetId)
  const mergedSpouses = [...new Set([...pSpouses, ...dSpouses])].filter(id => id !== primaryId && id !== targetId)

  // Merge tags
  const pTags: string[] = (primary as any).tags ?? []
  const dTags: string[] = (duplicate as any).tags ?? []
  const mergedTags = [...new Set([...pTags, ...dTags])]

  // ── 4. Update all OTHER members that reference the duplicate ───────────────
  const { data: affectedMembers } = await admin
    .from('family_members')
    .select('id, parent_ids, spouse_ids')
    .eq('family_id', (primary as any).family_id)
    .neq('id', primaryId)
    .neq('id', targetId)

  const refUpdates: Promise<unknown>[] = []
  for (const member of (affectedMembers ?? [])) {
    const memberAny = member as any
    const newParents: string[] = (memberAny.parent_ids ?? []).map((pid: string) =>
      pid === targetId ? primaryId : pid
    )
    const newSpouses: string[] = (memberAny.spouse_ids ?? []).map((sid: string) =>
      sid === targetId ? primaryId : sid
    )
    const parentChanged = JSON.stringify(newParents) !== JSON.stringify(memberAny.parent_ids ?? [])
    const spouseChanged = JSON.stringify(newSpouses) !== JSON.stringify(memberAny.spouse_ids ?? [])

    if (parentChanged || spouseChanged) {
      refUpdates.push(
        Promise.resolve(
          admin.from('family_members')
            .update({ parent_ids: newParents, spouse_ids: newSpouses })
            .eq('id', memberAny.id)
        ).then(() => { })
      )
    }
  }
  await Promise.all(refUpdates)

  // ── 5. Transfer claim if applicable ───────────────────────────────────────
  const dupClaimed = (duplicate as any).is_claimed === true
  const priUnclaimed = (primary as any).is_claimed !== true
  if (dupClaimed && priUnclaimed) {
    merged['is_claimed'] = true
    merged['claimed_by_user_id'] = (duplicate as any).claimed_by_user_id
    merged['claim_status'] = (duplicate as any).claim_status ?? 'claimed'
    merged['claimed_at'] = (duplicate as any).claimed_at

    // Update the profile's member_id reference
    const dupClaimedBy = (duplicate as any).claimed_by_user_id
    if (dupClaimedBy) {
      await admin.from('profiles').update({ member_id: primaryId }).eq('id', dupClaimedBy)
    }
  }

  // ── 6. Transfer stories ─────────────────────────────────────────────────────
  await admin
    .from('stories')
    .update({ member_id: primaryId })
    .eq('member_id', targetId)
    .then(() => { }) // best-effort — stories table might not exist

  // ── 7. Apply merged update to primary, then delete duplicate ───────────────
  const { error: updateErr } = await admin
    .from('family_members')
    .update({
      ...merged,
      parent_ids: mergedParents,
      spouse_ids: mergedSpouses,
      tags: mergedTags,
      updated_at: new Date().toISOString(),
    })
    .eq('id', primaryId)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  const { error: deleteErr } = await admin.from('family_members').delete().eq('id', targetId)
  if (deleteErr) return NextResponse.json({ error: `Merge applied but could not delete duplicate: ${deleteErr.message}` }, { status: 500 })

  // ── 8. Audit log ────────────────────────────────────────────────────────────
  await admin.from('claim_audit_log').insert({
    node_id: primaryId,
    actor_id: user.id,
    action: 'node_merged',
    metadata: { absorbed_id: targetId },
  }).then(() => { })

  // Return the updated primary
  const { data: updated } = await admin.from('family_members').select('*').eq('id', primaryId).single()
  return NextResponse.json({ merged: true, node: updated })
}
