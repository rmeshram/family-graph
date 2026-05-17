'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, X, ChevronRight, UserCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { MatchResult } from '@/lib/match-detection'
import { tierLabel, tierColor } from '@/lib/match-detection'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface SuggestedNodesBannerProps {
  /** Called when user claims a node; parent should refresh members */
  onClaimed?: (nodeId: string) => void
}

export function SuggestedNodesBanner({ onClaimed }: SuggestedNodesBannerProps) {
  const [matches, setMatches] = useState<MatchResult[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/users/me/suggested-node-matches')
      .then((r) => r.json())
      .then((d) => setMatches(d.matches ?? []))
      .catch(() => { })
      .finally(() => setLoading(false))
  }, [])

  const handleDismiss = async (nodeId: string, reason = 'not_me') => {
    setDismissed((prev) => new Set([...prev, nodeId]))
    await fetch(`/api/users/me/suggested-node-matches/${nodeId}/dismiss`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => { })
  }

  const handleClaim = async (match: MatchResult) => {
    setClaimingId(match.nodeId)
    try {
      const res = await fetch(`/api/nodes/${match.nodeId}/claim`, {
        method: 'POST',
        body: JSON.stringify({ submittedName: match.nodeName }),
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()

      if (res.ok) {
        toast.success(data.requiresReview ? 'Claim submitted for review!' : 'Profile linked!')
        setDismissed((prev) => new Set([...prev, match.nodeId]))
        onClaimed?.(match.nodeId)
      } else {
        if (data.error === 'IDENTITY_MISMATCH') {
          toast.error('Identity check needed. Open the profile to verify.')
        } else {
          toast.error(data.message ?? 'Could not claim profile')
        }
      }
    } catch {
      toast.error('Something went wrong')
    } finally {
      setClaimingId(null)
    }
  }

  const visible = matches.filter((m) => !dismissed.has(m.nodeId))

  if (loading || bannerDismissed || visible.length === 0) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-3"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-400 shrink-0" />
            <p className="text-sm font-medium text-amber-300">
              {visible.length === 1
                ? 'A profile might be you'
                : `${visible.length} profiles might be you`}
            </p>
          </div>
          <button
            onClick={() => setBannerDismissed(true)}
            className="text-muted-foreground/50 hover:text-muted-foreground"
            aria-label="Dismiss banner"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2">
          <AnimatePresence>
            {visible.slice(0, 3).map((match) => (
              <motion.div
                key={match.nodeId}
                layout
                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                transition={{ duration: 0.18 }}
                className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/60 p-3"
              >
                <span className="h-9 w-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 grid place-items-center text-xs font-semibold text-white shrink-0">
                  {match.nodeInitials}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium truncate">{match.nodeName}</span>
                    <Badge
                      variant="outline"
                      className={cn('text-[10px] px-1.5 py-0 border shrink-0', tierColor(match.confidenceTier))}
                    >
                      {tierLabel(match.confidenceTier)}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{match.familyName}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs px-2"
                    onClick={() => handleDismiss(match.nodeId)}
                  >
                    Not me
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 text-xs px-2"
                    onClick={() => handleClaim(match)}
                    disabled={!!claimingId}
                  >
                    <UserCheck className="h-3 w-3 mr-1" />
                    {claimingId === match.nodeId ? '…' : 'Claim'}
                  </Button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {visible.length > 3 && (
          <p className="text-xs text-muted-foreground text-center">
            +{visible.length - 3} more
            <ChevronRight className="h-3 w-3 inline ml-0.5" />
          </p>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
