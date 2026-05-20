'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { MoreHorizontal, X, Activity } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useAuth } from '@/hooks/use-auth'
import { createClient } from '@/lib/supabase/client'

interface ActivityItem {
  id: string
  userName: string
  userColor: string
  action: string
  subject: string
  timestamp: Date
}

const SAMPLE_ACTIVITY: ActivityItem[] = [
  {
    id: '1',
    userName: 'Marcus',
    userColor: '#6366F1',
    action: 'added a birth certificate for',
    subject: 'Margal Sharma',
    timestamp: new Date(Date.now() - 4 * 60 * 1000),
  },
  {
    id: '2',
    userName: 'Sarah',
    userColor: '#10B981',
    action: 'updated marriage dates for',
    subject: 'Allina Sharma',
    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
  },
  {
    id: '3',
    userName: 'David',
    userColor: '#8B5CF6',
    action: 'is editing',
    subject: 'Shanna Sharma',
    timestamp: new Date(Date.now() - 26 * 60 * 60 * 1000),
  },
]

// Maps audit log actions to human-readable strings
function auditActionLabel(action: string): { verb: string; color: string } {
  switch (action) {
    case 'claim_completed': return { verb: 'claimed profile', color: '#10B981' }
    case 'claim_verified': return { verb: 'approved claim for', color: '#10B981' }
    case 'claim_rejected': return { verb: 'rejected claim for', color: '#EF4444' }
    case 'claim_revoked': return { verb: 'revoked claim on', color: '#F59E0B' }
    case 'claim_unclaimed': return { verb: 'unclaimed', color: '#8B5CF6' }
    case 'claim_initiated': return { verb: 'requested to claim', color: '#6366F1' }
    case 'invite_sent': return { verb: 'sent invite for', color: '#22D3EE' }
    case 'invite_refreshed': return { verb: 'refreshed invite for', color: '#22D3EE' }
    default: return { verb: 'updated', color: '#94A3B8' }
  }
}

