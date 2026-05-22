import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')
  const next = searchParams.get('next') ?? '/dashboard'

  // Handle OAuth errors (e.g., provider not configured, user denied access)
  if (error) {
    const msg = encodeURIComponent(errorDescription || error)
    return NextResponse.redirect(`${origin}/auth/signin?error=${msg}`)
  }

  if (code) {
    const supabase = await createClient()
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
    if (!exchangeError) {
      // After OAuth (Google), detect new vs returning user
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('family_id')
          .eq('id', user.id)
          .single()
        // New user (no family yet) → onboarding (preserve ?next so invite flow resumes)
        if (!profile?.family_id) {
          const onboardingUrl = next !== '/dashboard'
            ? `${origin}/onboarding?next=${encodeURIComponent(next)}`
            : `${origin}/onboarding`
          return NextResponse.redirect(onboardingUrl)
        }
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/signin?error=auth_callback_failed`)
}
