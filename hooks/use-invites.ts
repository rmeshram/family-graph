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

export function useJoinFamily() {
  const supabase = createClient()

  const joinWithCode = useCallback(async (code: string, userId: string) => {
    // Look up invite
    const { data: invite, error: inviteErr } = await supabase
      .from('invite_links')
      .select('*')
      .eq('code', code.toUpperCase())
      .single()

    if (inviteErr || !invite) throw new Error('Invalid or expired invite code')
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) throw new Error('Invite link has expired')
    if (invite.max_uses && invite.used_count >= invite.max_uses) throw new Error('Invite link is full')

    // Update profile with family_id + role
    const { error: profileErr } = await supabase.from('profiles').update({
      family_id: invite.family_id,
      role: invite.role,
    }).eq('id', userId)

    if (profileErr) throw new Error(profileErr.message)

    // Increment used_count
    await supabase.from('invite_links').update({ used_count: invite.used_count + 1 }).eq('id', invite.id)

    return invite.family_id
  }, [supabase])

  return { joinWithCode }
}
