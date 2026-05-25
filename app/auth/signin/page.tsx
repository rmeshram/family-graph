"use client"

import { useState, useEffect, useRef, Suspense } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { FEATURE_FLAGS } from "@/lib/feature-flags"
import { normalizePhone, isValidIndianPhone, formatPhoneDisplay } from "@/lib/phone-utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Mail, Lock, Loader2, ArrowRight, Eye, EyeOff, Phone, ChevronLeft } from "lucide-react"
import { cn } from "@/lib/utils"

export default function SignInPage() {
  return (
    <Suspense>
      <SignInContent />
    </Suspense>
  )
}

// ─── Email + password form ─────────────────────────────────────────────────────
function EmailSignIn() {
  const searchParams = useSearchParams()
  const supabase = createClient()
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const urlError = searchParams.get('error')
    if (urlError) setError(decodeURIComponent(urlError))
  }, [searchParams])

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    setIsLoading(false)
    if (error) { setError(error.message); return }
    if (!data.user) { setError('Sign in failed — please try again.'); return }

    const nextPath = searchParams.get('next')
    if (nextPath && nextPath.startsWith('/') && !nextPath.startsWith('//')) {
      router.push(nextPath); router.refresh(); return
    }
    const { data: profile } = await supabase
      .from('profiles').select('family_id').eq('id', data.user.id).single()
    router.push(!profile?.family_id ? '/onboarding' : '/dashboard')
    router.refresh()
  }

  const signInWithGoogle = async () => {
    setIsLoading(true)
    const nextPath = searchParams.get('next')
    const callbackUrl = nextPath && nextPath.startsWith('/') && !nextPath.startsWith('//')
      ? `${location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`
      : `${location.origin}/auth/callback`
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl },
    })
    if (error) { setError(error.message); setIsLoading(false) }
  }

  return (
    <>
      <form onSubmit={handleSignIn} className="space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">{error}</div>
        )}
        <div className="space-y-2">
          <Label htmlFor="email">Email address</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input id="email" type="email" placeholder="you@example.com" value={email}
              onChange={e => setEmail(e.target.value)} className="pl-10 h-11 bg-muted/50 border-border" required autoFocus />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="/auth/forgot-password" className="text-xs text-primary hover:underline">Forgot password?</Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input id="password" type={showPassword ? 'text' : 'password'} placeholder="Your password" value={password}
              onChange={e => setPassword(e.target.value)} className="pl-10 pr-10 h-11 bg-muted/50 border-border" required />
            <button type="button" onClick={() => setShowPassword(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <Button type="submit" className="w-full h-11" disabled={isLoading || !email.includes('@') || !password}>
          {isLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Signing in…</> : <>Sign in <ArrowRight className="w-4 h-4 ml-2" /></>}
        </Button>
      </form>
      <div className="relative my-6">
        <Separator />
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-2 text-xs text-muted-foreground">or continue with</span>
      </div>
      <Button type="button" variant="outline" className="w-full h-11 border-border hover:bg-muted" onClick={signInWithGoogle} disabled={isLoading}>
        <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
        Continue with Google
      </Button>
    </>
  )
}

// ─── Phone + OTP form ─────────────────────────────────────────────────────────
const OTP_RESEND_SECONDS = 60

function friendlyPhoneError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('unsupported phone provider') || m.includes('phone provider')) {
    return 'SMS delivery is not configured yet. Please sign in with email or Google for now.'
  }
  if (m.includes('invalid otp') || m.includes('token is invalid')) {
    return 'Incorrect OTP — please check and try again.'
  }
  if (m.includes('expired') || m.includes('token has expired')) {
    return 'OTP has expired. Please go back and request a new one.'
  }
  if (m.includes('invalid phone') || m.includes('phone number format')) {
    return 'Invalid phone number. Please enter a valid 10-digit Indian mobile number.'
  }
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Too many attempts. Please wait a minute before trying again.'
  }
  return message
}

