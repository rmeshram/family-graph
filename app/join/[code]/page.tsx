'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useJoinFamily } from '@/hooks/use-invites'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Loader2, CheckCircle2, XCircle, TreePine, ArrowRight, Share2, Heart, Users, User, GitBranch, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'

type Status = 'loading' | 'preview' | 'relate' | 'joining' | 'success' | 'error'
type RelType = 'spouse' | 'child' | 'parent' | 'sibling' | 'relative' | 'skip'

interface FamilyPreview {
  name: string
  memberCount: number
  generationCount: number
  recentNames: string[]
  inviterName: string | null
}

const RELATIONSHIP_OPTIONS: { key: RelType; label: string; sublabel: string; icon: React.ElementType; color: string }[] = [
  { key: 'spouse', label: 'Spouse / Partner', sublabel: 'Husband, wife, or partner', icon: Heart, color: 'text-pink-400 bg-pink-500/10 border-pink-500/30' },
  { key: 'child', label: 'Son / Daughter', sublabel: 'Their child', icon: User, color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
  { key: 'parent', label: 'Father / Mother', sublabel: 'Their parent', icon: Users, color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  { key: 'sibling', label: 'Brother / Sister', sublabel: 'Their sibling', icon: GitBranch, color: 'text-green-400 bg-green-500/10 border-green-500/30' },
  { key: 'relative', label: 'Other Relative', sublabel: 'Uncle, aunt, cousin, in-law…', icon: UserPlus, color: 'text-violet-400 bg-violet-500/10 border-violet-500/30' },
  { key: 'skip', label: 'Just Browse', sublabel: 'Add details later', icon: ArrowRight, color: 'text-muted-foreground bg-muted/30 border-border/50' },
]

export default function JoinPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  const { joinWithCode } = useJoinFamily()
  const code = params.code as string

  const [status, setStatus] = useState<Status>('loading')
  const [message, setMessage] = useState('')
  const [preview, setPreview] = useState<FamilyPreview | null>(null)
  const [isAuthed, setIsAuthed] = useState(false)

  // Relationship step state
  const [selectedRel, setSelectedRel] = useState<RelType | null>(null)
  const [displayName, setDisplayName] = useState('')

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setIsAuthed(!!user)
      if (user) setDisplayName('') // will pre-fill below

      const { data: invite } = await supabase
        .from('invite_links')
        .select('*, families(name)')
        .eq('code', code.toUpperCase())
        .single()

      if (!invite) { setStatus('error'); setMessage('Invalid or expired invite link.'); return }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inv = invite as any
      const familyName = inv.families?.name ?? 'this family'

      // Inviter name
      let inviterName: string | null = null
      if (inv.created_by) {
        const { data: inviterProf } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', inv.created_by)
          .single()
        inviterName = (inviterProf as any)?.display_name ?? null
      }

      // Family preview stats
      const { data: members } = await supabase
        .from('family_members')
        .select('name, generation')
        .eq('family_id', inv.family_id)
        .limit(50)

      const memberCount = members?.length ?? 0
      const generations = new Set(members?.map(m => m.generation) ?? [])
      const recentNames = (members ?? []).slice(0, 4).map(m => m.name.split(' ')[0])

      setPreview({ name: familyName, memberCount, generationCount: generations.size, recentNames, inviterName })
      setStatus('preview')
    }
    init()
  }, [code, supabase])

  const handleContinueToRelate = () => {
    if (!isAuthed) { router.push(`/auth/signin?next=/join/${code}`); return }
    setStatus('relate')
  }

  const handleJoin = async () => {
    if (!isAuthed) { router.push(`/auth/signin?next=/join/${code}`); return }
    setStatus('joining')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push(`/auth/signin?next=/join/${code}`); return }
      await joinWithCode(code, user.id, {
        displayName: displayName.trim() || undefined,
        relationshipToInviter: selectedRel ?? 'skip',
      })
      setStatus('success')
      setTimeout(() => router.push('/dashboard'), 2000)
    } catch (e: unknown) {
      setStatus('error')
      setMessage(e instanceof Error ? e.message : 'Something went wrong')
    }
  }

  const shareUrl = typeof window !== 'undefined' ? window.location.href : ''
  const shareText = `🌳 Join the ${preview?.name ?? 'Family'} tree on Family Graph! ${shareUrl}`

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-12">
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5" />

      <div className="relative w-full max-w-md space-y-4">
        {/* Header */}
        <div className="text-center mb-2">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-secondary shadow-xl shadow-primary/30 mb-4">
            <TreePine className="h-7 w-7 text-white" />
          </div>
          <p className="text-sm text-muted-foreground">Family Graph</p>
        </div>

        <div className="rounded-3xl border border-border/50 bg-card shadow-2xl overflow-hidden">

          {/* ── Loading ───────────────────────────────────────── */}
          {status === 'loading' && (
            <div className="p-10 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">Loading family preview...</p>
            </div>
          )}

          {/* ── Preview ───────────────────────────────────────── */}
          {status === 'preview' && preview && (
            <>
              <div className="px-8 pt-8 pb-6 text-center border-b border-border/50 bg-gradient-to-b from-primary/5 to-transparent">
                <h1 className="text-2xl font-bold text-foreground mb-1">{preview.name}</h1>
                <p className="text-muted-foreground text-sm">
                  {preview.inviterName ? (
                    <><strong>{preview.inviterName}</strong> has invited you to join the family tree</>
                  ) : "You've been invited to join the family tree"}
                </p>
                <div className="flex items-center justify-center gap-6 mt-5">
                  {[
                    { v: preview.memberCount || '—', l: 'members' },
                    { v: preview.generationCount || '—', l: 'generations' },
                    { v: '🌳', l: 'live tree' },
                  ].map(({ v, l }, i, a) => (
                    <div key={l} className="flex items-center gap-6">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-primary">{v}</p>
                        <p className="text-[11px] text-muted-foreground">{l}</p>
                      </div>
                      {i < a.length - 1 && <div className="h-8 w-px bg-border/50" />}
                    </div>
                  ))}
                </div>
                {preview.recentNames.length > 0 && (
                  <div className="mt-5 flex items-center justify-center gap-1">
                    <div className="flex -space-x-2">
                      {preview.recentNames.map((name, i) => (
                        <Avatar key={i} className="h-8 w-8 border-2 border-card">
                          <AvatarFallback className="text-[10px] font-bold bg-primary/20 text-primary">{name[0]}</AvatarFallback>
                        </Avatar>
                      ))}
                    </div>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {preview.recentNames.slice(0, 2).join(', ')} & more are waiting
                    </span>
                  </div>
                )}
              </div>
              <div className="p-6 space-y-3">
                <Button onClick={handleContinueToRelate} className="w-full h-12 text-base font-semibold bg-primary hover:bg-primary/90">
                  {isAuthed ? 'Join Family Tree' : 'Sign in & Join'}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
                {!isAuthed && <p className="text-center text-xs text-muted-foreground">Free account · No app download needed</p>}
                <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 text-xs text-muted-foreground hover:text-green-400 transition-colors">
                  <Share2 className="h-3.5 w-3.5" /> Forward this invite
                </a>
              </div>
              <div className="px-6 pb-5 text-center">
                <Badge variant="outline" className="font-mono text-xs tracking-widest text-muted-foreground">CODE: {code.toUpperCase()}</Badge>
              </div>
            </>
          )}

          {/* ── Relationship Step ─────────────────────────────── */}
          {status === 'relate' && preview && (
            <div className="p-6 space-y-5">
              <div className="text-center">
                <h2 className="text-lg font-bold text-foreground">
                  How do you know {preview.inviterName ? <span className="text-primary">{preview.inviterName}</span> : 'the inviter'}?
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  This places you correctly in the family tree — the magic happens automatically ✨
                </p>
              </div>

              {/* Name field */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Your name</label>
                <Input
                  placeholder="Your full name"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  className="h-10 bg-muted/50 border-border"
                  autoFocus
                />
              </div>

              {/* Relationship grid */}
              <div className="grid grid-cols-2 gap-2">
                {RELATIONSHIP_OPTIONS.map(({ key, label, sublabel, icon: Icon, color }) => (
                  <button
                    key={key}
                    onClick={() => setSelectedRel(key)}
                    className={cn(
                      'flex items-start gap-2.5 rounded-xl border p-3 text-left transition-all',
                      selectedRel === key ? color : 'border-border/50 bg-muted/20 hover:border-border/70'
                    )}
                  >
                    <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', selectedRel === key ? '' : 'text-muted-foreground')} />
                    <div>
                      <p className={cn('text-xs font-semibold', selectedRel === key ? '' : 'text-foreground')}>{label}</p>
                      <p className="text-[10px] text-muted-foreground">{sublabel}</p>
                    </div>
                  </button>
                ))}
              </div>

              {/* Viral explainer */}
              {selectedRel && selectedRel !== 'skip' && (
                <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 text-xs text-muted-foreground">
                  🌳 <strong className="text-foreground">Your node will be auto-linked.</strong> Anyone who joins through you will extend the tree further — creating a living, connected graph across families.
                </div>
              )}

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStatus('preview')} className="flex-1 h-11">Back</Button>
                <Button
                  onClick={handleJoin}
                  disabled={!selectedRel || (selectedRel !== 'skip' && !displayName.trim())}
                  className="flex-1 h-11 bg-primary hover:bg-primary/90"
                >
                  Join Tree
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* ── Joining spinner ───────────────────────────────── */}
          {status === 'joining' && (
            <div className="p-10 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Placing you in the family tree…</p>
            </div>
          )}

          {/* ── Success ───────────────────────────────────────── */}
          {status === 'success' && (
            <div className="p-10 text-center space-y-3">
              <CheckCircle2 className="h-12 w-12 text-green-400 mx-auto" />
              <h1 className="text-xl font-bold">Welcome to the family! 🙏</h1>
              <p className="text-muted-foreground text-sm">
                {selectedRel && selectedRel !== 'skip'
                  ? `You're now connected as ${preview?.inviterName ? `${preview.inviterName}'s ${selectedRel}` : 'a family member'} in the tree.`
                  : 'Redirecting to your family tree…'}
              </p>
              <p className="text-xs text-muted-foreground animate-pulse">Redirecting…</p>
            </div>
          )}

          {/* ── Error ─────────────────────────────────────────── */}
          {status === 'error' && (
            <div className="p-10 text-center">
              <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <h1 className="text-xl font-bold mb-2">Couldn't join</h1>
              <p className="text-muted-foreground text-sm mb-6">{message}</p>
              <Button variant="outline" className="w-full" onClick={() => router.push('/')}>Go home</Button>
            </div>
          )}
        </div>

        <p className="text-center text-[11px] text-muted-foreground/60">
          Family Graph · Your family story, preserved forever
        </p>
      </div>
    </div>
  )
}
