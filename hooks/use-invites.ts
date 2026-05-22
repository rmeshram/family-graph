'use client'

import { useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { isRecommendedClaimMatch, scoreCandidate } from '@/lib/match-detection'

function getOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin
  return process.env.NEXT_PUBLIC_APP_URL ?? ''
}

function randomCode(len = 8) {
  return Math.random().toString(36).substring(2, 2 + len).toUpperCase()
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

    return { ...data, link: `${getOrigin()}/join/${(data as any).code}` }
  }, [familyId, getCallerRole, supabase])

  const getActiveLinks = useCallback(async () => {
    if (!familyId) return []
    const { data } = await supabase
      .from('invite_links')
      .select('*')
      .eq('family_id', familyId)
      .order('created_at', { ascending: false })
    return data ?? []
  }, [familyId, supabase])

  const revokeInvite = useCallback(async (id: string) => {
    if (!familyId) return
    await supabase.from('invite_links')
      .update({ expires_at: new Date().toISOString() })
      .eq('id', id)
      .eq('family_id', familyId)
  }, [familyId, supabase])

  return { createInviteLink, createNodeClaimInvite, getActiveLinks, revokeInvite }
}

// ─── Join via invite code ─────────────────────────────────────────────────────

type RelToInviter = 'spouse' | 'child' | 'parent' | 'sibling' | 'relative' | 'skip'

interface JoinOpts {
  displayName?: string
  relationshipToInviter?: RelToInviter
  gender?: 'male' | 'female' | 'other'
  /** If set, claim this existing node instead of creating a new one */
  claimMemberId?: string
}

export function useJoinFamily() {
  const supabase = createClient()

  const joinWithCode = useCallback(async (code: string, userId: string, opts?: JoinOpts) => {
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
      .select('display_name, phone, member_id')
      .eq('id', userId)
      .single()

    const { data: authUser } = await supabase.auth.getUser()
    const userEmail = authUser.user?.email ?? null

    // If the user already has a bound member in this family, don't create another.
    if (profile?.member_id) {
      const { data: existingMember } = await supabase
        .from('family_members')
        .select('id, family_id')
        .eq('id', profile.member_id)
        .single()
      if (existingMember?.family_id === invite.family_id) {
        await supabase.from('profiles').update({
          family_id: invite.family_id,
          role: invite.role,
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
    }

    // 2. Update profile with family_id + role
    const { error: profileErr } = await supabase.from('profiles').update({
      family_id: invite.family_id,
      role: invite.role,
    }).eq('id', userId)
    if (profileErr) throw new Error(profileErr.message)

    // 2b. Before creating a new member, auto-claim a recommended unclaimed node
    // if there is an exact email/phone match or a high-confidence identity match.
    if (!opts?.claimMemberId) {
      const { data: unclaimed } = await supabase
        .from('family_members')
        .select('id, name, relationship, birth_year, phone, email')
        .eq('family_id', invite.family_id)
        .eq('is_claimed', false)
        .limit(50)

      const userProfile = {
        name: opts?.displayName?.trim() || profile?.display_name || userEmail?.split('@')[0] || '',
        birthYear: null as number | null,
        phone: profile?.phone ?? null,
        email: userEmail,
      }

      const bestMatch = (unclaimed ?? [])
        .map((node: any) => scoreCandidate(
          {
            nodeId: node.id,
            nodeName: node.name,
            familyId: invite.family_id,
            familyName: 'Family',
            addedByName: null,
            relationship: node.relationship ?? null,
            birthYear: node.birth_year ?? null,
            phone: node.phone ?? null,
            email: node.email ?? null,
          },
          userProfile,
        ))
        .filter(Boolean)
        .sort((a: any, b: any) => b.confidenceScore - a.confidenceScore)[0]

      if (bestMatch && isRecommendedClaimMatch(bestMatch)) {
        const { error: claimErr } = await supabase.from('family_members')
          .update({ claimed_by_user_id: userId, is_claimed: true } as any)
          .eq('id', bestMatch.nodeId)
          .eq('is_claimed', false)
        if (claimErr) throw new Error(claimErr.message)

        await supabase.from('profiles').update({
          member_id: bestMatch.nodeId,
          display_name: opts?.displayName || profile?.display_name || undefined,
        }).eq('id', userId)

        // Emit audit event so realtime notifications fire for admins
        await (supabase.from('claim_audit_log') as any).insert({
          node_id: bestMatch.nodeId,
          family_id: invite.family_id,
          actor_id: userId,
          action: 'claim_completed',
          metadata: { via_invite: true, invite_code: code, auto_matched: true },
        })

        const incrQ = supabase.from('invite_links') as any
        let chain = incrQ
          .update({ used_count: invite.used_count + 1, consumed_at: new Date().toISOString() })
          .eq('id', invite.id)
          .eq('used_count', invite.used_count)
        if (invite.max_uses) chain = chain.lt('used_count', invite.max_uses)
        chain = chain.select('id')
        const { data: autoData, error: incErr } = await chain
        if (incErr || !(autoData as any[])?.length) throw new Error('This invite was just used by someone else. Please request a new one.')
        return invite.family_id
      }
    }

    // 3. If user picked an existing node to claim, link it and skip new-member creation
    if (opts?.claimMemberId) {
      const { error: claimErr } = await supabase.from('family_members')
        .update({ claimed_by_user_id: userId, is_claimed: true } as any)
        .eq('id', opts.claimMemberId)
        .eq('is_claimed', false)
      if (claimErr) throw new Error(claimErr.message)

      await supabase.from('profiles').update({
        member_id: opts.claimMemberId,
        display_name: opts.displayName || undefined,
      }).eq('id', userId)

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

      const { data: newMember, error: memberErr } = await supabase.from('family_members').insert({
        family_id: invite.family_id,
        name: opts.displayName,
        relationship: relationshipLabel[relToInviter],
        generation,
        is_alive: true,
        parent_ids: parentIds,
        spouse_ids: spouseIds,
        gender: opts.gender ?? null,
        phone: profile?.phone ?? null,
        email: userEmail,
        network_group: networkGroup,
        added_by: userId,
      } as any).select().single()
      if (memberErr) throw new Error(memberErr.message)

      if (newMember && relToInviter !== 'skip') {
        const { data: inviterProfile } = await supabase
          .from('profiles').select('member_id').eq('id', invite.created_by).single()
        const inviterMemberId = inviterProfile?.member_id as string | null

        if (inviterMemberId) {
          if (relToInviter === 'spouse') {
            const { data: inv } = await supabase.from('family_members')
              .select('spouse_ids').eq('id', inviterMemberId).single()
            const existing = ((inv?.spouse_ids ?? []) as string[])
            if (!existing.includes(newMember.id)) {
              await supabase.from('family_members')
                .update({ spouse_ids: [...existing, newMember.id] }).eq('id', inviterMemberId)
            }
          } else if (relToInviter === 'parent') {
            const { data: inv } = await supabase.from('family_members')
              .select('parent_ids').eq('id', inviterMemberId).single()
            const existing = ((inv?.parent_ids ?? []) as string[])
            if (!existing.includes(newMember.id)) {
              await supabase.from('family_members')
                .update({ parent_ids: [...existing, newMember.id] }).eq('id', inviterMemberId)
            }
          }
        }
      }

      if (newMember) {
        await supabase.from('profiles').update({
          member_id: newMember.id,
          display_name: opts.displayName,
        }).eq('id', userId)
      }
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
