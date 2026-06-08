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
  Printer, BookOpen, Shield, ChevronRight, ChevronLeft, ChevronDown,
  UserCheck, UserX, TreeDeciduous, Heart,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { FEATURE_FLAGS } from '@/lib/feature-flags'

// ── Nav items ─────────────────────────────────────────────────────────────────
const ALL_NAV_ITEMS = [
  { icon: GitBranch, label: 'Family Tree', href: '/dashboard', color: 'text-primary', flag: null },
  { icon: UserPlus, label: 'Invite Family', href: '/invite', color: 'text-green-400', flag: null },
  { icon: Clock, label: 'Timeline', href: '/timeline', color: 'text-blue-400', flag: null },
  { icon: Camera, label: 'Memory Vault', href: '/memory', color: 'text-amber-400', flag: null },
  { icon: Sparkles, label: 'AI Copilot', href: '/ai-copilot', color: 'text-violet-400', flag: 'enableAICopilot' as const },
  { icon: CalendarDays, label: 'Events', href: '/events', color: 'text-pink-400', flag: 'enableEvents' as const },
  { icon: Sun, label: 'On This Day', href: '/today', color: 'text-amber-500', flag: null },
  { icon: Map, label: 'Migration Map', href: '/migration', color: 'text-cyan-400', flag: 'enableMigrationMap' as const },
  { icon: FileText, label: 'Biodata', href: '/biodata', color: 'text-orange-400', flag: null },
  { icon: Printer, label: 'Family Poster', href: '/poster', color: 'text-rose-400', flag: 'enableFamilyPoster' as const },
  { icon: BookOpen, label: 'Kulgatha PDF', href: '/kulgatha', color: 'text-emerald-400', flag: 'enableKulgathaPDF' as const },
  { icon: Shield, label: 'Moderation', href: '/moderation', color: 'text-violet-400', flag: 'enableModeratorUI' as const },
]
const NAV_ITEMS = ALL_NAV_ITEMS.filter(item => item.flag === null || FEATURE_FLAGS[item.flag])

