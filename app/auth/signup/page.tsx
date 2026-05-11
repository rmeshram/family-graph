"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Mail, Loader2, ArrowRight, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"

type Step = 'email' | 'otp'

export default function SignUpPage() {
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)

  const startCooldown = () => {
    setResendCooldown(60)
    const timer = setInterval(() => setResendCooldown(v => {
      if (v <= 1) { clearInterval(timer); return 0 }
      return v - 1
    }), 1000)
  }

  const sendOTP = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setError('')
    setIsLoading(true)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    })
    setIsLoading(false)
    if (error) { setError(error.message); return }
    setStep('otp')
    startCooldown()
  }

  const verifyOTP = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    const { data, error } = await supabase.auth.verifyOtp({ email, token: otp, type: 'email' })
    setIsLoading(false)
    if (error) { setError(error.message); return }
    // New user → onboarding; returning user → dashboard
    const isNew = data.user?.created_at === data.user?.last_sign_in_at
    router.push(isNew ? '/onboarding' : '/dashboard')
    router.refresh()
  }

  const signUpWithGoogle = async () => {
    setIsLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback` },
    })
    if (error) { setError(error.message); setIsLoading(false) }
  }

  return (
    <div>
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-foreground mb-2">Create your account</h1>
        <p className="text-muted-foreground">
          {step === 'email' ? 'Start building your family tree today' : `Check your inbox at ${email}`}
        </p>
      </div>

      {step === 'email' && (
        <form onSubmit={sendOTP} className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email address</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="pl-10 h-11 bg-muted/50 border-border"
                required
                autoFocus
              />
            </div>
            <p className="text-[11px] text-muted-foreground">We'll email you a 6-digit code — no password needed</p>
          </div>
          <Button type="submit" className="w-full h-11" disabled={isLoading || !email.includes('@')}>
            {isLoading
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending code...</>
              : <>Get started <ArrowRight className="w-4 h-4 ml-2" /></>}
          </Button>
        </form>
      )}

      {step === 'otp' && (
        <form onSubmit={verifyOTP} className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              {error}
            </div>
          )}
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 text-primary text-sm text-center">
            6-digit code sent to <strong>{email}</strong> ✓
          </div>
          <div className="space-y-2">
            <Label htmlFor="otp">Enter 6-digit code</Label>
            <Input
              id="otp"
              type="text"
              inputMode="numeric"
              placeholder="• • • • • •"
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="h-14 text-center text-2xl tracking-[0.5em] bg-muted/50 border-border font-mono"
              required
              autoFocus
              maxLength={6}
            />
          </div>
          <Button type="submit" className="w-full h-11" disabled={isLoading || otp.length < 6}>
            {isLoading
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Verifying...</>
              : 'Verify & Create Account'}
          </Button>
          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={() => { setStep('email'); setOtp(''); setError('') }}
              className="text-muted-foreground hover:text-foreground"
            >
              ← Change email
            </button>
            <button
              type="button"
              onClick={() => sendOTP()}
              disabled={resendCooldown > 0}
              className={cn('flex items-center gap-1 text-primary hover:text-primary/80', resendCooldown > 0 && 'opacity-50 cursor-not-allowed')}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
            </button>
          </div>
        </form>
      )}

      <div className="relative my-6">
        <Separator />
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-2 text-xs text-muted-foreground">
          or continue with
        </span>
      </div>

      <Button type="button" variant="outline" className="w-full h-11 border-border hover:bg-muted" onClick={signUpWithGoogle} disabled={isLoading}>
        <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
        Continue with Google
      </Button>

      <p className="text-center text-sm text-muted-foreground mt-6">
        Already have an account?{" "}
        <Link href="/auth/signin" className="text-primary hover:underline font-medium">Sign in</Link>
      </p>
    </div>
  )
}

