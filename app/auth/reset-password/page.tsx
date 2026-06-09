"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Lock, Loader2, CheckCircle, Eye, EyeOff } from "lucide-react"

export default function ResetPasswordPage() {
  const router = useRouter()
  const supabase = createClient()

  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [sessionError, setSessionError] = useState('')
  const [formError, setFormError] = useState('')
  const [success, setSuccess] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)

  // Supabase sends a PKCE reset link pointing here with ?code=xxx.
  // Exchange the code for a session, then verify we have an authenticated user.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')

    const init = async () => {
      if (code) {
        // Remove the code from the URL so it can't be replayed on refresh
        window.history.replaceState({}, '', window.location.pathname)
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
        if (exchangeError) {
          setSessionError('This reset link has expired or has already been used. Please request a new one.')
          return
        }
      }
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setSessionReady(true)
      } else {
        setSessionError('This reset link has expired or has already been used. Please request a new one.')
      }
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    if (password.length < 6) { setFormError('Password must be at least 6 characters'); return }
    setIsLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setIsLoading(false)
    if (error) { setFormError(error.message); return }
    setSuccess(true)
    setTimeout(() => { router.push('/dashboard'); router.refresh() }, 2000)
  }

  return (
    <div>
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-foreground mb-2">Set new password</h1>
        <p className="text-muted-foreground">Choose a strong password for your account</p>
      </div>

      {success ? (
        <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-green-500 text-sm flex items-start gap-3">
          <CheckCircle className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Password updated!</p>
            <p className="text-green-500/80 mt-1">Redirecting to your dashboard...</p>
          </div>
        </div>
      ) : !sessionReady ? (
        <div className="space-y-4">
          {sessionError ? (
            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              <p className="font-medium">Link expired</p>
              <p className="mt-1 text-destructive/80">{sessionError}</p>
            </div>
          ) : (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}
          <a href="/auth/forgot-password"
            className="block w-full text-center rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors">
            Request a new reset link
          </a>
        </div>
      ) : (
        <form onSubmit={handleUpdate} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              {formError}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="At least 6 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="pl-10 pr-10 h-11 bg-muted/50 border-border"
                required
                autoFocus
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <Button type="submit" className="w-full h-11" disabled={isLoading || password.length < 6}>
            {isLoading
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Updating...</>
              : 'Update password'}
          </Button>
        </form>
      )}
    </div>
  )
}
