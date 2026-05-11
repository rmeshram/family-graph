'use client'

import { useState, useEffect, useCallback } from 'react'
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
    addedAt: row.added_at,
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
    added_by: userId,
  }
}

// ─── useMembers hook ──────────────────────────────────────────────────────────

export function useMembers(familyId: string | null) {
  const supabase = createClient()
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchMembers = useCallback(async () => {
    if (!familyId) { setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('family_members')
      .select('*')
      .eq('family_id', familyId)
      .order('generation', { ascending: true })
    if (error) { setError(error.message); setLoading(false); return }
    setMembers((data ?? []).map(dbToMember))
    setLoading(false)
  }, [familyId, supabase])

  useEffect(() => { fetchMembers() }, [fetchMembers])

  // Real-time subscription
  useEffect(() => {
    if (!familyId) return
    const channel = supabase
      .channel(`family_members:${familyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'family_members', filter: `family_id=eq.${familyId}` },
        () => fetchMembers()
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [familyId, supabase, fetchMembers])

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
    const { error } = await supabase.from('family_members').update({
      name: updates.name,
      birth_year: updates.birthYear ?? null,
      death_year: updates.deathYear ?? null,
      birth_place: updates.birthPlace ?? null,
      current_place: updates.currentPlace ?? null,
      photo_url: updates.photoUrl ?? null,
      bio: updates.bio ?? null,
      relationship: updates.relationship ?? null,
      occupation: updates.occupation ?? null,
      parent_ids: updates.parentIds as string[] | undefined,
      spouse_ids: updates.spouseIds as string[] | undefined,
      generation: updates.generation,
      is_alive: updates.isAlive,
      gender: updates.gender ?? null,
      gotra: updates.gotra ?? null,
      hometown: updates.hometown ?? null,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
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
    const { error } = await supabase.from('family_members').delete().eq('id', id)
    if (error) throw new Error(error.message)
  }, [supabase, members])

  return { members, loading, error, addMember, updateMember, deleteMember, refetch: fetchMembers }
}

// ─── useStories hook ──────────────────────────────────────────────────────────

export function useStories(familyId: string | null) {
  const supabase = createClient()
  const [storiesByMember, setStoriesByMember] = useState<Record<string, Story[]>>({})

  useEffect(() => {
    if (!familyId) return
    const fetchStories = async () => {
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
    }
    fetchStories()
  }, [familyId, supabase])

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
