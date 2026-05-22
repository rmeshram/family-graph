'use client'

import { useState } from 'react'
import { UserPlus, Send, RefreshCw, Copy, Check, Shield } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { FamilyMember } from '@/lib/types'
import { cn, copyToClipboard } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

interface InviteToClaimDialogProps {
  member: FamilyMember | null
  open: boolean
  onOpenChange: (open: boolean) => void
  familyId: string | null
  userId: string | null
}

export function InviteToClaimDialog({
  member,
  open,
  onOpenChange,
  familyId,
  userId,
}: InviteToClaimDialogProps) {
  const [generating, setGenerating] = useState(false)
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const supabase = createClient()

  if (!member) return null

  const generateInvite = async () => {
    if (!familyId || !userId || !member) return
    setGenerating(true)
    try {
      const code = Math.random().toString(36).substring(2, 10).toUpperCase()
      const expiry = new Date(Date.now() + 72 * 3_600_000).toISOString()

      const { data, error } = await supabase.from('invite_links').insert({
        family_id: familyId,
        code,
        role: 'contributor',
        created_by: userId,
        expires_at: expiry,
        max_uses: 1,
        node_id: member.id,
        invite_type: 'node_claim',
        identity_hint: member.name,
      } as any).select('code, expires_at').single()

      if (error) throw new Error(error.message)

      // Set node to invite_sent
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fmQuery = supabase.from('family_members') as any
      await fmQuery
        .update({ claim_status: 'invite_sent' })
        .eq('id', member.id)
        .eq('claim_status', 'unclaimed')

      const link = `${window.location.origin}/join/${(data as any).code}`
      setInviteLink(link)
      setExpiresAt((data as any).expires_at)
      toast.success('Invite link created!')
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to create invite')
    } finally {
      setGenerating(false)
    }
  }

  const refreshInvite = async () => {
    if (!inviteLink) return
    const oldCode = inviteLink.split('/').pop()!
    setRefreshing(true)
    try {
      const res = await fetch(`/api/invites/${oldCode}/refresh`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to refresh')
      const data = await res.json()
      setInviteLink(data.link)
      setExpiresAt(data.expiresAt)
      toast.success('Invite link refreshed — valid for 72 hours')
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to refresh invite')
    } finally {
      setRefreshing(false)
    }
  }

  const copyLink = async () => {
    if (!inviteLink) return
    const ok = await copyToClipboard(inviteLink)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } else {
      toast.error('Could not copy to clipboard')
    }
  }

  const expiryLabel = expiresAt
    ? new Date(expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-blue-400" />
            Invite {member.name} to claim their profile
          </DialogTitle>
          <DialogDescription>
            Send a secure link. They&apos;ll verify their identity with name and birth year before claiming.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Member info */}
          <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/30 p-3">
            <span className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 grid place-items-center text-sm font-semibold text-white shrink-0">
              {member.name.substring(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">{member.name}</p>
              <p className="text-xs text-muted-foreground">
                {member.relationship ?? 'Family member'}
                {member.birthYear ? ` · b. ${member.birthYear}` : ''}
              </p>
            </div>
            <Badge variant="outline" className="ml-auto shrink-0 text-xs">
              Unclaimed
            </Badge>
          </div>

          {/* Security note */}
          <div className="flex items-start gap-2 rounded-lg bg-blue-500/8 border border-blue-500/20 p-3 text-xs text-blue-300">
            <Shield className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              The recipient must enter their name and birth year to verify their identity before claiming.
            </span>
          </div>

          {!inviteLink ? (
            <Button
              className="w-full"
              onClick={generateInvite}
              disabled={generating}
            >
              {generating ? (
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Generate Invite Link
            </Button>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Invite link (expires {expiryLabel})</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={inviteLink}
                    className="text-xs font-mono bg-muted/50 border-border/50"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={copyLink}
                    className={cn('shrink-0', copied && 'border-green-500 text-green-400')}
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={refreshInvite}
                  disabled={refreshing}
                >
                  {refreshing ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Refresh link
                </Button>
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={copyLink}
                >
                  {copied ? <Check className="h-3.5 w-3.5 mr-1.5" /> : <Copy className="h-3.5 w-3.5 mr-1.5" />}
                  {copied ? 'Copied!' : 'Copy & share'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
