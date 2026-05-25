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

const VALID_MODES = ['open', 'protected', 'closed'] as const

/**
 * PATCH /api/admin/family/privacy
 * Body: { privacyMode: 'open' | 'protected' | 'closed' }
 *
 * Updates the family's privacy_mode. Caller must have role = 'admin'.
 * Uses the service-role client because the `families: creator can update` RLS
 * policy only allows the original creator to update — this route enforces the
 * admin-role check in application code instead, making it work for any admin.
 */
export async function PATCH(req: NextRequest) {
  const supabase = await authedClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 })

  let body: { privacyMode?: string }
  try { body = await req.json() } catch { body = {} }

  const { privacyMode } = body
  if (!VALID_MODES.includes(privacyMode as any)) {
    return NextResponse.json({ error: `privacyMode must be one of: ${VALID_MODES.join(', ')}` }, { status: 400 })
  }

  const admin = adminClient()

  // Verify caller is admin of their family
  const { data: profile } = await admin
    .from('profiles')
    .select('role, family_id')
    .eq('id', user.id)
    .single()

  if ((profile as any)?.role !== 'admin') {
    return NextResponse.json({ error: 'FORBIDDEN — admin role required' }, { status: 403 })
  }

  const familyId: string | null = (profile as any)?.family_id ?? null
  if (!familyId) {
    return NextResponse.json({ error: 'Caller has no family' }, { status: 400 })
  }

  const { error } = await admin
    .from('families')
    .update({ privacy_mode: privacyMode } as any)
    .eq('id', familyId)

  if (error) {
    console.error('[admin/family/privacy] update error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, privacyMode })
}
