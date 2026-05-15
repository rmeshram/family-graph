'use client'

import { useState, useEffect } from 'react'
import { Bell, Users, Camera, ChevronRight, BellOff } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { AppNotification } from '@/hooks/use-notifications'
import Link from 'next/link'

const TYPE_ICON: Record<string, React.ElementType> = {
  member_joined: Users,
  birthday_today: Bell,
  birthday_upcoming: Bell,
  anniversary: Bell,
  memory_added: Camera,
}

const TYPE_COLOR: Record<string, string> = {
  member_joined: 'bg-green-500/10 text-green-400',
  birthday_today: 'bg-amber-500/10 text-amber-400',
  birthday_upcoming: 'bg-amber-500/10 text-amber-400',
  anniversary: 'bg-pink-500/10 text-pink-400',
  memory_added: 'bg-violet-500/10 text-violet-400',
}

interface NotificationBellProps {
  notifications: AppNotification[]
  unreadCount: number
}

export function NotificationBell({ notifications, unreadCount }: NotificationBellProps) {
  const [open, setOpen] = useState(false)
  const [pushState, setPushState] = useState<'default' | 'granted' | 'denied'>('default')

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPushState(Notification.permission as 'default' | 'granted' | 'denied')
    }
  }, [])

  const handleEnablePush = () => {
    if (!('Notification' in window)) return
    Notification.requestPermission().then(perm => {
      setPushState(perm as 'default' | 'granted' | 'denied')
    })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
            notifications.map(notif => {
              const Icon = TYPE_ICON[notif.type] ?? Bell
              const colorClass = TYPE_COLOR[notif.type] ?? 'bg-muted text-muted-foreground'
              const content = (
                <div
                  key={notif.id}
                  className={cn(
                    'flex items-start gap-3 px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer border-b border-border/30 last:border-0',
                    !notif.read && 'bg-primary/5'
                  )}
                >
                  <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold', colorClass)}>
                    {notif.memberInitials ? notif.memberInitials : <Icon className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-snug">{notif.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{notif.body}</p>
                  </div>
                  {!notif.read && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  )}
                </div>
              )

              return notif.href ? (
                <Link key={notif.id} href={notif.href} onClick={() => setOpen(false)}>
                  {content}
                </Link>
              ) : content
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
