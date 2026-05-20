import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function POST(req: NextRequest) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  if (!serviceRoleKey || !supabaseUrl) {
    // No service role key — caller should fall back to direct insert (needs migration 004)
    return NextResponse.json({ error: 'SERVICE_ROLE_NOT_CONFIGURED' }, { status: 503 })
  }

  let body: { name?: string; inviteCode?: string; createdBy?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { name, inviteCode, createdBy } = body
  if (!name || !inviteCode || !createdBy) {
    return NextResponse.json({ error: 'Missing required fields: name, inviteCode, createdBy' }, { status: 400 })
  }
  // Input validation
  const trimmedName = String(name).trim()
  if (trimmedName.length < 1 || trimmedName.length > 100) {
    return NextResponse.json({ error: 'INVALID_NAME' }, { status: 400 })
  }
  if (!/^[A-Z0-9]{4,16}$/.test(String(inviteCode).toUpperCase())) {
    return NextResponse.json({ error: 'INVALID_INVITE_CODE' }, { status: 400 })
  }

  // Use service role client — bypasses all RLS policies
  const adminClient = createServerClient(supabaseUrl, serviceRoleKey, {
    cookies: { getAll: () => [], setAll: () => { } },
    auth: { persistSession: false },
  })

  const { data: family, error } = await adminClient
    .from('families')
    .insert({ name: trimmedName, invite_code: String(inviteCode).toUpperCase(), created_by: createdBy })
    .select()
    .single()

  if (error) {
    console.error('create-family error:', error)
    // Do not leak DB error messages to the client
    return NextResponse.json({ error: 'CREATE_FAILED' }, { status: 500 })
  }

  return NextResponse.json({ family: { id: family.id, invite_code: family.invite_code } })
}
