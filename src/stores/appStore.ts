import { create } from 'zustand'
import type { Goal, UserMaterial } from '../types/database'

interface AppState {
  activeGoal: Goal | null
  materials: UserMaterial[]
  setActiveGoal: (goal: Goal | null) => void
  setMaterials: (materials: UserMaterial[]) => void
}

export const useAppStore = create<AppState>((set) => ({
  activeGoal: null,
  materials: [],
  setActiveGoal: (goal) => set({ activeGoal: goal }),
  setMaterials: (materials) => set({ materials }),
}))
