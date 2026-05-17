'use client'

import { useState } from 'react'
import { UserCheck, Lock, Globe, Users, AlertCircle, ShieldCheck } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FamilyMember } from '@/lib/types'
import { cn } from '@/lib/utils'

interface ClaimNodeDialogProps {
  member: FamilyMember | null
  userId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onClaim: (memberId: string, userId: string, opts?: { submittedName?: string; submittedBirthYear?: number }) => Promise<void>
  onSetVisibility?: (memberId: string, visibility: 'public' | 'family' | 'private') => Promise<void>
}

const VISIBILITY_OPTIONS: {
  value: 'public' | 'family' | 'private'
  label: string
  description: string
  icon: React.ReactNode
  color: string
}[] = [
    {
      value: 'public',
      label: 'Public',
      description: 'Anyone with a link can see your profile',
      icon: <Globe className="h-4 w-4" />,
      color: 'text-green-500',
    },
    {
      value: 'family',
      label: 'Family only',
      description: 'Only family members in this tree can see you',
      icon: <Users className="h-4 w-4" />,
      color: 'text-blue-500',
    },
    {
      value: 'private',
      label: 'Private',
      description: 'Only you can see your profile',
      icon: <Lock className="h-4 w-4" />,
      color: 'text-orange-500',
    },
  ]

export function ClaimNodeDialog({
  member,
  userId,
  open,
  onOpenChange,
  onClaim,
  onSetVisibility,
}: ClaimNodeDialogProps) {
  const [claiming, setClaiming] = useState(false)
  const [visibilityLoading, setVisibilityLoading] = useState<string | null>(null)

  if (!member) return null

  const alreadyClaimed = !!member.isClaimed
  const claimedByMe = alreadyClaimed && member.claimedByUserId === userId

  const handleClaim = async () => {
    if (!userId) return
    setClaiming(true)
    try {
      await onClaim(member.id, userId)
      onOpenChange(false)
    } catch {
      // error handled by parent toast
    } finally {
      setClaiming(false)
    }
  }

  const handleVisibility = async (v: 'public' | 'family' | 'private') => {
    if (!onSetVisibility) return
    setVisibilityLoading(v)
    try {
      await onSetVisibility(member.id, v)
    } finally {
      setVisibilityLoading(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-primary" />
            {claimedByMe ? 'Your profile node' : alreadyClaimed ? 'Already claimed' : 'Is this you?'}
          </DialogTitle>
          <DialogDescription>
            {claimedByMe
              ? 'This is your node in the family tree. Manage visibility below.'
              : alreadyClaimed
                ? 'This person has already been claimed by another family member.'
                : `Claim "${member.name}" to link it to your account. You can then control who sees your details.`}
          </DialogDescription>
        </DialogHeader>

        {!alreadyClaimed && userId && (
          <Button onClick={handleClaim} disabled={claiming} className="w-full">
            <UserCheck className="h-4 w-4 mr-2" />
            {claiming ? 'Claiming…' : `Yes, I'm ${member.name.split(' ')[0]}`}
          </Button>
        )}

        {claimedByMe && onSetVisibility && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Who can see your profile?</p>
              {VISIBILITY_OPTIONS.map(opt => {
                const isActive = (member.visibility ?? 'family') === opt.value
                return (
                  <button
                    key={opt.value}
                    onClick={() => handleVisibility(opt.value)}
                    disabled={visibilityLoading !== null}
                    className={cn(
                      'w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors',
                      isActive
                        ? 'border-primary/60 bg-primary/10'
                        : 'border-border/50 hover:border-primary/30 hover:bg-muted/30'
                    )}
                  >
                    <span className={cn('flex-shrink-0', opt.color, isActive && 'opacity-100')}>
                      {opt.icon}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{opt.label}</span>
                        {isActive && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            current
                          </Badge>
                        )}
                        {visibilityLoading === opt.value && (
                          <span className="text-[10px] text-muted-foreground">saving…</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </>
        )}

        {!userId && (
          <p className="text-sm text-muted-foreground text-center">
            Sign in to claim your node in the family tree.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
