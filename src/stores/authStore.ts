import { create } from 'zustand'
import type { Session, User as SupabaseUser } from '@supabase/supabase-js'
import type { User } from '../types/database'
import { supabase } from '../lib/supabase'

interface AuthState {
  session: Session | null
  supabaseUser: SupabaseUser | null
  profile: User | null
  loading: boolean
  setSession: (session: Session | null) => void
  setProfile: (profile: User | null) => void
  fetchProfile: (userId: string) => Promise<void>
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  supabaseUser: null,
  profile: null,
  loading: true,

  setSession: (session) =>
    set({ session, supabaseUser: session?.user ?? null, loading: false }),

  setProfile: (profile) => set({ profile }),

  fetchProfile: async (userId: string) => {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()
    if (data) set({ profile: data as User })
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ session: null, supabaseUser: null, profile: null })
  },
}))
