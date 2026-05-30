/**
 * Phone number utilities for Family Graph.
 *
 * Stored phones use E.164 format: +<countryCode><subscriber>
 * V1 focused on Indian numbers (+91). V1.1 adds pass-through for any valid
 * E.164 input so international users are not silently dropped.
 */

const INDIA_CODE = '+91'

/**
 * Normalise a phone number to E.164.
 *
 * Strategy:
 *   1. If the input is already a valid E.164 string (starts with +, 7-15 digits
 *      total), return it as-is. This handles international numbers and numbers
 *      already stored in the correct format.
 *   2. Otherwise apply India-specific heuristics (10-digit, starts with 6-9)
 *      to prepend +91.
 *   3. Return null if no parse succeeds.
 *
 * Indian-format examples (backward-compatible):
 *   9876543210         → +919876543210
 *   09876543210        → +919876543210
 *   +91 98765 43210    → +919876543210
 *   0091-9876543210    → +919876543210
 *   919876543210       → +919876543210
 *
 * International / already-E.164:
 *   +14155552671       → +14155552671  (US)
 *   +447911123456      → +447911123456 (UK)
 *   +919876543210      → +919876543210 (already correct)
 */
export function normalizePhone(raw: string): string | null {
  if (!raw?.trim()) return null

  // Strip all whitespace, dashes, dots, parentheses for uniform processing
  const stripped = raw.replace(/[\s\-().]/g, '')

  // ── Step 1: already valid E.164 ─────────────────────────────────────────────
  // E.164: starts with +, 7–15 digits total (ITU-T E.164 §5.1)
  if (/^\+\d{7,15}$/.test(stripped)) return stripped

  // ── Step 2: India-specific heuristics ────────────────────────────────────────
  let digits = stripped

  // Remove leading 00 (international dialling prefix without the +)
  if (digits.startsWith('00')) digits = digits.slice(2)

  // Remove leading + (already stripped above for valid E.164 — this catches
  // partial matches like '+9876543210' that are 10 digits without country code)
  if (digits.startsWith('+')) digits = digits.slice(1)

  // Strip country code 91 if present (919876543210 → 9876543210)
  if (digits.startsWith('91') && digits.length === 12) {
    digits = digits.slice(2)
  }

  // Strip leading 0 (domestic trunk prefix: 09876543210 → 9876543210)
  if (digits.startsWith('0') && digits.length === 11) {
    digits = digits.slice(1)
  }

  // We should now have exactly 10 digits for an Indian number
  if (!/^\d{10}$/.test(digits)) return null

  // Indian mobile numbers start with 6–9
  if (!/^[6-9]/.test(digits)) return null

  return `${INDIA_CODE}${digits}`
}

/**
 * Format an E.164 phone number for human-readable display.
 * Indian numbers get the regional spacing; others are returned verbatim.
 * +919876543210 → +91 98765 43210
 */
export function formatPhoneDisplay(e164: string): string {
  if (e164.startsWith('+91') && e164.length === 13) {
    const local = e164.slice(3)
    return `+91 ${local.slice(0, 5)} ${local.slice(5)}`
  }
  return e164
}

/**
 * Quick validity check on a raw phone string (before normalisation).
 * Returns true if normalizePhone can produce a valid E.164 number.
 */
export function isValidIndianPhone(raw: string): boolean {
  return normalizePhone(raw) !== null
}

/**
 * Build a WhatsApp invite URL.
 * @param e164  E.164 phone number (e.g. +919876543210)
 * @param text  Pre-filled message text
 */
export function whatsappUrl(e164: string, text: string): string {
  // wa.me expects number without the leading +
  const number = e164.replace(/^\+/, '')
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`
}