// Deterministic color from user id string
function colorFromId(id: string): string {
  const colors = ['#6366F1', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#22D3EE', '#EF4444']
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return colors[h % colors.length]
}

const PRESENCE_AVATARS_DEMO = [
  { id: '1', name: 'Marcus', color: '#6366F1', textColor: 'text-indigo-200' },
  { id: '2', name: 'Sarah', color: '#10B981', textColor: 'text-emerald-200' },
  { id: '3', name: 'David', color: '#8B5CF6', textColor: 'text-violet-200' },
]

interface PresenceAvatarsProps {
  isDemoMode?: boolean
}

export function PresenceAvatars({ isDemoMode }: PresenceAvatarsProps) {
  const { user } = useAuth()

  if (!isDemoMode && !user) return null

  // For logged-in users: show just the current user avatar
  if (!isDemoMode && user) {
    const initials = (user.email ?? 'U').slice(0, 1).toUpperCase()
    return (
      <div className="flex items-center -space-x-2">
        <div
          title="You"
          className="h-7 w-7 rounded-full border-2 flex items-center justify-center text-[9px] font-bold bg-primary/20"
          style={{ borderColor: 'var(--background)' }}
        >
          <span className="text-primary">{initials}</span>
        </div>
        <div className="h-7 w-7 rounded-full border-2 bg-muted flex items-center justify-center text-[9px] font-bold text-muted-foreground ml-1" style={{ borderColor: 'var(--background)' }}>
          1
        </div>
      </div>
    )
  }

  // Demo mode: show fake presence
  return (
    <div className="flex items-center -space-x-2">
      {PRESENCE_AVATARS_DEMO.map((u) => (
        <div
          key={u.id}
          title={u.name}
          className="h-7 w-7 rounded-full border-2 flex items-center justify-center text-[9px] font-bold"
          style={{ backgroundColor: u.color + '33', borderColor: 'var(--background)' }}
        >
          <span style={{ color: u.color }}>
            {u.name.slice(0, 1)}
          </span>
        </div>
      ))}
      <div className="h-7 w-7 rounded-full border-2 bg-muted flex items-center justify-center text-[9px] font-bold text-muted-foreground ml-1" style={{ borderColor: 'var(--background)' }}>
        +2
      </div>
    </div>
  )
}

interface LiveActivityFeedProps {
  isDemoMode?: boolean
}

export function LiveActivityFeed({ isDemoMode }: LiveActivityFeedProps) {
  const { user, familyId } = useAuth()
  const [visible, setVisible] = useState(true)
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const supabaseRef = useRef(createClient())
  const memberMapRef = useRef<Map<string, string>>(new Map())
  const profileMapRef = useRef<Map<string, string>>(new Map())
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch real activity from claim_audit_log for logged-in users
  useEffect(() => {
    if (isDemoMode || !user || !familyId) return
    const supabase = supabaseRef.current
    let cancelled = false

    // D2: load member map once per family change — keep cached across audit events.
    const loadMembers = async () => {
      const { data: members } = await supabase
        .from('family_members')
        .select('id, name')
        .eq('family_id', familyId)
      if (cancelled) return
      memberMapRef.current = new Map((members ?? []).map((m: any) => [m.id, m.name]))
    }

    const loadActivity = async () => {
      if (memberMapRef.current.size === 0) await loadMembers()
      const memberMap = memberMapRef.current
      if (memberMap.size === 0) { setActivities([]); return }

      // claim_audit_log has family_id — filter directly (also enforced by RLS).
      const { data: logs } = await supabase
        .from('claim_audit_log')
        .select('id, node_id, actor_id, action, created_at, family_id')
        .eq('family_id' as any, familyId)
        .order('created_at', { ascending: false })
        .limit(20)

      if (cancelled) return
      if (!logs || logs.length === 0) { setActivities([]); return }

      // Get actor names — incremental cache, only fetch new ids.
      const actorIds = [...new Set(logs.map((l: any) => l.actor_id).filter(Boolean))] as string[]
      const missing = actorIds.filter(id => !profileMapRef.current.has(id))
      if (missing.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles').select('id, display_name').in('id', missing)
        if (cancelled) return
        for (const p of (profiles ?? []) as any[]) {
          profileMapRef.current.set(p.id, p.display_name ?? 'Someone')
        }
      }
      const profileMap = profileMapRef.current

      setActivities(logs.map((l: any) => {
        const { verb, color } = auditActionLabel(l.action)
        const actorName = l.actor_id ? (profileMap.get(l.actor_id) ?? 'Someone') : 'Someone'
        return {
          id: l.id,
          userName: actorName,
          userColor: l.actor_id ? colorFromId(l.actor_id) : color,
          action: verb,
          subject: memberMap.get(l.node_id) ?? 'a member',
          timestamp: new Date(l.created_at),
        }
      }))
    }

    // D3: debounce burst inserts so batch operations don't trigger N refetches.
    const scheduleLoad = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => { loadActivity() }, 500)
    }

    loadActivity()

    // Real-time subscription — D1: server-side filter by family_id, unique
    // channel name to prevent cross-tenant subscription collisions.
    const supabase2 = supabaseRef.current
    const channel = supabase2
      .channel(`activity:${familyId}:${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'claim_audit_log',
        filter: `family_id=eq.${familyId}`,
      }, () => { scheduleLoad() })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'family_members',
        filter: `family_id=eq.${familyId}`,
      }, () => { memberMapRef.current = new Map(); scheduleLoad() })
      .subscribe()

    return () => {
      cancelled = true
      if (debounceRef.current) clearTimeout(debounceRef.current)
      supabase2.removeChannel(channel)
    }
  }, [isDemoMode, user, familyId])

  if (!visible) {
    return (
      <button
        onClick={() => setVisible(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl backdrop-blur-lg border border-slate-800/50 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        style={{ background: 'var(--surface-card)' }}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
        Live Activity
      </button>
    )
  }

  // Logged-in users see real activity (or empty state if none yet)
  if (!isDemoMode && user) {
    return (
      <div className="w-56 rounded-2xl backdrop-blur-lg border border-border/50 overflow-hidden shadow-xl shadow-black/10" style={{ background: 'var(--surface-card)' }}>
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/50">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[11px] font-semibold text-foreground">Live Activity</span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); setVisible(false) }}
            className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {activities.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 px-3 text-center">
            <Activity className="h-6 w-6 text-muted-foreground/40" />
            <p className="text-[11px] text-muted-foreground">No recent activity</p>
            <p className="text-[10px] text-muted-foreground/60">Invite family members to see live updates here</p>
          </div>
        ) : (
          <div className="divide-y divide-border/30 max-h-64 overflow-y-auto">
            {activities.map((item) => (
              <div key={item.id} className="flex items-start gap-2.5 px-3 py-2.5">
                <div
                  className="h-7 w-7 shrink-0 rounded-full border border-border/50 flex items-center justify-center text-[10px] font-bold mt-0.5"
                  style={{ backgroundColor: item.userColor + '22', color: item.userColor }}
                >
                  {item.userName.slice(0, 1)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    <span className="font-semibold text-foreground">{item.userName}</span>
                    {' '}{item.action}{' '}
                    <span className="text-amber-500/90">{item.subject}</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                    {formatDistanceToNow(item.timestamp, { addSuffix: true })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Demo mode: show sample activity
  return (
    <div className="w-56 rounded-2xl backdrop-blur-lg border border-border/50 overflow-hidden shadow-xl shadow-black/10" style={{ background: 'var(--surface-card)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/50">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[11px] font-semibold text-foreground">Live Activity</span>
          <span className="text-[9px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-1">Demo</span>
        </div>
        <div className="flex items-center gap-1">
          <button className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors">
            <MoreHorizontal className="h-3 w-3" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setVisible(false) }}
            className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Feed items */}
      <div className="divide-y divide-border/30">
        {SAMPLE_ACTIVITY.map((item) => (
          <div key={item.id} className="flex items-start gap-2.5 px-3 py-2.5">
            <div
              className="h-7 w-7 shrink-0 rounded-full border border-border/50 flex items-center justify-center text-[10px] font-bold mt-0.5"
              style={{ backgroundColor: item.userColor + '22', color: item.userColor }}
            >
              {item.userName.slice(0, 1)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-muted-foreground leading-snug">
                <span className="font-semibold text-foreground">{item.userName}</span>
                {' '}{item.action}{' '}
                <span className="text-amber-500/90">{item.subject}</span>
              </p>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                {formatDistanceToNow(item.timestamp, { addSuffix: true })}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

