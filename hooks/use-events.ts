'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/database.types'
import type { FamilyEvent } from '@/lib/types'

type DBEvent = Database['public']['Tables']['events']['Row']

function dbToEvent(row: DBEvent) {
  return {
    id: row.id,
    familyId: row.family_id,
    title: row.title,
    description: row.description ?? undefined,
    eventDate: row.event_date,
    location: row.location ?? undefined,
    createdBy: row.created_by ?? undefined,
    rsvps: (row.rsvps as Record<string, string>) ?? {},
    createdAt: row.created_at,
  }
}

export function useEvents(familyId: string | null) {
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current
  const [events, setEvents] = useState<ReturnType<typeof dbToEvent>[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!familyId) { setLoading(false); return }
    const { data } = await supabase
      .from('events')
      .select('*')
      .eq('family_id', familyId)
      .order('event_date', { ascending: true })
    setEvents((data ?? []).map(dbToEvent))
    setLoading(false)
  }, [familyId, supabase])

  useEffect(() => { fetch() }, [fetch])

  // Real-time — use ref so fetch ref change never triggers re-subscribe
  const fetchRef = useRef(fetch)
  useEffect(() => { fetchRef.current = fetch }, [fetch])

  useEffect(() => {
    if (!familyId) return
    const ch = supabase
      .channel(`events:${familyId}:${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter: `family_id=eq.${familyId}` }, () => fetchRef.current())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [familyId, supabase])

  const createEvent = useCallback(async (
    familyId: string,
    event: { title: string; description?: string; eventDate: string; location?: string },
    userId: string
  ) => {
    const { data, error } = await supabase.from('events').insert({
      family_id: familyId,
      title: event.title,
      description: event.description ?? null,
      event_date: event.eventDate,
      location: event.location ?? null,
      created_by: userId,
      rsvps: {},
    }).select().single()
    if (error) throw new Error(error.message)
    const newEvent = dbToEvent(data)
    // Optimistically add to local state
    setEvents(prev => [...prev, newEvent].sort((a, b) =>
      new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime()
    ))
    return newEvent
  }, [supabase])

  const updateRSVP = useCallback(async (
    eventId: string,
    userId: string,
    status: 'going' | 'maybe' | 'cant'
  ) => {
    const event = events.find(e => e.id === eventId)
    if (!event) return
    const previousRsvps = event.rsvps
    const nextRsvps = { ...event.rsvps, [userId]: status }
    // Optimistic update
    setEvents(prev => prev.map(e => e.id === eventId ? { ...e, rsvps: nextRsvps } : e))
    const { error } = await supabase.from('events').update({ rsvps: nextRsvps }).eq('id', eventId)
    if (error) {
      // Rollback on failure
      setEvents(prev => prev.map(e => e.id === eventId ? { ...e, rsvps: previousRsvps } : e))
      throw new Error(error.message)
    }
  }, [supabase, events])

  const deleteEvent = useCallback(async (eventId: string) => {
    setEvents(prev => prev.filter(e => e.id !== eventId)) // optimistic
    const { error } = await supabase.from('events').delete().eq('id', eventId)
    if (error) {
      // Rollback: refetch on failure
      await fetch()
      throw new Error(error.message)
    }
  }, [supabase, fetch])

  return { events, loading, createEvent, updateRSVP, deleteEvent, refetch: fetch }
}
