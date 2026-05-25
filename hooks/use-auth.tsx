'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User, Session } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']

interface AuthContextValue {
  user: User | null
  session: Session | null
  profile: Profile | null
  familyId: string | null
  loading: boolean
  signOut: () => Promise<void>
  /** Force a fresh profile fetch. Call after operations that change the profile (e.g. onboarding). */
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  profile: null,
  familyId: null,
  loading: true,
  signOut: async () => { },
  refreshProfile: async () => { },
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      // Self-heal: if the user created this family but their role wasn't set to admin
      // (e.g. the onboarding UPDATE ran before the profile row existed), fix it now.
      if (data && data.family_id && data.role !== 'admin') {
        const { data: family } = await supabase
          .from('families')
          .select('created_by')
          .eq('id', data.family_id)
          .single()
        if (family?.created_by === userId) {
          await supabase
            .from('profiles')
            .update({ role: 'admin' })
            .eq('id', userId)
          data.role = 'admin'
        }
      }

      setProfile(data)
    } catch {
      // Network or RLS error — keep previous profile, don't crash auth
    }
  }, [supabase])

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id).finally(() => { if (mounted) setLoading(false) })
      } else {
        setLoading(false)
      }
    }).catch(() => { if (mounted) setLoading(false) })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        // Always settle loading after profile fetch resolves (success or fail)
        fetchProfile(session.user.id).finally(() => { if (mounted) setLoading(false) })
      } else {
        setProfile(null); setLoading(false)
      }
    })

    return () => { mounted = false; subscription.unsubscribe() }
  }, [supabase, fetchProfile])

  // Realtime: re-fetch profile whenever the current user's row changes
  // (e.g. role update, family assignment) so the UI reflects changes immediately.
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel(`profile:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
        () => { fetchProfile(user.id) }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, user, fetchProfile])

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id)
  }, [user, fetchProfile])

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{
      user,
      session,
      profile,
      familyId: profile?.family_id ?? null,
      loading,
      signOut,
      refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
