'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/database.types'
import type { FamilyMember, Story } from '@/lib/types'

type DBMember = Database['public']['Tables']['family_members']['Row']

// ─── Converters ──────────────────────────────────────────────────────────────

function dbToMember(row: DBMember): FamilyMember {
  return {
    id: row.id,
    name: row.name,
    birthYear: row.birth_year ?? undefined,
    birthMonth: (row as any).birth_month ?? undefined,
    birthDay: (row as any).birth_day ?? undefined,
    deathYear: row.death_year ?? undefined,
    birthPlace: row.birth_place ?? undefined,
    currentPlace: row.current_place ?? undefined,
    photoUrl: row.photo_url ?? undefined,
    bio: row.bio ?? undefined,
    relationship: (row.relationship as FamilyMember['relationship']) ?? undefined,
    occupation: row.occupation ?? undefined,
    parentIds: (row.parent_ids ?? []) as string[],
    spouseIds: (row.spouse_ids ?? []) as string[],
    generation: row.generation,
    isAlive: row.is_alive,
    gender: (row.gender as FamilyMember['gender']) ?? undefined,
    tags: (row.tags as FamilyMember['tags']) ?? [],
    side: (row.side as FamilyMember['side']) ?? undefined,
    role: (row.role as FamilyMember['role']) ?? undefined,
    gotra: row.gotra ?? undefined,
    caste: row.caste ?? undefined,
    hometown: row.hometown ?? undefined,
    nativeLanguage: row.native_language ?? undefined,
    religion: row.religion ?? undefined,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    instagramHandle: (row as any).instagram_handle ?? undefined,
    addedAt: row.added_at,
    // Migration 002
    claimedByUserId: (row as any).claimed_by_user_id ?? undefined,
    isClaimed: (row as any).is_claimed ?? false,
    visibility: ((row as any).visibility as FamilyMember['visibility']) ?? 'family',
    // Migration 003: extended & affiliated family
    networkGroup: ((row as any).network_group as FamilyMember['networkGroup']) ?? 'core',
    affiliatedFamilyId: (row as any).affiliated_family_id ?? undefined,
    affiliatedFamilyName: (row as any).affiliated_family_name ?? undefined,
    affiliatedJunctionId: (row as any).affiliated_junction_id ?? undefined,
  }
}

function memberToInsert(
  member: Omit<FamilyMember, 'id'>,
  familyId: string,
  userId: string
): Database['public']['Tables']['family_members']['Insert'] {
  return {
    family_id: familyId,
    name: member.name,
    birth_year: member.birthYear ?? null,
    birth_month: (member as any).birthMonth ?? null,
    birth_day: (member as any).birthDay ?? null,
    death_year: member.deathYear ?? null,
    birth_place: member.birthPlace ?? null,
    current_place: member.currentPlace ?? null,
    photo_url: member.photoUrl ?? null,
    bio: member.bio ?? null,
    relationship: member.relationship ?? null,
    occupation: member.occupation ?? null,
    parent_ids: member.parentIds as string[],
    spouse_ids: member.spouseIds as string[],
    generation: member.generation,
    is_alive: member.isAlive ?? true,
    gender: member.gender ?? null,
    tags: (member.tags ?? []) as string[],
    side: member.side ?? null,
    role: member.role ?? null,
    gotra: member.gotra ?? null,
    caste: member.caste ?? null,
    hometown: member.hometown ?? null,
    native_language: member.nativeLanguage ?? null,
    religion: member.religion ?? null,
    phone: member.phone ?? null,
    email: member.email ?? null,
    ...(member.instagramHandle ? { instagram_handle: member.instagramHandle } : {}),
    added_by: userId,
    // Migration 003
    ...(member.networkGroup && member.networkGroup !== 'core' ? { network_group: member.networkGroup } : {}),
    ...(member.affiliatedFamilyId ? { affiliated_family_id: member.affiliatedFamilyId } : {}),
    ...(member.affiliatedFamilyName ? { affiliated_family_name: member.affiliatedFamilyName } : {}),
    ...(member.affiliatedJunctionId ? { affiliated_junction_id: member.affiliatedJunctionId } : {}),
  } as Database['public']['Tables']['family_members']['Insert']
}

// ─── useMembers hook ──────────────────────────────────────────────────────────

// ─── Fetch limit — safety cap for initial load. loadMore() fetches next page. ─
const FETCH_LIMIT = 500

