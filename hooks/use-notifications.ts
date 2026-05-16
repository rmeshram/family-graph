'use client'

import { useMemo, useState, useCallback } from 'react'
import { FamilyMember } from '@/lib/types'

export type NotifType = 'member_joined' | 'birthday_today' | 'birthday_upcoming' | 'event_upcoming' | 'memory_added'

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
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch { return new Set() }
}

export function useNotifications(members: FamilyMember[], memoriesCount: number, events: MinEvent[] = []) {
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    return getReadIds()
  })

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

  // Mark notifications as read based on readIds
  const notificationsWithRead = useMemo(
    () => notifications.map(n => ({ ...n, read: readIds.has(n.id) })),
    [notifications, readIds]
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

