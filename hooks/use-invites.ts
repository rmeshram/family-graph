'use client'

import { useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { levenshtein } from '@/lib/utils'

function getOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin
  return process.env.NEXT_PUBLIC_APP_URL ?? ''
}

function randomCode(len = 8) {
  const bytes = new Uint8Array(Math.ceil(len * 1.5))
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(36)).join('').replace(/[^a-z0-9]/gi, '').slice(0, len).toUpperCase()
}

// ─── Duplicate-detection helpers ─────────────────────────────────────────────

function normalizeNameForDup(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ')
}

export function useInvites(familyId: string | null) {
  const supabase = createClient()

  const getCallerRole = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()

    if (error) throw new Error(error.message)
    return data.role as 'admin' | 'contributor' | 'viewer'
  }, [supabase])

  const createInviteLink = useCallback(async (
    role: 'contributor' | 'viewer' | 'admin' = 'contributor',
    expiryHours: number = 72,
    userId: string
  ) => {
    if (!familyId) throw new Error('No family')
    const callerRole = await getCallerRole(userId)
    if (callerRole === 'viewer') {
      throw new Error('Permission denied: viewers cannot create invite links')
    }
    if (role === 'admin' && callerRole !== 'admin') {
      throw new Error('Permission denied: only family admins can create admin invite links')
    }
    const code = randomCode(8)
    const expiresAt = new Date(Date.now() + expiryHours * 3600 * 1000).toISOString()

    const { data, error } = await supabase.from('invite_links').insert({
      family_id: familyId,
      code,
      role,
      created_by: userId,
      expires_at: expiresAt,
      max_uses: 50,
    }).select().single()

    if (error) throw new Error(error.message)
    return { ...data, link: `${getOrigin()}/join/${data.code}` }
  }, [familyId, getCallerRole, supabase])

  const createNodeClaimInvite = useCallback(async (
    nodeId: string,
    nodeName: string,
    userId: string,
    expiryHours = 72
  ) => {
    if (!familyId) throw new Error('No family')
    const callerRole = await getCallerRole(userId)
    if (callerRole === 'viewer') {
      throw new Error('Permission denied: viewers cannot create claim invites')
    }

    // Guard: only allow sending a node-claim invite for nodes that are not yet claimed.
    const { data: targetNode } = await supabase
      .from('family_members')
      .select('is_claimed, claim_status')
      .eq('id', nodeId)
      .single()
    if ((targetNode as any)?.is_claimed) {
      throw new Error('This profile is already claimed. Revoke the existing claim before sending a new invite.')
    }

    // ISSUE-05: prevent creating a second active invite for the same unclaimed node.
    // Return the existing invite URL so the admin can reshare it without minting a
    // second valid token. Revoke the existing invite first if a fresh one is needed.
    const { data: existingInvite } = await (supabase.from('invite_links') as any)
      .select('id, code, expires_at')
      .eq('node_id', nodeId)
      .eq('invite_type', 'node_claim')
      .is('consumed_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()
    if (existingInvite) {
      return {
        ...(existingInvite as any),
        link: `${getOrigin()}/join/${(existingInvite as any).code}`,
        reused: true,
      }
    }

    const code = randomCode(8)
    const expiresAt = new Date(Date.now() + expiryHours * 3600 * 1000).toISOString()

    const { data, error } = await supabase.from('invite_links').insert({
      family_id: familyId,
      code,
      role: 'contributor',
      created_by: userId,
      expires_at: expiresAt,
      max_uses: 1,
      node_id: nodeId,
      invite_type: 'node_claim',
      identity_hint: nodeName,
    } as any).select().single()

    if (error) throw new Error(error.message)

    // Advance node claim status
    await supabase
      .from('family_members')
      .update({ claim_status: 'invite_sent' } as any)
      .eq('id', nodeId)
      .eq('claim_status' as any, 'unclaimed')

    // Write audit log so notification bell shows "Invite sent for <name>"
    // to family admins watching the Realtime claim_audit_log subscription.
    await (supabase as any).from('claim_audit_log').insert({
      node_id: nodeId,
      action: 'invite_sent',
      performed_by: userId,
      meta: { code, identity_hint: nodeName },
    }).then(() => {/* fire-and-forget — audit failure must not block the invite flow */ })

    return { ...data, link: `${getOrigin()}/join/${(data as any).code}` }
  }, [familyId, getCallerRole, supabase])

  const getActiveLinks = useCallback(async () => {
    if (!familyId) return []
    // LOW-03: filter out expired and consumed invites so callers never see
    // stale links as valid. Expired = expires_at in the past. Consumed = consumed_at set.
    const { data } = await supabase
      .from('invite_links')
      .select('*')
      .eq('family_id', familyId)
      .is('consumed_at', null)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order('created_at', { ascending: false })
    return data ?? []
  }, [familyId, supabase])

  const revokeInvite = useCallback(async (id: string) => {
    if (!familyId) return
    // LOW-04: use consumed_at (not expires_at) so a revoked invite is
    // distinguishable from a naturally-expired one in the audit log.
    await supabase.from('invite_links')
      .update({ consumed_at: new Date().toISOString() } as any)
      .eq('id', id)
      .eq('family_id', familyId)
  }, [familyId, supabase])

  return { createInviteLink, createNodeClaimInvite, getActiveLinks, revokeInvite }
}

