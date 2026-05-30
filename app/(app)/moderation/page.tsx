'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  ArrowLeft, Shield, CheckCircle2, XCircle, AlertTriangle,
  Clock, RefreshCw, Loader2, ArrowRightLeft, Users, Archive, RotateCcw
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import type { PendingConflict } from '@/lib/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClaimRequest {
  id: string
  node_id: string
  claimant_user_id: string
  status: string
  submitted_name: string | null
  submitted_birth_year: number | null
  confidence_score: number | null
  attempts: number
  created_at: string
  // joined
  node_name?: string
  claimant_display_name?: string
  claimant_email?: string
}

interface ArchivedNode {
  id: string
  name: string
  birth_year: number | null
  gender: string | null
  relationship_to_root: string | null
  deleted_at: string
  deleted_by: string | null
  claim_status: string | null
}

// ─── Conflict Severity Badge ──────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: string }) {
  return (
    <Badge variant="outline" className={cn(
      'text-[10px] font-semibold',
      severity === 'error'
        ? 'border-red-500/40 text-red-400 bg-red-500/5'
        : 'border-amber-500/40 text-amber-400 bg-amber-500/5'
    )}>
      {severity === 'error' ? '⛔ Error' : '⚠️ Warning'}
    </Badge>
  )
}

// ─── Claim Review Card ────────────────────────────────────────────────────────

function ClaimCard({
  claim,
  onReview,
  loading,
}: {
  claim: ClaimRequest
  onReview: (id: string, action: 'approve' | 'reject', reason?: string) => void
  loading: boolean
}) {
  const [reason, setReason] = useState('')
  const [expanded, setExpanded] = useState(false)
  const confidence = claim.confidence_score ?? 0

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-4 space-y-3">
      <div className="flex items-start gap-3">
        <Avatar className="h-10 w-10 shrink-0">
          <AvatarFallback className="bg-violet-500/10 text-violet-400 text-xs font-bold">
            {(claim.claimant_display_name ?? claim.claimant_email ?? '?').slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">
            {claim.claimant_display_name ?? claim.claimant_email ?? 'Unknown user'}
          </p>
          <p className="text-xs text-muted-foreground">
            wants to claim <span className="font-medium text-foreground">{claim.node_name ?? claim.node_id}</span>
          </p>
          {claim.submitted_name && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Submitted name: <span className="text-foreground">{claim.submitted_name}</span>
              {claim.submitted_birth_year ? `, born ${claim.submitted_birth_year}` : ''}
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className={cn(
            'text-sm font-bold',
            confidence >= 70 ? 'text-green-400' : confidence >= 40 ? 'text-amber-400' : 'text-red-400'
          )}>
            {confidence}pts
          </div>
          <div className="text-[10px] text-muted-foreground">
            {claim.attempts} attempt{claim.attempts !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Confidence bar */}
      <div className="h-1.5 w-full rounded-full bg-muted/50 overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            confidence >= 70 ? 'bg-green-500' : confidence >= 40 ? 'bg-amber-500' : 'bg-red-500'
          )}
          style={{ width: `${Math.min(confidence, 100)}%` }}
        />
      </div>

      <button
        onClick={() => setExpanded(v => !v)}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? 'Hide rejection reason ▲' : 'Add rejection reason (optional) ▼'}
      </button>

      {expanded && (
        <Textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Reason for rejection (shown to the requester)…"
          className="text-xs h-16 resize-none"
        />
      )}

      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={loading}
          onClick={() => onReview(claim.id, 'reject', reason || undefined)}
          className="flex-1 h-8 text-xs border-red-500/30 text-red-400 hover:bg-red-500/5"
        >
          <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
        </Button>
        <Button
          size="sm"
          disabled={loading}
          onClick={() => onReview(claim.id, 'approve')}
          className="flex-1 h-8 text-xs bg-green-600 hover:bg-green-700 text-white"
        >
          <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
        </Button>
      </div>
    </div>
  )
}

// ─── Conflict Card ────────────────────────────────────────────────────────────

