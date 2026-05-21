'use client'

import { useMemo, useState, useCallback, useEffect } from 'react'
import { FamilyMember } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { FEATURE_FLAGS } from '@/lib/feature-flags'

export type NotifType = 'member_joined' | 'birthday_today' | 'birthday_upcoming' | 'event_upcoming' | 'memory_added' | 'node_match_found' | 'claim_accepted' | 'claim_revoked' | 'node_claimed' | 'claim_submitted' | 'claim_pending_admin'

export interface AppNotification {
  id: string
  type: NotifType
  title: string
  body: string
  memberName?: string
  memberInitials?: string
  timestamp: Date
  read: boolean
  href?: string
  /** For birthday_today: pre-encoded WhatsApp link */
  whatsappLink?: string
}

const TODAY = new Date()
const TODAY_MONTH = TODAY.getMonth() + 1  // 1-12
const TODAY_DAY = TODAY.getDate()
const CURRENT_YEAR = TODAY.getFullYear()

function daysAgo(dateStr: string | undefined): number {
  if (!dateStr) return 999
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
}

function daysUntil(dateStr: string): number {
  const d = new Date(dateStr)
  const now = new Date(); now.setHours(0, 0, 0, 0)
  return Math.ceil((d.getTime() - now.getTime()) / 86_400_000)
}

interface MinEvent {
  id: string
  title: string
  eventDate: string
  location?: string | null
}

const STORAGE_KEY = 'fg_read_notif_ids'

function getReadIds(): Set<string> {
  try {
    if (typeof localStorage === 'undefined') return new Set()
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((v): v is string => typeof v === 'string'))
  } catch { return new Set() }
}

