'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useJoinFamily } from '@/hooks/use-invites'
import { Button } from '@/components/ui/button'
import { Loader2, Users, CheckCircle2, XCircle } from 'lucide-react'

type Status = 'loading' | 'joining' | 'success' | 'error' | 'needs_auth'

export default function JoinPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  const { joinWithCode } = useJoinFamily()
  const code = params.code as string

  const [status, setStatus] = useState<Status>('loading')
  const [message, setMessage] = useState('')
  const [familyName, setFamilyName] = useState('')

  useEffect(() => {
    const init = async () => {
      // Check auth first
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setStatus('needs_auth')
        return
      }

      // Preview invite details
      const { data: invite } = await supabase
        .from('invite_links')
        .select('*, families(name)')
        .eq('code', code.toUpperCase())
        .single()

      if (!invite) { setStatus('error'); setMessage('Invalid or expired invite link.'); return }
      // @ts-expect-error joined relation
      setFamilyName(invite.families?.name ?? 'this family')
      setStatus('joining')
    }
    init()
  }, [code, supabase])

  const handleJoin = async () => {
    setStatus('loading')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setStatus('needs_auth'); return }
      await joinWithCode(code, user.id)
      setStatus('success')
      setTimeout(() => router.push('/dashboard'), 1500)
    } catch (e: unknown) {
      setStatus('error')
      setMessage(e instanceof Error ? e.message : 'Something went wrong')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border/50 bg-card p-8 text-center shadow-xl">
        <div className="mb-4 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-secondary shadow-lg">
            <Users className="h-8 w-8 text-white" />
          </div>
        </div>

        {status === 'loading' && (
          <>
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">Loading invite...</p>
          </>
        )}

        {status === 'needs_auth' && (
          <>
            <h1 className="text-xl font-bold mb-2">Sign in to join</h1>
            <p className="text-muted-foreground text-sm mb-6">You need an account to join a family tree.</p>
            <Button className="w-full" onClick={() => router.push(`/auth/signin?next=/join/${code}`)}>
              Sign in / Create account
            </Button>
          </>
        )}

        {status === 'joining' && (
          <>
            <h1 className="text-xl font-bold mb-2">You're invited! 🎉</h1>
            <p className="text-muted-foreground text-sm mb-2">
              Join <strong>{familyName}</strong>'s family tree
            </p>
            <p className="text-[11px] text-muted-foreground mb-6">Code: <code className="font-mono">{code.toUpperCase()}</code></p>
            <Button className="w-full" onClick={handleJoin}>
              Join Family Tree
            </Button>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle2 className="h-10 w-10 text-green-400 mx-auto mb-3" />
            <h1 className="text-xl font-bold mb-2">Welcome to the family! 🙏</h1>
            <p className="text-muted-foreground text-sm">Redirecting to your family tree...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="h-10 w-10 text-destructive mx-auto mb-3" />
            <h1 className="text-xl font-bold mb-2">Couldn't join</h1>
            <p className="text-muted-foreground text-sm mb-6">{message}</p>
            <Button variant="outline" className="w-full" onClick={() => router.push('/')}>
              Go home
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
