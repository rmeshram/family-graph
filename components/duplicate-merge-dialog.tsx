'use client'

/**
 * DuplicateMergeDialog
 *
 * Detects and surfaces potential duplicate nodes within the current family.
 * Uses scoreCandidate to rank pairs by identity similarity, then lets an
 * admin choose which node to keep (primary) and which to absorb (duplicate).
 *
 * Trigger: a "Check for duplicates" button in settings or the members page.
 */

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { GitMerge, X, AlertTriangle, Check, Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { FamilyMember } from '@/lib/types'
import { scoreCandidate, tierColor } from '@/lib/match-detection'

export interface DuplicatePair {
  primary: FamilyMember
  duplicate: FamilyMember
  score: number
  reasons: string[]
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  members: FamilyMember[]
  onMergeComplete: (primaryId: string, absorbedId: string) => void
}

/** Detect potential duplicate pairs within a member list using identity scoring. */
export function detectDuplicatePairs(members: FamilyMember[]): DuplicatePair[] {
  const pairs: DuplicatePair[] = []
  const seen = new Set<string>()

  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const a = members[i]
      const b = members[j]

      // Skip already-claimed nodes only when they are claimed by DIFFERENT users —
      // two nodes each claimed by a different real person cannot be the same person.
      // If both are claimed by the SAME user, or one/both are unclaimed, still check.
      if (
        a.isClaimed && b.isClaimed &&
        a.claimedByUserId && b.claimedByUserId &&
        a.claimedByUserId !== b.claimedByUserId
      ) continue

      const key = [a.id, b.id].sort().join('|')
      if (seen.has(key)) continue
      seen.add(key)

      const result = scoreCandidate(
        {
          nodeId: b.id,
          nodeName: b.name,
          familyId: a.id, // not used for scoring — just required by interface
          familyName: '',
          addedByName: null,
          relationship: b.relationship ?? null,
          birthYear: b.birthYear ?? null,
          phone: b.phone ?? null,
          email: b.email ?? null,
        },
        {
          name: a.name,
          birthYear: a.birthYear ?? null,
          phone: a.phone ?? null,
          email: a.email ?? null,
        }
      )

      if (result && result.confidenceScore >= 50) {
        // Primary = the one with more data filled in (higher "completeness")
        const aScore = [a.birthYear, a.photoUrl, a.occupation, a.phone, a.email].filter(Boolean).length
        const bScore = [b.birthYear, b.photoUrl, b.occupation, b.phone, b.email].filter(Boolean).length
        pairs.push({
          primary: aScore >= bScore ? a : b,
          duplicate: aScore >= bScore ? b : a,
          score: result.confidenceScore,
          reasons: result.matchReasons,
        })
      }
    }
  }

  return pairs.sort((a, b) => b.score - a.score).slice(0, 10)
}

