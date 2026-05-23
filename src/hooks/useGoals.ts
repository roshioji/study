import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Goal } from '../types/database'
import { useAuthStore } from '../stores/authStore'
import { useAppStore } from '../stores/appStore'

export function useGoals() {
  const { profile } = useAuthStore()
  const { setActiveGoal } = useAppStore()
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(false)

  const fetchGoals = useCallback(async () => {
    if (!profile?.id) return
    setLoading(true)
    const { data } = await supabase
      .from('goals')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
    setLoading(false)
    if (data) {
      setGoals(data as Goal[])
      const active = (data as Goal[]).find((g) => g.status === 'active')
      if (active) setActiveGoal(active)
    }
  }, [profile?.id])

  async function createGoal(params: {
    title: string
    cycleType: 'weekly' | 'biweekly' | 'monthly'
    passScore: number
    startDate: string
    endDate: string
  }) {
    if (!profile?.id) throw new Error('Not authenticated')
    const { data, error } = await supabase
      .from('goals')
      .insert({
        user_id: profile.id,
        title: params.title,
        cycle_type: params.cycleType,
        pass_score: params.passScore,
        start_date: params.startDate,
        end_date: params.endDate,
      })
      .select()
      .single()
    if (error) throw error
    await fetchGoals()
    return data as Goal
  }

  return { goals, loading, fetchGoals, createGoal }
}
