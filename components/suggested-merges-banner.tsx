'use client'

/**
 * SuggestedMergesBanner
 *
 * Shows a dismissible banner after a member is added when the duplicate
 * scanner finds pairs that score ≥ 50.  Each pair can be individually
 * dismissed (persisted in sessionStorage) so admins aren't spammed.
 *
 * Used in: app/(app)/dashboard/page.tsx (post-add scan)
 */

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { GitMerge, X, AlertTriangle, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { FamilyMember } from '@/lib/types'
import { DuplicateMergeDialog, detectDuplicatePairs, type DuplicatePair } from '@/components/duplicate-merge-dialog'

const SESSION_DISMISSED_KEY = 'dismissed_merge_pairs'

function getDismissed(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SESSION_DISMISSED_KEY)
    return raw ? new Set<string>(JSON.parse(raw) as string[]) : new Set()
  } catch {
    return new Set()
  }
}

function addDismissed(key: string) {
  const existing = getDismissed()
  existing.add(key)
  try {
    sessionStorage.setItem(SESSION_DISMISSED_KEY, JSON.stringify([...existing]))
  } catch {
    // sessionStorage unavailable — ignore
  }
}

function pairKey(pair: DuplicatePair): string {
  return [pair.primary.id, pair.duplicate.id].sort().join('|')
}

interface Props {
  members: FamilyMember[]
  /** Trigger re-scan by incrementing (pass result of useState counter) */
  scanTrigger?: number
  onMergeComplete: (primaryId: string, absorbedId: string) => void
  /** Only show merge dialog trigger when user is admin */
  isAdmin?: boolean
}

export function SuggestedMergesBanner({
  members,
  scanTrigger,
  onMergeComplete,
  isAdmin,
}: Props) {
  const [visiblePairs, setVisiblePairs] = useState<DuplicatePair[]>([])
  const [mergeOpen, setMergeOpen] = useState(false)

  useEffect(() => {
    if (!members.length) return
    const dismissed = getDismissed()
    const found = detectDuplicatePairs(members).filter(p => {
      // Never suppress exact same-name pairs via sessionStorage dismiss —
      // these are almost certainly real duplicates and the user must resolve them.
      const exactSameName =
        p.primary.name.trim().toLowerCase() === p.duplicate.name.trim().toLowerCase()
      if (exactSameName) return true
      return !dismissed.has(pairKey(p))
    })
    setVisiblePairs(found)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanTrigger, members.length, members])

  const dismiss = (pair: DuplicatePair) => {
    addDismissed(pairKey(pair))
    setVisiblePairs(prev => prev.filter(p => pairKey(p) !== pairKey(pair)))
  }

  const dismissAll = () => {
    visiblePairs.forEach(p => addDismissed(pairKey(p)))
    setVisiblePairs([])
  }

  if (!visiblePairs.length) return null

  return (
    <>
      <AnimatePresence>
        <motion.div
          key="suggested-merges-banner"
          initial={{ opacity: 0, y: -10, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, y: -10, height: 0 }}
          transition={{ duration: 0.25 }}
          className="mx-4 mt-3 mb-0 overflow-hidden"
        >
          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-sm font-semibold text-amber-300">
                    Possible duplicate{visiblePairs.length > 1 ? 's' : ''} detected
                  </p>
                  <div className="flex items-center gap-1">
                    {isAdmin && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[11px] gap-1 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 px-2"
                        onClick={() => setMergeOpen(true)}
                      >
                        <GitMerge className="h-3 w-3" />
                        Review &amp; Merge
                        <ChevronRight className="h-3 w-3" />
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-muted-foreground hover:text-foreground"
                      onClick={dismissAll}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {visiblePairs.map(pair => (
                    <div
                      key={pairKey(pair)}
                      className="flex items-center gap-2 rounded-xl bg-amber-500/8 border border-amber-500/15 px-2.5 py-1.5"
                    >
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-medium truncate text-foreground/90">
                          {pair.primary.name}
                        </span>
                        <span className="text-xs text-muted-foreground mx-1.5">&amp;</span>
                        <span className="text-xs font-medium truncate text-foreground/90">
                          {pair.duplicate.name}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            'ml-2 text-[9px] h-4 font-bold border-0',
                            pair.score >= 75
                              ? 'bg-red-500/15 text-red-300'
                              : pair.score >= 60
                              ? 'bg-amber-500/15 text-amber-300'
                              : 'bg-slate-500/15 text-slate-400'
                          )}
                        >
                          {pair.score}% match
                        </Badge>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5 shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={() => dismiss(pair)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {isAdmin && (
        <DuplicateMergeDialog
          open={mergeOpen}
          onOpenChange={setMergeOpen}
          members={members}
          onMergeComplete={(primaryId, absorbedId) => {
            onMergeComplete(primaryId, absorbedId)
            setMergeOpen(false)
          }}
        />
      )}
    </>
  )
}