function ConflictCard({
  conflict,
  onResolve,
  loading,
}: {
  conflict: PendingConflict
  onResolve: (id: string, action: 'resolved' | 'dismissed', resolution?: string) => void
  loading: boolean
}) {
  const [resolution, setResolution] = useState('')

  return (
    <div className={cn(
      'rounded-2xl border p-4 space-y-3',
      conflict.severity === 'error'
        ? 'border-red-500/30 bg-red-500/5'
        : 'border-amber-500/30 bg-amber-500/5'
    )}>
      <div className="flex items-start gap-3">
        <div className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
          conflict.severity === 'error' ? 'bg-red-500/15' : 'bg-amber-500/15'
        )}>
          <AlertTriangle className={cn('h-4 w-4', conflict.severity === 'error' ? 'text-red-400' : 'text-amber-400')} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm capitalize">
              {conflict.conflictType.replace(/_/g, ' ')}
            </p>
            <SeverityBadge severity={conflict.severity} />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{conflict.description}</p>
          <p className="text-[10px] text-muted-foreground/60 mt-1">
            Detected {new Date(conflict.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>
      </div>

      <Textarea
        value={resolution}
        onChange={e => setResolution(e.target.value)}
        placeholder="Resolution note (optional)…"
        className="text-xs h-14 resize-none"
      />

      <div className="flex gap-2">
        <Button
          size="sm" variant="outline" disabled={loading}
          onClick={() => onResolve(conflict.id, 'dismissed', resolution || undefined)}
          className="flex-1 h-8 text-xs text-muted-foreground"
        >
          Dismiss
        </Button>
        <Button
          size="sm" disabled={loading}
          onClick={() => onResolve(conflict.id, 'resolved', resolution || undefined)}
          className="flex-1 h-8 text-xs"
        >
          <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Mark Resolved
        </Button>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ModerationPage() {
  const { user, familyId, profile, loading: authLoading } = useAuth()
  const supabase = createClient()
  const { toast } = useToast()

  const role = (profile as any)?.role as string | undefined
  const canAccess = role === 'admin' || role === 'moderator'

  const [claims, setClaims] = useState<ClaimRequest[]>([])
  const [conflicts, setConflicts] = useState<PendingConflict[]>([])
  const [archivedNodes, setArchivedNodes] = useState<ArchivedNode[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [loadingArchived, setLoadingArchived] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  const loadData = useCallback(async () => {
    if (!familyId || !canAccess) return
    setLoadingData(true)
    try {
      // Load pending claim requests — join with family_members for node name
      const { data: rawClaims } = await supabase
        .from('claim_requests')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(50)

      if (rawClaims && rawClaims.length > 0) {
        // Fetch node names
        const nodeIds = [...new Set(rawClaims.map(c => (c as any).node_id))]
        const { data: nodes } = await supabase
          .from('family_members')
          .select('id, name, family_id')
          .in('id', nodeIds)
          .eq('family_id', familyId)

        const nodeMap = Object.fromEntries((nodes ?? []).map(n => [n.id, n.name]))

        // Fetch claimant display names
        const claimantIds = [...new Set(rawClaims.map(c => (c as any).claimant_user_id))]
        const { data: claimantProfiles } = await (supabase as any)
          .from('profiles')
          .select('id, display_name, email:id') // approximate — use display_name
          .in('id', claimantIds)

        // Get emails via auth — not available client-side; use display_name only
        const profileMap: Record<string, { displayName: string }> = {}
          ; (claimantProfiles ?? []).forEach((p: any) => {
            profileMap[p.id] = { displayName: p.display_name ?? '' }
          })

        setClaims(rawClaims.map((c: any) => ({
          id: c.id,
          node_id: c.node_id,
          claimant_user_id: c.claimant_user_id,
          status: c.status,
          submitted_name: c.submitted_name,
          submitted_birth_year: c.submitted_birth_year,
          confidence_score: c.confidence_score,
          attempts: c.attempts ?? 0,
          created_at: c.created_at,
          node_name: nodeMap[c.node_id] ?? c.node_id,
          claimant_display_name: profileMap[c.claimant_user_id]?.displayName || undefined,
        })).filter(c => !!nodeMap[c.node_id])) // only claims for this family
      } else {
        setClaims([])
      }

      // Load open conflicts
      const { data: rawConflicts } = await (supabase as any)
        .from('pending_conflicts')
        .select('*')
        .eq('family_id', familyId)
        .eq('status', 'open')
        .order('created_at', { ascending: false })

      setConflicts((rawConflicts ?? []).map((c: any) => ({
        id: c.id,
        familyId: c.family_id,
        nodeId: c.node_id,
        conflictType: c.conflict_type,
        description: c.description,
        severity: c.severity,
        status: c.status,
        detectedBy: c.detected_by,
        resolvedBy: c.resolved_by,
        resolution: c.resolution,
        metadata: c.metadata ?? {},
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      })))
    } finally {
      setLoadingData(false)
    }
  }, [familyId, canAccess, supabase])

  useEffect(() => { loadData() }, [loadData])

  const loadArchivedNodes = useCallback(async () => {
    if (!canAccess || role !== 'admin') return
    setLoadingArchived(true)
    try {
      const res = await fetch('/api/nodes/archived')
      const data = await res.json()
      if (res.ok) setArchivedNodes(data.nodes ?? [])
    } finally {
      setLoadingArchived(false)
    }
  }, [canAccess, role])

  const handleRestoreNode = useCallback(async (nodeId: string) => {
    setActionLoading(true)
    try {
      const res = await fetch(`/api/nodes/${nodeId}/revoke-claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? data.error ?? 'Restore failed')
      toast({ title: 'Profile restored', description: 'The node is visible in the family tree again.' })
      setArchivedNodes(prev => prev.filter(n => n.id !== nodeId))
    } catch (e: unknown) {
      toast({ title: 'Restore failed', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' })
    } finally {
      setActionLoading(false)
    }
  }, [toast])

  const handleReviewClaim = useCallback(async (id: string, action: 'approve' | 'reject', reason?: string) => {
    setActionLoading(true)
    try {
      const res = await fetch(`/api/claims/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Review failed')
      toast({
        title: action === 'approve' ? 'Claim approved' : 'Claim rejected',
        description: action === 'approve' ? 'The user has been linked to the node.' : 'The claim has been rejected.',
      })
      setClaims(prev => prev.filter(c => c.id !== id))
    } catch (e: unknown) {
      toast({ title: 'Action failed', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' })
    } finally {
      setActionLoading(false)
    }
  }, [toast])

  const handleResolveConflict = useCallback(async (id: string, action: 'resolved' | 'dismissed', resolution?: string) => {
    setActionLoading(true)
    try {
      const { error } = await (supabase as any)
        .from('pending_conflicts')
        .update({
          status: action,
          resolution: resolution ?? null,
          resolved_by: user?.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
      if (error) throw new Error(error.message)
      toast({ title: action === 'resolved' ? 'Conflict resolved' : 'Conflict dismissed' })
      setConflicts(prev => prev.filter(c => c.id !== id))
    } catch (e: unknown) {
      toast({ title: 'Action failed', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' })
    } finally {
      setActionLoading(false)
    }
  }, [supabase, user, toast])

  // Auth / role gate
  if (authLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!canAccess) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 border border-red-500/30">
          <Shield className="h-6 w-6 text-red-400" />
        </div>
        <h2 className="text-lg font-bold">Access Restricted</h2>
        <p className="text-sm text-muted-foreground max-w-xs">
          Moderation tools are available to family admins and moderators only.
        </p>
        <Link href="/dashboard">
          <Button variant="outline" size="sm">← Back to dashboard</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border/40 px-4">
        <Link href="/dashboard">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/15 border border-violet-500/30">
          <Shield className="h-4 w-4 text-violet-400" />
        </div>
        <div className="flex-1">
          <h1 className="text-sm font-bold">Moderation</h1>
          <p className="text-[11px] text-muted-foreground">
            Claims queue · Graph conflicts · {role === 'admin' ? 'Full admin' : 'Moderator'}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={loadData} disabled={loadingData} className="h-8 text-xs gap-1.5">
          <RefreshCw className={cn('h-3.5 w-3.5', loadingData && 'animate-spin')} />
          Refresh
        </Button>
      </header>

      {/* Stats strip */}
      <div className="flex items-center gap-4 border-b border-border/40 bg-muted/20 px-4 py-2">
        <div className="flex items-center gap-1.5 text-xs">
          <Clock className="h-3.5 w-3.5 text-amber-400" />
          <span className="font-semibold text-amber-400">{claims.length}</span>
          <span className="text-muted-foreground">pending claims</span>
        </div>
        <div className="h-4 w-px bg-border/50" />
        <div className="flex items-center gap-1.5 text-xs">
          <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
          <span className="font-semibold text-red-400">{conflicts.filter(c => c.severity === 'error').length}</span>
          <span className="text-muted-foreground">errors</span>
          <span className="font-semibold text-amber-400">{conflicts.filter(c => c.severity === 'warning').length}</span>
          <span className="text-muted-foreground">warnings</span>
        </div>
      </div>

      <Tabs defaultValue="claims" className="flex flex-col flex-1 min-h-0">
        <TabsList className="mx-4 mt-3 h-8 w-fit">
          <TabsTrigger value="claims" className="text-xs h-7 gap-1">
            <Users className="h-3 w-3" />
            Claims
            {claims.length > 0 && (
              <span className="ml-1 rounded-full bg-amber-500/20 text-amber-400 text-[9px] font-bold px-1.5 py-px">
                {claims.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="conflicts" className="text-xs h-7 gap-1">
            <AlertTriangle className="h-3 w-3" />
            Conflicts
            {conflicts.length > 0 && (
              <span className="ml-1 rounded-full bg-red-500/20 text-red-400 text-[9px] font-bold px-1.5 py-px">
                {conflicts.length}
              </span>
            )}
          </TabsTrigger>
          {role === 'admin' && (
            <TabsTrigger value="transfer" className="text-xs h-7 gap-1">
              <ArrowRightLeft className="h-3 w-3" />
              Transfer
            </TabsTrigger>
          )}
          {role === 'admin' && (
            <TabsTrigger value="archived" className="text-xs h-7 gap-1" onClick={loadArchivedNodes}>
              <Archive className="h-3 w-3" />
              Archived
              {archivedNodes.length > 0 && (
                <span className="ml-1 rounded-full bg-slate-500/20 text-slate-400 text-[9px] font-bold px-1.5 py-px">
                  {archivedNodes.length}
                </span>
              )}
            </TabsTrigger>
          )}
        </TabsList>

        {/* Claims Tab */}
        <TabsContent value="claims" className="flex-1 min-h-0 mt-0">
          <ScrollArea className="h-full px-4 py-3">
            {loadingData ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : claims.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <CheckCircle2 className="h-10 w-10 text-green-400/40" />
                <p className="text-sm font-medium text-muted-foreground">No pending claims</p>
                <p className="text-xs text-muted-foreground/60">All caught up!</p>
              </div>
            ) : (
              <div className="space-y-3 pb-4">
                {claims.map(claim => (
                  <ClaimCard
                    key={claim.id}
                    claim={claim}
                    onReview={handleReviewClaim}
                    loading={actionLoading}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        {/* Conflicts Tab */}
        <TabsContent value="conflicts" className="flex-1 min-h-0 mt-0">
          <ScrollArea className="h-full px-4 py-3">
            {loadingData ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : conflicts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <CheckCircle2 className="h-10 w-10 text-green-400/40" />
                <p className="text-sm font-medium text-muted-foreground">No open conflicts</p>
                <p className="text-xs text-muted-foreground/60">Graph is consistent</p>
              </div>
            ) : (
              <div className="space-y-3 pb-4">
                {conflicts.map(conflict => (
                  <ConflictCard
                    key={conflict.id}
                    conflict={conflict}
                    onResolve={handleResolveConflict}
                    loading={actionLoading}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        {/* Transfer Tab (admin only) */}
        {role === 'admin' && (
          <TabsContent value="transfer" className="flex-1 min-h-0 mt-0">
            <ClaimTransferPanel familyId={familyId} />
          </TabsContent>
        )}

        {/* Archived Nodes Tab (admin only) */}
        {role === 'admin' && (
          <TabsContent value="archived" className="flex-1 min-h-0 mt-0">
            <ScrollArea className="h-full px-4 py-3">
              {loadingArchived ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : archivedNodes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                  <Archive className="h-10 w-10 text-muted-foreground/30" />
                  <p className="text-sm font-medium text-muted-foreground">No archived profiles</p>
                  <p className="text-xs text-muted-foreground/60">Archived nodes will appear here and can be restored.</p>
                </div>
              ) : (
                <div className="space-y-2 pb-4">
                  <p className="text-[11px] text-muted-foreground pb-1">
                    These profiles are hidden from the tree but can be restored at any time.
                    Connections and memories are fully preserved.
                  </p>
                  {archivedNodes.map(node => (
                    <div key={node.id} className="flex items-center gap-3 rounded-2xl border border-border/50 bg-card p-3">
                      <Avatar className="h-9 w-9 shrink-0">
                        <AvatarFallback className="bg-slate-500/10 text-slate-400 text-xs font-bold">
                          {node.name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{node.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {node.relationship_to_root ?? 'Unknown relation'}
                          {node.birth_year ? ` · b. ${node.birth_year}` : ''}
                          {' · Archived '}
                          {new Date(node.deleted_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1 shrink-0"
                        disabled={actionLoading}
                        onClick={() => handleRestoreNode(node.id)}
                      >
                        <RotateCcw className="h-3 w-3" />
                        Restore
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}

// ─── Claim Transfer Panel ─────────────────────────────────────────────────────

function ClaimTransferPanel({ familyId }: { familyId: string | null }) {
  const supabase = createClient()
  const { toast } = useToast()
  const [fromNodeId, setFromNodeId] = useState('')
  const [toNodeId, setToNodeId] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [claimedNodes, setClaimedNodes] = useState<{ id: string; name: string; claimedBy: string }[]>([])
  const [unclaimedNodes, setUnclaimedNodes] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    if (!familyId) return
    supabase.from('family_members')
      .select('id, name, claimed_by_user_id, is_claimed')
      .eq('family_id', familyId)
      .order('name')
      .then(({ data }) => {
        const all = (data ?? []) as any[]
        setClaimedNodes(all.filter(n => n.is_claimed).map(n => ({
          id: n.id, name: n.name, claimedBy: n.claimed_by_user_id ?? ''
        })))
        setUnclaimedNodes(all.filter(n => !n.is_claimed).map(n => ({ id: n.id, name: n.name })))
      })
  }, [familyId, supabase])

  const handleTransfer = async () => {
    if (!fromNodeId || !toNodeId) {
      toast({ title: 'Select both nodes', variant: 'destructive' }); return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/nodes/${fromNodeId}/transfer-claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toNodeId, reason }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? data.error ?? 'Transfer failed')
      toast({ title: 'Claim transferred successfully' })
      setFromNodeId(''); setToNodeId(''); setReason('')
    } catch (e: unknown) {
      toast({ title: 'Transfer failed', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <ScrollArea className="h-full px-4 py-3">
      <div className="max-w-md space-y-4 pb-4">
        <div className="rounded-xl border border-border/50 bg-muted/20 p-4 text-xs text-muted-foreground leading-relaxed">
          <p className="font-semibold text-foreground mb-1">When to use this</p>
          A user was linked to the wrong node. Use this to move their claim from the
          incorrect node to their correct node. The old node becomes unclaimed again.
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium">From node (currently claimed)</label>
          <select
            value={fromNodeId}
            onChange={e => setFromNodeId(e.target.value)}
            className="w-full rounded-xl border border-border/50 bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
          >
            <option value="">Select claimed node…</option>
            {claimedNodes.map(n => (
              <option key={n.id} value={n.id}>{n.name}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium">To node (unclaimed target)</label>
          <select
            value={toNodeId}
            onChange={e => setToNodeId(e.target.value)}
            className="w-full rounded-xl border border-border/50 bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
          >
            <option value="">Select unclaimed node…</option>
            {unclaimedNodes.map(n => (
              <option key={n.id} value={n.id}>{n.name}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium">Reason (optional)</label>
          <Textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Explain why the claim is being transferred…"
            className="text-xs h-16 resize-none"
          />
        </div>

        <Button
          onClick={handleTransfer}
          disabled={loading || !fromNodeId || !toNodeId}
          className="w-full h-10"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ArrowRightLeft className="h-4 w-4 mr-2" />}
          Transfer Claim
        </Button>
      </div>
    </ScrollArea>
  )
}
