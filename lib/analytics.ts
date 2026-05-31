/**
 * lib/analytics.ts
 *
 * Lightweight analytics wrapper. Fires events to Vercel Analytics when available
 * and logs to console in development. Import and call `track()` anywhere in the app.
 *
 * Event taxonomy (aligned with Sprint 3 success metrics):
 *   tree_created        — first member added to an empty family
 *   member_added        — any member added to the tree
 *   invite_sent         — invite link generated and shared (WhatsApp or copy)
 *   invite_whatsapp     — WhatsApp CTA clicked from post-add prompt
 *   invite_link_copied  — Copy link CTA clicked
 *   invite_accepted     — claim_completed (tracked server-side via audit log)
 *   user_joined         — user successfully claims a node (server-side)
 *   checklist_step_done — a checklist item completed
 *   nudge_shown         — missing-info nudge displayed
 *   nudge_dismissed     — missing-info nudge dismissed
 *   nudge_acted         — user tapped the nudge CTA
 */

export type AnalyticsEvent =
  | 'tree_created'
  | 'member_added'
  | 'invite_sent'
  | 'invite_whatsapp'
  | 'invite_link_copied'
  | 'invite_accepted'
  | 'user_joined'
  | 'checklist_step_done'
  | 'nudge_shown'
  | 'nudge_dismissed'
  | 'nudge_acted'

export function track(event: AnalyticsEvent, properties?: Record<string, string | number | boolean>) {
  try {
    // Vercel Analytics client SDK — exposes window.va when the <Analytics /> component is mounted.
    if (typeof window !== 'undefined') {
      const va = (window as unknown as { va?: (action: string, payload?: object) => void }).va
      if (va) va('event', { name: event, ...properties })
    }
  } catch { /* ignore — analytics must never break the app */ }

  if (process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line no-console
    console.log(`[Analytics] ${event}`, properties ?? '')
  }
}
