'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Milestone } from '@/lib/types'

export function useMilestones(familyId: string | null, memberId: string | null) {
  const supabase = createClient()
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [loading, setLoading] = useState(false)

  const fetchMilestones = useCallback(async () => {
    if (!familyId || !memberId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('milestones' as any)
      .select('*')
      .eq('family_id', familyId)
      .eq('member_id', memberId)
      .order('year', { ascending: false })
    if (!error && data) {
      setMilestones((data as any[]).map(row => ({
        id: row.id,
        title: row.title,
        year: row.year,
        description: row.description ?? undefined,
        type: row.type,
      })))
    }
    setLoading(false)
  }, [supabase, familyId, memberId])

  useEffect(() => { fetchMilestones() }, [fetchMilestones])

  // Realtime
  const fetchRef = useRef(fetchMilestones)
  useEffect(() => { fetchRef.current = fetchMilestones }, [fetchMilestones])
  useEffect(() => {
    if (!familyId || !memberId) return
    const channel = supabase
      .channel(`milestones:${memberId}:${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'milestones', filter: `member_id=eq.${memberId}` }, () => fetchRef.current())
      .subscribe(err => { if (err) console.warn('[milestones] realtime:', err) })
    return () => { supabase.removeChannel(channel) }
  }, [supabase, familyId, memberId])

  const addMilestone = useCallback(async (
    data: Omit<Milestone, 'id'>,
    createdBy: string,
  ) => {
    if (!familyId || !memberId) throw new Error('No family/member context')
    const { data: row, error } = await supabase
      .from('milestones' as any)
      .insert({
        family_id: familyId,
        member_id: memberId,
        title: data.title,
        year: data.year,
        description: data.description ?? null,
        type: data.type,
        created_by: createdBy,
      })
      .select()
      .single()
    if (error) throw new Error(error.message)
    const newMs: Milestone = { id: (row as any).id, title: data.title, year: data.year, description: data.description, type: data.type }
    setMilestones(prev => [newMs, ...prev])
    return newMs
  }, [supabase, familyId, memberId])

  const deleteMilestone = useCallback(async (milestoneId: string) => {
    const { error } = await supabase.from('milestones' as any).delete().eq('id', milestoneId)
    if (error) throw new Error(error.message)
    setMilestones(prev => prev.filter(m => m.id !== milestoneId))
  }, [supabase])

  return { milestones, loading, addMilestone, deleteMilestone, refetch: fetchMilestones }
}