export function useNotifications(
  members: FamilyMember[],
  memoriesCount: number,
  events: MinEvent[] = [],
  familyId?: string | null,
  isAdmin?: boolean,
) {
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    return getReadIds()
  })

  // ── Pending claims polling (admin only) ───────────────────────────────
  // Polls GET /api/claims/pending every 60 s and injects each claim as a
  // notification so the bell badge lights up without the admin needing to
  // open Settings first.
  const [pendingClaimNotifs, setPendingClaimNotifs] = useState<AppNotification[]>([])
  useEffect(() => {
    if (!isAdmin || !familyId) return

    const load = async () => {
      try {
        const res = await fetch('/api/claims/pending')
        if (!res.ok) return
        const { claims = [] } = await res.json()
        const notifs: AppNotification[] = (claims as any[]).map((c) => ({
          id: `pending-claim-${c.id}`,
          type: 'claim_submitted' as NotifType,
          title: `Claim request: ${c.nodeName ?? 'Unknown'}`,
          body: `${c.claimantName ?? 'Someone'} wants to claim this profile — review in Settings → Team`,
          timestamp: new Date(c.createdAt ?? Date.now()),
          read: false,
          href: '/dashboard', // opens settings programmatically; for now link to dashboard
        }))
        setPendingClaimNotifs(notifs)
      } catch { /* ignore */ }
    }

    load()
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [isAdmin, familyId])

  // ── Realtime claim_audit_log subscription ─────────────────────────────
  // Listens for claim lifecycle events on the user's family and emits
  // warm-copy notifications in real time. Off when no familyId or when the
  // feature flag is disabled.
  const [claimNotifs, setClaimNotifs] = useState<AppNotification[]>([])
  useEffect(() => {
    if (!familyId) return
    if (!FEATURE_FLAGS.enableRealtimeNotifications) return

    const supabase = createClient()
    const channel = supabase
      .channel(`claim_audit:${familyId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'claim_audit_log', filter: `family_id=eq.${familyId}` },
        (payload) => {
          const row = payload.new as { id: string; node_id: string; actor_id: string | null; action: string; metadata: Record<string, unknown>; created_at: string }
          const node = members.find(m => m.id === row.node_id)
          const nodeName = node?.name ?? (row.metadata?.node_name as string) ?? 'A family member'
          const initials = nodeName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
          const ts = new Date(row.created_at)

          let title: string | null = null
          let body = ''
          let type: NotifType = 'node_claimed'

          switch (row.action) {
            case 'claim_completed':
              title = `${nodeName} joined the family`
              body = 'Their profile is now claimed and verified.'
              type = 'node_claimed'
              break
            case 'claim_initiated':
              // Someone submitted a claim that needs admin review
              title = `New claim request for ${nodeName}`
              body = 'Review and approve or reject in Settings → Team.'
              type = 'claim_submitted'
              break
            case 'claim_verified':
              title = `${nodeName}\'s claim was approved`
              body = 'They now have full access to their profile.'
              type = 'claim_accepted'
              break
            case 'claim_rejected':
              title = `A claim on ${nodeName} was rejected`
              body = 'The submitted identity did not match.'
              type = 'claim_revoked'
              break
            case 'claim_revoked':
              title = `Access to ${nodeName} was revoked`
              body = 'An admin removed the claim.'
              type = 'claim_revoked'
              break
            case 'invite_sent':
              title = `Invite sent for ${nodeName}`
              body = 'They can now claim their profile.'
              type = 'node_match_found'
              break
            case 'node_merged':
              title = `Duplicate profile merged`
              body = `${nodeName}\'s duplicate entry was cleaned up.`
              type = 'node_claimed'
              break
            default:
              return // ignore non-notable actions
          }

          setClaimNotifs(prev => {
            // Dedupe by id (audit row id is unique).
            if (prev.some(n => n.id === `claim-${row.id}`)) return prev
            const next: AppNotification = {
              id: `claim-${row.id}`,
              type,
              title,
              body,
              memberName: nodeName,
              memberInitials: initials,
              timestamp: ts,
              read: false,
              href: '/dashboard',
            }
            // Cap to last 20 realtime claim events.
            return [next, ...prev].slice(0, 20)
          })
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [familyId, members])

  const notifications = useMemo<AppNotification[]>(() => {
    const notifs: AppNotification[] = []

    // 1. New members joined in last 7 days
    const newMembers = members
      .filter(m => daysAgo(m.addedAt) <= 7 && m.relationship !== 'self')
      .sort((a, b) => new Date(b.addedAt ?? 0).getTime() - new Date(a.addedAt ?? 0).getTime())

    for (const m of newMembers.slice(0, 5)) {
      notifs.push({
        id: `joined-${m.id}`,
        type: 'member_joined',
        title: `${m.name} joined the family tree`,
        body: 'Added to the family tree',
        memberName: m.name,
        memberInitials: m.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(),
        timestamp: new Date(m.addedAt ?? Date.now()),
        read: false,
        href: '/dashboard',
      })
    }

    // 2. Birthday today (requires birth_month + birth_day from migration 005)
    const birthdayToday = members.filter(m => {
      const bm = (m as any).birthMonth as number | undefined
      const bd = (m as any).birthDay as number | undefined
      return bm === TODAY_MONTH && bd === TODAY_DAY && m.relationship !== 'self'
    })
    for (const m of birthdayToday) {
      const age = m.birthYear ? CURRENT_YEAR - m.birthYear : null
      const wishText = encodeURIComponent(
        `🎂 Happy Birthday ${m.name}! ${age ? `Wishing you a wonderful ${age}th birthday! ` : ''}May this year bring joy and great health. — Family Graph 🌳`
      )
      notifs.push({
        id: `bday-today-${m.id}`,
        type: 'birthday_today',
        title: `🎂 ${m.name}'s birthday is today!`,
        body: age ? `Turning ${age} today` : 'Send them your warm wishes',
        memberName: m.name,
        memberInitials: m.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(),
        timestamp: new Date(),
        read: false,
        href: '/dashboard',
        whatsappLink: `https://wa.me/?text=${wishText}`,
      })
    }

    // 3. Birthdays upcoming in next 7 days
    const birthdayUpcoming = members.filter(m => {
      const bm = (m as any).birthMonth as number | undefined
      const bd = (m as any).birthDay as number | undefined
      if (!bm || !bd || m.relationship === 'self') return false
      const thisYearDate = new Date(CURRENT_YEAR, bm - 1, bd)
      const diff = Math.ceil((thisYearDate.getTime() - TODAY.getTime()) / 86_400_000)
      return diff > 0 && diff <= 7
    })
    for (const m of birthdayUpcoming.slice(0, 2)) {
      const bm = (m as any).birthMonth as number
      const bd = (m as any).birthDay as number
      const diff = Math.ceil((new Date(CURRENT_YEAR, bm - 1, bd).getTime() - TODAY.getTime()) / 86_400_000)
      notifs.push({
        id: `bday-upcoming-${m.id}`,
        type: 'birthday_upcoming',
        title: `${m.name}'s birthday in ${diff} day${diff === 1 ? '' : 's'}`,
        body: 'Plan a surprise or send a personal message',
        memberName: m.name,
        memberInitials: m.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(),
        timestamp: new Date(),
        read: false,
        href: '/events',
      })
    }

    // 4. Upcoming events in next 7 days
    const upcoming = events
      .filter(e => { const d = daysUntil(e.eventDate); return d >= 0 && d <= 7 })
      .sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime())
    for (const ev of upcoming.slice(0, 3)) {
      const d = daysUntil(ev.eventDate)
      notifs.push({
        id: `event-${ev.id}`,
        type: 'event_upcoming',
        title: ev.title,
        body: d === 0 ? `Today${ev.location ? ` · ${ev.location}` : ''}` : `In ${d} day${d === 1 ? '' : 's'}${ev.location ? ` · ${ev.location}` : ''}`,
        timestamp: new Date(ev.eventDate),
        read: false,
        href: '/events',
      })
    }

    // 5. Members who are "elders" (age > 70) — remind to record their voice stories
    const elders = members.filter(m => m.isAlive !== false && m.birthYear && (CURRENT_YEAR - m.birthYear) >= 70)
    if (elders.length > 0) {
      notifs.push({
        id: 'elder-voice-reminder',
        type: 'memory_added',
        title: `Record stories from ${elders[0].name}`,
        body: `${elders.length} elder${elders.length > 1 ? 's' : ''} in your tree — preserve their voice memories`,
        memberName: elders[0].name,
        memberInitials: elders[0].name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(),
        timestamp: new Date(),
        read: false,
        href: '/memory',
      })
    }

    // 6. Memory vault reminder if no photos
    if (memoriesCount === 0 && members.length > 2) {
      notifs.push({
        id: 'add-first-memory',
        type: 'memory_added',
        title: 'Add your first family photo',
        body: 'Your memory vault is empty — upload a family photo to bring it alive',
        timestamp: new Date(),
        read: false,
        href: '/memory',
      })
    }

    // Sort: newest first
    return notifs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
  }, [members, memoriesCount, events])

  // Mark notifications as read based on readIds + merge realtime claim events.
  const notificationsWithRead = useMemo(
    () => {
      // Merge all streams: pending-claim polls (admin), realtime audit events, computed.
      const merged = [...pendingClaimNotifs, ...claimNotifs, ...notifications]
      // Dedupe by id (admin pending-claim first wins so they stay until dismissed).
      const seen = new Set<string>()
      const deduped: AppNotification[] = []
      for (const n of merged) {
        if (seen.has(n.id)) continue
        seen.add(n.id)
        deduped.push(n)
      }
      deduped.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      return deduped.map(n => ({ ...n, read: readIds.has(n.id) }))
    },
    [notifications, claimNotifs, pendingClaimNotifs, readIds]
  )

  const unreadCount = useMemo(
    () => notificationsWithRead.filter(n => !n.read).length,
    [notificationsWithRead]
  )

  const markAllRead = useCallback(() => {
    setReadIds(prev => {
      const allIds = new Set([...prev, ...notifications.map(n => n.id)])
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...allIds])) } catch { /* ignore */ }
      return allIds
    })
  }, [notifications])

  return { notifications: notificationsWithRead, unreadCount, markAllRead }
}

