// lib/claim-state-machine.ts
// Claim status state machine. Used in both API routes (server) and UI (client).

export type ClaimStatus =
  | 'unclaimed'
  | 'invite_sent'
  | 'claim_pending'
  | 'claimed'
  | 'rejected'
  | 'revoked'

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
  [['claimed'], 'unclaimed', 'user'],
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
