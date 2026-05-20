'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import type { FamilyMember } from '@/lib/types'

export interface LinkedFamily {
  id: string
  name: string
  memberCount: number
  junctionMemberId: string | null
}

export interface FamilyLinkRequest {
  id: string
  familyAId: string
  familyBId: string
  status: 'pending' | 'accepted' | 'rejected' | 'revoked'
  linkNote?: string
  initiatedBy: string
  createdAt: string
}

interface UseLinkedFamiliesResult {
  linkedMembers: FamilyMember[]
  linkedFamilies: LinkedFamily[]
  newMemberAlert: { member: FamilyMember; familyName: string } | null
  clearNewMemberAlert: () => void
  loading: boolean
  error: string | null
  sendLinkRequest: (inviteCode: string, opts?: { linkNote?: string; junctionMemberAId?: string }) => Promise<{ targetFamilyName: string }>
  refresh: () => void
}

export function useLinkedFamilies(familyId: string | null): UseLinkedFamiliesResult {
  const [linkedMembers, setLinkedMembers] = useState<FamilyMember[]>([])
  const [linkedFamilies, setLinkedFamilies] = useState<LinkedFamily[]>([])
  const [newMemberAlert, setNewMemberAlert] = useState<{ member: FamilyMember; familyName: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const linkedFamilyIdsRef = useRef<string[]>([])
  const linkedMembersRef = useRef<FamilyMember[]>([])
  const familyNamesRef = useRef<Record<string, string>>({})

  const fetchLinkedMembers = useCallback(async () => {
    if (!familyId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/families/linked-members')
      if (!res.ok) throw new Error('Failed to fetch linked families')
      const data = await res.json()
      setLinkedMembers(data.linkedMembers ?? [])
      setLinkedFamilies(data.linkedFamilies ?? [])
      linkedFamilyIdsRef.current = (data.linkedFamilies ?? []).map((f: LinkedFamily) => f.id)
      linkedMembersRef.current = data.linkedMembers ?? []
      familyNamesRef.current = Object.fromEntries(
        (data.linkedFamilies ?? []).map((f: LinkedFamily) => [f.id, f.name])
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [familyId])

  // Initial fetch
  useEffect(() => {
    fetchLinkedMembers()
  }, [fetchLinkedMembers])

  // ── Supabase Realtime: watch family_members INSERT on linked families ──────
  // When any linked family adds a new member, it pops up as an alert in the tree.
  useEffect(() => {
    if (!familyId) return

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const channel = supabase
      .channel(`linked-family-members:${familyId}:${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'family_members',
        },
        (payload) => {
          const row = payload.new as any
          // Only react if the new member belongs to one of our linked families
          if (!linkedFamilyIdsRef.current.includes(row.family_id)) return

          const newMember: FamilyMember = {
            id: row.id,
            name: row.name,
            birthYear: row.birth_year ?? undefined,
            generation: row.generation ?? 3,
            parentIds: row.parent_ids ?? [],
            spouseIds: row.spouse_ids ?? [],
            gender: row.gender ?? undefined,
            currentPlace: row.current_place ?? undefined,
            birthPlace: row.birth_place ?? undefined,
            isAlive: row.is_alive ?? true,
            networkGroup: 'affiliated',
            affiliatedFamilyId: row.family_id,
            affiliatedFamilyName: familyNamesRef.current[row.family_id] ?? 'Linked Family',
          }

          // Add to linked members list
          setLinkedMembers(prev => {
            const updated = [...prev, newMember]
            linkedMembersRef.current = updated
            return updated
          })

          // Show the "their tree just grew" alert
          setNewMemberAlert({
            member: newMember,
            familyName: familyNamesRef.current[row.family_id] ?? 'Linked Family',
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [familyId])

  const sendLinkRequest = useCallback(async (
    inviteCode: string,
    opts?: { linkNote?: string; junctionMemberAId?: string }
  ): Promise<{ targetFamilyName: string }> => {
    const res = await fetch('/api/families/link-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetInviteCode: inviteCode,
        linkNote: opts?.linkNote,
        junctionMemberAId: opts?.junctionMemberAId,
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Failed to send link request')
    return { targetFamilyName: data.targetFamilyName }
  }, [])

  return {
    linkedMembers,
    linkedFamilies,
    newMemberAlert,
    clearNewMemberAlert: () => setNewMemberAlert(null),
    loading,
    error,
    sendLinkRequest,
    refresh: fetchLinkedMembers,
  }
}