export function DuplicateMergeDialog({ open, onOpenChange, members, onMergeComplete }: Props) {
  const [pairs, setPairs] = useState<DuplicatePair[]>([])
  const [scanning, setScanning] = useState(false)
  const [merging, setMerging] = useState<string | null>(null)
  const [merged, setMerged] = useState<Set<string>>(new Set())
  const [swapped, setSwapped] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  // Scan whenever dialog opens
  useEffect(() => {
    if (!open) return
    setScanning(true)
    setMerged(new Set())
    setSwapped(new Set())
    setError(null)
    const found = detectDuplicatePairs(members)
    setPairs(found)
    setScanning(false)
  }, [open, members])

  const handleMerge = async (pair: DuplicatePair) => {
    const pairKey = [pair.primary.id, pair.duplicate.id].sort().join('|')
    setMerging(pairKey)
    setError(null)

    try {
      const isSwapped = swapped.has(pairKey)
      const primaryId = isSwapped ? pair.duplicate.id : pair.primary.id
      const duplicateId = isSwapped ? pair.primary.id : pair.duplicate.id

      const res = await fetch(`/api/members/${primaryId}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId: duplicateId }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        // BOTH_CLAIMED: two real people claimed by different users — cannot auto-merge.
        // Admin must revoke one claim first, then retry.
        if (data.error === 'BOTH_CLAIMED' || res.status === 409) {
          throw new Error(
            `Cannot merge: both profiles are claimed by different family members.\n\n` +
            `To proceed:\n` +
            `1. Ask one person to go to their profile and click "Unclaim"\n` +
            `2. Once unclaimed, retry the merge here\n\n` +
            `(Claims from Moderation → Transfer tab can also be used)`
          )
        }
        throw new Error(data.message ?? data.error ?? 'Merge failed')
      }

      setMerged(prev => new Set([...prev, pairKey]))
      onMergeComplete(primaryId, duplicateId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Merge failed')
    } finally {
      setMerging(null)
    }
  }

  const handleSwap = (pair: DuplicatePair) => {
    const key = [pair.primary.id, pair.duplicate.id].sort().join('|')
    setSwapped(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const visible = pairs.filter(p => !merged.has([p.primary.id, p.duplicate.id].sort().join('|')))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px] max-h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="p-5 pb-4 border-b border-border/50">
          <DialogTitle className="flex items-center gap-2 text-base">
            <div className="h-7 w-7 rounded-lg bg-amber-500/15 grid place-items-center">
              <GitMerge className="h-4 w-4 text-amber-400" />
            </div>
            Duplicate Profile Detection
          </DialogTitle>
          <DialogDescription className="text-xs">
            Profiles that appear to be the same person. Merge them to keep your tree clean.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0">
          {scanning && (
            <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Scanning for duplicates…</span>
            </div>
          )}

          {!scanning && visible.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <div className="h-12 w-12 rounded-full bg-green-500/10 grid place-items-center">
                <Check className="h-6 w-6 text-green-400" />
              </div>
              <div>
                <p className="font-semibold text-sm">No duplicates found</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {merged.size > 0
                    ? `${merged.size} duplicate${merged.size > 1 ? 's' : ''} merged successfully.`
                    : 'Your family tree looks clean!'}
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <AnimatePresence>
            {visible.map((pair) => {
              const key = [pair.primary.id, pair.duplicate.id].sort().join('|')
              const isSwapped = swapped.has(key)
              const isMerging = merging === key

              const keepNode = isSwapped ? pair.duplicate : pair.primary
              const removeNode = isSwapped ? pair.primary : pair.duplicate

              return (
                <motion.div
                  key={key}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  transition={{ duration: 0.2 }}
                  className="rounded-xl border border-border/60 bg-card overflow-hidden"
                >
                  {/* Confidence header */}
                  <div className="flex items-center gap-2 px-4 py-2 border-b border-border/40 bg-amber-500/5">
                    <Sparkles className="h-3 w-3 text-amber-400" />
                    <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">
                      Possible Duplicate · {pair.score}% match
                    </span>
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {pair.reasons.map(r => r.replace(/_/g, ' ')).join(' · ')}
                    </span>
                  </div>

                  {/* Two-node comparison */}
                  <div className="grid grid-cols-2 divide-x divide-border/40">
                    {[keepNode, removeNode].map((node, idx) => (
                      <div key={node.id} className={cn('p-3 space-y-1', idx === 0 ? 'bg-green-500/5' : 'bg-red-500/5')}>
                        <div className="flex items-center gap-1.5">
                          <span className={cn('text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded',
                            idx === 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                          )}>
                            {idx === 0 ? 'Keep' : 'Remove'}
                          </span>
                          {node.isClaimed && <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-blue-500/40 text-blue-400">Claimed</Badge>}
                        </div>
                        <p className="font-semibold text-sm">{node.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {[node.relationship, node.birthYear && `b. ${node.birthYear}`, node.occupation].filter(Boolean).join(' · ') || 'No details'}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 p-3 border-t border-border/40 bg-muted/10">
                    <button
                      onClick={() => handleSwap(pair)}
                      className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      ⇄ Swap keep/remove
                    </button>
                    <div className="ml-auto flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={isMerging}
                        onClick={() => handleMerge(pair)}
                        className="h-7 text-xs px-3"
                      >
                        {isMerging ? (
                          <><Loader2 className="h-3 w-3 animate-spin mr-1" />Merging…</>
                        ) : (
                          <><GitMerge className="h-3 w-3 mr-1" />Merge</>
                        )}
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  )
}