function PhoneSignIn({ onSwitchToEmail }: { onSwitchToEmail?: () => void }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [isProviderError, setIsProviderError] = useState(false)
  const [resendSeconds, setResendSeconds] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const e164 = normalizePhone(phone) ?? ''

  const startResendTimer = () => {
    setResendSeconds(OTP_RESEND_SECONDS)
    timerRef.current = setInterval(() => {
      setResendSeconds(s => {
        if (s <= 1) { clearInterval(timerRef.current!); return 0 }
        return s - 1
      })
    }, 1000)
  }

  const sendOtp = async () => {
    setError('')
    setIsProviderError(false)
    setIsLoading(true)
    const { error } = await supabase.auth.signInWithOtp({ phone: e164 })
    setIsLoading(false)
    if (error) {
      const friendly = friendlyPhoneError(error.message)
      setError(friendly)
      if (error.message.toLowerCase().includes('phone provider')) setIsProviderError(true)
      return
    }
    setStep('otp')
    startResendTimer()
  }

  const verifyOtp = async () => {
    if (otp.length !== 6) return
    setError('')
    setIsLoading(true)
    const { data, error } = await supabase.auth.verifyOtp({ phone: e164, token: otp, type: 'sms' })
    setIsLoading(false)
    if (error) { setError(friendlyPhoneError(error.message)); return }
    if (!data.user) { setError('Verification failed — please try again.'); return }

    const nextPath = searchParams.get('next')
    if (nextPath && nextPath.startsWith('/') && !nextPath.startsWith('//')) {
      router.push(nextPath); router.refresh(); return
    }
    const { data: profile } = await supabase.from('profiles').select('family_id').eq('id', data.user.id).single()
    if (profile?.family_id) {
      router.push('/dashboard')
    } else {
      router.push(`/auth/phone-onboarding?phone=${encodeURIComponent(e164)}`)
    }
    router.refresh()
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          <p>{error}</p>
          {isProviderError && onSwitchToEmail && (
            <button onClick={onSwitchToEmail}
              className="mt-2 text-xs font-medium underline underline-offset-2 hover:opacity-80">
              Use email / Google instead →
            </button>
          )}
        </div>
      )}
      {step === 'phone' && (
        <>
          <div className="space-y-2">
            <Label htmlFor="phone">Mobile number</Label>
            <div className="flex gap-2">
              <div className="flex items-center justify-center rounded-lg border border-border bg-muted/50 px-3 h-11 text-sm font-medium text-foreground shrink-0 gap-1.5">
                🇮🇳 <span className="text-muted-foreground">+91</span>
              </div>
              <div className="relative flex-1">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input id="phone" type="tel" inputMode="numeric" placeholder="98765 43210" value={phone}
                  onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  className="pl-10 h-11 bg-muted/50 border-border font-mono tracking-wide" autoFocus />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">We'll send a 6-digit OTP via SMS or WhatsApp.</p>
          </div>
          <Button className="w-full h-11" disabled={isLoading || !isValidIndianPhone(phone)} onClick={sendOtp}>
            {isLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending OTP…</> : <>Send OTP <ArrowRight className="w-4 h-4 ml-2" /></>}
          </Button>
        </>
      )}
      {step === 'otp' && (
        <>
          <div className="space-y-3">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-1">
                OTP sent to <span className="font-medium text-foreground">{formatPhoneDisplay(e164)}</span>
              </p>
              <button type="button" onClick={() => { setStep('phone'); setOtp('') }}
                className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                <ChevronLeft className="w-3 h-3" /> Change number
              </button>
            </div>
            <div className="flex justify-center">
              <InputOTP maxLength={6} value={otp} onChange={setOtp} onComplete={verifyOtp}>
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>
          </div>
          <Button className="w-full h-11" disabled={isLoading || otp.length !== 6} onClick={verifyOtp}>
            {isLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Verifying…</> : <>Verify & Sign in <ArrowRight className="w-4 h-4 ml-2" /></>}
          </Button>
          <div className="text-center">
            {resendSeconds > 0
              ? <p className="text-xs text-muted-foreground">Resend in {resendSeconds}s</p>
              : <button type="button" onClick={sendOtp} disabled={isLoading} className="text-xs text-primary hover:underline">Resend OTP</button>}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Main sign-in page ────────────────────────────────────────────────────────
function SignInContent() {
  const showPhone = FEATURE_FLAGS.enablePhoneOtpAuth
  const showEmail = FEATURE_FLAGS.enableEmailPasswordAuth
  const showTabs = showPhone && showEmail
  const [tab, setTab] = useState<'phone' | 'email'>(showPhone ? 'phone' : 'email')

  return (
    <div>
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-foreground mb-2">Welcome back 🙏</h1>
        <p className="text-muted-foreground">Sign in to your family tree</p>
      </div>

      {showTabs && (
        <div className="flex rounded-xl border border-border bg-muted/30 p-1 mb-6 gap-1">
          {(['phone', 'email'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-all',
                tab === t ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}>
              {t === 'phone' ? <Phone className="w-3.5 h-3.5" /> : <Mail className="w-3.5 h-3.5" />}
              {t === 'phone' ? 'Phone' : 'Email'}
            </button>
          ))}
        </div>
      )}

      {showPhone && tab === 'phone' && <PhoneSignIn onSwitchToEmail={showTabs ? () => setTab('email') : undefined} />}
      {showEmail && tab === 'email' && <EmailSignIn />}

      <p className="text-center text-sm text-muted-foreground mt-6">
        New to Family Graph?{" "}
        <Link href="/auth/signup" className="text-primary hover:underline font-medium">Create account</Link>
      </p>

      <div className="relative mt-6">
        <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border/40" /></div>
        <div className="relative flex justify-center">
          <span className="bg-background px-2 text-xs text-muted-foreground/60">or</span>
        </div>
      </div>

      <Link href="/dashboard?demo=1"
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.07] py-2.5 text-sm font-medium text-amber-400 hover:bg-amber-500/15 transition-colors">
        🌳 Explore demo — no sign in needed
      </Link>
    </div>
  )
}
