/**
 * Phone number utilities for Family Graph.
 *
 * All stored phones use E.164 format: +91XXXXXXXXXX
 * Only Indian numbers (+91) supported in V1.
 */

const INDIA_CODE = '+91'

/**
 * Normalise any common Indian phone number format to E.164 (+91XXXXXXXXXX).
 *
 * Handles:
 *   9876543210         → +919876543210
 *   09876543210        → +919876543210  (leading 0)
 *   +91 98765 43210    → +919876543210
 *   0091-9876543210    → +919876543210
 *   919876543210       → +919876543210  (91 prefix without +)
 *
 * Returns null for inputs that cannot be parsed as a valid 10-digit Indian number.
 */
export function normalizePhone(raw: string): string | null {
  // Strip all whitespace, dashes, dots, parentheses
  let digits = raw.replace(/[\s\-().]/g, '')

  // Remove leading 00 (international dialling prefix)
  if (digits.startsWith('00')) digits = digits.slice(2)

  // Remove leading +
  if (digits.startsWith('+')) digits = digits.slice(1)

  // Strip country code 91 if present
  if (digits.startsWith('91') && digits.length === 12) {
    digits = digits.slice(2)
  }

  // Strip leading 0 (domestic trunk prefix)
  if (digits.startsWith('0') && digits.length === 11) {
    digits = digits.slice(1)
  }

  // We should now have exactly 10 digits
  if (!/^\d{10}$/.test(digits)) return null

  // Indian mobile numbers start with 6–9
  if (!/^[6-9]/.test(digits)) return null

  return `${INDIA_CODE}${digits}`
}

/**
 * Format an E.164 Indian phone number for display.
 * +919876543210 → +91 98765 43210
 */
export function formatPhoneDisplay(e164: string): string {
  if (!e164.startsWith('+91') || e164.length !== 13) return e164
  const local = e164.slice(3)
  return `+91 ${local.slice(0, 5)} ${local.slice(5)}`
}

/**
 * Quick validity check on a raw phone string (before normalisation).
 * Does NOT require E.164 — just checks we can produce a valid Indian number.
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