// ── Donut ring ────────────────────────────────────────────────────────────────
function DonutRing({ pct, size = 96 }: { pct: number; size?: number }) {
  const strokeW = 10
  const r = (size - strokeW) / 2
  const circ = 2 * Math.PI * r
  const filled = (pct / 100) * circ
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke="currentColor" strokeWidth={strokeW} className="text-muted/30" />
      <circle cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke="url(#donutGrad)" strokeWidth={strokeW}
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circ - filled}`} />
      <defs>
        <linearGradient id="donutGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="60%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#34d399" />
        </linearGradient>
      </defs>
    </svg>
  )
}

interface AppSidebarProps {
  onInsightsClick?: () => void
  onFeedClick?: () => void
  feedCount?: number
}

export function AppSidebar({ onInsightsClick, onFeedClick, feedCount }: AppSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

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
  const { notifications, unreadCount, markAllRead } = useNotifications(
    sidebarMembers, memoriesCount, sidebarEvents,
    isDemoMode ? null : familyId, isAdmin, selfMemberId
  )

  const handleSignOut = async () => { await signOut(); router.push('/auth/signin') }

  const displayName = profile?.display_name
    ?? (selfMemberId ? sidebarMembers.find(m => m.id === selfMemberId)?.name : undefined)
    ?? user?.phone?.replace('+91', '')
    ?? user?.email?.split('@')[0]
    ?? 'Family Member'
  const familyName = profile?.display_name
    ? `${profile.display_name.split(' ').pop() || ''} Family`
    : 'My Family'
  const initials = displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()

  // ── Family Health stats ────────────────────────────────────────────────────
  const MEMBER_TARGET = 30
  const health = useMemo(() => {
    const total = sidebarMembers.length
    if (total === 0) return {
      pct: 0, waitingToJoin: 0, unclaimed: 0, missingParents: 0, missingSpouses: 0,
      membersAdded: 0, claimed: 0, photos: 0,
      memberScore: 0, claimedScore: 0, photoScore: 0,
    }

    const claimed = sidebarMembers.filter(m => m.isClaimed).length
    const photos = sidebarMembers.filter(m => !!m.photoUrl).length

    // Health % = weighted: members(30%) + claimed(40%) + photos(30%)
    const memberScore = Math.min(total / MEMBER_TARGET, 1)
    const claimedScore = total > 0 ? claimed / total : 0
    const photoScore = total > 0 ? photos / total : 0
    const pct = Math.round((memberScore * 0.3 + claimedScore * 0.4 + photoScore * 0.3) * 100)

    const waitingToJoin = sidebarMembers.filter(m => !m.isClaimed).length
    const unclaimed = sidebarMembers.filter(m => !m.isClaimed && (m as any).claimStatus === 'unclaimed').length
    const missingParents = sidebarMembers.filter(m => (m.parentIds ?? []).length === 0).length
    const missingSpouses = sidebarMembers.filter(m => (m.spouseIds ?? []).length === 0 && m.isAlive !== false).length

    return { pct, waitingToJoin, unclaimed, missingParents, missingSpouses, membersAdded: total, claimed, photos, memberScore, claimedScore, photoScore }
  }, [sidebarMembers])

  // ── Unclaimed badge for Invite Family nav item ─────────────────────────────
  const unclaimedCount = health.waitingToJoin

  // ─────────────────────────────────────────────────────────────────────────────
  // COLLAPSED MODE: icon-only rail (w-14)
  // EXPANDED MODE: full sidebar (w-64)
  // ─────────────────────────────────────────────────────────────────────────────

  const iconRail = (
    <div className="flex h-full flex-col items-center py-3 gap-1">
      {/* Logo icon */}
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary shadow-lg ring-1 ring-amber-500/20 mb-2">
        <TreeDeciduous className="h-5 w-5 text-primary-foreground" />
      </div>

      <Separator className="w-8 my-1" />

      {/* Nav icons */}
      {NAV_ITEMS.map(item => {
        const isActive = pathname === item.href
        return (
          <Link key={item.href} href={item.href}
            title={item.label}
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
              isActive ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
            )}>
            <item.icon className={cn('h-4 w-4', isActive ? 'text-primary' : item.color)} />
          </Link>
        )
      })}

      <div className="flex-1" />

      {/* Expand button */}
      <button onClick={() => setCollapsed(false)}
        title="Expand sidebar"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors">
        <ChevronRight className="h-4 w-4" />
      </button>

      {/* User avatar */}
      <Avatar className="h-8 w-8 shrink-0">
        {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt={displayName} />}
        <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">{initials || 'FG'}</AvatarFallback>
      </Avatar>
    </div>
  )

  const fullContent = (
    <div className="flex h-full flex-col">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border/40 px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary shadow-lg ring-1 ring-amber-500/20">
          <TreeDeciduous className="h-4 w-4 text-primary-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-bold tracking-tight text-foreground leading-tight">Outverse</h1>
          <div className="flex items-center gap-1">
            <p className="text-[11px] text-muted-foreground truncate">{familyName}</p>
            <ChevronDown className="h-3 w-3 text-muted-foreground/60 shrink-0" />
          </div>
        </div>
        <div className="flex items-center gap-1">
          <NotificationBell notifications={notifications} unreadCount={unreadCount} onOpen={markAllRead} />
          {/* Collapse button — desktop only */}
          <button onClick={() => setCollapsed(true)}
            title="Collapse sidebar"
            className="hidden lg:flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setMobileOpen(false)} className="lg:hidden text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Family Health widget ──────────────────────────────────────────── */}
      <div className="mx-3 mt-3 mb-1 rounded-2xl border border-border/40 overflow-hidden shrink-0"
        style={{ background: 'hsl(var(--muted) / 0.15)' }}>
        {/* Title row */}
        <div className="flex items-center justify-between px-3.5 pt-3 pb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px]">✦</span>
            <span className="text-[12px] font-semibold text-foreground">Family Health</span>
          </div>
          <span className="text-[11px] font-bold text-primary tabular-nums">{health.pct}%</span>
        </div>

        {/* Overall progress bar */}
        <div className="px-3.5 pb-3">
          <div className="h-1.5 rounded-full bg-muted/60 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${health.pct}%`, background: 'linear-gradient(90deg, #6366f1, #22d3ee, #34d399)' }} />
          </div>
        </div>

        {/* 3 drivers — each with label, fraction, mini bar */}
        <div className="border-t border-border/30 divide-y divide-border/20 px-3.5">
          {[
            {
              label: 'Members added',
              sublabel: `invite more family — goal: ${MEMBER_TARGET}`,
              current: health.membersAdded,
              target: MEMBER_TARGET,
              pct: Math.round(health.memberScore * 100),
              color: '#6366f1',
              weight: '30%',
            },
            {
              label: 'Profiles claimed',
              sublabel: 'invite members to join the app',
              current: health.claimed,
              target: health.membersAdded,
              pct: Math.round(health.claimedScore * 100),
              color: '#22d3ee',
              weight: '40%',
            },
            {
              label: 'Photos added',
              sublabel: 'edit each member and add a photo',
              current: health.photos,
              target: health.membersAdded,
              pct: Math.round(health.photoScore * 100),
              color: '#34d399',
              weight: '30%',
            },
          ].map(({ label, sublabel, current, target, pct, color, weight }) => (
            <div key={label} className="py-2.5">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[11px] font-semibold text-foreground truncate">{label}</span>
                  <span className="text-[9px] text-muted-foreground/60 shrink-0">({weight})</span>
                </div>
                <span className="text-[11px] font-bold tabular-nums shrink-0 ml-2" style={{ color }}>
                  {current}/{target}
                </span>
              </div>
              <div className="h-1 rounded-full bg-muted/50 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
              </div>
              {pct < 100 && (
                <p className="text-[9px] text-muted-foreground/60 mt-0.5 truncate">{sublabel}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Navigation ───────────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto space-y-0.5 px-2 py-2" style={{ scrollbarWidth: 'none' }}>
        {NAV_ITEMS.map(item => {
          const isActive = pathname === item.href
          const isInvite = item.href === '/invite'
          return (
            <Link key={item.href} href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-muted/40 text-primary border-l-2 border-primary pl-[10px]'
                  : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground border-l-2 border-transparent pl-[10px]'
              )}>
              <item.icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-primary' : item.color)} />
              {item.label}
              {isInvite && unclaimedCount > 0 && (
                <Badge className="ml-auto h-4 px-1.5 text-[10px] bg-amber-500/20 text-amber-400 border-amber-500/30 tabular-nums">
                  {unclaimedCount}
                </Badge>
              )}
            </Link>
          )
        })}

        <Separator className="my-2" />

        {onInsightsClick && (
          <button onClick={() => { onInsightsClick(); setMobileOpen(false) }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-colors border-l-2 border-transparent pl-[10px]">
            <BarChart3 className="h-4 w-4 text-pink-400" />
            AI Insights
          </button>
        )}
        {onFeedClick && (
          <button onClick={() => { onFeedClick(); setMobileOpen(false) }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-colors border-l-2 border-transparent pl-[10px]">
            <Activity className="h-4 w-4 text-cyan-400" />
            Family Feed
            {feedCount !== undefined && feedCount > 0 && (
              <Badge className="ml-auto h-4 px-1.5 text-[10px] bg-cyan-500/20 text-cyan-400 border-cyan-500/30">{feedCount}</Badge>
            )}
          </button>
        )}

        <Separator className="my-2" />
        <ThemeToggle showLabel />
      </nav>

      {/* ── User profile ──────────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-border/40 p-3 space-y-1.5">
        <div className="flex items-center gap-2.5 rounded-xl bg-muted/30 border border-border/50 p-2.5">
          <Avatar className="h-8 w-8 shrink-0">
            {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt={displayName} />}
            <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">{initials || 'FG'}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate text-foreground">{displayName}</p>
            <p className="text-[10px] text-muted-foreground truncate capitalize">
              {profile?.role ?? 'Member'} · {health.pct}% complete
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
          <button onClick={handleSignOut}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-colors">
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
      <button onClick={() => setMobileOpen(true)}
        className="fixed top-3 left-3 z-50 flex h-9 w-9 items-center justify-center rounded-xl border border-border/50 bg-card shadow-sm lg:hidden"
        aria-label="Open menu">
        <Menu className="h-4 w-4 text-muted-foreground" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 border-r border-border/40 backdrop-blur-2xl transition-all duration-300 lg:relative lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          collapsed ? 'w-14' : 'w-64'
        )}
        style={{ background: 'var(--surface-sidebar)' }}
      >
        {collapsed ? iconRail : fullContent}
      </aside>
    </>
  )
}