export function useMembers(familyId: string | null) {
  const supabase = createClient()
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [totalCount, setTotalCount] = useState<number>(0)
  const [hasMore, setHasMore] = useState(false)
  const offsetRef = useRef(0)

  // ── DB-level COUNT — accurate even when data is paginated ─────────────────
  const fetchCount = useCallback(async () => {
    if (!familyId) return
    const { count } = await supabase
      .from('family_members')
      .select('*', { count: 'exact', head: true })
      .eq('family_id', familyId)
    setTotalCount(count ?? 0)
  }, [familyId, supabase])

  // ── Initial fetch with limit — prevents loading thousands of rows at once ──
  const fetchMembers = useCallback(async () => {
    if (!familyId) { setLoading(false); return }
    setLoading(true)
    offsetRef.current = 0
    const { data, error } = await supabase
      .from('family_members')
      .select('*')
      .eq('family_id', familyId)
      .order('generation', { ascending: true })
      .order('id', { ascending: true })
      .range(0, FETCH_LIMIT - 1)
    if (error) { setError(error.message); setLoading(false); return }
    const rows = data ?? []
    setMembers(rows.map(dbToMember))
    setHasMore(rows.length === FETCH_LIMIT)
    offsetRef.current = rows.length
    setLoading(false)
    // Fire count query in parallel — doesn't block rendering
    fetchCount()
  }, [familyId, supabase, fetchCount])

  // ── Load next page (cursor-based) ─────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (!familyId || !hasMore) return
    const { data } = await supabase
      .from('family_members')
      .select('*')
      .eq('family_id', familyId)
      .order('generation', { ascending: true })
      .order('id', { ascending: true })
      .range(offsetRef.current, offsetRef.current + FETCH_LIMIT - 1)
    const rows = data ?? []
    setMembers(prev => [...prev, ...rows.map(dbToMember)])
    setHasMore(rows.length === FETCH_LIMIT)
    offsetRef.current += rows.length
  }, [familyId, supabase, hasMore])

  useEffect(() => { fetchMembers() }, [fetchMembers])

  // ── Real-time subscription — patch graph incrementally, no full refetch ────
  useEffect(() => {
    if (!familyId) return
    const channel = supabase
      .channel(`family_members:${familyId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'family_members', filter: `family_id=eq.${familyId}` },
        (payload) => {
          const newMember = dbToMember(payload.new as any)
          setMembers(prev => {
            if (prev.some(m => m.id === newMember.id)) return prev
            return [...prev, newMember]
          })
          setTotalCount(c => c + 1)
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'family_members', filter: `family_id=eq.${familyId}` },
        (payload) => {
          const updated = dbToMember(payload.new as any)
          setMembers(prev => prev.map(m => m.id === updated.id ? updated : m))
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'family_members', filter: `family_id=eq.${familyId}` },
        (payload) => {
          const deletedId = (payload.old as any)?.id
          if (deletedId) {
            setMembers(prev => prev.filter(m => m.id !== deletedId))
            setTotalCount(c => Math.max(0, c - 1))
          }
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [familyId, supabase])

  const addMember = useCallback(async (memberData: Omit<FamilyMember, 'id'>, userId: string) => {
    if (!familyId) return null
    const insert = memberToInsert(memberData, familyId, userId)
    const { data, error } = await supabase.from('family_members').insert(insert).select().single()
    if (error) throw new Error(error.message)

    // Update spouse bidirectional
    const newMember = dbToMember(data)
    if (newMember.spouseIds.length > 0) {
      for (const spouseId of newMember.spouseIds) {
        const spouse = members.find(m => m.id === spouseId)
        if (spouse && !spouse.spouseIds.includes(newMember.id)) {
          await supabase.from('family_members').update({
            spouse_ids: [...spouse.spouseIds, newMember.id] as string[],
          }).eq('id', spouseId)
        }
      }
    }
    return newMember
  }, [familyId, supabase, members])

  const updateMember = useCallback(async (id: string, updates: Partial<FamilyMember>) => {
    // Cast to any to accommodate columns added in migration 005 (birth_month, birth_day)
    // that may not yet be in the generated database.types.ts
    const patch: Record<string, unknown> = {
      name: updates.name,
      birth_year: updates.birthYear ?? null,
      birth_month: (updates as any).birthMonth ?? null,
      birth_day: (updates as any).birthDay ?? null,
      death_year: updates.deathYear ?? null,
      birth_place: updates.birthPlace ?? null,
      current_place: updates.currentPlace ?? null,
      photo_url: updates.photoUrl ?? null,
      bio: updates.bio ?? null,
      relationship: updates.relationship ?? null,
      occupation: updates.occupation ?? null,
      parent_ids: updates.parentIds,
      spouse_ids: updates.spouseIds,
      generation: updates.generation,
      is_alive: updates.isAlive,
      gender: updates.gender ?? null,
      gotra: updates.gotra ?? null,
      hometown: updates.hometown ?? null,
      updated_at: new Date().toISOString(),
    }
    const { error } = await (supabase.from('family_members') as any).update(patch).eq('id', id)
    if (error) throw new Error(error.message)
  }, [supabase])

  const deleteMember = useCallback(async (id: string) => {
    // Remove from other members' parent_ids/spouse_ids first
    for (const m of members) {
      const needsUpdate =
        (m.parentIds as string[]).includes(id) ||
        (m.spouseIds as string[]).includes(id)
      if (needsUpdate) {
        await supabase.from('family_members').update({
          parent_ids: (m.parentIds as string[]).filter(pid => pid !== id),
          spouse_ids: (m.spouseIds as string[]).filter(sid => sid !== id),
        }).eq('id', m.id)
      }
    }
    // Use count to detect RLS silent block (0 rows deleted = permission denied)
    const { error, count } = await supabase
      .from('family_members')
      .delete({ count: 'exact' })
      .eq('id', id)
    if (error) throw new Error(error.message)
    if ((count ?? 0) === 0) throw new Error('Permission denied: only family admins can delete members')
  }, [supabase, members])

  const claimMember = useCallback(async (memberId: string, userId: string) => {
    const { error } = await supabase
      .from('family_members')
      .update({ claimed_by_user_id: userId, is_claimed: true } as any)
      .eq('id', memberId)
      .eq('is_claimed', false)
    if (error) throw new Error(error.message)
  }, [supabase])

  const setVisibility = useCallback(async (memberId: string, visibility: 'public' | 'family' | 'private') => {
    const { error } = await supabase
      .from('family_members')
      .update({ visibility } as any)
      .eq('id', memberId)
    if (error) throw new Error(error.message)
  }, [supabase])

  return { members, loading, error, totalCount, hasMore, loadMore, addMember, updateMember, deleteMember, claimMember, setVisibility, refetch: fetchMembers }
}

// ─── useStories hook ──────────────────────────────────────────────────────────

export function useStories(familyId: string | null) {
  const supabase = createClient()
  const [storiesByMember, setStoriesByMember] = useState<Record<string, Story[]>>({})

  const fetchStories = useCallback(async () => {
    if (!familyId) return
    const { data } = await supabase
      .from('stories')
      .select('*')
      .eq('family_id', familyId)
      .order('created_at', { ascending: false })
    if (!data) return
    const grouped: Record<string, Story[]> = {}
    data.forEach(row => {
      if (!grouped[row.member_id]) grouped[row.member_id] = []
      grouped[row.member_id].push({
        id: row.id,
        title: row.title,
        content: row.content,
        date: row.date ?? undefined,
        author: row.author ?? undefined,
        createdAt: row.created_at,
        aiGenerated: row.ai_generated,
        language: row.language ?? undefined,
      })
    })
    setStoriesByMember(grouped)
  }, [familyId, supabase])

  useEffect(() => { fetchStories() }, [fetchStories])

  // Real-time subscription so new stories appear instantly
  useEffect(() => {
    if (!familyId) return
    const ch = supabase
      .channel(`stories:${familyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stories', filter: `family_id=eq.${familyId}` }, fetchStories)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [familyId, supabase, fetchStories])

  const addStory = useCallback(async (
    memberId: string,
    familyId: string,
    storyData: Omit<Story, 'id' | 'createdAt'>
  ) => {
    const { data, error } = await supabase.from('stories').insert({
      family_id: familyId,
      member_id: memberId,
      title: storyData.title,
      content: storyData.content,
      date: storyData.date ?? null,
      author: storyData.author ?? null,
      ai_generated: storyData.aiGenerated ?? false,
      language: storyData.language ?? 'en',
    }).select().single()
    if (error) throw new Error(error.message)
    return data
  }, [supabase])

  return { storiesByMember, addStory }
}
