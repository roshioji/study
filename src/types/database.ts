export type UserRole = 'student' | 'teacher' | 'admin'
export type CycleType = 'weekly' | 'biweekly' | 'monthly'
export type GoalStatus = 'active' | 'completed' | 'revised'
export type QuestionType = 'short_answer' | 'long_answer'
export type SessionType = 'weekly' | 'monthly' | 'remedial'
export type RetryStatus = 'pending' | 'resolved'
export type PeriodType = 'weekly' | 'monthly'

export interface User {
  id: string
  display_name: string | null
  role: UserRole
  streak_count: number
  streak_updated_at: string | null
  created_at: string
}

export interface Goal {
  id: string
  user_id: string
  cycle_type: CycleType | null
  title: string
  pass_score: number
  start_date: string | null
  end_date: string | null
  status: GoalStatus
  created_at: string
}

export interface SharedMaterial {
  id: string
  file_hash: string
  title: string | null
  file_path: string | null
  extracted_text: string | null
  summary: string | null
  questions_generated: boolean
  upload_count: number
  created_at: string
}

export interface UserMaterial {
  id: string
  user_id: string
  shared_material_id: string | null
  goal_id: string | null
  nickname: string | null
  total_attempts: number
  avg_score: number
  last_studied_at: string | null
  added_at: string
  shared_material?: SharedMaterial
  goal?: Goal
}

export interface Question {
  id: string
  shared_material_id: string | null
  goal_id: string | null
  type: QuestionType | null
  question_text: string
  correct_answer: string
  rubric: {
    keywords: string[]
    min_length: number
    strictness: 'standard' | 'strict' | 'lenient'
  } | null
  keywords: string[] | null
  points: number
  explanation: string | null
  source: 'ai_generated' | 'manual'
  difficulty: number
  created_at: string
}

export interface TestSession {
  id: string
  user_id: string | null
  goal_id: string | null
  session_type: SessionType | null
  score: number | null
  passed: boolean | null
  restriction_active: boolean
  completed_at: string
}

export interface TestAnswer {
  id: string
  session_id: string | null
  question_id: string | null
  user_answer: string | null
  ai_score: number | null
  ai_feedback: string | null
  missing_keywords: string[] | null
  is_correct: boolean | null
  time_spent_sec: number | null
  created_at: string
}

export interface MaterialAttempt {
  id: string
  user_id: string | null
  user_material_id: string | null
  question_id: string | null
  session_id: string | null
  image_path: string | null
  user_answer: string | null
  ai_score: number | null
  ai_feedback: string | null
  missing_keywords: string[] | null
  is_correct: boolean | null
  attempt_count: number
  attempted_at: string
}

export interface WeakUnit {
  unit: string
  avg_score: number
  count: number
}

export interface MaterialSummary {
  id: string
  user_id: string | null
  user_material_id: string | null
  period_type: PeriodType | null
  period_start: string | null
  period_end: string | null
  total_attempts: number | null
  avg_score: number | null
  weak_units: WeakUnit[] | null
  frequent_missing_kw: string[] | null
  ai_summary_text: string | null
  recommended_pages: { chapter: string; reason: string }[] | null
  generated_at: string
}

export interface RetryQueueItem {
  id: string
  user_id: string | null
  question_id: string | null
  priority: number
  fail_count: number
  next_retry_at: string | null
  status: RetryStatus
}

export interface Badge {
  id: string
  user_id: string | null
  badge_type: string | null
  earned_at: string
}

export interface NotificationSettings {
  id: string
  user_id: string | null
  daily_reminder_time: string
  test_reminder_enabled: boolean
  loss_warning_enabled: boolean
  push_token: string | null
}
