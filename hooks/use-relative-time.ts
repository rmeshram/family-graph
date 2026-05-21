import { useState, useEffect, useCallback } from 'react'

/**
 * useRelativeTime
 *
 * Returns a human-readable relative time string (e.g. "2m ago", "3h ago",
 * "just now") that automatically refreshes so the display stays current.
 *
 * @param timestamp  ISO string, Date, or epoch milliseconds. Pass null/undefined
 *                   to get an empty string.
 * @param intervalMs How often (ms) to recalculate. Default: 30 000 (30 s).
 *
 * @example
 *   const label = useRelativeTime(post.createdAt)   // "5m ago"
 *   const label = useRelativeTime(notification.sentAt, 10_000) // refresh every 10 s
 */
export function useRelativeTime(
  timestamp: string | Date | number | null | undefined,
  intervalMs = 30_000,
): string {
  const format = useCallback((ts: string | Date | number | null | undefined): string => {
    if (ts === null || ts === undefined || ts === '') return ''
    const date = ts instanceof Date ? ts : new Date(ts)
    if (isNaN(date.getTime())) return ''

    const diffMs = Date.now() - date.getTime()
    const diffSec = Math.floor(diffMs / 1000)

    if (diffSec < 5) return 'just now'
    if (diffSec < 60) return `${diffSec}s ago`
    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) return `${diffMin}m ago`
    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return `${diffHr}h ago`
    const diffDay = Math.floor(diffHr / 24)
    if (diffDay < 7) return `${diffDay}d ago`
    const diffWk = Math.floor(diffDay / 7)
    if (diffWk < 5) return `${diffWk}w ago`
    const diffMo = Math.floor(diffDay / 30)
    if (diffMo < 12) return `${diffMo}mo ago`
    return `${Math.floor(diffMo / 12)}y ago`
  }, [])

  const [label, setLabel] = useState(() => format(timestamp))

  useEffect(() => {
    setLabel(format(timestamp))
    if (!timestamp) return
    const id = setInterval(() => setLabel(format(timestamp)), intervalMs)
    return () => clearInterval(id)
  }, [timestamp, intervalMs, format])

  return label
}
