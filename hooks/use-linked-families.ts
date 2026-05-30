'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
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
  // Drives per-family subscription setup — updated after each successful fetch.
  const [subscribedFamilyIds, setSubscribedFamilyIds] = useState<string[]>([])

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
      const ids = (data.linkedFamilies ?? []).map((f: LinkedFamily) => f.id)
      linkedFamilyIdsRef.current = ids
      linkedMembersRef.current = data.linkedMembers ?? []
      familyNamesRef.current = Object.fromEntries(
        (data.linkedFamilies ?? []).map((f: LinkedFamily) => [f.id, f.name])
      )
      // Update subscription targets after fetch completes
      setSubscribedFamilyIds(ids)
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

  // ── Supabase Realtime: one subscription per linked family ─────────────────
  // Creates a server-filtered channel for each linked family ID so only
  // relevant INSERT events are delivered (no client-side fan-out of all
  // family_members inserts from the entire database).
  useEffect(() => {
    if (!familyId || subscribedFamilyIds.length === 0) return

    const supabase = createClient()

    const handleInsert = (linkedFamilyId: string) => (payload: any) => {
      const row = payload.new as any
      if (row.family_id !== linkedFamilyId) return // defensive double-check

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

      setLinkedMembers(prev => {
        const updated = [...prev, newMember]
        linkedMembersRef.current = updated
        return updated
      })

      setNewMemberAlert({
        member: newMember,
        familyName: familyNamesRef.current[row.family_id] ?? 'Linked Family',
      })
    }

    const channels = subscribedFamilyIds.map(linkedFamilyId =>
      supabase
        .channel(`linked-fam-members:${linkedFamilyId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'family_members',
            filter: `family_id=eq.${linkedFamilyId}`,
          },
          handleInsert(linkedFamilyId)
        )
        .subscribe()
    )

    return () => {
      channels.forEach(ch => supabase.removeChannel(ch))
    }
  }, [familyId, subscribedFamilyIds])

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
