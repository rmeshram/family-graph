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
  CalendarDays, Sun, Map, FileText, Crown, X, Menu, LogOut, Printer, BookOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { BarChart, Bar, ResponsiveContainer, Cell } from 'recharts'
import { FEATURE_FLAGS } from '@/lib/feature-flags'

const ALL_NAV_ITEMS = [
  { icon: GitBranch, label: 'Family Tree', href: '/dashboard', color: 'text-primary', flag: null },
  { icon: Clock, label: 'Timeline', href: '/timeline', color: 'text-blue-400', flag: null },
  { icon: Camera, label: 'Memory Vault', href: '/memory', color: 'text-amber-400', flag: null },
  { icon: Sparkles, label: 'AI Copilot', href: '/ai-copilot', color: 'text-violet-400', flag: 'enableAICopilot' as const },
  { icon: UserPlus, label: 'Invite Family', href: '/invite', color: 'text-green-400', flag: null },
  { icon: CalendarDays, label: 'Events', href: '/events', color: 'text-pink-400', flag: null },
  { icon: Sun, label: 'On This Day', href: '/today', color: 'text-amber-500', flag: null },
  { icon: Map, label: 'Migration Map', href: '/migration', color: 'text-cyan-400', flag: 'enableMigrationMap' as const },
  { icon: FileText, label: 'Biodata', href: '/biodata', color: 'text-orange-400', flag: null },
  { icon: Printer, label: 'Family Poster', href: '/poster', color: 'text-rose-400', flag: 'enableFamilyPoster' as const },
  { icon: BookOpen, label: 'Kulgatha PDF', href: '/kulgatha', color: 'text-emerald-400', flag: 'enableKulgathaPDF' as const },
]
const NAV_ITEMS = ALL_NAV_ITEMS.filter(item => item.flag === null || FEATURE_FLAGS[item.flag])

interface AppSidebarProps {
  onInsightsClick?: () => void
  onFeedClick?: () => void
  feedCount?: number
}

export function AppSidebar({ onInsightsClick, onFeedClick, feedCount }: AppSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const { user, profile, familyId, loading: authLoading, signOut } = useAuth()
  const { members: dbMembers } = useMembers(familyId)
  const { memories: dbMemories } = useMemories(familyId)
  const { events: dbEvents } = useEvents(familyId)
  const isDemoMode = !authLoading && !user
  const sidebarMembers = useMemo(() => isDemoMode ? sampleFamilyMembers : dbMembers, [isDemoMode, dbMembers])
  const memoriesCount = isDemoMode ? sampleMemories.length : dbMemories.length
  const sidebarEvents = useMemo(() => isDemoMode ? [] : dbEvents, [isDemoMode, dbEvents])
  const isAdmin = !isDemoMode && (profile as any)?.role === 'admin'
  // Pass own member node ID so the hook can suppress self-update notifications
  const selfMemberId = isDemoMode ? null : ((profile as any)?.member_id ?? null)
  const { notifications, unreadCount, markAllRead } = useNotifications(sidebarMembers, memoriesCount, sidebarEvents, isDemoMode ? null : familyId, isAdmin, selfMemberId)

  const handleSignOut = async () => {
    await signOut()
    router.push('/auth/signin')
  }

  // Display name: from profile, or phone number, or email
  const displayName = profile?.display_name
    ?? user?.phone?.replace('+91', '')
    ?? user?.email?.split('@')[0]
    ?? 'Family Member'

  const initials = displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()

  const stats = useMemo(() => {
    const living = sidebarMembers.filter(m => m.isAlive !== false).length
    const generations = new Set(sidebarMembers.map(m => m.generation)).size
    const cities = new Set(sidebarMembers.map(m => m.currentPlace || m.birthPlace).filter(Boolean)).size
    return { total: sidebarMembers.length, living, generations, cities }
  }, [sidebarMembers])

  // Real "missing data" analytics derived from actual members
  const analyticsData = useMemo(() => {
    if (sidebarMembers.length === 0) return [{ v: 0 }, { v: 0 }, { v: 0 }, { v: 0 }, { v: 0 }]
    const pct = (fn: (m: typeof sidebarMembers[0]) => boolean) =>
      Math.round((sidebarMembers.filter(fn).length / sidebarMembers.length) * 100)
    return [
      { v: pct(m => !m.photoUrl), label: 'No photo' },
      { v: pct(m => !m.birthYear), label: 'No birth year' },
      { v: pct(m => !m.occupation), label: 'No occupation' },
      { v: pct(m => !m.bio), label: 'No bio' },
      { v: pct(m => !m.currentPlace), label: 'No location' },
    ]
  }, [sidebarMembers])

  const sidebarContent = (
    <div className="flex h-full flex-col">
      {/* Logo */}
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

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 p-3 shrink-0">
        {[
          { label: 'Members', value: stats.total, icon: Users, color: 'text-primary' },
          { label: 'Generations', value: stats.generations, icon: GitBranch, color: 'text-violet-400' },
          { label: 'Living', value: stats.living, icon: Star, color: 'text-green-400' },
          { label: 'Cities', value: stats.cities, icon: Globe, color: 'text-blue-400' },
        ].map(s => (
          <div key={s.label} className="flex flex-col rounded-xl bg-muted/30 border border-border/50 px-2.5 py-2">
            <s.icon className={cn('h-3.5 w-3.5 mb-0.5', s.color)} />
            <span className="text-base font-bold text-foreground">{s.value}</span>
            <span className="text-[10px] text-muted-foreground">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto space-y-0.5 px-2 py-2" style={{ scrollbarWidth: 'none' }}>
        {NAV_ITEMS.map(item => {
          const isActive = pathname === item.href
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
            </Link>
          )
        })}

        <Separator className="my-2" />

        <div className="mt-3 px-2">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-2 px-1">Advanced Analytics</p>
          <div className="rounded-xl bg-muted/20 border border-border/40 p-2">
            <p className="text-[10px] text-muted-foreground mb-1">Missing data</p>
            <ResponsiveContainer width="100%" height={56}>
              <BarChart data={analyticsData} barSize={10} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <Bar dataKey="v" radius={[3, 3, 0, 0]}>
                  {analyticsData.map((_, idx) => (
                    <Cell key={idx} fill="#6366F1" fillOpacity={0.55 + idx * 0.09} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

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

      {/* User Profile */}
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
              {profile?.role ?? 'Member'}
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
