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

// GET /api/nodes/archived
// Returns all soft-deleted (archived) nodes for the caller's family.
// Requires admin role. Uses service-role to bypass the `deleted_at IS NULL` RLS predicate.
export async function GET(_req: NextRequest) {
  const supabase = await authedClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 })

  const admin = adminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('role, family_id')
    .eq('id', user.id)
    .single()

  if ((profile as any)?.role !== 'admin')
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })

  const familyId = (profile as any).family_id as string | null
  if (!familyId)
    return NextResponse.json({ error: 'NO_FAMILY' }, { status: 400 })

  const { data: nodes, error } = await admin
    .from('family_members')
    .select('id, name, birth_year, gender, relationship, deleted_at, deleted_by, claim_status')
    .eq('family_id', familyId)
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ nodes: nodes ?? [] })
}
