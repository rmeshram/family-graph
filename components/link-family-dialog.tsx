'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import type { FamilyMember, LinkedFamily } from '@/lib/types'
import {
  Link2, Check, X, Loader2, Users, ChevronRight, TreePine, Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface LinkFamilyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  myFamilyName: string
  linkedFamilies: LinkedFamily[]
  members: FamilyMember[]
  onSendRequest: (
    inviteCode: string,
    opts?: { linkNote?: string; junctionMemberAId?: string }
  ) => Promise<{ targetFamilyName: string }>
}

type Step = 'form' | 'success'

export function LinkFamilyDialog({
  open,
  onOpenChange,
  myFamilyName,
  linkedFamilies,
  members,
  onSendRequest,
}: LinkFamilyDialogProps) {
  const [step, setStep] = useState<Step>('form')
  const [inviteCode, setInviteCode] = useState('')
  const [linkNote, setLinkNote] = useState('')
  const [junctionMemberId, setJunctionMemberId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultFamilyName, setResultFamilyName] = useState('')

  const ERROR_LABELS: Record<string, string> = {
    FAMILY_NOT_FOUND: 'No family found with that code. Check the code and try again.',
    ALREADY_LINKED: 'Your families are already linked.',
    REQUEST_PENDING: 'A link request to this family is already pending their acceptance.',
    CANNOT_LINK_SELF: 'You cannot link your family to itself.',
    NOT_ADMIN: 'Only family admins can send link requests.',
    MISSING_CODE: 'Please enter a family code.',
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const code = inviteCode.trim().toUpperCase()
    if (!code) { setError('Please enter the family invite code.'); return }

    setSubmitting(true)
    try {
      const result = await onSendRequest(code, {
        linkNote: linkNote.trim() || undefined,
        junctionMemberAId: junctionMemberId || undefined,
      })
      setResultFamilyName(result.targetFamilyName)
      setStep('success')
    } catch (e: unknown) {
      const code = (e as any)?.message ?? 'UNKNOWN'
      setError(ERROR_LABELS[code] ?? 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    onOpenChange(false)
    setTimeout(() => {
      setStep('form')
      setInviteCode('')
      setLinkNote('')
      setJunctionMemberId('')
      setError(null)
      setResultFamilyName('')
    }, 300)
  }

  // Possible junction members = direct relatives (parents, spouse, siblings)
  const junctionCandidates = members
    .filter(m => m.networkGroup !== 'affiliated')
    .filter(m => m.relationship && ['spouse', 'son', 'daughter', 'brother', 'sister', 'father', 'mother'].some(r => m.relationship?.includes(r)))
    .slice(0, 10)

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-teal-400" />
            Link Another Family Tree
          </DialogTitle>
          <DialogDescription>
            Connect your tree with another family's tree so you can see each other grow in real-time.
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {step === 'form' ? (
            <motion.form
              key="form"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              onSubmit={handleSubmit}
              className="space-y-4"
            >
              {/* How it works */}
              <div className="rounded-xl bg-teal-500/5 border border-teal-500/15 px-4 py-3 space-y-1.5">
                <p className="text-xs font-semibold text-teal-400 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" /> How it works
                </p>
                <ul className="text-[11px] text-muted-foreground space-y-0.5 leading-relaxed">
                  <li>→ Enter their family's invite code (they share it from Settings)</li>
                  <li>→ They receive a request and accept it</li>
                  <li>→ Their family appears as the "Community" cluster in your universe</li>
                  <li>→ When they add new members, you see the tree grow live 🌳</li>
                </ul>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="invite-code">Their Family Invite Code</Label>
                <Input
                  id="invite-code"
                  value={inviteCode}
                  onChange={e => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="e.g. RAO-PUNE-2024"
                  className="font-mono tracking-widest"
                  maxLength={32}
                  autoComplete="off"
                />
                <p className="text-[10px] text-muted-foreground">
                  Ask them to share their code from Settings → Family Info
                </p>
              </div>

              {junctionCandidates.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Who connects you to them? <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <div className="flex flex-wrap gap-1.5">
                    {junctionCandidates.map(m => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setJunctionMemberId(prev => prev === m.id ? '' : m.id)}
                        className={cn(
                          'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                          junctionMemberId === m.id
                            ? 'bg-teal-500/15 border-teal-500/40 text-teal-400'
                            : 'border-border/50 text-muted-foreground hover:text-foreground hover:border-border'
                        )}
                      >
                        {m.name}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    This helps the path finder show "How are you related?" across trees
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="link-note">Note <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input
                  id="link-note"
                  value={linkNote}
                  onChange={e => setLinkNote(e.target.value)}
                  placeholder="e.g. Rahul's wife Priya is from this family"
                  maxLength={200}
                />
              </div>

              {error && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive"
                >
                  <X className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  {error}
                </motion.p>
              )}

              {/* Existing linked families */}
              {linkedFamilies.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      Already linked
                    </p>
                    <div className="space-y-1">
                      {linkedFamilies.map(f => (
                        <div key={f.id} className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-2">
                          <TreePine className="h-3.5 w-3.5 text-teal-400 shrink-0" />
                          <span className="text-sm flex-1 truncate">{f.name}</span>
                          <Badge variant="outline" className="text-[10px] border-teal-500/30 text-teal-400">
                            {f.memberCount} members
                          </Badge>
                          <Check className="h-3.5 w-3.5 text-teal-400 shrink-0" />
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <div className="flex gap-2 pt-1">
                <Button type="button" variant="outline" className="flex-1" onClick={handleClose}>
                  Cancel
                </Button>
                <Button type="submit" className="flex-1 gap-1.5 bg-teal-500 hover:bg-teal-600 text-white" disabled={submitting}>
                  {submitting ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending…</>
                  ) : (
                    <><Link2 className="h-3.5 w-3.5" /> Send Request</>
                  )}
                </Button>
              </div>
            </motion.form>
          ) : (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-5 py-2 text-center"
            >
              <div className="flex justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-teal-500/15 border border-teal-500/25">
                  <Check className="h-7 w-7 text-teal-400" />
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-base mb-1">Request sent!</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  The <span className="font-semibold text-foreground">{resultFamilyName}</span> family
                  admin will receive your link request. Once they accept, their family tree will appear
                  as the <span className="text-teal-400 font-medium">Community</span> cluster in your
                  Relationship Universe.
                </p>
              </div>
              <div className="rounded-xl bg-muted/30 border border-border/50 px-4 py-3 text-left space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">What happens next</p>
                <div className="space-y-1.5 text-[11px] text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <span className="text-teal-400 shrink-0">1.</span>
                    <span>They accept the request in their Family Settings</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-teal-400 shrink-0">2.</span>
                    <span>Their members appear in your Universe as teal nodes</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-teal-400 shrink-0">3.</span>
                    <span>Every new member they add animates into your tree live 🌳</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={handleClose}>
                  Done
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 gap-1.5 border-teal-500/30 text-teal-400 hover:bg-teal-500/10"
                  onClick={() => {
                    setStep('form')
                    setInviteCode('')
                    setLinkNote('')
                    setJunctionMemberId('')
                    setError(null)
                  }}
                >
                  <ChevronRight className="h-3.5 w-3.5" /> Link another
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  )
}
