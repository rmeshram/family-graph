import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  // Skip middleware entirely if Supabase is not configured yet
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.next()
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session — don't call getUser() before this
  const { data: { user } } = await supabase.auth.getUser()

  const { pathname, searchParams } = request.nextUrl

  // Demo mode: persist via cookie so it survives hard navigation / refresh.
  // Activated by either ?demo=1 in the URL or an existing fg_demo cookie.
  const demoParam = searchParams.get('demo') === '1'
  const demoCookie = request.cookies.get('fg_demo')?.value === '1'
  const isDemo = demoParam || demoCookie
  if (demoParam && !demoCookie) {
    supabaseResponse.cookies.set('fg_demo', '1', {
      path: '/',
      sameSite: 'lax',
      maxAge: 60 * 60 * 4, // 4 hours
    })
  }

  // Protected app routes — require an authenticated session.
  // We intentionally do NOT gate /onboarding (handled in-app) or /join/[code] (public preview).
  const protectedPrefixes = [
    '/dashboard',
    '/members',
    '/memory',
    '/events',
    '/timeline',
    '/biodata',
    '/poster',
    '/ai-copilot',
    '/kulgatha',
    '/migration',
    '/today',
    '/invite',
  ]
  const isProtected = protectedPrefixes.some(p => pathname === p || pathname.startsWith(p + '/'))

  if (!user && isProtected && !isDemo) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/signin'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  // If signed in and hitting auth pages, redirect to dashboard
  if (user && (pathname === '/auth/signin' || pathname === '/auth/signup')) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // /auth/phone-onboarding is accessible to authenticated users without a family_id —
  // do NOT redirect them to /auth/signin even though it's under /auth/.
  // (middleware has no easy way to query family_id, so we just allow all /auth/* for authed users
  //  except the above signin/signup which redirect to dashboard)

  // Clear demo cookie once a user has actually signed in
  if (user && demoCookie) {
    supabaseResponse.cookies.set('fg_demo', '', { path: '/', maxAge: 0 })
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // Skip Next internals, static assets, and API routes (they have their own auth checks)
    '/((?!api|_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
