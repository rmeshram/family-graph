import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { scoreCandidate } from '@/lib/match-detection'

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

// GET /api/users/me/suggested-node-matches
// Returns up to 5 unclaimed nodes from OTHER families that likely match the caller.
export async function GET() {
  const supabase = await authedClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 })

  const admin = adminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('display_name, phone, family_id')
    .eq('id', user.id)
    .single()

  const { data: authUser } = await admin.auth.admin.getUserById(user.id)
  const userEmail = authUser?.user?.email ?? null

  if (!profile || !(profile as any).display_name) {
    return NextResponse.json({ matches: [] })
  }

  // Get dismissed nodes
  const { data: dismissed } = await admin
    .from('node_match_dismissals')
    .select('node_id')
    .eq('user_id', user.id)
  const dismissedIds = new Set((dismissed ?? []).map((d: any) => d.node_id))

  // Fetch unclaimed nodes outside the user's own family
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fmQuery = admin.from('family_members') as any
  const { data: nodes } = await fmQuery
    .select('id, name, birth_year, phone, email, relationship, family_id, added_by')
    .eq('claim_status', 'unclaimed')
    .neq('family_id', (profile as any).family_id ?? '')
    .eq('is_deceased', false)
    .neq('visibility', 'private') // MUC-15: never surface private nodes in match suggestions
    .is('deleted_at', null)       // exclude archived nodes
    .limit(200)

  if (!nodes?.length) return NextResponse.json({ matches: [] })

  // Batch-load family names
  const familyIds = [...new Set(nodes.map((n: any) => n.family_id))]
  const { data: families } = await admin
    .from('families')
    .select('id, name')
    .in('id', familyIds)
  const familyMap = new Map((families ?? []).map((f: any) => [f.id, f.name]))

  // Batch-load adder names
  const adderIds = [...new Set(nodes.map((n: any) => n.added_by).filter(Boolean))]
  const { data: adders } = adderIds.length
    ? await admin.from('profiles').select('id, display_name').in('id', adderIds)
    : { data: [] }
  const adderMap = new Map((adders ?? []).map((a: any) => [a.id, a.display_name]))

  const userProfile = {
    name: (profile as any).display_name as string,
    birthYear: null as number | null,
    phone: (profile as any).phone ?? null,
    email: userEmail,
  }

  const results = nodes
    .filter((n: any) => !dismissedIds.has(n.id))
    .map((n: any) =>
      scoreCandidate(
        {
          nodeId: n.id,
          nodeName: n.name,
          familyId: n.family_id,
          familyName: familyMap.get(n.family_id) ?? 'Unknown Family',
          addedByName: adderMap.get(n.added_by) ?? null,
          relationship: n.relationship ?? null,
          birthYear: n.birth_year ?? null,
          phone: n.phone ?? null,
          email: n.email ?? null,
        },
        userProfile
      )
    )
    .filter(Boolean)
    .sort((a: any, b: any) => (b?.confidenceScore ?? 0) - (a?.confidenceScore ?? 0))
    .slice(0, 5)

  return NextResponse.json({ matches: results })
}
