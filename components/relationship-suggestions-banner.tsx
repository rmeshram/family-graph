'use client'

/**
 * RelationshipSuggestionsBanner
 *
 * Shows post-add relationship inference suggestions in a non-intrusive
 * floating panel. Each suggestion can be accepted (applies DB updates)
 * or dismissed individually.
 */

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Sparkles, X, Check, ChevronRight } from 'lucide-react'
import type { RelationshipSuggestion, RelationshipAction } from '@/lib/relationship-engine'

interface Props {
  suggestions: RelationshipSuggestion[]
  onAccept: (actions: RelationshipAction[]) => Promise<void>
  onDismiss: (id: string) => void
  onDismissAll: () => void
}

const KIND_LABEL: Record<RelationshipSuggestion['kind'], string> = {
  sibling: 'Sibling Detected',
  spouse: 'Possible Couple',
  'in-law': 'In-law Inferred',
}

const KIND_COLOR: Record<RelationshipSuggestion['kind'], string> = {
  sibling: '#60a5fa',  // blue
  spouse: '#f472b6',  // pink
  'in-law': '#a78bfa',  // violet
}

export function RelationshipSuggestionsBanner({ suggestions, onAccept, onDismiss, onDismissAll }: Props) {
  const [accepting, setAccepting] = useState<string | null>(null)

  if (suggestions.length === 0) return null

  const handleAccept = async (s: RelationshipSuggestion) => {
    setAccepting(s.id)
    try {
      await onAccept(s.actions)
    } finally {
      setAccepting(null)
      onDismiss(s.id)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      className="absolute left-4 right-4 z-40 rounded-2xl border backdrop-blur-xl shadow-2xl overflow-hidden"
      style={{
        bottom: 72,
        background: 'var(--surface-panel, rgba(15,15,20,0.92))',
        borderColor: 'var(--border)',
        maxWidth: 420,
        margin: '0 auto',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5" style={{ color: '#22d3ee' }} />
          <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: '#22d3ee' }}>
            Relationship Intelligence
          </span>
        </div>
        <button
          onClick={onDismissAll}
          className="rounded-md p-0.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Suggestion cards */}
      <div className="max-h-[260px] overflow-y-auto divide-y divide-border/30">
        <AnimatePresence initial={false}>
          {suggestions.map(s => {
            const color = KIND_COLOR[s.kind]
            const isAccepting = accepting === s.id
            const hasActions = s.actions.length > 0

            return (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18 }}
                className="px-4 py-3"
              >
                {/* Kind badge + dismiss */}
                <div className="flex items-center justify-between mb-1.5">
                  <span
                    className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                    style={{ background: `${color}20`, color }}
                  >
                    {KIND_LABEL[s.kind]}
                    {s.confidence === 'high' && ' · High Confidence'}
                  </span>
                  <button
                    onClick={() => onDismiss(s.id)}
                    className="rounded p-0.5 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>

                {/* Names */}
                <p className="text-sm font-semibold text-foreground mb-0.5">
                  {s.fromName}
                  <span className="text-muted-foreground font-normal mx-1.5">and</span>
                  {s.toName}
                </p>

                {/* Reason */}
                <p className="text-[12px] text-muted-foreground leading-relaxed mb-2.5">
                  {s.reason}
                </p>

                {/* Actions */}
                {hasActions ? (
                  <button
                    disabled={isAccepting}
                    onClick={() => handleAccept(s)}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                    style={{
                      background: `${color}18`,
                      border: `1px solid ${color}44`,
                      color,
                    }}
                  >
                    {isAccepting ? (
                      <span>Connecting…</span>
                    ) : (
                      <>
                        <Check className="h-3 w-3" />
                        Connect them
                        <ChevronRight className="h-3 w-3 opacity-60" />
                      </>
                    )}
                  </button>
                ) : (
                  <p className="text-[11px] text-muted-foreground/60 italic">
                    Already visible in the graph — no action needed.
                  </p>
                )}
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
