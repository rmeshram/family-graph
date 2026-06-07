import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { normalizePhone } from '@/lib/phone-utils'
import type { Database } from '@/lib/supabase/database.types'

// ISSUE-25: replace per-process in-memory Map with a DB-backed rate limit table
// (phone_discovery_rate_limits, created in migration 039) so the 5-req/min limit
// applies globally across all warm serverless instances, not just per-process.
const RATE_LIMIT = 5
const RATE_WINDOW_MS = 60_000

function adminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} }, auth: { persistSession: false } }
  )
}

// ─── Route handler ───────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'

  let body: { phone?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { phone } = body
  if (!phone) {
    return NextResponse.json({ error: 'phone is required' }, { status: 400 })
  }

  const e164 = normalizePhone(phone)
  if (!e164) {
    return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })
  }

  // Build a server-side Supabase client (respects RLS via service role is NOT used here —
  // we intentionally use the anon key so RLS applies and private nodes stay hidden).
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: () => { }, // read-only context
      },
    }
  )

  // Verify caller is authenticated (prevents unauthenticated phone enumeration)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  // ISSUE-25: DB-based rate limit — global across all serverless instances.
  // Count how many requests this user has made in the last RATE_WINDOW_MS ms.
  const rl = adminClient()
  const windowStart = new Date(Date.now() - RATE_WINDOW_MS).toISOString()
  const { count: recentCount } = await rl
    .from('phone_discovery_rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gt('created_at', windowStart)
  if ((recentCount ?? 0) >= RATE_LIMIT) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a minute and try again.' },
      { status: 429 }
    )
  }
  await rl.from('phone_discovery_rate_limits').insert({
    user_id: user.id, ip, created_at: new Date().toISOString(),
  } as any)

  // Search for unclaimed nodes with this phone across families.
  // We intentionally do NOT filter by family_id — the point is cross-family discovery.
  // RLS on family_members ensures only visible nodes are returned.
  const { data: nodes, error } = await supabase
    .from('family_members')
    .select('id, name, relationship, generation, birth_year, family_id, families(name)')
    .eq('normalized_phone' as any, e164)
    .eq('is_claimed' as any, false)
    .neq('visibility' as any, 'private')
    .limit(10)

  if (error) {
    console.error('[phone-discovery] query error:', error)
    return NextResponse.json({ error: 'Discovery failed' }, { status: 500 })
  }

  // Shape the response — never return the phone number itself back to the client
  const candidates = (nodes ?? []).map((n: any) => ({
    id: n.id,
    name: n.name,
    relationship: n.relationship ?? null,
    generation: n.generation ?? null,
    birthYear: n.birth_year ?? null,
    familyId: n.family_id,
    familyName: n.families?.name ?? null,
  }))

  return NextResponse.json({ candidates })
}
