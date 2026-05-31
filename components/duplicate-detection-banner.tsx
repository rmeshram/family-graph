'use client'

/**
 * DuplicateDetectionBanner
 *
 * Shown to admins when post-add scanning finds likely duplicate nodes.
 * Renders an amber dismissible banner with a count and a "Review & Merge" CTA.
 * Each pair can be individually dismissed for the session.
 */

import { useState, useEffect, useRef } from 'react'
import { GitMerge, X, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { FamilyMember } from '@/lib/types'
import { detectDuplicatePairs } from '@/components/duplicate-merge-dialog'
import { DuplicateMergeDialog } from '@/components/duplicate-merge-dialog'

interface Props {
  members: FamilyMember[]
  /** Only admins see this banner */
  isAdmin: boolean
  /** Key used to avoid showing pairs that were already dismissed this session */
  sessionKey?: string
}

// Reason → human label
const REASON_LABELS: Record<string, string> = {
  phone: 'same phone',
  email: 'same email',
  name: 'same name',
  name_fuzzy: 'similar name',
  first_name: 'same first name',
  name_phonetic: 'sounds alike',
  birth_year_exact: 'same birth year',
  birth_year_approx: 'close birth year',
  structural_parent: 'same parent slot',
  structural_spouse: 'same spouse slot',
}

function friendlyReasons(reasons: string[]): string {
  return reasons
    .map(r => REASON_LABELS[r] ?? r)
    .slice(0, 3)
    .join(', ')
}

export function DuplicateDetectionBanner({ members, isAdmin, sessionKey = 'default' }: Props) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [mergeOpen, setMergeOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [localMembers, setLocalMembers] = useState(members)

  // Sync members without losing dismiss state
  useEffect(() => { setLocalMembers(members) }, [members])

  // Run duplicate scan — debounced so it doesn't fire on every render
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [pairs, setPairs] = useState<ReturnType<typeof detectDuplicatePairs>>([])

  useEffect(() => {
    if (scanTimerRef.current) clearTimeout(scanTimerRef.current)
    scanTimerRef.current = setTimeout(() => {
      setPairs(detectDuplicatePairs(localMembers))
    }, 600)
    return () => { if (scanTimerRef.current) clearTimeout(scanTimerRef.current) }
  }, [localMembers])

  if (!isAdmin) return null

  const visiblePairs = pairs.filter(p => {
    const key = [p.primary.id, p.duplicate.id].sort().join('|')
    return !dismissed.has(key)
  })

  if (visiblePairs.length === 0) return null

  const dismissPair = (primaryId: string, dupId: string) => {
    const key = [primaryId, dupId].sort().join('|')
    setDismissed(prev => new Set([...prev, key]))
  }

  return (
    <>
      <div className={cn(
        'mx-4 mt-2 rounded-lg border border-amber-500/40 bg-amber-500/8 text-sm overflow-hidden transition-all',
      )}>
        {/* Header row */}
        <div className="flex items-center gap-2 px-3 py-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
          <p className="flex-1 font-medium text-amber-600 dark:text-amber-400 text-xs">
            {visiblePairs.length} possible duplicate{visiblePairs.length > 1 ? 's' : ''} detected
            <span className="font-normal text-muted-foreground ml-1">
              — family members may have added the same person twice
            </span>
          </p>
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5 border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
            onClick={() => setMergeOpen(true)}
          >
            <GitMerge className="h-3 w-3" />
            Review &amp; Merge
          </Button>
        </div>

        {/* Expanded pair list */}
        {expanded && (
          <div className="border-t border-amber-500/20 divide-y divide-amber-500/10">
            {visiblePairs.slice(0, 6).map(pair => {
              const key = [pair.primary.id, pair.duplicate.id].sort().join('|')
              return (
                <div key={key} className="flex items-center gap-2 px-3 py-2 text-xs">
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-foreground truncate">{pair.primary.name}</span>
                    <span className="text-muted-foreground mx-1">↔</span>
                    <span className="font-medium text-foreground truncate">{pair.duplicate.name}</span>
                    <Badge variant="outline" className="ml-2 text-[10px] py-0 h-4 border-amber-500/30 text-amber-500">
                      {pair.score}%
                    </Badge>
                    <span className="text-muted-foreground ml-1.5">· {friendlyReasons(pair.reasons)}</span>
                  </div>
                  <button
                    onClick={() => dismissPair(pair.primary.id, pair.duplicate.id)}
                    className="text-muted-foreground/50 hover:text-muted-foreground transition-colors shrink-0"
                    aria-label="Dismiss this pair"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            })}
            {visiblePairs.length > 6 && (
              <p className="px-3 py-1.5 text-[11px] text-muted-foreground">
                +{visiblePairs.length - 6} more — open "Review &amp; Merge" to see all
              </p>
            )}
          </div>
        )}
      </div>

      <DuplicateMergeDialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        members={localMembers}
        onMergeComplete={(primaryId, absorbedId) => {
          // Remove merged node from local view immediately
          setLocalMembers(prev => prev.filter(m => m.id !== absorbedId))
          dismissPair(primaryId, absorbedId)
        }}
      />
    </>
  )
}
