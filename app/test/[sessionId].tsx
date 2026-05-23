import { useEffect, useState, useRef, useCallback } from 'react'
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase, supabaseUrl } from '../../src/lib/supabase'
import { useAuthStore } from '../../src/stores/authStore'
import { colors } from '../../src/lib/theme'
import type { TestSession, Question } from '../../src/types/database'

interface Answer {
  questionId: string
  userAnswer: string
  timeSpentSec: number
}

function TypeBadge({ type }: { type: string | null }) {
  const isLong = type === 'long_answer'
  return (
    <View
      style={{
        backgroundColor: isLong ? `${colors.secondary}20` : `${colors.primary}20`,
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 3,
        alignSelf: 'flex-start',
      }}
    >
      <Text
        style={{
          fontSize: 12,
          fontWeight: '700',
          color: isLong ? colors.secondary : colors.primary,
        }}
      >
        {isLong ? '記述式' : '短答式'}
      </Text>
    </View>
  )
}

export default function TestScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>()
  const { profile } = useAuthStore()
  const [session, setSession] = useState<TestSession | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Map<string, string>>(new Map())
  const [timings, setTimings] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const questionStartRef = useRef<number>(Date.now())

  useEffect(() => {
    fetchData()
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [sessionId])

  useEffect(() => {
    // Reset timer when question changes
    questionStartRef.current = Date.now()
    setElapsed(0)

    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - questionStartRef.current) / 1000))
    }, 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [currentIndex])

  async function fetchData() {
    if (!sessionId || !profile?.id) return

    const { data: sessionData } = await supabase
      .from('test_sessions')
      .select('*')
      .eq('id', sessionId)
      .single()

    if (!sessionData) {
      setLoading(false)
      return
    }

    const sess = sessionData as TestSession
    setSession(sess)

    // Fetch questions for the goal
    const { data: questionsData } = await supabase
      .from('questions')
      .select('*')
      .eq('goal_id', sess.goal_id)
      .order('difficulty', { ascending: true })

    if (questionsData) {
      setQuestions(questionsData as Question[])
    }
    setLoading(false)
  }

  function recordCurrentTiming() {
    if (questions.length === 0) return
    const q = questions[currentIndex]
    const spent = Math.floor((Date.now() - questionStartRef.current) / 1000)
    setTimings((prev) => new Map(prev).set(q.id, (prev.get(q.id) ?? 0) + spent))
  }

  function goNext() {
    recordCurrentTiming()
    setCurrentIndex((i) => Math.min(i + 1, questions.length - 1))
  }

  function goPrev() {
    recordCurrentTiming()
    setCurrentIndex((i) => Math.max(i - 1, 0))
  }

  function setAnswer(questionId: string, text: string) {
    setAnswers((prev) => new Map(prev).set(questionId, text))
  }

  async function handleSubmit() {
    if (!profile?.id || !session) return

    const unanswered = questions.filter((q) => !answers.get(q.id)?.trim())
    if (unanswered.length > 0) {
      Alert.alert(
        '未回答の問題があります',
        `${unanswered.length}問が未回答です。このまま提出しますか？`,
        [
          { text: 'キャンセル', style: 'cancel' },
          { text: '提出する', style: 'destructive', onPress: submitAnswers },
        ]
      )
      return
    }

    submitAnswers()
  }

  async function submitAnswers() {
    if (!profile?.id || !session) return
    recordCurrentTiming()
    setSubmitting(true)

    const answerPayload = questions.map((q) => ({
      questionId: q.id,
      userAnswer: answers.get(q.id) ?? '',
      timeSpentSec: timings.get(q.id) ?? 0,
    }))

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token ?? ''

      const response = await fetch(`${supabaseUrl}/functions/v1/score-answer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          sessionId: session.id,
          answers: answerPayload,
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      router.replace(`/test/result/${session.id}`)
    } catch (err: any) {
      setSubmitting(false)
      Alert.alert('エラー', '採点に失敗しました。もう一度お試しください。\n' + (err?.message ?? ''))
    }
  }

  function formatTime(secs: number): string {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    )
  }

  if (questions.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.emptyIcon}>📝</Text>
          <Text style={styles.emptyTitle}>問題が見つかりませんでした</Text>
          <Text style={styles.emptySubtitle}>この目標に紐づく問題がまだ生成されていません</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>戻る</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  const currentQuestion = questions[currentIndex]
  const currentAnswer = answers.get(currentQuestion.id) ?? ''
  const answeredCount = questions.filter((q) => answers.get(q.id)?.trim()).length
  const progress = (currentIndex + 1) / questions.length
  const isLast = currentIndex === questions.length - 1

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              Alert.alert('テストを終了', 'テストを中断しますか？回答は保存されません。', [
                { text: 'キャンセル', style: 'cancel' },
                { text: '終了する', style: 'destructive', onPress: () => router.back() },
              ])
            }}
            style={styles.exitButton}
          >
            <Text style={styles.exitText}>✕</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.questionCounter}>
              {currentIndex + 1} / {questions.length}
            </Text>
            <Text style={styles.answeredCount}>回答済み {answeredCount}問</Text>
          </View>
          <View style={styles.timerContainer}>
            <Text style={styles.timerText}>{formatTime(elapsed)}</Text>
          </View>
        </View>

        {/* Progress Bar */}
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Question Card */}
          <View style={styles.questionCard}>
            <View style={styles.questionMeta}>
              <TypeBadge type={currentQuestion.type} />
              <View style={styles.questionMetaRight}>
                <Text style={styles.pointsText}>{currentQuestion.points}点</Text>
                <Text style={styles.difficultyText}>
                  {'★'.repeat(currentQuestion.difficulty)}
                </Text>
              </View>
            </View>
            <Text style={styles.questionText}>{currentQuestion.question_text}</Text>
          </View>

          {/* Answer Input */}
          <View style={styles.answerSection}>
            <Text style={styles.answerLabel}>あなたの回答</Text>
            <TextInput
              style={[
                styles.answerInput,
                currentQuestion.type === 'long_answer' && styles.answerInputLong,
              ]}
              value={currentAnswer}
              onChangeText={(text) => setAnswer(currentQuestion.id, text)}
              placeholder={
                currentQuestion.type === 'long_answer'
                  ? '詳しく説明してください...'
                  : 'キーワードを入力...'
              }
              placeholderTextColor={colors.textSecondary}
              multiline={currentQuestion.type === 'long_answer'}
              textAlignVertical={currentQuestion.type === 'long_answer' ? 'top' : 'center'}
              returnKeyType={currentQuestion.type === 'long_answer' ? 'default' : 'done'}
            />
            {currentAnswer.trim() && (
              <Text style={styles.charCount}>{currentAnswer.length}文字</Text>
            )}
          </View>

          {/* Question Navigation Dots */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.dotsScroll}
            contentContainerStyle={styles.dotsContent}
          >
            {questions.map((q, idx) => {
              const hasAnswer = !!answers.get(q.id)?.trim()
              const isCurrent = idx === currentIndex
              return (
                <TouchableOpacity
                  key={q.id}
                  style={[
                    styles.dot,
                    isCurrent && styles.dotCurrent,
                    hasAnswer && !isCurrent && styles.dotAnswered,
                  ]}
                  onPress={() => {
                    recordCurrentTiming()
                    setCurrentIndex(idx)
                  }}
                >
                  <Text
                    style={[
                      styles.dotText,
                      isCurrent && styles.dotTextCurrent,
                      hasAnswer && !isCurrent && styles.dotTextAnswered,
                    ]}
                  >
                    {idx + 1}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        </ScrollView>

        {/* Navigation Footer */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.navButton, currentIndex === 0 && styles.navButtonDisabled]}
            onPress={goPrev}
            disabled={currentIndex === 0}
          >
            <Text style={[styles.navButtonText, currentIndex === 0 && styles.navButtonTextDisabled]}>
              ‹ 前の問題
            </Text>
          </TouchableOpacity>

          {isLast ? (
            <TouchableOpacity
              style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.submitButtonText}>提出する</Text>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.nextButton} onPress={goNext}>
              <Text style={styles.nextButtonText}>次の問題 ›</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
  },
  exitButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  exitText: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  headerCenter: {
    alignItems: 'center',
  },
  questionCounter: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
  },
  answeredCount: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  timerContainer: {
    backgroundColor: colors.background,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 60,
    alignItems: 'center',
  },
  timerText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    height: 4,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 16,
  },
  questionCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  questionMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  questionMetaRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  pointsText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  difficultyText: {
    fontSize: 12,
    color: colors.warning,
  },
  questionText: {
    fontSize: 17,
    color: colors.text,
    lineHeight: 26,
    fontWeight: '500',
  },
  answerSection: {
    marginBottom: 16,
  },
  answerLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  answerInput: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
    minHeight: 56,
  },
  answerInputLong: {
    minHeight: 160,
    lineHeight: 24,
  },
  charCount: {
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'right',
    marginTop: 4,
  },
  dotsScroll: {
    marginBottom: 8,
  },
  dotsContent: {
    paddingVertical: 4,
    gap: 6,
  },
  dot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dotCurrent: {
    backgroundColor: colors.primary,
  },
  dotAnswered: {
    backgroundColor: `${colors.success}30`,
    borderWidth: 1.5,
    borderColor: colors.success,
  },
  dotText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  dotTextCurrent: {
    color: '#FFFFFF',
  },
  dotTextAnswered: {
    color: colors.success,
  },
  footer: {
    flexDirection: 'row',
    padding: 16,
    gap: 10,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  navButton: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  navButtonDisabled: {
    borderColor: colors.border,
  },
  navButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
  },
  navButtonTextDisabled: {
    color: colors.border,
  },
  nextButton: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  nextButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  submitButton: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: colors.success,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emptyIcon: {
    fontSize: 56,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 21,
  },
  backButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
})
