"use client"

import { useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Mail, Loader2, ArrowLeft, CheckCircle, AlertTriangle } from "lucide-react"

function ForgotPasswordForm() {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const linkExpired = searchParams.get('expired') === '1'

  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      // Point directly at the reset page. That page will exchange the PKCE code
      // itself. Using /auth/callback as an intermediary requires that URL to be
      // explicitly in Supabase's Redirect URLs allowlist; pointing at the reset
      // page works as long as the Site URL wildcard covers it.
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
    setIsLoading(false)
    // Always show success — never reveal whether the email is registered (prevents account enumeration)
    if (error) {
      console.warn('reset password error:', error.message)
    }
    setSent(true)
  }

  return (
    <div>
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-foreground mb-2">Reset your password</h1>
        <p className="text-muted-foreground">
          {sent ? 'Check your email for the reset link' : "We'll send you a link to reset it"}
        </p>
      </div>

      {linkExpired && !sent && (
        <div className="mb-4 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-sm flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">That link has expired</p>
            <p className="mt-1 opacity-80">Password reset links are valid for 1 hour. Enter your email below to get a fresh one.</p>
          </div>
        </div>
      )}

      {sent ? (
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-green-500 text-sm flex items-start gap-3">
            <CheckCircle className="w-5 h-5 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Reset link sent!</p>
              <p className="text-green-500/80 mt-1">
                Check your inbox at <strong>{email}</strong>. Click the link in the email to set a new password.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full h-11"
            onClick={() => { setSent(false); setEmail('') }}
          >
            Send again with different email
          </Button>
        </div>
      ) : (
        <form onSubmit={handleReset} className="space-y-4">
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
          </div>
          <Button type="submit" className="w-full h-11" disabled={isLoading || !email.includes('@')}>
            {isLoading
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending...</>
              : 'Send reset link'}
          </Button>
        </form>
      )}

      <Link
        href="/auth/signin"
        className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to sign in
      </Link>
    </div>
  )
}

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <ForgotPasswordForm />
    </Suspense>
  )
}
