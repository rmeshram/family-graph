// lib/claim-state-machine.ts
// Claim status state machine. Used in both API routes (server) and UI (client).

// MED-01: re-export from types.ts as the single source of truth to prevent drift.
export type { ClaimStatus } from './types'
import type { ClaimStatus } from './types'

// HIGH-01: encode the unclaim grace period here so UI code can read it from
// the state machine rather than hard-coding 7 days in multiple places.
// The API route (/api/nodes/[id]/unclaim) enforces this server-side.
export const UNCLAIM_GRACE_PERIOD_DAYS = 7

export type ClaimActor = 'user' | 'owner' | 'admin'

type Transition = [
  from: ClaimStatus | ClaimStatus[],
  to: ClaimStatus,
  by: ClaimActor | 'any',
]

const TRANSITIONS: Transition[] = [
  [['unclaimed'], 'invite_sent', 'owner'],
  [['unclaimed', 'invite_sent'], 'claim_pending', 'any'],
  [['claim_pending'], 'claimed', 'any'],
  [['claim_pending'], 'rejected', 'any'],
  [['rejected'], 'unclaimed', 'owner'],
  // NOTE: self-unclaim is intentionally removed from the state machine.
  // The API route (/api/nodes/[id]/unclaim) enforces a 7-day grace window
  // and then delegates to the owner/admin path. Client UI must not rely on
  // canTransition() to decide unclaim eligibility — check claimedAt instead.
  [['claimed', 'claim_pending'], 'revoked', 'owner'],
  [['revoked'], 'unclaimed', 'admin'],
]

export function canTransition(
  from: ClaimStatus,
  to: ClaimStatus,
  by: ClaimActor
): boolean {
  return TRANSITIONS.some(([froms, toState, byRole]) => {
    const fromMatch = Array.isArray(froms)
      ? (froms as ClaimStatus[]).includes(from)
      : froms === from
    return (
      fromMatch &&
      toState === to &&
      (byRole === 'any' || byRole === by || by === 'admin')
    )
  })
}

export function assertTransition(
  from: ClaimStatus,
  to: ClaimStatus,
  by: ClaimActor
): void {
  if (!canTransition(from, to, by)) {
    throw new Error(`Invalid claim transition: ${from} → ${to} by ${by}`)
  }
}

export const CLAIM_STATUS_META: Record<
  ClaimStatus,
  { label: string; color: string; description: string }
> = {
  unclaimed: {
    label: 'Unclaimed',
    color: 'text-slate-400',
    description: 'No one has claimed this profile yet',
  },
  invite_sent: {
    label: 'Invited',
    color: 'text-blue-400',
    description: 'An invite has been sent to claim this profile',
  },
  claim_pending: {
    label: 'Pending',
    color: 'text-amber-400',
    description: 'A claim is awaiting verification',
  },
  claimed: {
    label: 'Claimed',
    color: 'text-green-400',
    description: 'This profile has been claimed and verified',
  },
  rejected: {
    label: 'Rejected',
    color: 'text-red-400',
    description: 'The last claim attempt was rejected',
  },
  revoked: {
    label: 'Revoked',
    color: 'text-orange-400',
    description: 'The claim was revoked by the tree owner',
  },
}
