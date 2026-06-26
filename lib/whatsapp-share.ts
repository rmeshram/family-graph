/**
 * lib/whatsapp-share.ts
 *
 * WhatsApp biodata sharing via wa.me deep links — SPEC §2.1
 * (FF: enableBiodataWhatsappShare). No WhatsApp Business API required.
 *
 * Pure builders: produce the share message text and the wa.me URL. The UI layer
 * is responsible for rendering the share card image (html2canvas, SPEC §3) and
 * invoking navigator.share() / opening the returned URL.
 */

export interface BiodataShareInput {
  name: string
  gotra?: string
  /** Current city / location, shown as one line. */
  city?: string
  age?: number
  /** Absolute URL to the live biodata profile. */
  profileUrl: string
  /** Verified family size, e.g. "Verified family of 12 members". */
  familyMemberCount?: number
  /** Number of verified (claimed) members in the family. */
  verifiedMemberCount?: number
  /** Number of generations in the family tree. */
  generationCount?: number
}

/**
 * Build the WhatsApp share message body for a biodata profile.
 * Plain text + emoji only (WhatsApp does not render markdown in deep links).
 * Leads with family context line per audit spec §7.2.
 */
export function buildBiodataShareText(input: BiodataShareInput): string {
  const lines: string[] = []

  // Family context line — leads the message (most important trust signal)
  if (typeof input.familyMemberCount === 'number' && input.familyMemberCount > 0) {
    const genPart = input.generationCount ? `${input.generationCount} generation${input.generationCount > 1 ? 's' : ''}, ` : ''
    const verifiedPart = input.verifiedMemberCount ? `, ${input.verifiedMemberCount} verified` : ''
    lines.push(`👨‍👩‍👧‍👦 Family background: ${genPart}${input.familyMemberCount} member${input.familyMemberCount > 1 ? 's' : ''}${verifiedPart}`)
    lines.push('')
  }

  const headline = [input.name, input.age != null ? `${input.age} yrs` : null]
    .filter(Boolean)
    .join(', ')
  lines.push(`🪔 ${headline}`)
  if (input.gotra?.trim()) lines.push(`Gotra: ${input.gotra.trim()}`)
  if (input.city?.trim()) lines.push(`📍 ${input.city.trim()}`)
  lines.push('')
  lines.push(`View full biodata & family tree: ${input.profileUrl}`)
  return lines.join('\n')
}

/**
 * Normalize a phone number to digits-only for a wa.me link (no '+', no spaces).
 * Returns undefined if no usable digits remain.
 */
export function normalizeWhatsAppPhone(phone?: string): string | undefined {
  if (!phone) return undefined
  const digits = phone.replace(/\D/g, '')
  return digits.length > 0 ? digits : undefined
}

/**
 * Build a wa.me deep link. When `phone` is provided the chat opens with that
 * contact pre-selected; otherwise WhatsApp shows the contact picker.
 */
export function buildWhatsAppShareUrl(text: string, phone?: string): string {
  const normalized = normalizeWhatsAppPhone(phone)
  const base = normalized ? `https://wa.me/${normalized}` : 'https://wa.me/'
  return `${base}?text=${encodeURIComponent(text)}`
}

/** Convenience: build the full wa.me URL for a biodata profile in one call. */
export function buildBiodataWhatsAppUrl(input: BiodataShareInput, phone?: string): string {
  return buildWhatsAppShareUrl(buildBiodataShareText(input), phone)
}
