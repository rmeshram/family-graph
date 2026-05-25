/**
 * Notification utilities — priority, privacy, deduplication, grouping.
 * Pure functions; no side effects. Import from use-notifications or bell.
 */

// ─── Priority ─────────────────────────────────────────────────────────────────

export type NotifPriority = 'high' | 'medium' | 'low'

const PRIORITY_MAP: Record<string, NotifPriority> = {
  // HIGH — identity / access events that user must act on
  claim_accepted: 'high',
  claim_revoked: 'high',
  node_claimed: 'high',
  role_changed: 'high',
  invite_accepted: 'high',
  // MEDIUM — meaningful family activity
  claim_submitted: 'medium',
  claim_pending_admin: 'medium',
  member_joined: 'medium',
  story_added: 'medium',
  relationship_updated: 'medium',
  visibility_changed: 'medium',
  birthday_today: 'medium',
  anniversary: 'medium',
  memorial: 'medium',
  // LOW — passive / scheduled
  birthday_upcoming: 'low',
  event_upcoming: 'low',
  memory_added: 'low',
  node_match_found: 'low',
}

export function getNotifPriority(type: string): NotifPriority {
  return PRIORITY_MAP[type] ?? 'low'
}

const PRIORITY_ORDER: Record<NotifPriority, number> = { high: 0, medium: 1, low: 2 }

/** Sort notifications: high priority first, then newest timestamp. */
export function sortNotifications<T extends { priority?: NotifPriority; timestamp: Date }>(notifs: T[]): T[] {
  return [...notifs].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority ?? 'low']
    const pb = PRIORITY_ORDER[b.priority ?? 'low']
    if (pa !== pb) return pa - pb
    return b.timestamp.getTime() - a.timestamp.getTime()
  })
}

// ─── Privacy ──────────────────────────────────────────────────────────────────

/**
 * Returns a display name that respects the member's visibility setting.
 * Never exposes the real name of private members to notification text.
 */
export function privacyAwareName(name: string, visibility?: string): string {
  if (visibility === 'private') return 'A private family member'
  if (visibility === 'hidden') return 'A family member'
  return name
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

// ─── Deduplication ────────────────────────────────────────────────────────────

/** Deduplicate by id, preserving first-seen order. */
export function deduplicateNotifs<T extends { id: string }>(notifs: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const n of notifs) {
    if (seen.has(n.id)) continue
    seen.add(n.id)
    out.push(n)
  }
  return out
}

// ─── Graph update grouping ────────────────────────────────────────────────────

/**
 * When 3+ new members are added in the last 7 days (bulk import or quick onboarding),
 * suppress individual member_joined rows and return a single grouped summary string.
 * Returns null if not enough members to group.
 */
export function shouldGroupMemberAdds(count: number): boolean {
  return count >= 3
}

export function buildGroupedMemberTitle(count: number, names: string[]): { title: string; body: string } {
  const preview = names.slice(0, 2).join(', ')
  const extra = count > 2 ? ` and ${count - 2} more` : ''
  return {
    title: `${count} new family members added`,
    body: `${preview}${extra} joined the tree`,
  }
}

// ─── Date section labels ──────────────────────────────────────────────────────

export type DateSection = 'today' | 'week' | 'earlier'

export function getDateSection(ts: Date): DateSection {
  const diffMs = Date.now() - ts.getTime()
  const diffDays = diffMs / 86_400_000
  if (diffDays < 1) return 'today'
  if (diffDays < 7) return 'week'
  return 'earlier'
}

export const DATE_SECTION_LABEL: Record<DateSection, string> = {
  today: 'Today',
  week: 'This week',
  earlier: 'Earlier',
}
