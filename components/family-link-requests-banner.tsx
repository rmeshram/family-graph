'use client'

import { useEffect, useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, X, LinkIcon, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface PendingLink {
  id: string
  otherFamilyName: string
  otherFamilyId: string
  linkNote: string | null
  createdAt: string
}

interface FamilyLinkRequestsBannerProps {
  /** Provide the authenticated user's family ID so we only poll when it exists. */
  familyId: string | null
}

export function FamilyLinkRequestsBanner({ familyId }: FamilyLinkRequestsBannerProps) {
  const [requests, setRequests] = useState<PendingLink[]>([])
  const [responding, setResponding] = useState<Record<string, boolean>>({})

  const fetchPending = useCallback(async () => {
    if (!familyId) return
    try {
      const res = await fetch('/api/family-links/pending')
      if (!res.ok) return
      const { incoming } = await res.json()
      setRequests(incoming ?? [])
    } catch { }
  }, [familyId])

  useEffect(() => {
    fetchPending()
  }, [fetchPending])

  const respond = async (id: string, action: 'accept' | 'reject') => {
    setResponding(prev => ({ ...prev, [id]: true }))
    try {
      await fetch(`/api/family-links/${id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      setRequests(prev => prev.filter(r => r.id !== id))
    } catch {
      // keep the item — let user retry
    } finally {
      setResponding(prev => ({ ...prev, [id]: false }))
    }
  }

  if (!familyId || requests.length === 0) return null

  return (
    <AnimatePresence mode="popLayout">
      {requests.map(req => (
        <motion.div
          key={req.id}
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, x: 40 }}
          transition={{ duration: 0.25 }}
          className="rounded-xl border border-teal-500/30 bg-teal-500/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3"
        >
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="mt-0.5 shrink-0 h-7 w-7 rounded-full bg-teal-500/20 flex items-center justify-center">
              <LinkIcon className="h-3.5 w-3.5 text-teal-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground leading-snug">
                <span className="text-teal-300 font-semibold">{req.otherFamilyName}</span>{' '}
                wants to connect their family tree with yours.
              </p>
              {req.linkNote && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{req.linkNote}</p>
              )}
              <Badge
                variant="outline"
                className="mt-1 text-[10px] border-teal-500/30 text-teal-400 bg-transparent"
              >
                Pending request
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-3 border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-300"
              disabled={responding[req.id]}
              onClick={() => respond(req.id, 'reject')}
            >
              {responding[req.id] ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <><X className="h-3.5 w-3.5 mr-1" />Decline</>
              )}
            </Button>
            <Button
              size="sm"
              className="h-7 px-3 bg-teal-600 hover:bg-teal-500 text-white"
              disabled={responding[req.id]}
              onClick={() => respond(req.id, 'accept')}
            >
              {responding[req.id] ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <><Check className="h-3.5 w-3.5 mr-1" />Accept</>
              )}
            </Button>
          </div>
        </motion.div>
      ))}
    </AnimatePresence>
  )
}
