'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, UserCheck, X, ChevronRight, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { MatchResult } from '@/lib/match-detection'
import { tierLabel, tierColor } from '@/lib/match-detection'
import { cn } from '@/lib/utils'

interface OnboardingMatchStepProps {
  matches: MatchResult[]
  onClaim: (nodeId: string, familyId: string) => Promise<void>
  onDismiss: (nodeId: string) => Promise<void>
  onSkip: () => void
}

export function OnboardingMatchStep({
  matches,
  onClaim,
  onDismiss,
  onSkip,
}: OnboardingMatchStepProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [claimedId, setClaimedId] = useState<string | null>(null)

  const visible = matches.filter((m) => !dismissed.has(m.nodeId))

  const handleClaim = async (match: MatchResult) => {
    setClaimingId(match.nodeId)
    try {
      await onClaim(match.nodeId, match.familyId)
      setClaimedId(match.nodeId)
    } finally {
      setClaimingId(null)
    }
  }

  const handleDismiss = async (match: MatchResult) => {
    await onDismiss(match.nodeId)
    setDismissed((prev) => new Set([...prev, match.nodeId]))
  }

  if (claimedId) {
    const claimed = matches.find((m) => m.nodeId === claimedId)
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-4 py-8 text-center"
      >
        <div className="h-16 w-16 rounded-full bg-green-500/15 grid place-items-center">
          <CheckCircle2 className="h-8 w-8 text-green-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Profile linked!</h3>
          <p className="text-sm text-muted-foreground mt-1">
            You are now connected as <strong>{claimed?.nodeName}</strong> in the{' '}
            <strong>{claimed?.familyName}</strong>.
          </p>
        </div>
        <Button onClick={onSkip}>Continue setup</Button>
      </motion.div>
    )
  }

  if (visible.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center gap-3 py-8 text-center text-muted-foreground"
      >
        <p className="text-sm">No matches found. You can always claim a profile later.</p>
        <Button variant="outline" onClick={onSkip}>
          Continue <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </motion.div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-amber-400">
        <Sparkles className="h-4 w-4" />
        <p className="text-sm font-medium">
          We found {visible.length} profile{visible.length !== 1 ? 's' : ''} that might be you
        </p>
      </div>

      <div className="space-y-3">
        <AnimatePresence>
          {visible.map((match) => (
            <motion.div
              key={match.nodeId}
              layout
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20, height: 0, marginBottom: 0 }}
              transition={{ duration: 0.2 }}
              className="rounded-xl border border-border/60 bg-card/80 p-4 space-y-3"
            >
              <div className="flex items-start gap-3">
                <span className="h-10 w-10 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 grid place-items-center text-sm font-semibold text-white shrink-0 mt-0.5">
                  {match.nodeInitials}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{match.nodeName}</span>
                    <Badge
                      variant="outline"
                      className={cn('text-[10px] px-1.5 py-0 border', tierColor(match.confidenceTier))}
                    >
                      {tierLabel(match.confidenceTier)}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {match.familyName}
                    {match.addedByName ? ` · Added by ${match.addedByName}` : ''}
                    {match.relationship ? ` · ${match.relationship}` : ''}
                  </p>
                  {match.matchReasons.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {match.matchReasons.map((r) => (
                        <span
                          key={r}
                          className="text-[10px] rounded-full bg-muted/60 px-2 py-0.5 text-muted-foreground"
                        >
                          {r.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleDismiss(match)}
                  className="text-muted-foreground/50 hover:text-muted-foreground shrink-0 mt-0.5"
                  aria-label="Not me"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={() => handleClaim(match)}
                  disabled={!!claimingId}
                >
                  <UserCheck className="h-3.5 w-3.5 mr-1.5" />
                  {claimingId === match.nodeId ? 'Linking…' : "Yes, that's me"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => handleDismiss(match)}
                  disabled={!!claimingId}
                >
                  Not me
                </Button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
        <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>
          Linking your profile lets family members know you&apos;re on Family Graph and connects your
          stories, memories, and milestones to your node.
        </span>
      </div>

      <Button variant="ghost" size="sm" onClick={onSkip} className="w-full text-muted-foreground">
        Skip for now — I&apos;ll do this later
      </Button>
    </div>
  )
}
