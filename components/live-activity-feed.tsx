'use client'

import { useState } from 'react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { MoreHorizontal, X } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

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

const PRESENCE_AVATARS = [
  { id: '1', name: 'Marcus', color: '#6366F1', textColor: 'text-indigo-200' },
  { id: '2', name: 'Sarah', color: '#10B981', textColor: 'text-emerald-200' },
  { id: '3', name: 'David', color: '#8B5CF6', textColor: 'text-violet-200' },
]

export function PresenceAvatars() {
  return (
    <div className="flex items-center -space-x-2">
      {PRESENCE_AVATARS.map((user) => (
        <div
          key={user.id}
          title={user.name}
          className="h-7 w-7 rounded-full border-2 flex items-center justify-center text-[9px] font-bold"
          style={{ backgroundColor: user.color + '33', borderColor: 'var(--background)' }}
        >
          <span style={{ color: user.color }}>
            {user.name.slice(0, 1)}
          </span>
        </div>
      ))}
      <div className="h-7 w-7 rounded-full border-2 bg-muted flex items-center justify-center text-[9px] font-bold text-muted-foreground ml-1" style={{ borderColor: 'var(--background)' }}>
        +2
      </div>
    </div>
  )
}

export function LiveActivityFeed() {
  const [visible, setVisible] = useState(true)

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

  return (
    <div className="w-56 rounded-2xl backdrop-blur-lg border border-border/50 overflow-hidden shadow-xl shadow-black/10" style={{ background: 'var(--surface-card)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/50">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[11px] font-semibold text-foreground">Live Activity</span>
        </div>
        <div className="flex items-center gap-1">
          <button className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors">
            <MoreHorizontal className="h-3 w-3" />
          </button>
          <button
            onClick={() => setVisible(false)}
            className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3 w-3" />
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
