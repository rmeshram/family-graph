import { describe, it, expect } from 'vitest'
import { canTransition, assertTransition } from '@/lib/claim-state-machine'

describe('claim state machine', () => {
  it('allows owner to send an invite on an unclaimed node (Invite step)', () => {
    expect(canTransition('unclaimed', 'invite_sent', 'owner')).toBe(true)
  })

  it('allows any actor to move invite_sent -> claim_pending -> claimed (Claim step)', () => {
    expect(canTransition('invite_sent', 'claim_pending', 'user')).toBe(true)
    expect(canTransition('claim_pending', 'claimed', 'user')).toBe(true)
  })

  it('allows owner to revoke a claimed node (Unclaim/admin-revoke step)', () => {
    expect(canTransition('claimed', 'revoked', 'owner')).toBe(true)
    expect(canTransition('claim_pending', 'revoked', 'owner')).toBe(true)
  })

  it('admin can perform any owner/any transition', () => {
    expect(canTransition('claimed', 'revoked', 'admin')).toBe(true)
    expect(canTransition('revoked', 'unclaimed', 'admin')).toBe(true)
  })

  it('rejects illegal transitions (failure path)', () => {
    // A plain user cannot revoke someone else's claim
    expect(canTransition('claimed', 'revoked', 'user')).toBe(false)
    // Cannot jump straight from unclaimed to claimed
    expect(canTransition('unclaimed', 'claimed', 'user')).toBe(false)
    // Only an admin can move revoked back to unclaimed
    expect(canTransition('revoked', 'unclaimed', 'owner')).toBe(false)
  })

  it('assertTransition throws on an invalid transition', () => {
    expect(() => assertTransition('unclaimed', 'claimed', 'user')).toThrow(/Invalid claim transition/)
  })

  it('assertTransition is silent on a valid transition', () => {
    expect(() => assertTransition('claim_pending', 'claimed', 'user')).not.toThrow()
  })
})
