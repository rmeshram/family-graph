'use client'

import { useMemo } from 'react'
import { FamilyMember } from '@/lib/types'

export type NotifType = 'member_joined' | 'birthday_today' | 'birthday_upcoming' | 'anniversary' | 'memory_added'

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
}

const TODAY = new Date()
const TODAY_MONTH = TODAY.getMonth() + 1  // 1-12
const TODAY_DAY = TODAY.getDate()
const CURRENT_YEAR = TODAY.getFullYear()

function isBirthdayToday(m: FamilyMember) {
  if (!m.birthYear) return false
  // We only have birthYear, not birthMonth/day in type — use addedAt as proxy for "joined recently"
  return false
}

function daysAgo(dateStr: string | undefined): number {
  if (!dateStr) return 999
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
}

export function useNotifications(members: FamilyMember[], memoriesCount: number) {
  const notifications = useMemo<AppNotification[]>(() => {
    const notifs: AppNotification[] = []

    // 1. New members joined in last 7 days
    const newMembers = members
      .filter(m => daysAgo(m.addedAt) <= 7 && m.relationship !== 'self')
      .sort((a, b) => new Date(b.addedAt ?? 0).getTime() - new Date(a.addedAt ?? 0).getTime())

    for (const m of newMembers.slice(0, 5)) {
      const ago = daysAgo(m.addedAt)
      notifs.push({
        id: `joined-${m.id}`,
        type: 'member_joined',
        title: `${m.name} joined the family tree`,
        body: ago === 0 ? 'Just now' : ago === 1 ? 'Yesterday' : `${ago} days ago`,
        memberName: m.name,
        memberInitials: m.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(),
        timestamp: new Date(m.addedAt ?? Date.now()),
        read: false,
        href: '/dashboard',
      })
    }

    // 2. Members added today (for "activity" sense)
    const todayMembers = members.filter(m => daysAgo(m.addedAt) === 0 && m.relationship !== 'self')
    if (todayMembers.length > 0) {
      // Already covered above, skip
    }

    // 3. Birthday reminders based on birth year match (we don't store month/day, so 
    //    we show "this person's birth year was [year] — send them wishes!")
    //    Real birthday push needs birth_month + birth_day fields (future migration).
    //    For now: find members born in the current month (heuristic from birthYear only — placeholder)

    // 4. Members who are "elders" (age > 70) — remind to record their voice stories
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

    // 5. Memory vault reminder if no photos
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
  }, [members, memoriesCount])

  const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications])

  return { notifications, unreadCount }
}
