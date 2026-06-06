'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useMemo } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ThemeToggle } from '@/components/theme-toggle'
import { sampleFamilyMembers, sampleMemories } from '@/lib/sample-data'
import { useAuth } from '@/hooks/use-auth'
import { useMembers } from '@/hooks/use-members'
import { useMemories } from '@/hooks/use-memories'
import { useEvents } from '@/hooks/use-events'
import { useNotifications } from '@/hooks/use-notifications'
import { NotificationBell } from '@/components/notification-bell'
import {
  GitBranch, Camera, UserPlus, Clock, Sparkles,
  Users, Globe, Star, BarChart3, Activity,
  CalendarDays, Sun, Map, FileText, Crown, X, Menu, LogOut,
  Printer, BookOpen, Shield, Share2, ChevronRight, Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { FEATURE_FLAGS } from '@/lib/feature-flags'

// ── Nav items — Invite Family at position 2 (viral action front-and-center) ──
const ALL_NAV_ITEMS = [
  { icon: GitBranch, label: 'Family Tree',   href: '/dashboard',  color: 'text-primary',    flag: null },
  { icon: UserPlus,  label: 'Invite Family', href: '/invite',     color: 'text-green-400',  flag: null },
  { icon: Clock,     label: 'Timeline',      href: '/timeline',   color: 'text-blue-400',   flag: null },
  { icon: Camera,    label: 'Memory Vault',  href: '/memory',     color: 'text-amber-400',  flag: null },
  { icon: Sparkles,  label: 'AI Copilot',    href: '/ai-copilot', color: 'text-violet-400', flag: 'enableAICopilot' as const },
  { icon: CalendarDays, label: 'Events',     href: '/events',     color: 'text-pink-400',   flag: null },
  { icon: Sun,       label: 'On This Day',   href: '/today',      color: 'text-amber-500',  flag: null },
  { icon: Map,       label: 'Migration Map', href: '/migration',  color: 'text-cyan-400',   flag: 'enableMigrationMap' as const },
  { icon: FileText,  label: 'Biodata',       href: '/biodata',    color: 'text-orange-400', flag: null },
  { icon: Printer,   label: 'Family Poster', href: '/poster',     color: 'text-rose-400',   flag: 'enableFamilyPoster' as const },
  { icon: BookOpen,  label: 'Kulgatha PDF',  href: '/kulgatha',   color: 'text-emerald-400',flag: 'enableKulgathaPDF' as const },
  { icon: Shield,    label: 'Moderation',    href: '/moderation', color: 'text-violet-400', flag: 'enableModeratorUI' as const },
]
const NAV_ITEMS = ALL_NAV_ITEMS.filter(item => item.flag === null || FEATURE_FLAGS[item.flag])

// ── Circular SVG progress ring (no external dep) ─────────────────────────────
function RingProgress({ pct, size = 64 }: { pct: number; size?: number }) {
  const r = (size - 10) / 2
  const circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="currentColor" strokeWidth={7}
        className="text-muted/40" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="url(#ringGrad)" strokeWidth={7}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circ - dash}`} />
      <defs>
        <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function CompletionBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className="h-1.5 w-full rounded-full bg-muted/50 overflow-hidden">
      <div className="h-full rounded-full transition-all duration-700"
        style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

function headline(pct: number) {
  if (pct >= 90) return { h: 'Almost complete! 🎉', sub: 'The tree is thriving' }
  if (pct >= 70) return { h: 'Great progress!', sub: 'Keep adding members' }
  if (pct >= 40) return { h: 'Building momentum!', sub: 'Invite relatives to grow faster' }
  if (pct >= 15) return { h: 'Great start!', sub: 'Keep going' }
  return { h: 'Let\'s build your tree', sub: 'Start by adding your parents' }
}

interface AppSidebarProps {
  onInsightsClick?: () => void
  onFeedClick?: () => void
  feedCount?: number
}

export function AppSidebar({ onInsightsClick, onFeedClick, feedCount }: AppSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const { user, profile, familyId, loading: authLoading, signOut } = useAuth()
  const { members: dbMembers } = useMembers(familyId)
  const { memories: dbMemories } = useMemories(familyId)
  const { events: dbEvents } = useEvents(familyId)
  const isDemoMode = !authLoading && !user
  const sidebarMembers = useMemo(() => isDemoMode ? sampleFamilyMembers : dbMembers, [isDemoMode, dbMembers])
  const memoriesCount = isDemoMode ? sampleMemories.length : dbMemories.length
  const sidebarEvents = useMemo(() => isDemoMode ? [] : dbEvents, [isDemoMode, dbEvents])
  const isAdmin = !isDemoMode && (profile as any)?.role === 'admin'
  const selfMemberId = isDemoMode ? null : ((profile as any)?.member_id ?? null)
  const { notifications, unreadCount, markAllRead } = useNotifications(sidebarMembers, memoriesCount, sidebarEvents, isDemoMode ? null : familyId, isAdmin, selfMemberId)

  const handleSignOut = async () => {
    await signOut()
    router.push('/auth/signin')
  }

  const displayName = profile?.display_name
    ?? user?.phone?.replace('+91', '')
    ?? user?.email?.split('@')[0]
    ?? 'Family Member'
  const initials = displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const living = sidebarMembers.filter(m => m.isAlive !== false).length
    const generations = new Set(sidebarMembers.map(m => m.generation)).size
    const cities = new Set(sidebarMembers.map(m => m.currentPlace || m.birthPlace).filter(Boolean)).size
    return { total: sidebarMembers.length, living, generations, cities }
  }, [sidebarMembers])

  // ── Family Completion ──────────────────────────────────────────────────────
  const completion = useMemo(() => {
    const total = sidebarMembers.length
    if (total === 0) return { pct: 0, members: total, memberTarget: 30, claimed: 0, photos: 0, unclaimed: 0 }
    const claimed   = sidebarMembers.filter(m => m.isClaimed).length
    const photos    = sidebarMembers.filter(m => !!m.photoUrl).length
    const unclaimed = sidebarMembers.filter(m => !m.isClaimed && m.isDeceased !== true).length
    const membersScore = Math.min(total / 30, 1)
    const claimedScore = claimed / total
    const photosScore  = photos / total
    const pct = Math.round((membersScore * 0.4 + claimedScore * 0.4 + photosScore * 0.2) * 100)
    return { pct, members: total, memberTarget: 30, claimed, photos, unclaimed }
  }, [sidebarMembers])

  const { h: hlText, sub: hlSub } = headline(completion.pct)

  // ── Share invite link ──────────────────────────────────────────────────────
  const handleShareLink = async () => {
    const url = familyId
      ? `${window.location.origin}/join/${familyId}`
      : window.location.origin
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Join our family tree', url })
      } else {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch { /* user dismissed share sheet */ }
  }

  const sidebarContent = (
    <div className="flex h-full flex-col">
      {/* ── Logo ─────────────────────────────────────────────────────────── */}
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border/40 px-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary shadow-lg shadow-primary/20 ring-1 ring-amber-500/20">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-primary-foreground" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="7" r="3" />
            <circle cx="6" cy="17" r="2.5" />
            <circle cx="18" cy="17" r="2.5" />
            <path d="M12 10v3M8 14l-1.5 2M16 14l1.5 2" strokeLinecap="round" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="font-bold tracking-tight text-foreground">Family Graph</h1>
          <p className="text-[10px] text-muted-foreground">{profile?.display_name ? `${profile.display_name.split(' ').pop() || ''} Family` : 'My Family'}</p>
        </div>
        <NotificationBell notifications={notifications} unreadCount={unreadCount} onOpen={markAllRead} />
        <button onClick={() => setOpen(false)} className="lg:hidden text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* ── Stats ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 p-3 shrink-0">
        {[
          { label: 'Members',     value: stats.total,       icon: Users,   color: 'text-primary' },
          { label: 'Generations', value: stats.generations, icon: GitBranch, color: 'text-violet-400' },
          { label: 'Living',      value: stats.living,      icon: Star,    color: 'text-green-400' },
          { label: 'Cities',      value: stats.cities,      icon: Globe,   color: 'text-blue-400' },
        ].map(s => (
          <div key={s.label} className="flex flex-col rounded-xl bg-muted/30 border border-border/50 px-2.5 py-2">
            <s.icon className={cn('h-3.5 w-3.5 mb-0.5', s.color)} />
            <span className="text-base font-bold text-foreground">{s.value}</span>
            <span className="text-[10px] text-muted-foreground">{s.label}</span>
          </div>
        ))}
      </div>

      {/* ── Family Completion widget ──────────────────────────────────────── */}
      <div className="mx-3 mb-2 rounded-2xl border border-border/40 bg-muted/20 overflow-hidden shrink-0">
        {/* header */}
        <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
          <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70">Family Completion</span>
          <Link href="/dashboard"
            className="flex items-center gap-0.5 text-[10px] font-medium text-primary hover:text-primary/80 transition-colors">
            View details <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
        {/* ring + headline */}
        <div className="flex items-center gap-3 px-3 pt-1 pb-2">
          <div className="relative">
            <RingProgress pct={completion.pct} size={62} />
            <span className="absolute inset-0 flex items-center justify-center text-[13px] font-extrabold text-foreground rotate-90">
              {completion.pct}%
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-foreground leading-tight">{hlText}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{hlSub}</p>
          </div>
        </div>
        {/* bars */}
        <div className="px-3 pb-3 space-y-2">
          {[
            { icon: '👨‍👩‍👧‍👦', label: 'Relatives Added',   value: completion.members,  max: completion.memberTarget, color: '#818cf8' },
            { icon: '🙋',       label: 'Profiles Claimed', value: completion.claimed,  max: Math.max(completion.members, 1), color: '#34d399' },
            { icon: '📷',       label: 'Photos Added',     value: completion.photos,   max: Math.max(completion.members, 1), color: '#f59e0b' },
          ].map(row => (
            <div key={row.label}>
              <div className="flex items-center justify-between mb-1">
                <span className="flex items-center gap-1 text-[10px] text-foreground font-medium">
                  <span>{row.icon}</span>{row.label}
                </span>
                <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">
                  {row.value} / {row.max}
                </span>
              </div>
              <CompletionBar value={row.value} max={row.max} color={row.color} />
            </div>
          ))}
        </div>
        {/* invite CTA — only shown when there are unclaimed members */}
        {completion.unclaimed > 0 && (
          <div className="border-t border-border/30 px-3 py-2 flex items-center justify-between">
            <span className="text-[10px] text-amber-400 font-medium">
              {completion.unclaimed} member{completion.unclaimed > 1 ? 's' : ''} waiting to join
            </span>
            <Link href="/invite"
              className="flex items-center gap-1 rounded-lg bg-green-600/90 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-green-500 transition-colors">
              Invite →
            </Link>
          </div>
        )}
      </div>

      {/* ── Share invite link ─────────────────────────────────────────────── */}
      {!isDemoMode && (
        <div className="mx-3 mb-2 shrink-0">
          <button
            onClick={handleShareLink}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-green-600/40 bg-green-950/20 py-2 text-[11px] font-semibold text-green-400 hover:bg-green-900/30 hover:border-green-500/60 transition-all duration-200"
          >
            {copied ? <><Check className="h-3.5 w-3.5" /> Link copied!</> : <><Share2 className="h-3.5 w-3.5" /> Share family invite link</>}
          </button>
        </div>
      )}

      {/* ── Navigation ───────────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto space-y-0.5 px-2 py-2" style={{ scrollbarWidth: 'none' }}>
        {NAV_ITEMS.map(item => {
          const isActive = pathname === item.href
          const isInvite = item.href === '/invite'
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={cn(
                'relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-muted/40 text-primary border-l-2 border-primary pl-[10px]'
                  : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground border-l-2 border-transparent pl-[10px]'
              )}
            >
              <item.icon className={cn('h-4 w-4', isActive ? 'text-primary' : item.color)} />
              {item.label}
              {/* Unclaimed badge on Invite Family — creates urgency */}
              {isInvite && completion.unclaimed > 0 && (
                <Badge className="ml-auto h-4 px-1.5 text-[10px] bg-amber-500/20 text-amber-400 border-amber-500/30 tabular-nums">
                  {completion.unclaimed}
                </Badge>
              )}
            </Link>
          )
        })}

        <Separator className="my-2" />

        {onInsightsClick && (
          <button
            onClick={() => { onInsightsClick(); setOpen(false) }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-colors border-l-2 border-transparent pl-[10px]"
          >
            <BarChart3 className="h-4 w-4 text-pink-400" />
            AI Insights
          </button>
        )}

        {onFeedClick && (
          <button
            onClick={() => { onFeedClick(); setOpen(false) }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-colors border-l-2 border-transparent pl-[10px]"
          >
            <Activity className="h-4 w-4 text-cyan-400" />
            Family Feed
            {feedCount !== undefined && (
              <Badge className="ml-auto h-4 px-1.5 text-[10px] bg-cyan-500/20 text-cyan-400 border-cyan-500/30">{feedCount}</Badge>
            )}
          </button>
        )}

        <Separator className="my-2" />
        <ThemeToggle showLabel />
      </nav>

      {/* ── User Profile ─────────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-border/40 p-3 space-y-2">
        <div className="flex items-center gap-2.5 rounded-xl bg-muted/30 border border-border/50 p-2.5">
          <Avatar className="h-8 w-8">
            {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt={displayName} className="object-cover" />}
            <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
              {initials || 'FG'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate text-foreground">{displayName}</p>
            <p className="text-[10px] text-muted-foreground truncate capitalize">
              {profile?.role ?? 'Member'} · {completion.pct}% complete
            </p>
          </div>
          {profile?.role === 'admin' && (
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 border-amber-500/30 text-amber-400 shrink-0">
              <Crown className="h-2.5 w-2.5 mr-0.5" />
              Admin
            </Badge>
          )}
        </div>
        {user && (
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        )}
      </div>
    </div>
  )

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setOpen(true)}
        className="fixed top-3 left-3 z-50 flex h-9 w-9 items-center justify-center rounded-xl border border-border/50 bg-card shadow-sm lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-4 w-4 text-muted-foreground" />
      </button>

      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 border-r border-border/40 backdrop-blur-2xl transition-transform duration-300 lg:relative lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
        style={{ background: 'var(--surface-sidebar)' }}
      >
        {sidebarContent}
      </aside>
    </>
  )
}