// ─── Invite by phone number ───────────────────────────────────────────────────

export function useInviteByPhone(familyId: string | null) {
  const supabase = createClient()

  /**
   * Invite a specific person by their phone number.
   * Creates an invite_links row with invited_phone set so the join flow can
   * auto-match them to a family_member node on arrival.
   *
   * @param phone  Raw phone string (will be normalized to E.164 internally)
   * @param nodeId  Optional: pre-link to a specific unclaimed family_member node
   * @param expiryHours  Defaults to 72 hours
   */
  const inviteByPhone = useCallback(async (
    phone: string,
    nodeId?: string,
    expiryHours = 72,
    userId?: string,
  ) => {
    if (!familyId) throw new Error('No family')

    // Lazy import to keep this module server-safe
    const { normalizePhone, whatsappUrl } = await import('@/lib/phone-utils')
    const e164 = normalizePhone(phone)
    if (!e164) throw new Error('Invalid phone number')

    const code = randomCode(8)
    const expiresAt = new Date(Date.now() + expiryHours * 3600 * 1000).toISOString()

    const insertData: Record<string, unknown> = {
      family_id: familyId,
      code,
      role: 'contributor',
      expires_at: expiresAt,
      max_uses: 1,
      invited_phone: e164,
    }
    if (nodeId) { insertData.node_id = nodeId; insertData.invite_type = 'node_claim' }
    if (userId) insertData.created_by = userId

    const { data, error } = await (supabase.from('invite_links') as any)
      .insert(insertData).select().single()

    if (error) throw new Error(error.message)

    const link = `${getOrigin()}/join/${code}`
    const waText = `🌳 You've been invited to join your family tree on Outverse!\n\nTap to join: ${link}`
    const waLink = whatsappUrl(e164, waText)

    return { code, link, waLink, invitedPhone: e164 }
  }, [familyId, supabase])

  return { inviteByPhone }
}

// ─── Join via invite code ─────────────────────────────────────────────────────

type RelToInviter = 'spouse' | 'child' | 'parent' | 'sibling' | 'relative' | 'skip'

interface JoinOpts {
  displayName?: string
  relationshipToInviter?: RelToInviter
  gender?: 'male' | 'female' | 'other'
  /** If set, claim this existing node instead of creating a new one */
  claimMemberId?: string
  /**
   * Bug B: User explicitly confirmed they want to leave their current family
   * and join the invited family. Must be true before joinWithCode will overwrite
   * profiles.family_id when the user has an active claimed node elsewhere.
   */
  confirmCrossFamily?: boolean
}

