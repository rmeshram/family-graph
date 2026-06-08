/**
 * lib/whatsapp-invite.ts
 *
 * Generates WhatsApp-ready invite messages and URLs for the family growth loop.
 * Uses wa.me deep-links so recipients land directly in WhatsApp with a pre-filled
 * message — no phone number required when sharing a general invite link.
 */

/**
 * Build a personalized WhatsApp invite message for a node-claim invite.
 * Uses the relationship between the sender and the recipient to make the
 * message feel like it came from a real family member, not a form email.
 *
 * @param memberName    Full name of the person being invited
 * @param relationship  Human-readable relationship label (e.g. "Father", "Uncle")
 * @param familyName    Family/group name (e.g. "Sharma family")
 * @param inviteLink    The /claim/[code] deep-link
 */
export function buildPersonalizedClaimMessage(
  memberName: string,
  relationship: string | undefined,
  familyName: string | undefined,
  inviteLink: string,
): string {
  const firstName = memberName.split(' ')[0] ?? memberName
  const salutation = relationship
    ? `Hi ${firstName} ${relationship.toLowerCase()}`
    : `Hi ${firstName}`
  const familyRef = familyName ? `the ${familyName}` : 'our family'
  return (
    `${salutation} 🙏\n\n` +
    `Your place in ${familyRef} tree on Outverse is reserved — your profile is already there.\n\n` +
    `When you claim it you can:\n` +
    `• See exactly how you're connected to everyone\n` +
    `• Add your spouse, children & relatives\n` +
    `• Share your own stories & memories\n` +
    `• Control what the family sees about you\n\n` +
    `Claim your spot (link valid 72 hrs):\n${inviteLink}`
  )
}

/**
 * Build the pre-filled WhatsApp invite message for a newly added family member.
 *
 * @param memberName  First name (or full name) of the person being invited
 * @param inviteLink  The join link (e.g. https://familygraph.app/join/ABCD1234)
 */
export function buildMemberInviteMessage(memberName: string, inviteLink: string): string {
  const firstName = memberName.split(' ')[0] ?? memberName
  return (
    `Hi ${firstName},\n\n` +
    `I've added you to our family tree on Outverse.\n\n` +
    `Join using this link:\n${inviteLink}\n\n` +
    `You can:\n` +
    `• View family connections\n` +
    `• Add your branch\n` +
    `• Help complete our family tree\n\n` +
    `Join here:\n${inviteLink}`
  )
}

/**
 * Build the pre-filled WhatsApp invite message for a general family invite
 * (no specific recipient — used for "Share in WhatsApp group" CTAs).
 *
 * @param familyName  Name of the family (e.g. "Sharma Family")
 * @param inviteLink  The join link
 */
export function buildFamilyInviteMessage(familyName: string, inviteLink: string, memberCount?: number): string {
  const countLine = memberCount && memberCount > 1
    ? `${memberCount} family members are already here. ` : ''
  return (
    `🌳 Join the ${familyName} family tree on Outverse!\n\n` +
    `${countLine}I'd love for you to join too.\n\n` +
    `Join here:\n${inviteLink}\n\n` +
    `When you join you can:\n` +
    `• See how everyone is connected\n` +
    `• Add your own spouse, children & relatives\n` +
    `• Share stories and memories\n` +
    `• Get birthday reminders for everyone in the tree`
  )
}

/**
 * Build a wa.me URL with a pre-filled message.
 * Works on both mobile (opens WhatsApp app) and desktop (opens web.whatsapp.com).
 * No phone number means "let the user pick a contact" — ideal for sharing to groups.
 */
export function whatsAppShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`
}

/**
 * Build a wa.me URL targeting a specific phone number with a pre-filled message.
 *
 * @param e164   E.164 phone number, e.g. +919876543210
 * @param message  Pre-filled message text
 */
export function whatsAppDirectUrl(e164: string, message: string): string {
  const number = e164.replace(/^\+/, '')
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`
}
