"use client"

import { useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Mail, Loader2, ArrowLeft, CheckCircle } from "lucide-react"

export default function ForgotPasswordPage() {
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
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
