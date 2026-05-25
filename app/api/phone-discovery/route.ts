import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { normalizePhone } from '@/lib/phone-utils'
import type { Database } from '@/lib/supabase/database.types'

// ─── Simple in-memory rate limiter ───────────────────────────────────────────
// 5 requests per IP per 60-second window. Resets per serverless instance restart.
// Supabase OTP has its own rate limits on top of this.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 5
const RATE_WINDOW_MS = 60_000

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return true
  }
  if (entry.count >= RATE_LIMIT) return false
  entry.count++
  return true
}

// ─── Route handler ───────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  // Rate limit by IP
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a minute and try again.' },
      { status: 429 }
    )
  }

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
