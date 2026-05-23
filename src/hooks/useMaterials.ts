import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { UserMaterial } from '../types/database'
import { useAuthStore } from '../stores/authStore'
import { useAppStore } from '../stores/appStore'

export function useMaterials() {
  const { profile } = useAuthStore()
  const { setMaterials } = useAppStore()
  const [loading, setLoading] = useState(false)

  const fetchMaterials = useCallback(async () => {
    if (!profile?.id) return []
    setLoading(true)
    const { data } = await supabase
      .from('user_materials')
      .select(`
        *,
        shared_material:shared_materials(id, title, summary, questions_generated),
        goal:goals(id, title, pass_score)
      `)
      .eq('user_id', profile.id)
      .order('added_at', { ascending: false })
    setLoading(false)
    const materials = (data as UserMaterial[]) ?? []
    setMaterials(materials)
    return materials
  }, [profile?.id])

  return { loading, fetchMaterials }
}
