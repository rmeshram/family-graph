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
      .channel(`memories:${familyId}:${crypto.randomUUID()}`)
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
    // Optimistic insert
    const optimisticId = `optimistic-${Date.now()}`
    const optimistic: MemoryItem = {
      id: optimisticId,
      title: memory.title,
      description: memory.description,
      photoUrl: memory.photoUrl,
      eventType: memory.eventType,
      year: memory.year,
      date: memory.date,
      taggedMemberIds: memory.taggedMemberIds ?? [],
      uploadedBy: userId,
      uploadedAt: new Date().toISOString(),
    }
    setMemories(prev => [optimistic, ...prev])

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

    if (error) {
      setMemories(prev => prev.filter(m => m.id !== optimisticId))
      throw new Error(error.message)
    }
    // Replace optimistic entry with real persisted record
    setMemories(prev => prev.map(m => m.id === optimisticId
      ? { ...optimistic, id: data.id, uploadedAt: data.created_at }
      : m
    ))
    return data
  }, [supabase])

  const updateMemory = useCallback(async (
    memoryId: string,
    updates: Partial<Pick<MemoryItem, 'title' | 'description' | 'taggedMemberIds' | 'year'>>
  ) => {
    // Optimistic update — capture snapshot inside the setter for safe rollback
    let snapshot: MemoryItem | undefined
    setMemories(prev => {
      snapshot = prev.find(m => m.id === memoryId)
      return prev.map(m => m.id === memoryId ? { ...m, ...updates } : m)
    })

    const { error } = await supabase.from('memories').update({
      title: updates.title,
      description: updates.description ?? null,
      tagged_member_ids: updates.taggedMemberIds ?? undefined,
      year: updates.year ?? null,
    }).eq('id', memoryId)

    if (error) {
      if (snapshot) setMemories(prev => prev.map(m => m.id === memoryId ? snapshot! : m))
      throw new Error(error.message)
    }
  }, [supabase])

  const deleteMemory = useCallback(async (memoryId: string) => {
    // Optimistic delete
    let snapshot: MemoryItem | undefined
    setMemories(prev => {
      snapshot = prev.find(m => m.id === memoryId)
      return prev.filter(m => m.id !== memoryId)
    })

    const { error } = await supabase.from('memories').delete().eq('id', memoryId)
    if (error) {
      if (snapshot) setMemories(prev => [snapshot!, ...prev])
      throw new Error(error.message)
    }
  }, [supabase])

  return { memories, loading, addMemory, updateMemory, deleteMemory, uploadPhoto, refetch: fetch }
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
    // Optimistic insert
    const optimisticId = `optimistic-${Date.now()}`
    const optimistic: VoiceNote = {
      id: optimisticId,
      title: note.title,
      durationSeconds: note.durationSeconds,
      fileUrl: note.fileUrl,
      transcription: note.transcription,
      translation: note.translation,
      language: note.language,
      recordedBy: userId,
      recordedAt: new Date().toISOString(),
      memberId: note.memberId,
    }
    setVoiceNotes(prev => [optimistic, ...prev])

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

    if (error) {
      setVoiceNotes(prev => prev.filter(v => v.id !== optimisticId))
      throw new Error(error.message)
    }
    setVoiceNotes(prev => prev.map(v => v.id === optimisticId
      ? { ...optimistic, id: data.id, recordedAt: data.created_at }
      : v
    ))
    return data
  }, [supabase])

  const deleteVoiceNote = useCallback(async (noteId: string) => {
    let snapshot: VoiceNote | undefined
    setVoiceNotes(prev => {
      snapshot = prev.find(v => v.id === noteId)
      return prev.filter(v => v.id !== noteId)
    })
    const { error } = await supabase.from('voice_notes').delete().eq('id', noteId)
    if (error) {
      if (snapshot) setVoiceNotes(prev => [snapshot!, ...prev])
      throw new Error(error.message)
    }
  }, [supabase])

  return { voiceNotes, loading, addVoiceNote, uploadVoiceBlob, deleteVoiceNote, refetch: fetch }
}
