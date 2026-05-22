'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import {
  Bell, Users, Camera, ChevronRight, Calendar, UserCheck, ShieldAlert,
  BookOpen, GitMerge, Eye, Heart, Flame, AlertCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { AppNotification } from '@/hooks/use-notifications'
import { useRelativeTime } from '@/hooks/use-relative-time'
import { getDateSection, DATE_SECTION_LABEL, type DateSection } from '@/lib/notification-utils'
import Link from 'next/link'

const TYPE_ICON: Record<string, React.ElementType> = {
  member_joined: Users,
  birthday_today: Bell,
  birthday_upcoming: Bell,
  event_upcoming: Calendar,
  anniversary: Heart,
  memorial: Heart,
  memory_added: Camera,
  claim_submitted: UserCheck,
  node_claimed: UserCheck,
  claim_accepted: UserCheck,
  claim_revoked: ShieldAlert,
  node_match_found: Users,
  claim_pending_admin: ShieldAlert,
  // Extended
  story_added: BookOpen,
  relationship_updated: GitMerge,
  visibility_changed: Eye,
}

const TYPE_COLOR: Record<string, string> = {
  member_joined: 'bg-green-500/10 text-green-400',
  birthday_today: 'bg-amber-500/10 text-amber-400',
  birthday_upcoming: 'bg-amber-500/10 text-amber-400',
  event_upcoming: 'bg-blue-500/10 text-blue-400',
  anniversary: 'bg-pink-500/10 text-pink-400',
  memorial: 'bg-purple-500/10 text-purple-400',
  memory_added: 'bg-violet-500/10 text-violet-400',
  claim_submitted: 'bg-amber-500/10 text-amber-400',
  node_claimed: 'bg-green-500/10 text-green-400',
  claim_accepted: 'bg-green-500/10 text-green-400',
  claim_revoked: 'bg-red-500/10 text-red-400',
  node_match_found: 'bg-indigo-500/10 text-indigo-400',
  claim_pending_admin: 'bg-amber-500/10 text-amber-400',
  // Extended
  story_added: 'bg-violet-500/10 text-violet-400',
  relationship_updated: 'bg-teal-500/10 text-teal-400',
  visibility_changed: 'bg-slate-500/10 text-slate-400',
}

const PRIORITY_DOT: Record<string, string> = {
  high: 'bg-red-500',
  medium: 'bg-amber-400',
  low: 'bg-transparent',
}

const SECTION_ORDER: DateSection[] = ['today', 'week', 'earlier']

