'use client'

import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { FamilyMember } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { FEATURE_FLAGS } from '@/lib/feature-flags'
import {
  getNotifPriority,
  privacyAwareName,
  getInitials,
  sortNotifications,
  deduplicateNotifs,
  shouldGroupMemberAdds,
  buildGroupedMemberTitle,
  type NotifPriority,
} from '@/lib/notification-utils'

export type NotifType =
  | 'member_joined'
  | 'birthday_today'
  | 'birthday_upcoming'
  | 'event_upcoming'
  | 'memory_added'
  | 'node_match_found'
  | 'claim_accepted'
  | 'claim_revoked'
  | 'node_claimed'
  | 'claim_submitted'
  | 'claim_pending_admin'
  // Extended types
  | 'story_added'
  | 'relationship_updated'
  | 'visibility_changed'
  | 'anniversary'
  | 'memorial'
  | 'role_changed'
  | 'member_updated'

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
  /** Priority level — used for sorting and visual emphasis */
  priority?: NotifPriority
  /** For grouped notifications: how many items are in the group */
  groupCount?: number
  /** Actor photo URL — renders in bell icon instead of initials when available */
  memberAvatarUrl?: string
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
  /** The current user's own member node ID — suppresses self-update notifications */
  currentUserMemberId?: string | null,
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
          href: '/dashboard',
          priority: 'medium' as NotifPriority,
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
          // Use privacy-aware name so private members aren't exposed in notification text
          const nodeName = node
            ? privacyAwareName(node.name, node.visibility)
            : (row.metadata?.node_name as string) ?? 'A family member'
          const rawName = node?.name ?? (row.metadata?.node_name as string) ?? 'A family member'
          const initials = getInitials(rawName)
          const ts = new Date(row.created_at)

          let title: string | null = null
          let body = ''
          let type: NotifType = 'node_claimed'
          let priority: NotifPriority = 'medium'

          switch (row.action) {
            case 'claim_completed':
              title = `${nodeName} joined the family`
              body = 'Their profile is now claimed and verified.'
              type = 'node_claimed'
              priority = 'high'
              break
            case 'claim_initiated':
              // Someone submitted a claim that needs admin review
              title = `New claim request for ${nodeName}`
              body = 'Review and approve or reject in Settings → Team.'
              type = 'claim_submitted'
              priority = 'medium'
              break
            case 'claim_verified':
              title = `${nodeName}'s claim was approved`
              body = 'They now have full access to their profile.'
              type = 'claim_accepted'
              priority = 'high'
              break
            case 'claim_rejected':
              title = `A claim on ${nodeName} was rejected`
              body = 'The submitted identity did not match.'
              type = 'claim_revoked'
              priority = 'high'
              break
            case 'claim_revoked':
              title = `Access to ${nodeName} was revoked`
              body = 'An admin removed the claim.'
              type = 'claim_revoked'
              priority = 'high'
              break
            case 'invite_sent':
              title = `Invite sent for ${nodeName}`
              body = 'They can now claim their profile.'
              type = 'node_match_found'
              priority = 'low'
              break
            case 'invite_expired':
              title = `Invite for ${nodeName} expired`
              body = 'The link is no longer valid. Send a new invite if needed.'
              type = 'node_match_found'
              priority = 'low'
              break
            case 'invite_refreshed':
              title = `Invite refreshed for ${nodeName}`
              body = 'A new invite link was generated.'
              type = 'node_match_found'
              priority = 'low'
              break
            case 'node_merged':
            case 'nodes_merged':
              title = 'Duplicate profile merged'
              body = `${nodeName}'s duplicate entry was cleaned up.`
              type = 'node_claimed'
              priority = 'medium'
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
              priority,
            }
            // Cap to last 20 realtime claim events.
            return [next, ...prev].slice(0, 20)
          })
        }
      )
      .subscribe((status, err) => {
        if (err) console.warn('[claim_audit] realtime error:', err)
      })

    return () => { supabase.removeChannel(channel) }
  }, [familyId, members])

  // ── family_members UPDATE → fires when someone claims a node via joinWithCode ─
  // Catches the case where is_claimed flips true (join via invite), emitting a
  // member_joined notification in real time even before the audit log is written.
  const [joinNotifs, setJoinNotifs] = useState<AppNotification[]>([])
  useEffect(() => {
    if (!familyId) return
    if (!FEATURE_FLAGS.enableRealtimeNotifications) return

    const supabase = createClient()
    const channel = supabase
      .channel(`family_members_claim:${familyId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'family_members', filter: `family_id=eq.${familyId}` },
        (payload) => {
          const next = payload.new as any
          const prev = payload.old as any
          // Only react when is_claimed transitions false → true
          if (!next.is_claimed || prev.is_claimed) return
          const nodeName = next.name ?? 'A family member'
          const initials = nodeName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
          setJoinNotifs(existing => {
            const notif: AppNotification = {
              id: `joined-rt-${next.id}`,
              type: 'member_joined',
              title: `${nodeName} joined the family`,
              body: 'They have claimed their profile.',
              memberName: nodeName,
              memberInitials: initials,
              timestamp: new Date(),
              read: false,
              href: '/dashboard',
              priority: 'high' as NotifPriority,
            }
            return [notif, ...existing].slice(0, 10)
          })
        }
      )
      .subscribe((status, err) => {
        if (err) console.warn('[family_members_claim] realtime error:', err)
      })

    return () => { supabase.removeChannel(channel) }
  }, [familyId])

  // ── Realtime: stories INSERT → story_added notification ─────────────────────
  // Notifies family members when a new story or memory is added.
  const [storyNotifs, setStoryNotifs] = useState<AppNotification[]>([])
  useEffect(() => {
    if (!familyId) return
    if (!FEATURE_FLAGS.enableRealtimeNotifications) return

    const supabase = createClient()
    const channel = supabase
      .channel(`stories:${familyId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'stories', filter: `family_id=eq.${familyId}` },
        (payload) => {
          const row = payload.new as any
          const member = members.find(m => m.id === row.member_id)
          const displayName = member
            ? privacyAwareName(member.name, member.visibility)
            : 'A family member'
          const initials = member ? getInitials(member.name) : '📚'
          const storyTitle = row.title as string | undefined

          setStoryNotifs(prev => {
            const id = `story-${row.id}`
            if (prev.some(n => n.id === id)) return prev
            const notif: AppNotification = {
              id,
              type: 'story_added',
              title: `New story added for ${displayName}`,
              body: storyTitle
                ? `“${storyTitle.slice(0, 70)}${storyTitle.length > 70 ? '…' : ''}”`
                : 'A new family memory was recorded',
              memberName: displayName,
              memberInitials: initials,
              timestamp: new Date(row.created_at ?? Date.now()),
              read: false,
              href: '/memory',
              priority: 'medium',
            }
            return [notif, ...prev].slice(0, 10)
          })
        }
      )
      .subscribe((status, err) => {
        if (err) console.warn('[stories] realtime error:', err)
      })

    return () => { supabase.removeChannel(channel) }
  }, [familyId, members])

  // ── Realtime: family_members UPDATE → visibility_changed notification ──────
  // Fires only when the visibility field changes, never for trivial field edits.
  // Privacy-safe: never exposes private member names.
  const [visibilityNotifs, setVisibilityNotifs] = useState<AppNotification[]>([])
  useEffect(() => {
    if (!familyId) return
    if (!FEATURE_FLAGS.enableRealtimeNotifications) return

    const supabase = createClient()
    const channel = supabase
      .channel(`family_members_vis:${familyId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'family_members', filter: `family_id=eq.${familyId}` },
        (payload) => {
          const prevRow = payload.old as any
          const nextRow = payload.new as any
          // Only fire when visibility actually changes
          if (!prevRow.visibility || prevRow.visibility === nextRow.visibility) return
          // Changing TO 'family' (the default) is not noteworthy
          if (nextRow.visibility === 'family' && prevRow.visibility !== 'private') return

          const isPrivate = nextRow.visibility === 'private'
          const displayName = isPrivate ? 'A family member' : (nextRow.name ?? 'A family member')
          const title = isPrivate
            ? 'A profile was made private'
            : `${displayName}'s profile visibility updated`
          const body = isPrivate
            ? 'Their information is now visible to family admins only'
            : `Visibility changed from ${prevRow.visibility} to ${nextRow.visibility}`

          setVisibilityNotifs(prev => {
            if (prev.length >= 5) return prev // cap — these are rare
            const notif: AppNotification = {
              id: `vis-${nextRow.id}-${Date.now()}`,
              type: 'visibility_changed',
              title,
              body,
              memberInitials: '🔒',
              timestamp: new Date(),
              read: false,
              href: '/dashboard',
              priority: 'medium',
            }
            return [notif, ...prev].slice(0, 5)
          })
        }
      )
      .subscribe((status, err) => {
        if (err) console.warn('[family_members] realtime error:', err)
      })

    return () => { supabase.removeChannel(channel) }
  }, [familyId])

  // ── Realtime: family_members UPDATE → member_updated notification ─────────
  // Fires when meaningful visible fields change: photo, name, bio, occupation,
  // location. Throttled per-member per 5 min to prevent save-spam.
  // Skips: private/anonymous members, own-profile edits, is_claimed/visibility
  // transitions (those are handled by joinNotifs/visibilityNotifs).
  const profileUpdateThrottleRef = useRef<Map<string, number>>(new Map())
  const [profileUpdateNotifs, setProfileUpdateNotifs] = useState<AppNotification[]>([])
  useEffect(() => {
    if (!familyId) return
    if (!FEATURE_FLAGS.enableRealtimeNotifications) return

    const supabase = createClient()
    const channel = supabase
      .channel(`family_members_profile_update:${familyId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'family_members', filter: `family_id=eq.${familyId}` },
        (payload) => {
          const prevRow = payload.old as any
          const nextRow = payload.new as any

          // Skip anonymous or private members
          if (nextRow.visibility === 'private') return
          if (nextRow.show_as_anonymous) return

          // Skip own profile edits (don't notify yourself)
          if (currentUserMemberId && nextRow.id === currentUserMemberId) return

          // Skip is_claimed transitions (handled by joinNotifs)
          const claimedFlipped = !prevRow.is_claimed && nextRow.is_claimed
          if (claimedFlipped) return

          // Skip pure visibility changes (handled by visibilityNotifs)
          const onlyVisibilityChanged =
            prevRow.visibility !== nextRow.visibility &&
            prevRow.photo_url === nextRow.photo_url &&
            prevRow.name === nextRow.name &&
            prevRow.bio === nextRow.bio &&
            prevRow.occupation === nextRow.occupation &&
            prevRow.current_place === nextRow.current_place &&
            prevRow.birth_place === nextRow.birth_place &&
            JSON.stringify(prevRow.parent_ids) === JSON.stringify(nextRow.parent_ids) &&
            JSON.stringify(prevRow.spouse_ids) === JSON.stringify(nextRow.spouse_ids)
          if (onlyVisibilityChanged) return

          // Detect what meaningfully changed
          const photoChanged = prevRow.photo_url !== nextRow.photo_url && !!nextRow.photo_url
          const nameChanged = prevRow.name !== nextRow.name
          const bioChanged = prevRow.bio !== nextRow.bio
          const occupationChanged = prevRow.occupation !== nextRow.occupation
          const locationChanged =
            prevRow.current_place !== nextRow.current_place ||
            prevRow.birth_place !== nextRow.birth_place
          const relationshipChanged =
            JSON.stringify(prevRow.parent_ids) !== JSON.stringify(nextRow.parent_ids) ||
            JSON.stringify(prevRow.spouse_ids) !== JSON.stringify(nextRow.spouse_ids)

          if (!photoChanged && !nameChanged && !bioChanged && !occupationChanged && !locationChanged && !relationshipChanged) return

          // Throttle: one notification per member per 5-minute window
          const now = Date.now()
          const lastTime = profileUpdateThrottleRef.current.get(nextRow.id) ?? 0
          if (now - lastTime < 5 * 60 * 1000) return
          profileUpdateThrottleRef.current.set(nextRow.id, now)

          const displayName = privacyAwareName(nextRow.name ?? 'A family member', nextRow.visibility)
          const initials = getInitials(nextRow.name ?? '')

          // Build contextual message
          let title: string
          let body: string
          let priority: NotifPriority = 'low'

          if (photoChanged && !nameChanged && !bioChanged && !occupationChanged && !locationChanged && !relationshipChanged) {
            title = `${displayName} updated their profile photo`
            body = 'Their profile picture has changed'
            priority = 'medium'
          } else if (relationshipChanged && !photoChanged && !nameChanged && !bioChanged) {
            title = `${displayName}'s family connections updated`
            body = 'Their relationships in the tree have changed'
            priority = 'low'
          } else {
            const changes: string[] = []
            if (photoChanged) changes.push('photo')
            if (nameChanged) changes.push('name')
            if (bioChanged) changes.push('bio')
            if (occupationChanged) changes.push('occupation')
            if (locationChanged) changes.push('location')
            title = `${displayName} updated their profile`
            body = changes.length > 0
              ? `Updated: ${changes.join(', ')}`
              : 'Profile details were updated'
            priority = 'low'
          }

          const bucketKey = `profile-update-${nextRow.id}-${Math.floor(now / (5 * 60 * 1000))}`
          setProfileUpdateNotifs(prev => {
            if (prev.some(n => n.id === bucketKey)) return prev
            const notif: AppNotification = {
              id: bucketKey,
              type: 'member_updated',
              title,
              body,
              memberName: displayName,
              memberInitials: initials,
              memberAvatarUrl: photoChanged ? nextRow.photo_url ?? undefined : undefined,
              timestamp: new Date(),
              read: false,
              href: '/dashboard',
              priority,
            }
            return [notif, ...prev].slice(0, 20)
          })
        }
      )
      .subscribe((status, err) => {
        if (err) console.warn('[family_members_profile_update] realtime error:', err)
      })

    return () => { supabase.removeChannel(channel) }
  }, [familyId, currentUserMemberId])

  // ── Realtime: profiles UPDATE → role_changed notification ─────────────────
  // Notifies the affected user (and admins) when their role is changed.
  // Subscribes to profiles table changes where family_id matches.
  const [roleNotifs, setRoleNotifs] = useState<AppNotification[]>([])
  useEffect(() => {
    if (!familyId) return
    if (!FEATURE_FLAGS.enableRealtimeNotifications) return

    const supabase = createClient()
    const channel = supabase
      .channel(`profiles_role:${familyId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `family_id=eq.${familyId}` },
        (payload) => {
          const prevRow = payload.old as any
          const nextRow = payload.new as any
          // Only fire when role actually changes
          if (!prevRow.role || prevRow.role === nextRow.role) return

          const displayName = (nextRow.display_name as string | null) ?? 'A family member'
          const roleLabel: Record<string, string> = {
            admin: 'Admin',
            contributor: 'Contributor',
            viewer: 'Viewer',
          }
          const newRoleLabel = roleLabel[nextRow.role as string] ?? nextRow.role
          const oldRoleLabel = roleLabel[prevRow.role as string] ?? prevRow.role

          setRoleNotifs(prev => {
            const id = `role-${nextRow.id}-${Date.now()}`
            const notif: AppNotification = {
              id,
              type: 'role_changed',
              title: `${displayName}'s role changed`,
              body: `Role updated from ${oldRoleLabel} to ${newRoleLabel}`,
              memberName: displayName,
              memberInitials: getInitials(displayName),
              timestamp: new Date(),
              read: false,
              href: '/dashboard',
              priority: 'medium',
            }
            return [notif, ...prev].slice(0, 10)
          })
        }
      )
      .subscribe((status, err) => {
        if (err) console.warn('[profiles_role] realtime error:', err)
      })

    return () => { supabase.removeChannel(channel) }
  }, [familyId])

  const notifications = useMemo<AppNotification[]>(() => {
    const notifs: AppNotification[] = []

    // 1. New members joined in last 7 days
    // Group 3+ rapid adds into one notification to prevent bulk-import spam.
    const newMembers = members
      .filter(m => daysAgo(m.addedAt) <= 7 && m.relationship !== 'self')
      .sort((a, b) => new Date(b.addedAt ?? 0).getTime() - new Date(a.addedAt ?? 0).getTime())

    if (shouldGroupMemberAdds(newMembers.length)) {
      // Anti-spam: collapse into a single grouped update notification
      const { title, body } = buildGroupedMemberTitle(
        newMembers.length,
        newMembers.slice(0, 3).map(m => privacyAwareName(m.name, m.visibility))
      )
      notifs.push({
        id: `family-update-batch-${newMembers[0]?.id ?? 'batch'}`,
        type: 'relationship_updated',
        title,
        body,
        memberInitials: '🌳',
        timestamp: new Date(newMembers[0]?.addedAt ?? Date.now()),
        read: false,
        href: '/dashboard',
        priority: 'medium',
        groupCount: newMembers.length,
      })
    } else {
      for (const m of newMembers.slice(0, 2)) {
        const displayName = privacyAwareName(m.name, m.visibility)
        const relLabel = m.relationship ? ` (${m.relationship})` : ''
        notifs.push({
          id: `joined-${m.id}`,
          type: 'member_joined',
          title: `${displayName} joined the family tree`,
          body: `New member added${relLabel}`,
          memberName: displayName,
          memberInitials: m.visibility === 'private' ? '🔒' : getInitials(m.name),
          timestamp: new Date(m.addedAt ?? Date.now()),
          read: false,
          href: '/dashboard',
          priority: 'medium',
        })
      }
    }

    // 2. Birthday today (requires birth_month + birth_day from migration 005)
    const birthdayToday = members.filter(m => {
      const bm = (m as any).birthMonth as number | undefined
      const bd = (m as any).birthDay as number | undefined
      return bm === TODAY_MONTH && bd === TODAY_DAY && m.relationship !== 'self'
        && m.visibility !== 'private' // don't surface private members' birthdays
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
        memberInitials: getInitials(m.name),
        timestamp: new Date(),
        read: false,
        href: '/dashboard',
        whatsappLink: `https://wa.me/?text=${wishText}`,
        priority: 'medium',
      })
    }

    // 3. Birthdays upcoming in next 7 days
    const birthdayUpcoming = members.filter(m => {
      const bm = (m as any).birthMonth as number | undefined
      const bd = (m as any).birthDay as number | undefined
      if (!bm || !bd || m.relationship === 'self' || m.visibility === 'private') return false
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
        memberInitials: getInitials(m.name),
        timestamp: new Date(),
        read: false,
        href: '/events',
        priority: 'low',
      })
    }

    // 4. Memorial: death anniversaries (year-of-death + birth month/day match today)
    // We only have deathYear, not deathMonth/deathDay, so we surface these on
    // the birth anniversary of deceased members as a remembrance nudge.
    const memorialToday = members.filter(m => {
      const bm = (m as any).birthMonth as number | undefined
      const bd = (m as any).birthDay as number | undefined
      return bm === TODAY_MONTH && bd === TODAY_DAY
        && m.isAlive === false && m.deathYear
        && m.visibility !== 'private'
    })
    for (const m of memorialToday.slice(0, 2)) {
      const yearsAgo = m.deathYear ? CURRENT_YEAR - m.deathYear : null
      notifs.push({
        id: `memorial-${m.id}`,
        type: 'memorial',
        title: `Remembering ${m.name}`,
        body: yearsAgo
          ? `Gone ${yearsAgo} year${yearsAgo === 1 ? '' : 's'} ago — may their memory live on`
          : 'Today is their birth anniversary — share a memory',
        memberName: m.name,
        memberInitials: getInitials(m.name),
        timestamp: new Date(),
        read: false,
        href: '/memory',
        priority: 'medium',
      })
    }

    // 5. Upcoming events in next 7 days
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
        priority: 'low',
      })
    }

    // 6. Elder voice story reminder
    const elders = members.filter(m => m.isAlive !== false && m.birthYear && (CURRENT_YEAR - m.birthYear) >= 70 && m.visibility !== 'private')
    if (elders.length > 0) {
      notifs.push({
        id: 'elder-voice-reminder',
        type: 'memory_added',
        title: `Record stories from ${elders[0].name}`,
        body: `${elders.length} elder${elders.length > 1 ? 's' : ''} in your tree — preserve their voice memories`,
        memberName: elders[0].name,
        memberInitials: getInitials(elders[0].name),
        timestamp: new Date(),
        read: false,
        href: '/memory',
        priority: 'low',
      })
    }

    // 7. Memory vault reminder if no photos yet
    if (memoriesCount === 0 && members.length > 2) {
      notifs.push({
        id: 'add-first-memory',
        type: 'memory_added',
        title: 'Add your first family photo',
        body: 'Your memory vault is empty — upload a photo to bring it alive',
        timestamp: new Date(),
        read: false,
        href: '/memory',
        priority: 'low',
      })
    }

    // Sort: newest first (priority-based sort done in the merged step)
    return notifs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
  }, [members, memoriesCount, events])

  // Merge all notification streams, deduplicate, sort by priority then timestamp.
  const notificationsWithRead = useMemo(
    () => {
      const merged = [
        ...pendingClaimNotifs,   // admin: polled claim queue (high priority first)
        ...claimNotifs,          // realtime: claim lifecycle events
        ...joinNotifs,           // realtime: is_claimed flip
        ...storyNotifs,          // realtime: new stories
        ...visibilityNotifs,     // realtime: visibility changes
        ...roleNotifs,           // realtime: role changes
        ...profileUpdateNotifs,  // realtime: profile field changes (photo, bio, etc.)
        ...notifications,        // computed: birthdays, events, members, reminders
      ]
      const deduped = deduplicateNotifs(merged)
      const sorted = sortNotifications(deduped)
      return sorted.map(n => ({ ...n, read: readIds.has(n.id) }))
    },
    [notifications, claimNotifs, joinNotifs, pendingClaimNotifs, storyNotifs, visibilityNotifs, roleNotifs, profileUpdateNotifs, readIds]
  )

  const unreadCount = useMemo(
    () => notificationsWithRead.filter(n => !n.read).length,
    [notificationsWithRead]
  )

  const markAllRead = useCallback(() => {
    setReadIds(prev => {
      const allIds = new Set([
        ...prev,
        ...notifications.map(n => n.id),
        ...storyNotifs.map(n => n.id),
        ...visibilityNotifs.map(n => n.id),
        ...claimNotifs.map(n => n.id),
        ...joinNotifs.map(n => n.id),
        ...pendingClaimNotifs.map(n => n.id),
        ...roleNotifs.map(n => n.id),
        ...profileUpdateNotifs.map(n => n.id),
      ])
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...allIds])) } catch { /* ignore */ }
      return allIds
    })
  }, [notifications, storyNotifs, visibilityNotifs, claimNotifs, joinNotifs, pendingClaimNotifs, roleNotifs, profileUpdateNotifs])

  return { notifications: notificationsWithRead, unreadCount, markAllRead }
}

