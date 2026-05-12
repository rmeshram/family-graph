'use client'

import { useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

function randomCode(len = 8) {
  return Math.random().toString(36).substring(2, 2 + len).toUpperCase()
}

export function useInvites(familyId: string | null) {
  const supabase = createClient()

  const createInviteLink = useCallback(async (
    role: 'contributor' | 'viewer' | 'admin' = 'contributor',
    expiryHours: number = 72,
    userId: string
  ) => {
    if (!familyId) throw new Error('No family')
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
    return { ...data, link: `${location.origin}/join/${data.code}` }
  }, [familyId, supabase])

  const getActiveLinks = useCallback(async () => {
    if (!familyId) return []
    const { data } = await supabase
      .from('invite_links')
      .select('*')
      .eq('family_id', familyId)
      .order('created_at', { ascending: false })
    return data ?? []
  }, [familyId, supabase])

  return { createInviteLink, getActiveLinks }
}

// ─── Join via invite code ─────────────────────────────────────────────────────

type RelToInviter = 'spouse' | 'child' | 'parent' | 'sibling' | 'relative' | 'skip'

interface JoinOpts {
  displayName?: string
  relationshipToInviter?: RelToInviter
  gender?: 'male' | 'female' | 'other'
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
    if (invite.max_uses && invite.used_count >= invite.max_uses) throw new Error('Invite link is full')

    // 2. Update profile with family_id + role
    const { error: profileErr } = await supabase.from('profiles').update({
      family_id: invite.family_id,
      role: invite.role,
    }).eq('id', userId)
    if (profileErr) throw new Error(profileErr.message)

    // 3. Auto-create + auto-link family_member record if relationship provided
    if (opts?.displayName && opts.relationshipToInviter && opts.relationshipToInviter !== 'skip') {
      // Get inviter's member record
      const { data: inviterProfile } = await supabase
        .from('profiles')
        .select('member_id')
        .eq('id', invite.created_by)
        .single()

      const inviterMemberId = inviterProfile?.member_id as string | null

      let generation = 3
      let parentIds: string[] = []
      let spouseIds: string[] = []
      let networkGroup = 'core'

      if (inviterMemberId) {
        const { data: inviterMember } = await supabase
          .from('family_members')
          .select('generation, parent_ids, spouse_ids, network_group')
          .eq('id', inviterMemberId)
          .single()

        if (inviterMember) {
          const invGen = inviterMember.generation as number
          const invNetwork = (inviterMember.network_group as string) ?? 'core'

          switch (opts.relationshipToInviter) {
            case 'spouse':
              generation = invGen
              spouseIds = [inviterMemberId]
              networkGroup = 'core' // spouse marries into core family
              break
            case 'child':
              generation = invGen + 1
              parentIds = [inviterMemberId]
              networkGroup = 'core'
              break
            case 'sibling':
              generation = invGen
              // Share same parents if inviter has them
              parentIds = (inviterMember.parent_ids as string[]) ?? []
              networkGroup = 'core'
              break
            case 'parent':
              generation = invGen - 1
              // After creating, we'll add new member id to inviter's parent_ids
              networkGroup = invNetwork === 'core' ? 'extended' : 'affiliated'
              break
            case 'relative':
              generation = invGen
              networkGroup = invNetwork === 'core' ? 'extended' : 'affiliated'
              break
          }
        }
      }

      // Relationship label for the DB field
      const relationshipLabel: Record<RelToInviter, string> = {
        spouse: 'spouse', child: 'child', parent: 'parent',
        sibling: 'sibling', relative: 'relative', skip: 'member',
      }

      const { data: newMember } = await supabase.from('family_members').insert({
        family_id: invite.family_id,
        name: opts.displayName,
        relationship: relationshipLabel[opts.relationshipToInviter],
        generation,
        is_alive: true,
        parent_ids: parentIds,
        spouse_ids: spouseIds,
        gender: opts.gender ?? null,
        network_group: networkGroup,
        added_by: userId,
      } as any).select().single()

      if (newMember && inviterMemberId) {
        // Bidirectional link back to inviter
        if (opts.relationshipToInviter === 'spouse') {
          const { data: inv } = await supabase.from('family_members')
            .select('spouse_ids').eq('id', inviterMemberId).single()
          const existing = ((inv?.spouse_ids ?? []) as string[])
          if (!existing.includes(newMember.id)) {
            await supabase.from('family_members')
              .update({ spouse_ids: [...existing, newMember.id] }).eq('id', inviterMemberId)
          }
        } else if (opts.relationshipToInviter === 'parent') {
          const { data: inv } = await supabase.from('family_members')
            .select('parent_ids').eq('id', inviterMemberId).single()
          const existing = ((inv?.parent_ids ?? []) as string[])
          if (!existing.includes(newMember.id)) {
            await supabase.from('family_members')
              .update({ parent_ids: [...existing, newMember.id] }).eq('id', inviterMemberId)
          }
        }
      }

      // Save member_id to profile so they can claim their node
      if (newMember) {
        await supabase.from('profiles').update({
          member_id: newMember.id,
          display_name: opts.displayName,
        }).eq('id', userId)
      }
    }

    // 4. Increment used_count
    await supabase.from('invite_links').update({ used_count: invite.used_count + 1 }).eq('id', invite.id)

    return invite.family_id
  }, [supabase])

  return { joinWithCode }
}
