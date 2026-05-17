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

// POST /api/users/me/suggested-node-matches/[nodeId]/dismiss
export async function POST(
  req: NextRequest,
  { params }: { params: { nodeId: string } }
) {
  const supabase = await authedClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 })

  let body: { reason?: string }
  try { body = await req.json() } catch { body = {} }

  const reason = body.reason ?? 'not_me'

  const admin = adminClient()
  await admin.from('node_match_dismissals').upsert(
    { user_id: user.id, node_id: params.nodeId, reason },
    { onConflict: 'user_id,node_id' }
  )

  // Best-effort audit (no family_id available without extra query)
  await admin.from('claim_audit_log').insert({
    node_id: params.nodeId,
    actor_id: user.id,
    action: 'match_dismissed',
    metadata: { reason },
  }).then(() => { })

  return NextResponse.json({ dismissed: true })
}
