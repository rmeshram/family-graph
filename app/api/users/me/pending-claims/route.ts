import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

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

// GET /api/users/me/pending-claims
// Returns the caller's in-flight claim requests (for cross-device resume).
export async function GET() {
  const supabase = await authedClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ pendingClaims: [] })

  const { data } = await supabase
    .from('claim_requests')
    .select(
      'id, node_id, status, confidence_score, intent_token, resume_step, created_at, expires_at, family_members(name, family_id)'
    )
    .eq('claimant_user_id', user.id)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })

  return NextResponse.json({ pendingClaims: data ?? [] })
}
