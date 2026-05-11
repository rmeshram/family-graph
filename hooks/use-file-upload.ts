'use client'

import { useCallback, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function useFileUpload() {
  const supabase = createClient()
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)

  /**
   * Upload a photo to the family-photos bucket.
   * Returns the public URL.
   */
  const uploadPhoto = useCallback(async (
    file: File,
    familyId: string,
    folder: 'members' | 'memories' = 'memories'
  ): Promise<string> => {
    setUploading(true)
    setProgress(0)

    const ext = file.name.split('.').pop()
    const path = `${familyId}/${folder}/${Date.now()}.${ext}`

    const { error } = await supabase.storage
      .from('family-photos')
      .upload(path, file, { upsert: false, contentType: file.type })

    setUploading(false)
    setProgress(100)

    if (error) throw new Error(error.message)

    const { data } = supabase.storage.from('family-photos').getPublicUrl(path)
    return data.publicUrl
  }, [supabase])

  /**
   * Upload a voice note to the voice-notes bucket.
   * Returns the storage path (not public — use signed URL to play).
   */
  const uploadVoiceNote = useCallback(async (
    blob: Blob,
    familyId: string,
    memberId: string
  ): Promise<string> => {
    setUploading(true)
    const path = `${familyId}/${memberId}/${Date.now()}.webm`

    const { error } = await supabase.storage
      .from('voice-notes')
      .upload(path, blob, { contentType: 'audio/webm' })

    setUploading(false)
    if (error) throw new Error(error.message)
    return path
  }, [supabase])

  /**
   * Get a short-lived signed URL for a private voice note.
   */
  const getVoiceNoteUrl = useCallback(async (path: string): Promise<string> => {
    const { data, error } = await supabase.storage
      .from('voice-notes')
      .createSignedUrl(path, 3600) // 1 hour
    if (error) throw new Error(error.message)
    return data.signedUrl
  }, [supabase])

  return { uploading, progress, uploadPhoto, uploadVoiceNote, getVoiceNoteUrl }
}
