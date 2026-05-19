import { NextResponse } from 'next/server'
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

/**
 * GET /api/claims/pending
 * Returns pending claim_requests for nodes owned by the caller's family.
 * Admin-only.
 */
export async function GET() {
  const supabase = await authedClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 })

  const admin = adminClient()

  // Get caller's profile to verify admin + family
  const { data: profile } = await admin
    .from('profiles')
    .select('role, family_id')
    .eq('id', user.id)
    .single()

  if ((profile as any)?.role !== 'admin') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  }
  const familyId: string = (profile as any).family_id
  if (!familyId) return NextResponse.json({ claims: [] })

  // Get all family member IDs for this family
  const { data: nodes } = await admin
    .from('family_members')
    .select('id, name, relationship, claim_status, date_of_birth')
    .eq('family_id', familyId)

  if (!nodes || nodes.length === 0) return NextResponse.json({ claims: [] })

  const nodeIds = nodes.map((n: any) => n.id)
  const nodeMap = new Map(nodes.map((n: any) => [n.id, n]))

  // Fetch pending claim_requests for those nodes
  const { data: requests } = await admin
    .from('claim_requests')
    .select('id, node_id, claimant_user_id, status, submitted_name, submitted_birth_year, confidence_score, attempts, created_at, expires_at')
    .in('node_id', nodeIds)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (!requests || requests.length === 0) return NextResponse.json({ claims: [] })

  // Fetch claimant display names from profiles
  const claimantIds = [...new Set(requests.map((r: any) => r.claimant_user_id))]
  const { data: claimants } = await admin
    .from('profiles')
    .select('id, display_name, avatar_url')
    .in('id', claimantIds)
  const claimantMap = new Map((claimants ?? []).map((c: any) => [c.id, c]))

  const claims = requests.map((r: any) => {
    const node = nodeMap.get(r.node_id) as any
    const claimant = claimantMap.get(r.claimant_user_id) as any
    return {
      id: r.id,
      nodeId: r.node_id,
      nodeName: node?.name ?? 'Unknown',
      nodeRelationship: node?.relationship ?? null,
      nodeDob: node?.date_of_birth ?? null,
      claimantUserId: r.claimant_user_id,
      claimantName: claimant?.display_name ?? 'Unknown User',
      submittedName: r.submitted_name,
      submittedBirthYear: r.submitted_birth_year,
      confidenceScore: r.confidence_score,
      attempts: r.attempts,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
    }
  })

  return NextResponse.json({ claims })
}
