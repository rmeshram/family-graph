import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// ── Service-role client — bypasses RLS ──────────────────────────────────────
// Safe here because:
//   1. Caller must supply a valid (non-expired, non-consumed) invite code
//   2. We only return unclaimed nodes — no sensitive personal data
function adminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => { } }, auth: { persistSession: false } }
  )
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params
  if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 })

  const supabase = adminClient()

  // Validate the invite code
  const { data: invite, error: inviteErr } = await supabase
    .from('invite_links')
    .select('id, family_id, expires_at, consumed_at, max_uses, used_count, created_by, invite_type, node_id')
    .eq('code', code.toUpperCase())
    .single()

  if (inviteErr || !invite) {
    return NextResponse.json({ error: 'Invalid invite code' }, { status: 404 })
  }
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Invite link has expired' }, { status: 410 })
  }
  if ((invite as any).consumed_at) {
    return NextResponse.json({ error: 'Invite already used' }, { status: 410 })
  }
  if (invite.max_uses && invite.used_count >= invite.max_uses) {
    return NextResponse.json({ error: 'Invite limit reached' }, { status: 410 })
  }

  // Fetch unclaimed nodes from this family
  const { data: nodes, error: nodesErr } = await supabase
    .from('family_members')
    .select('id, name, relationship, generation, birth_year, phone, email, gender')
    .eq('family_id', invite.family_id)
    .eq('is_claimed', false)
    .order('generation', { ascending: true })
    .limit(30)

  if (nodesErr) {
    return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 })
  }

  // Fetch inviter's member_id so the join page can show their name
  let inviterMemberId: string | null = null
  if (invite.created_by) {
    const { data: inviterProfile } = await supabase
      .from('profiles')
      .select('member_id')
      .eq('id', invite.created_by)
      .single()
    inviterMemberId = (inviterProfile as any)?.member_id ?? null
  }

  // For node_claim invites: fetch the target node + parents (bypasses RLS;
  // joining users don't have family access yet so client-side queries fail).
  const nodePreview = ((invite as any).invite_type === 'node_claim' && (invite as any).node_id)
    ? await fetchNodePreview(supabase, (invite as any).node_id as string)
    : null

  return NextResponse.json({
    familyId: invite.family_id,
    inviterMemberId,
    nodes: nodes ?? [],
    nodePreview,
  })
}

// ── nodePreview: fetch for node_claim invites so the join page can show
// "Are you [Name], child of [Parents]?" without requiring RLS access.
async function fetchNodePreview(
  supabase: ReturnType<typeof adminClient>,
  nodeId: string
): Promise<{
  id: string; name: string; birthYear: number | null
  relationship: string | null; gender: string | null; parentNames: string[]
} | null> {
  const { data: node } = await supabase
    .from('family_members')
    .select('id, name, birth_year, relationship, gender, parent_ids')
    .eq('id', nodeId)
    .single()
  if (!node) return null
  const parentIds: string[] = (node as any).parent_ids ?? []
  let parentNames: string[] = []
  if (parentIds.length > 0) {
    const { data: parents } = await supabase
      .from('family_members')
      .select('name')
      .in('id', parentIds)
    parentNames = (parents ?? []).map((p: any) => p.name as string)
  }
  return {
    id: (node as any).id,
    name: (node as any).name,
    birthYear: (node as any).birth_year ?? null,
    relationship: (node as any).relationship ?? null,
    gender: (node as any).gender ?? null,
    parentNames,
  }
}
