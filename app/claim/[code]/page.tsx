/**
 * /claim/[code] — Node Claim Invite landing page
 *
 * The canonical "Identity-centric onboarding" URL:
 *   outverse.in/claim/XYZ123
 *
 * Purpose: when an admin sends a node-specific invite ("Invite Shubham to claim
 * his profile"), the generated link points here. This URL pattern clearly
 * communicates "you are claiming YOUR identity in this tree" vs. "join a family".
 *
 * Implementation: delegates to /join/[code] which already handles the full
 * node_claim flow (identity verification, DOB check, single-use enforcement,
 * cross-family confirmation). No logic duplication.
 */
import { redirect } from 'next/navigation'

interface PageProps {
  params: Promise<{ code: string }>
}

export default async function ClaimPage({ params }: PageProps) {
  const { code } = await params
  // Normalise to uppercase to match how invite codes are stored
  redirect(`/join/${code.toUpperCase()}`)
}
