'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { GitBranch, Heart, FileText, Inbox, User } from 'lucide-react'
import { isFeatureEnabled } from '@/lib/feature-flags'

// Audit fix: Rename "Tree" → "Family" (user goal), replace "Invite" with "Inbox"
// (Invite is a growth mechanic, not a daily destination), add "Me" for own profile.
const BASE_TABS = [
  { href: '/dashboard', icon: GitBranch, label: 'Family' },
  { href: '/matches/inbox', icon: Inbox, label: 'Inbox', flag: 'enableMatrimonyFeed' as const },
  { href: '/biodata', icon: FileText, label: 'Biodata', flag: 'enableBiodata' as const },
] as const

const MATCHES_TAB = { href: '/matches', icon: Heart, label: 'Matches', flag: 'enableMatrimonyFeed' as const }

/** Fixed bottom tab bar — shown on mobile only (hidden lg+). SPEC §3.0. */
export function MobileBottomNav() {
  const pathname = usePathname()

  const showMatrimony = isFeatureEnabled('enableMatrimonyFeed')
  const showBiodata = isFeatureEnabled('enableBiodata')

  const tabs = [
    BASE_TABS[0], // Family (tree)
    ...(showMatrimony ? [MATCHES_TAB] : []),
    ...(showMatrimony ? [BASE_TABS[1]] : []), // Inbox
    ...(showBiodata ? [BASE_TABS[2]] : []), // Biodata
  ]

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-card/95 backdrop-blur-sm border-t border-border"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Main navigation"
    >
      <div className="flex items-center justify-around">
        {tabs.map(({ href, icon: Icon, label }) => {
          // Active if exact match or sub-path, but /matches/inbox should not activate /matches
          const active =
            href === '/matches'
              ? pathname === '/matches'
              : pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center justify-center gap-1 py-2 flex-1 min-h-[56px] transition-colors duration-150 ${active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              aria-current={active ? 'page' : undefined}
            >
              <Icon
                className={`w-5 h-5 transition-transform duration-150 ${active ? 'scale-110' : ''}`}
                strokeWidth={active ? 2.5 : 2}
              />
              <span className={`text-[10px] font-medium leading-none ${active ? 'text-primary' : ''}`}>
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
