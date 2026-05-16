import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL
      ? process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/^(https:\/\/[a-z0-9]{6}).*/, '$1…')
      : 'NOT SET',
  })
}
