'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { GitBranch, Heart, FileText, UserPlus, Home } from 'lucide-react'
import { isFeatureEnabled } from '@/lib/feature-flags'

const BASE_TABS = [
  { href: '/dashboard', icon: GitBranch, label: 'Tree' },
  { href: '/invite',    icon: UserPlus,  label: 'Invite' },
] as const

const MATRIMONY_TABS = [
  { href: '/biodata', icon: FileText, label: 'Biodata', flag: 'enableBiodata' as const },
  { href: '/matches', icon: Heart,    label: 'Matches', flag: 'enableMatrimonyFeed' as const },
] as const

/** Fixed bottom tab bar — shown on mobile only (hidden lg+). SPEC §3.0. */
export function MobileBottomNav() {
  const pathname = usePathname()

  const matrimonyTabs = MATRIMONY_TABS.filter(t => isFeatureEnabled(t.flag))

  // Build ordered tabs: Tree | [Biodata] | [Matches] | Invite
  const tabs = [
    BASE_TABS[0],
    ...matrimonyTabs,
    BASE_TABS[1],
  ]

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-card/95 backdrop-blur-sm border-t border-border"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Main navigation"
    >
      <div className="flex items-center justify-around">
        {tabs.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center justify-center gap-1 py-2 flex-1 min-h-[56px] transition-colors duration-150 ${
                active
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
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