export function useJoinFamily() {
  const supabase = createClient()

  const joinWithCode = useCallback(async (code: string, userId: string, opts?: JoinOpts) => {
    // ── Session refresh (P0 fix) ────────────────────────────────────────────
    // If the user's JWT has expired (e.g. >1 hour idle), all DB writes silently
    // fail at the RLS layer — no error is thrown. Refresh before any DB call.
    const { error: sessionErr } = await supabase.auth.refreshSession()
    if (sessionErr) throw new Error('Session expired — please sign in again')

    // 1. Look up invite
    const { data: invite, error: inviteErr } = await supabase
      .from('invite_links')
      .select('*')
      .eq('code', code.toUpperCase())
      .single()

    if (inviteErr || !invite) throw new Error('Invalid or expired invite code')
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) throw new Error('Invite link has expired')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inviteAny = invite as any
    if (inviteAny.consumed_at) throw new Error('This invite has already been used')
    if (invite.max_uses && invite.used_count >= invite.max_uses) throw new Error('This invite has reached its user limit')

    // A1: node_claim invites must go through the identity-verification flow.
    // Only allow joinWithCode if the caller explicitly targets the linked node.
    if (inviteAny.invite_type === 'node_claim') {
      if (!opts?.claimMemberId || opts.claimMemberId !== inviteAny.node_id) {
        throw new Error('This invite requires identity verification — open the claim link from your email')
      }
    }

    // A2: For non-node_claim invites, validate claimMemberId belongs to this family
    // Prevents cross-family node claiming with a regular invite link.
    if (opts?.claimMemberId && inviteAny.invite_type !== 'node_claim') {
      const { data: targetMember } = await supabase
        .from('family_members')
        .select('id, family_id, is_claimed')
        .eq('id', opts.claimMemberId)
        .single()
      if (!targetMember || (targetMember as any).family_id !== invite.family_id) {
        throw new Error('Cannot claim a node from a different family')
      }
      if ((targetMember as any).is_claimed) {
        throw new Error('This profile has already been claimed by someone else')
      }
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, phone, member_id, family_id')
      .eq('id', userId)
      .single()

    const { data: authUser } = await supabase.auth.getUser()
    const userEmail = authUser.user?.email ?? null

    // If the user already has a bound member in this family, don't create another.
    if (profile?.member_id) {
      const { data: existingMember } = await supabase
        .from('family_members')
        .select('id, family_id, name, is_claimed, claimed_by_user_id')
        .eq('id', profile.member_id)
        .single()
      if (existingMember?.family_id === invite.family_id) {
        // Cap at contributor — joining via invite never grants admin, even if the
        // invite record says 'admin'. Only the family creator (onboarding) gets admin.
        const safeRole = invite.role === 'admin' ? 'contributor' : invite.role
        await supabase.from('profiles').update({
          family_id: invite.family_id,
          role: safeRole,
        }).eq('id', userId)

        const incrQuery = supabase.from('invite_links') as any
        let incrChain = incrQuery
          .update({ used_count: invite.used_count + 1 })
          .eq('id', invite.id)
          .eq('used_count', invite.used_count)
        if (invite.max_uses) incrChain = incrChain.lt('used_count', invite.max_uses)
        incrChain = incrChain.select('id')
        const { data: incrData, error: incrErr } = await incrChain
        if (incrErr || !(incrData as any[])?.length) {
          throw new Error('This invite was just used by someone else. Please request a new one.')
        }
        return invite.family_id
      }

      // Bug B: Before silently overwriting family_id, check if the user has an
      // ACTIVE claimed node in their current family. If they do, switching families
      // orphans that node (it becomes unclaimed) and the user loses all context
      // from their original tree — with no warning. Require explicit confirmation.
      //
      // We check is_claimed=true AND claimed_by_user_id=userId to distinguish
      // "I created a family but never claimed a node" (safe to overwrite) from
      // "I am a full member of Family A" (destructive to overwrite silently).
      const isMemberActivelyClaimed =
        (existingMember as any).is_claimed === true &&
        (existingMember as any).claimed_by_user_id === userId

      if (isMemberActivelyClaimed && !opts?.confirmCrossFamily) {
        // Surface a typed error so the caller can show a confirmation dialog
        // instead of silently proceeding. The join page catches this and renders
        // a "You are already in another family" prompt with a Confirm / Cancel choice.
        const err = new Error('CROSS_FAMILY_JOIN') as Error & {
          code: string
          existingFamilyId: string
          existingNodeId: string
          existingNodeName: string
        }
        err.code = 'CROSS_FAMILY_JOIN'
        err.existingFamilyId = (existingMember?.family_id ?? '') as string
        err.existingNodeId = (existingMember?.id ?? '') as string
        err.existingNodeName = ((existingMember as any)?.name ?? '') as string
        throw err
      }

      // Guard: user already has a member node in a DIFFERENT family.
      // When confirmCrossFamily=true the user explicitly agreed to merge their tree
      // into the invited family. We migrate ALL their family members to the new
      // family so they don't disappear, and keep member_id intact so their node
      // stays linked. Without migration the user's members stay in the old
      // family_id and become completely invisible — the reported "members disappeared" bug.
      if (existingMember && existingMember.family_id !== invite.family_id) {
        const safeRole = invite.role === 'admin' ? 'contributor' : invite.role
        const oldFamilyId = existingMember.family_id as string
        const oldNodeId = existingMember.id as string

        // ── Migrate all members via server-side API (bypasses RLS) ────────────
        // The client-side Supabase cannot UPDATE family_id to a different family
        // due to the WITH CHECK constraint on the RLS policy. The server-side
        // endpoint uses the service-role key to perform the cross-family move.
        // If claimMemberId is also set, we pass it so the server can merge the
        // duplicate "same person" nodes (old Rahul node + Shikha's Rahul node).
        await fetch('/api/families/migrate-members', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fromFamilyId: oldFamilyId,
            toFamilyId: invite.family_id,
            // If the user is also claiming a node in the target family,
            // merge the old self-node into the claimed node so parent/spouse
            // edges carry over and there's no duplicate.
            oldNodeId: opts?.claimMemberId ? oldNodeId : undefined,
            newNodeId: opts?.claimMemberId ?? undefined,
          }),
        }).catch(err => console.warn('[joinWithCode] migration API error:', err))

        // ── Update profile ─────────────────────────────────────────────────────
        // If claimMemberId was provided and the server merged+deleted the old node,
        // point member_id at the new (claimed) node. Otherwise keep the old node id
        // (it was just moved to the new family by the migration above).
        const newMemberId = opts?.claimMemberId ?? oldNodeId
        await supabase.from('profiles').update({
          family_id: invite.family_id,
          role: safeRole,
          member_id: newMemberId,
          ...(opts?.displayName ? { display_name: opts.displayName } : {}),
        }).eq('id', userId)

        // If claiming, mark the new node as claimed too
        if (opts?.claimMemberId) {
          await supabase.from('family_members')
            .update({ claimed_by_user_id: userId, is_claimed: true } as any)
            .eq('id', opts.claimMemberId)
            .eq('is_claimed', false)
        }

        const incrQ = supabase.from('invite_links') as any
        let chain = incrQ
          .update({ used_count: invite.used_count + 1 })
          .eq('id', invite.id)
          .eq('used_count', invite.used_count)
        if (invite.max_uses) chain = chain.lt('used_count', invite.max_uses)
        chain = chain.select('id')
        const { data: incD, error: incE } = await chain
        if (incE || !(incD as any[])?.length) {
          throw new Error('This invite was just used by someone else. Please request a new one.')
        }
        return invite.family_id
      }
    }

    // ── NEW: Handle family switch even when user had NO claimed node (member_id=null) ──
    // Previously this was skipped: the user's old family members were silently orphaned
    // when profile.family_id changed to the new family without migrating their tree.
    // Now we detect the old family_id from the profile and migrate its members.
    const oldFamilyFromProfile = (profile as any)?.family_id as string | null
    if (oldFamilyFromProfile && oldFamilyFromProfile !== invite.family_id) {
      // Fire-and-forget: migration failure must not block the join.
      // The user's tree will just not be visible (same as the old broken state),
      // which is still better than crashing the join flow.
      fetch('/api/families/migrate-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromFamilyId: oldFamilyFromProfile,
          toFamilyId: invite.family_id,
          // No node merge here — user had no claimed node, so no duplicate to resolve
        }),
      }).catch(err => console.warn('[joinWithCode] migration (no-node) API error:', err))
    }

    // 2. Update profile with family_id + role
    // Cap at contributor — joining via invite never grants admin, even if the
    // invite record says 'admin'. Only the family creator (onboarding) gets admin.
    const safeRole = invite.role === 'admin' ? 'contributor' : invite.role
    const { error: profileErr } = await supabase.from('profiles').update({
      family_id: invite.family_id,
      role: safeRole,
    }).eq('id', userId)
    if (profileErr) throw new Error(profileErr.message)

    // 2b. Identity resolution is handled in the JOIN PAGE UI before this function
    // is called. The UI shows unclaimed node matches and lets the user explicitly
    // pick "Yes this is me" → passes claimMemberId in opts, OR "Create new profile".
    //
    // We intentionally do NOT auto-claim here based on email/name matching.
    // Silent auto-claim is a security risk: a phished email could silently take
    // over another person's profile without their knowledge or confirmation.
    //
    // If opts.claimMemberId is set, the user explicitly confirmed the match.
    // If not set, we proceed to create a new member (step 4).

    // 3. If user picked an existing node to claim, link it and skip new-member creation
    if (opts?.claimMemberId) {
      const { error: claimErr } = await supabase.from('family_members')
        .update({ claimed_by_user_id: userId, is_claimed: true } as any)
        .eq('id', opts.claimMemberId)
        .eq('is_claimed', false)
      if (claimErr) throw new Error(claimErr.message)

      await supabase.from('profiles').update({
        member_id: opts.claimMemberId,
        family_id: invite.family_id,
        display_name: opts.displayName || undefined,
      }).eq('id', userId)

      // ── Apply relationship connections to the claimed node ───────────────────
      // When the joiner said "I am X's child/spouse/sibling", wire the
      // parent_ids / spouse_ids on the claimed node to match that declaration.
      // Without this, the claimed node remains isolated in the tree even after
      // the claim succeeds (user sees members in sidebar but no connected tree).
      const relToInviter = opts.relationshipToInviter ?? 'skip'
      if (relToInviter !== 'skip' && invite.created_by) {
        const { data: inviterProfile } = await supabase
          .from('profiles').select('member_id').eq('id', invite.created_by).single()
        const inviterMemberId = (inviterProfile as any)?.member_id as string | null

        if (inviterMemberId) {
          const { data: inviterMember } = await supabase
            .from('family_members')
            .select('generation, parent_ids, spouse_ids')
            .eq('id', inviterMemberId).single()
          const { data: claimedNode } = await supabase
            .from('family_members')
            .select('generation, parent_ids, spouse_ids')
            .eq('id', opts.claimMemberId).single()

          if (inviterMember && claimedNode) {
            const invGen = (inviterMember as any).generation as number
            const existingPIds = ((claimedNode as any).parent_ids ?? []) as string[]
            const existingSIds = ((claimedNode as any).spouse_ids ?? []) as string[]
            let newParentIds = [...existingPIds]
            let newSpouseIds = [...existingSIds]
            let newGeneration = (claimedNode as any).generation as number

            switch (relToInviter) {
              case 'spouse':
                if (!newSpouseIds.includes(inviterMemberId)) newSpouseIds.push(inviterMemberId)
                newGeneration = invGen
                break
              case 'child':
                if (!newParentIds.includes(inviterMemberId)) newParentIds.push(inviterMemberId)
                newGeneration = invGen + 1
                break
              case 'parent':
                newGeneration = invGen - 1
                break
              case 'sibling': {
                const invPIds = ((inviterMember as any).parent_ids ?? []) as string[]
                invPIds.forEach(pid => { if (!newParentIds.includes(pid)) newParentIds.push(pid) })
                newGeneration = invGen
                break
              }
              case 'relative':
                newGeneration = invGen
                break
            }

            const changed =
              newParentIds.length !== existingPIds.length ||
              newSpouseIds.length !== existingSIds.length ||
              newGeneration !== (claimedNode as any).generation ||
              newParentIds.some(id => !existingPIds.includes(id)) ||
              newSpouseIds.some(id => !existingSIds.includes(id))

            if (changed) {
              await (supabase.from('family_members') as any)
                .update({ parent_ids: newParentIds, spouse_ids: newSpouseIds, generation: newGeneration })
                .eq('id', opts.claimMemberId)

              // Bidirectional: inviter's spouse_ids when joiner is their spouse
              if (relToInviter === 'spouse') {
                const invSIds = ((inviterMember as any).spouse_ids ?? []) as string[]
                if (!invSIds.includes(opts.claimMemberId)) {
                  await (supabase.from('family_members') as any)
                    .update({ spouse_ids: [...invSIds, opts.claimMemberId] })
                    .eq('id', inviterMemberId)
                }
              }
              // Bidirectional: inviter's parent_ids when joiner is their parent
              if (relToInviter === 'parent') {
                const invPIds2 = ((inviterMember as any).parent_ids ?? []) as string[]
                if (!invPIds2.includes(opts.claimMemberId)) {
                  await (supabase.from('family_members') as any)
                    .update({ parent_ids: [...invPIds2, opts.claimMemberId] })
                    .eq('id', inviterMemberId)
                }
              }
            }
          }
        }
      }

      // Emit audit event so realtime notifications fire for admins
      await (supabase.from('claim_audit_log') as any).insert({
        node_id: opts.claimMemberId,
        family_id: invite.family_id,
        actor_id: userId,
        action: 'claim_completed',
        metadata: { via_invite: true, invite_code: code, auto_matched: false },
      })

      // Atomic increment with boundary check (A6)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const incrQ = supabase.from('invite_links') as any
      let chain = incrQ
        .update({ used_count: invite.used_count + 1, consumed_at: new Date().toISOString() })
        .eq('id', invite.id)
        .eq('used_count', invite.used_count)
      if (invite.max_uses) chain = chain.lt('used_count', invite.max_uses)
      chain = chain.select('id')
      const { data: claimData, error: incErr } = await chain
      if (incErr || !(claimData as any[])?.length) throw new Error('This invite was just used by someone else. Please request a new one.')
      return invite.family_id
    }

    // 4. Auto-create + auto-link family_member record if display name provided
    if (opts?.displayName) {
      // Skip new-member creation if relationship step is disabled and user chose "skip"
      // but still create a basic node so the joiner has a presence in the tree.
      const relToInviter = opts.relationshipToInviter ?? 'skip'

      // Get inviter's member record (only relevant when a real relationship is declared)
      let generation = 3
      let parentIds: string[] = []
      let spouseIds: string[] = []
      let networkGroup = 'core'

      if (relToInviter !== 'skip') {
        const { data: inviterProfile } = await supabase
          .from('profiles')
          .select('member_id')
          .eq('id', invite.created_by)
          .single()

        const inviterMemberId = inviterProfile?.member_id as string | null

        if (inviterMemberId) {
          const { data: inviterMember } = await supabase
            .from('family_members')
            .select('generation, parent_ids, spouse_ids, network_group')
            .eq('id', inviterMemberId)
            .single()

          if (inviterMember) {
            const invGen = inviterMember.generation as number
            const invNetwork = (inviterMember.network_group as string) ?? 'core'

            switch (relToInviter) {
              case 'spouse':
                generation = invGen
                spouseIds = [inviterMemberId]
                networkGroup = 'core'
                break
              case 'child':
                generation = invGen + 1
                parentIds = [inviterMemberId]
                networkGroup = 'core'
                break
              case 'sibling':
                generation = invGen
                parentIds = (inviterMember.parent_ids as string[]) ?? []
                networkGroup = 'core'
                break
              case 'parent':
                generation = invGen - 1
                networkGroup = invNetwork === 'core' ? 'extended' : 'affiliated'
                break
              case 'relative':
                generation = invGen
                networkGroup = invNetwork === 'core' ? 'extended' : 'affiliated'
                break
            }

            // Bidirectional link back to inviter
            if (relToInviter === 'spouse' && inviterMemberId) {
              const { data: inv } = await supabase.from('family_members')
                .select('spouse_ids').eq('id', inviterMemberId).single()
              const existing = ((inv?.spouse_ids ?? []) as string[])
              // Will be patched after insert below
              void existing
            }
          }
        }
      }

      // Relationship label for the DB field — 'skip' maps to 'member' (neutral placeholder)
      const relationshipLabel: Record<RelToInviter, string> = {
        spouse: 'spouse', child: 'child', parent: 'parent',
        sibling: 'sibling', relative: 'relative', skip: 'member',
      }

      // ── Server-side duplicate prevention ────────────────────────────────────
      // The client already blocks HIGH-confidence matches in the UI, but a user
      // can still bypass a MEDIUM match, and a direct API call bypasses the UI
      // entirely.  Check for collisions here as a hard server-side guard.
      const normNew = normalizeNameForDup(opts.displayName)
      // #12: include normalized_phone in SELECT so E.164 comparison works even when
      // the raw phone field was stored in a non-normalized format.
      // #1: no pagination cap here — use service-role pattern via server API for large
      // families. For now raise the limit to 5000 to reduce the miss window.
      const { data: existingMembers } = await supabase
        .from('family_members')
        .select('id, name, phone, normalized_phone, email, is_claimed, claimed_by_user_id')
        .eq('family_id', invite.family_id)
        .limit(5000)

      // If a strong exact signal exists, ALWAYS reuse the existing node.
      // This prevents accidental duplicate nodes during invite onboarding.
      const normalizedPhone = profile?.phone?.trim() || null
      const normalizedEmail = userEmail?.trim().toLowerCase() || null

      // Normalize the joining user's phone to E.164 for consistent comparison
      const { normalizePhone: normalizePh } = await import('@/lib/phone-utils')
      const e164Phone = normalizedPhone ? normalizePh(normalizedPhone) : null

      const reusableStrongMatch = (existingMembers ?? []).find((m: any) => {
        if ((m as any).is_claimed) return false
        // Compare against normalized_phone first (E.164), fall back to raw phone field
        const nodeNormPhone: string | null = (m as any).normalized_phone ?? null
        const nodeRawPhone: string | null = (m.phone as string | null)?.trim() ?? null
        const samePhone = e164Phone && (
          (nodeNormPhone && nodeNormPhone === e164Phone) ||
          (!nodeNormPhone && nodeRawPhone === e164Phone)
        )
        const sameEmail = normalizedEmail && (m.email?.trim().toLowerCase() === normalizedEmail)
        return !!(samePhone || sameEmail)
      }) as any

      if (reusableStrongMatch?.id) {
        await (supabase.from('family_members') as any)
          .update({ claimed_by_user_id: userId, is_claimed: true })
          .eq('id', reusableStrongMatch.id)
          .eq('is_claimed', false)

        await supabase.from('profiles').update({
          member_id: reusableStrongMatch.id,
          display_name: opts.displayName,
        }).eq('id', userId)

        // Consume invite atomically
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const incrReuseQ = supabase.from('invite_links') as any
        let reuseChain = incrReuseQ
          .update({ used_count: invite.used_count + 1 })
          .eq('id', invite.id)
          .eq('used_count', invite.used_count)
        if (invite.max_uses) reuseChain = reuseChain.lt('used_count', invite.max_uses)
        reuseChain = reuseChain.select('id')
        const { data: reuseIncrData, error: reuseIncrErr } = await reuseChain
        if (reuseIncrErr || !(reuseIncrData as any[])?.length) {
          throw new Error('This invite was just used by someone else. Please request a new one.')
        }
        return invite.family_id
      }

      const exactPhoneDup = e164Phone
        ? (existingMembers ?? []).find((m: any) => {
          const nodeNormPhone: string | null = (m as any).normalized_phone ?? null
          const nodeRawPhone: string | null = (m.phone as string | null)?.trim() ?? null
          return (nodeNormPhone && nodeNormPhone === e164Phone) ||
            (!nodeNormPhone && nodeRawPhone === e164Phone)
        })
        : null
      if (exactPhoneDup) {
        throw new Error(
          `A profile with the same phone number already exists (${(exactPhoneDup as any).name}). ` +
          'Please claim that profile instead of creating a duplicate.'
        )
      }

      const exactEmailDup = normalizedEmail
        ? (existingMembers ?? []).find((m: any) => m.email?.trim().toLowerCase() === normalizedEmail)
        : null
      if (exactEmailDup) {
        throw new Error(
          `A profile with the same email already exists (${(exactEmailDup as any).name}). ` +
          'Please claim that profile instead of creating a duplicate.'
        )
      }

      const exactDup = (existingMembers ?? []).find(
        m => normalizeNameForDup((m as any).name) === normNew
      )
      if (exactDup) {
        throw new Error(
          `A profile named "${(exactDup as any).name}" already exists in this family. ` +
          `Please select that profile above to claim it — creating a duplicate would break the tree.`
        )
      }

      if (normNew.length >= 4) {
        const fuzzyDup = (existingMembers ?? []).find(m => {
          const norm = normalizeNameForDup((m as any).name)
          return norm.length >= 4 && levenshtein(norm, normNew) <= 2
        })
        if (fuzzyDup) {
          throw new Error(
            `A profile with a very similar name ("${(fuzzyDup as any).name}") already exists. ` +
            `If that's you, please claim it from the list above rather than creating a new profile.`
          )
        }
      }
      // ── End duplicate prevention (client-side pre-check, 5000-row) ─────────────
      // A server-side authoritative check with no row cap is performed by
      // POST /api/families/join-create, which also does the actual INSERT.
      // This prevents duplicate creation even for large families (> 5000 members)
      // and for direct API calls that bypass the client-side UI guards (#1).
      const joinCreateRes = await fetch('/api/families/join-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inviteCode: code.toUpperCase(),
          displayName: opts.displayName,
          relationship: relationshipLabel[relToInviter],
          generation,
          parentIds,
          spouseIds,
          gender: opts.gender ?? null,
          networkGroup,
        }),
      })
      const joinCreateData = await joinCreateRes.json().catch(() => ({}))
      if (!joinCreateRes.ok) {
        const msg: string = joinCreateData.message ?? `Failed to create profile (${joinCreateRes.status})`
        throw new Error(msg)
      }
      const newMemberId: string = joinCreateData.memberId

      // Bidirectional back-link to inviter (spouse/parent)
      if (relToInviter !== 'skip') {
        const { data: inviterProfile } = await supabase
          .from('profiles').select('member_id').eq('id', invite.created_by).single()
        const inviterMemberId = inviterProfile?.member_id as string | null

        if (inviterMemberId) {
          if (relToInviter === 'spouse') {
            const { data: inv } = await supabase.from('family_members')
              .select('spouse_ids').eq('id', inviterMemberId).single()
            const existing = ((inv?.spouse_ids ?? []) as string[])
            if (!existing.includes(newMemberId)) {
              await supabase.from('family_members')
                .update({ spouse_ids: [...existing, newMemberId] }).eq('id', inviterMemberId)
            }
          } else if (relToInviter === 'parent') {
            const { data: inv } = await supabase.from('family_members')
              .select('parent_ids').eq('id', inviterMemberId).single()
            const existing = ((inv?.parent_ids ?? []) as string[])
            if (!existing.includes(newMemberId)) {
              await supabase.from('family_members')
                .update({ parent_ids: [...existing, newMemberId] }).eq('id', inviterMemberId)
            }
          }
        }
      }

      await supabase.from('profiles').update({
        display_name: opts.displayName,
      }).eq('id', userId)
    }

    // 5. Atomic increment with boundary check (A6) to prevent over-consumption
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const incrQuery = supabase.from('invite_links') as any
    let incrChain = incrQuery
      .update({ used_count: invite.used_count + 1 })
      .eq('id', invite.id)
      .eq('used_count', invite.used_count)
    if (invite.max_uses) incrChain = incrChain.lt('used_count', invite.max_uses)
    incrChain = incrChain.select('id')
    const { data: incrData, error: incrErr } = await incrChain
    if (incrErr || !(incrData as any[])?.length) {
      // Lost the race — another joiner consumed the slot. Surface a retryable error.
      throw new Error('This invite was just used by someone else. Please request a new one.')
    }

    return invite.family_id
  }, [supabase])

  return { joinWithCode }
}
