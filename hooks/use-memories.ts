'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { MemoryItem, VoiceNote } from '@/lib/types'

// ─── useMemories ──────────────────────────────────────────────────────────────

export function useMemories(familyId: string | null) {
  const supabase = createClient()
  const [memories, setMemories] = useState<MemoryItem[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!familyId) { setLoading(false); return }
    const { data } = await supabase
      .from('memories')
      .select('*')
      .eq('family_id', familyId)
      .order('created_at', { ascending: false })
    setMemories(
      (data ?? []).map(row => ({
        id: row.id,
        title: row.title,
        description: row.description ?? undefined,
        photoUrl: row.photo_url ?? undefined,
        eventType: row.event_type as MemoryItem['eventType'],
        year: row.year ?? undefined,
        date: row.date ?? undefined,
        taggedMemberIds: (row.tagged_member_ids ?? []) as string[],
        uploadedBy: row.uploaded_by ?? undefined,
        uploadedAt: row.created_at,
      }))
    )
    setLoading(false)
  }, [familyId, supabase])

  useEffect(() => { fetch() }, [fetch])

  // Real-time
  useEffect(() => {
    if (!familyId) return
    const ch = supabase
      .channel(`memories:${familyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'memories', filter: `family_id=eq.${familyId}` }, fetch)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [familyId, supabase, fetch])

  const uploadPhoto = useCallback(async (file: File, familyId: string): Promise<string> => {
    const ext = file.name.split('.').pop()
    const path = `${familyId}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('memories').upload(path, file, { upsert: false })
    if (error) throw new Error(error.message)
    const { data } = supabase.storage.from('memories').getPublicUrl(path)
    return data.publicUrl
  }, [supabase])

  const addMemory = useCallback(async (
    familyId: string,
    memory: Omit<MemoryItem, 'id' | 'uploadedAt'>,
    userId: string
  ) => {
    const { data, error } = await supabase.from('memories').insert({
      family_id: familyId,
      title: memory.title,
      description: memory.description ?? null,
      photo_url: memory.photoUrl ?? null,
      event_type: memory.eventType,
      year: memory.year ?? null,
      date: memory.date ?? null,
      tagged_member_ids: (memory.taggedMemberIds ?? []) as string[],
      uploaded_by: userId,
    }).select().single()
    if (error) throw new Error(error.message)
    return data
  }, [supabase])

  return { memories, loading, addMemory, uploadPhoto, refetch: fetch }
}

// ─── useVoiceNotes ────────────────────────────────────────────────────────────

export function useVoiceNotes(familyId: string | null) {
  const supabase = createClient()
  const [voiceNotes, setVoiceNotes] = useState<VoiceNote[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!familyId) { setLoading(false); return }
    const { data } = await supabase
      .from('voice_notes')
      .select('*')
      .eq('family_id', familyId)
      .order('created_at', { ascending: false })
    setVoiceNotes(
      (data ?? []).map(row => ({
        id: row.id,
        title: row.title,
        durationSeconds: row.duration_seconds,
        transcription: row.transcription ?? undefined,
        translation: row.translation ?? undefined,
        language: row.language ?? undefined,
        recordedBy: row.recorded_by ?? undefined,
        recordedAt: row.created_at,
        memberId: row.member_id,
      }))
    )
    setLoading(false)
  }, [familyId, supabase])

  useEffect(() => { fetch() }, [fetch])

  const addVoiceNote = useCallback(async (
    familyId: string,
    note: Omit<VoiceNote, 'id' | 'recordedAt'>,
    userId: string
  ) => {
    const { data, error } = await supabase.from('voice_notes').insert({
      family_id: familyId,
      member_id: note.memberId,
      title: note.title,
      duration_seconds: note.durationSeconds,
      file_url: null,
      transcription: note.transcription ?? null,
      translation: note.translation ?? null,
      language: note.language ?? 'hi',
      recorded_by: userId,
    }).select().single()
    if (error) throw new Error(error.message)
    return data
  }, [supabase])

  return { voiceNotes, loading, addVoiceNote, refetch: fetch }
}
