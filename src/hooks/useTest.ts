import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Question, TestSession } from '../types/database'
import { useAuthStore } from '../stores/authStore'

interface AnswerDraft {
  questionId: string
  userAnswer: string
  timeSpentSec: number
}

export function useTest() {
  const { profile } = useAuthStore()
  const [questions, setQuestions] = useState<Question[]>([])
  const [session, setSession] = useState<TestSession | null>(null)
  const [loading, setLoading] = useState(false)
  const [answers, setAnswers] = useState<AnswerDraft[]>([])

  async function startSession(goalId: string, sessionType: 'weekly' | 'monthly' | 'remedial') {
    if (!profile?.id) throw new Error('Not authenticated')

    const { data: sessionData, error } = await supabase
      .from('test_sessions')
      .insert({ user_id: profile.id, goal_id: goalId, session_type: sessionType })
      .select()
      .single()

    if (error) throw error
    setSession(sessionData as TestSession)

    const { data: qData } = await supabase
      .from('questions')
      .select('*')
      .eq('goal_id', goalId)
      .order('difficulty')
      .limit(10)

    setQuestions((qData as Question[]) ?? [])
    return sessionData as TestSession
  }

  async function submitAnswers(sessionId: string) {
    setLoading(true)
    const res = await supabase.functions.invoke('score-answer', {
      body: { sessionId, answers },
    })
    setLoading(false)
    if (res.error) throw res.error
    return res.data as { score: number; passed: boolean; answers: any[] }
  }

  function updateAnswer(questionId: string, userAnswer: string, timeSpentSec: number) {
    setAnswers((prev) => {
      const existing = prev.findIndex((a) => a.questionId === questionId)
      if (existing >= 0) {
        const updated = [...prev]
        updated[existing] = { questionId, userAnswer, timeSpentSec }
        return updated
      }
      return [...prev, { questionId, userAnswer, timeSpentSec }]
    })
  }

  return { questions, session, loading, answers, startSession, submitAnswers, updateAnswer }
}
