'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { MemoryItem, VoiceNote } from '@/lib/types'

// ─── useMemories ──────────────────────────────────────────────────────────────

export function useMemories(familyId: string | null) {
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current
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

  // Real-time — use ref so fetch reference changes don't trigger re-subscribe
  const fetchRef = useRef(fetch)
  useEffect(() => { fetchRef.current = fetch }, [fetch])

  useEffect(() => {
    if (!familyId) return
    const ch = supabase
      .channel(`memories:${familyId}:${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'memories', filter: `family_id=eq.${familyId}` }, () => fetchRef.current())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [familyId, supabase])

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

  const updateMemory = useCallback(async (
    memoryId: string,
    updates: Partial<Pick<MemoryItem, 'title' | 'description' | 'taggedMemberIds' | 'year'>>
  ) => {
    const { error } = await supabase.from('memories').update({
      title: updates.title,
      description: updates.description ?? null,
      tagged_member_ids: updates.taggedMemberIds ?? undefined,
      year: updates.year ?? null,
    }).eq('id', memoryId)
    if (error) throw new Error(error.message)
  }, [supabase])

  return { memories, loading, addMemory, updateMemory, uploadPhoto, refetch: fetch }
}

// ─── useVoiceNotes ────────────────────────────────────────────────────────────

export function useVoiceNotes(familyId: string | null) {
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current
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
        fileUrl: row.file_url ?? undefined,
        transcription: row.transcription ?? undefined,
        translation: row.translation ?? undefined,
        language: row.language ?? undefined,
        recordedBy: row.recorded_by ?? undefined,
        recordedAt: row.created_at,
        memberId: row.member_id ?? undefined,
      }))
    )
    setLoading(false)
  }, [familyId, supabase])

  useEffect(() => { fetch() }, [fetch])

  const uploadVoiceBlob = useCallback(async (blob: Blob, familyId: string): Promise<string> => {
    const ext = blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mp4') ? 'mp4' : 'webm'
    const path = `${familyId}/${Date.now()}.${ext}`
    const { error } = await supabase.storage
      .from('voice-notes')
      .upload(path, blob, { upsert: false, contentType: blob.type })
    if (error) throw new Error(error.message)
    const { data } = supabase.storage.from('voice-notes').getPublicUrl(path)
    return data.publicUrl
  }, [supabase])

  const addVoiceNote = useCallback(async (
    familyId: string,
    note: Omit<VoiceNote, 'id' | 'recordedAt'>,
    userId: string
  ) => {
    const { data, error } = await supabase.from('voice_notes').insert({
      family_id: familyId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      member_id: (note.memberId ?? null) as any,
      title: note.title,
      duration_seconds: note.durationSeconds,
      file_url: note.fileUrl ?? null,
      transcription: note.transcription ?? null,
      translation: note.translation ?? null,
      language: note.language ?? null,
      recorded_by: userId,
    }).select().single()
    if (error) throw new Error(error.message)
    return data
  }, [supabase])

  return { voiceNotes, loading, addVoiceNote, uploadVoiceBlob, refetch: fetch }
}