/** Single notification row — uses useRelativeTime so timestamp stays live. */
function NotificationItem({ notif, onClose, onOpenSettings }: { notif: AppNotification; onClose: () => void; onOpenSettings?: () => void }) {
  const relTime = useRelativeTime(notif.timestamp)
  const router = useRouter()
  const pathname = usePathname()
  const Icon = TYPE_ICON[notif.type] ?? Bell
  const colorClass = TYPE_COLOR[notif.type] ?? 'bg-muted text-muted-foreground'
  const isHighPriority = notif.priority === 'high'

  const handleClaimReview = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onClose()
    if (onOpenSettings) {
      onOpenSettings()
    } else {
      // Fire global event; dashboard listens for it.
      // If not on dashboard, navigate there first so the listener is mounted.
      window.dispatchEvent(new CustomEvent('fg:open-settings', { detail: { tab: 'team' } }))
      if (!pathname.startsWith('/dashboard')) router.push('/dashboard')
    }
  }

  const inner = (
    <div
      className={cn(
        'flex items-start gap-3 px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer border-b border-border/30 last:border-0',
        !notif.read && 'bg-primary/5'
      )}
    >
      {/* Icon with optional high-priority pulse ring */}
      <div className="relative shrink-0">
        <div className={cn('flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold', colorClass)}>
          {notif.memberInitials ? notif.memberInitials : <Icon className="h-4 w-4" />}
        </div>
        {isHighPriority && !notif.read && (
          <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-background animate-pulse" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium leading-snug">{notif.title}</p>
          {notif.groupCount && notif.groupCount > 1 && (
            <span className="inline-flex items-center rounded-full bg-muted text-muted-foreground text-[10px] font-medium px-1.5 py-0 leading-4 shrink-0">
              {notif.groupCount}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{notif.body}</p>
        {notif.type === 'claim_submitted' && (
          <button
            onClick={handleClaimReview}
            className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-[11px] font-medium px-2.5 py-0.5 transition-colors border border-amber-500/30"
          >
            Review in Settings →
          </button>
        )}
        {notif.type === 'birthday_today' && notif.whatsappLink && (
          <a
            href={notif.whatsappLink}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-green-600 hover:bg-green-700 text-white text-[11px] font-medium px-2.5 py-0.5 transition-colors"
          >
            🎂 Wish on WhatsApp
          </a>
        )}
        <p className="mt-0.5 text-[10px] text-muted-foreground/50">{relTime}</p>
      </div>
      {!notif.read && (
        <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', isHighPriority ? 'bg-red-500' : 'bg-primary')} />
      )}
    </div>
  )

  // claim_submitted has its own CTA — don’t wrap in a nav Link
  if (notif.type === 'claim_submitted') return inner

  return notif.href ? (
    <Link href={notif.href} onClick={onClose}>{inner}</Link>
  ) : inner
}

interface NotificationBellProps {
  notifications: AppNotification[]
  unreadCount: number
  onOpen?: () => void
  onOpenSettings?: () => void
}

export function NotificationBell({ notifications, unreadCount, onOpen, onOpenSettings }: NotificationBellProps) {
  const [open, setOpen] = useState(false)
  const [pushState, setPushState] = useState<'default' | 'granted' | 'denied'>('default')

  // Group notifications by date section for section-header rendering
  const sectionedNotifs = useMemo(() => {
    const groups: Record<DateSection, AppNotification[]> = { today: [], week: [], earlier: [] }
    for (const n of notifications) {
      groups[getDateSection(n.timestamp)].push(n)
    }
    return groups
  }, [notifications])

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPushState(Notification.permission as 'default' | 'granted' | 'denied')
    }
  }, [])

  const handleOpenChange = (v: boolean) => {
    setOpen(v)
    if (v && onOpen) onOpen()
  }

  const handleEnablePush = () => {
    if (!('Notification' in window)) return
    Notification.requestPermission().then(perm => {
      setPushState(perm as 'default' | 'granted' | 'denied')
    })
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 text-muted-foreground hover:text-foreground"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-80 p-0 border border-border/60 bg-card shadow-xl"
        sideOffset={8}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
          <p className="font-semibold text-sm">Notifications</p>
          {unreadCount > 0 && (
            <Badge variant="secondary" className="text-xs bg-red-500/10 text-red-400 border-red-500/20">
              {unreadCount} new
            </Badge>
          )}
        </div>

        {/* Notification list */}
        <div className="max-h-[400px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
              <Bell className="h-8 w-8 opacity-30" />
              <p className="text-sm">All caught up!</p>
            </div>
          ) : (
            SECTION_ORDER.map(section => {
              const items = sectionedNotifs[section]
              if (items.length === 0) return null
              return (
                <div key={section}>
                  <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm px-4 py-1.5 border-b border-border/30">
                    <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest">
                      {DATE_SECTION_LABEL[section]}
                    </p>
                  </div>
                  {items.map(notif => (
                    <NotificationItem key={notif.id} notif={notif} onClose={() => setOpen(false)} onOpenSettings={onOpenSettings} />
                  ))}
                </div>
              )
            })
          )}
        </div>

        {/* Enable push CTA */}
        {pushState !== 'granted' && pushState !== 'denied' && (
          <div className="border-b border-border/50 px-4 py-2.5 bg-amber-500/5">
            <div className="flex items-center gap-2">
              <Bell className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <p className="text-xs text-muted-foreground flex-1">Get birthday & activity alerts</p>
              <Button size="sm" className="h-6 text-[11px] px-2 bg-amber-500 hover:bg-amber-600 text-white" onClick={handleEnablePush}>
                Enable
              </Button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-border/50 px-4 py-2">
          <Link href="/events" onClick={() => setOpen(false)}>
            <Button variant="ghost" size="sm" className="w-full justify-between text-muted-foreground text-xs h-8">
              View all activity
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  )
}
