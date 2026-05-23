import { useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '../../../src/lib/supabase'
import { useAuthStore } from '../../../src/stores/authStore'
import { colors } from '../../../src/lib/theme'
import type { TestSession, TestAnswer, Question, Goal, Badge } from '../../../src/types/database'

interface AnswerWithQuestion extends TestAnswer {
  question?: Question
}

export default function ResultScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>()
  const { profile } = useAuthStore()
  const [session, setSession] = useState<TestSession | null>(null)
  const [goal, setGoal] = useState<Goal | null>(null)
  const [answers, setAnswers] = useState<AnswerWithQuestion[]>([])
  const [newBadges, setNewBadges] = useState<Badge[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [sessionId])

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

    const [goalRes, answersRes, badgesRes] = await Promise.all([
      sess.goal_id
        ? supabase.from('goals').select('*').eq('id', sess.goal_id).single()
        : Promise.resolve({ data: null }),
      supabase
        .from('test_answers')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true }),
      supabase
        .from('badges')
        .select('*')
        .eq('user_id', profile.id)
        .order('earned_at', { ascending: false })
        .limit(5),
    ])

    if (goalRes.data) setGoal(goalRes.data as Goal)

    if (answersRes.data) {
      const rawAnswers = answersRes.data as TestAnswer[]
      // Fetch questions for each answer
      const questionIds = rawAnswers
        .map((a) => a.question_id)
        .filter(Boolean) as string[]

      if (questionIds.length > 0) {
        const { data: questionsData } = await supabase
          .from('questions')
          .select('*')
          .in('id', questionIds)

        const questionsMap = new Map(
          (questionsData ?? []).map((q: Question) => [q.id, q])
        )
        setAnswers(
          rawAnswers.map((a) => ({
            ...a,
            question: a.question_id ? questionsMap.get(a.question_id) : undefined,
          }))
        )
      } else {
        setAnswers(rawAnswers)
      }
    }

    // Check for recently earned badges (earned after session was created)
    if (badgesRes.data) {
      const recentBadges = (badgesRes.data as Badge[]).filter(
        (b) => new Date(b.earned_at) >= new Date(sess.completed_at)
      )
      setNewBadges(recentBadges)
    }

    setLoading(false)
  }

  async function startRemedialTest() {
    if (!profile?.id || !session?.goal_id) return

    const { data, error } = await supabase
      .from('test_sessions')
      .insert({
        user_id: profile.id,
        goal_id: session.goal_id,
        session_type: 'remedial',
        restriction_active: false,
      })
      .select()
      .single()

    if (error || !data) {
      Alert.alert('エラー', '補講テストを開始できませんでした')
      return
    }

    router.replace(`/test/${data.id}`)
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

  if (!session) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>テスト結果が見つかりませんでした</Text>
          <TouchableOpacity style={styles.homeButton} onPress={() => router.replace('/(tabs)')}>
            <Text style={styles.homeButtonText}>ホームへ</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  const score = session.score ?? 0
  const passed = session.passed ?? false
  const passScore = goal?.pass_score ?? 70

  function getScoreColor() {
    if (score >= 80) return colors.success
    if (score >= 60) return colors.warning
    return colors.danger
  }

  function getScoreGrade() {
    if (score >= 90) return 'S'
    if (score >= 80) return 'A'
    if (score >= 70) return 'B'
    if (score >= 60) return 'C'
    return 'D'
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Score Hero */}
        <View style={[styles.heroCard, { borderTopColor: passed ? colors.success : colors.danger }]}>
          <Text style={styles.resultLabel}>{passed ? '合格' : '不合格'}</Text>
          <View style={styles.scoreRow}>
            <Text style={[styles.scoreBig, { color: getScoreColor() }]}>{score}</Text>
            <Text style={styles.scoreUnit}>点</Text>
          </View>
          <View style={[styles.gradeBadge, { backgroundColor: `${getScoreColor()}20` }]}>
            <Text style={[styles.gradeText, { color: getScoreColor() }]}>
              Grade {getScoreGrade()}
            </Text>
          </View>
          {goal && (
            <Text style={styles.passLine}>合格ライン: {passScore}点</Text>
          )}
        </View>

        {/* Passed: Congratulations */}
        {passed && (
          <View style={styles.congratsCard}>
            <Text style={styles.congratsIcon}>🎉</Text>
            <Text style={styles.congratsTitle}>おめでとうございます！</Text>
            <Text style={styles.congratsSubtitle}>
              目標を達成しました！ストリークを維持しましょう。
            </Text>
            {profile && (
              <View style={styles.streakRow}>
                <Text style={styles.streakIcon}>🔥</Text>
                <Text style={styles.streakText}>{profile.streak_count}日連続達成</Text>
              </View>
            )}
          </View>
        )}

        {/* New Badges */}
        {newBadges.length > 0 && (
          <View style={styles.badgesCard}>
            <Text style={styles.badgesTitle}>新しいバッジ獲得！</Text>
            <View style={styles.badgesRow}>
              {newBadges.map((badge) => (
                <View key={badge.id} style={styles.badgeItem}>
                  <Text style={styles.badgeIcon}>{getBadgeIcon(badge.badge_type ?? '')}</Text>
                  <Text style={styles.badgeLabel}>{getBadgeLabel(badge.badge_type ?? '')}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Failed: Warning */}
        {!passed && (
          <View style={styles.failureWarning}>
            <Text style={styles.failureWarningIcon}>📵</Text>
            <View style={styles.failureWarningContent}>
              <Text style={styles.failureWarningTitle}>スマホ制限が発動します</Text>
              <Text style={styles.failureWarningText}>
                不合格のため、スマホ使用制限が設定されます。補講テストに合格することで制限が解除されます。
              </Text>
            </View>
          </View>
        )}

        {/* Answer Details */}
        <Text style={styles.sectionTitle}>問題ごとの結果</Text>
        {answers.map((answer, idx) => (
          <View key={answer.id} style={styles.answerCard}>
            <View style={styles.answerHeader}>
              <Text style={styles.answerNumber}>Q{idx + 1}</Text>
              <View style={styles.answerScoreBadge}>
                <Text style={styles.answerScoreText}>
                  {answer.ai_score ?? '—'} / {answer.question?.points ?? '—'}点
                </Text>
              </View>
              {answer.is_correct !== null && (
                <View
                  style={[
                    styles.correctBadge,
                    answer.is_correct ? styles.correctBadgePass : styles.correctBadgeFail,
                  ]}
                >
                  <Text style={styles.correctBadgeText}>
                    {answer.is_correct ? '正解' : '不正解'}
                  </Text>
                </View>
              )}
            </View>

            {answer.question?.question_text && (
              <Text style={styles.answerQuestion} numberOfLines={3}>
                {answer.question.question_text}
              </Text>
            )}

            <View style={styles.answerContent}>
              <Text style={styles.answerLabel}>あなたの回答:</Text>
              <Text style={styles.answerText}>
                {answer.user_answer || '（未回答）'}
              </Text>
            </View>

            {answer.ai_feedback && (
              <View style={styles.feedbackSection}>
                <Text style={styles.feedbackLabel}>AIフィードバック:</Text>
                <Text style={styles.feedbackText}>{answer.ai_feedback}</Text>
              </View>
            )}

            {!passed && answer.missing_keywords && answer.missing_keywords.length > 0 && (
              <View style={styles.missingSection}>
                <Text style={styles.missingLabel}>不足キーワード:</Text>
                <View style={styles.missingChips}>
                  {answer.missing_keywords.map((kw, i) => (
                    <View key={i} style={styles.missingChip}>
                      <Text style={styles.missingChipText}>{kw}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {answer.time_spent_sec !== null && (
              <Text style={styles.timeSpent}>回答時間: {answer.time_spent_sec}秒</Text>
            )}
          </View>
        ))}

        {/* Action Buttons */}
        <View style={styles.actions}>
          {!passed && (
            <TouchableOpacity style={styles.remedialButton} onPress={startRemedialTest}>
              <Text style={styles.remedialButtonText}>補講テストを受ける</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.homeButton}
            onPress={() => router.replace('/(tabs)')}
          >
            <Text style={styles.homeButtonText}>ホームへ戻る</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

function getBadgeIcon(type: string): string {
  const icons: Record<string, string> = {
    streak_7: '🔥',
    first_pass: '⭐',
    monthly_clear: '🏆',
  }
  return icons[type] ?? '🎖️'
}

function getBadgeLabel(type: string): string {
  const labels: Record<string, string> = {
    streak_7: '7日連続',
    first_pass: '初合格',
    monthly_clear: '月次クリア',
  }
  return labels[type] ?? type
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    marginBottom: 16,
    borderTopWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  resultLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  scoreBig: {
    fontSize: 72,
    fontWeight: '900',
    lineHeight: 80,
  },
  scoreUnit: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
    marginLeft: 4,
  },
  gradeBadge: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginBottom: 8,
  },
  gradeText: {
    fontSize: 16,
    fontWeight: '800',
  },
  passLine: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  congratsCard: {
    backgroundColor: `${colors.success}10`,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: `${colors.success}40`,
  },
  congratsIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  congratsTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.success,
    marginBottom: 4,
  },
  congratsSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 12,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  streakIcon: {
    fontSize: 20,
  },
  streakText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.streak,
  },
  badgesCard: {
    backgroundColor: `${colors.accent}10`,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: `${colors.accent}40`,
  },
  badgesTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  badgesRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  badgeItem: {
    alignItems: 'center',
  },
  badgeIcon: {
    fontSize: 36,
    marginBottom: 4,
  },
  badgeLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  failureWarning: {
    backgroundColor: '#FEF2F2',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  failureWarningIcon: {
    fontSize: 28,
  },
  failureWarningContent: {
    flex: 1,
  },
  failureWarningTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.danger,
    marginBottom: 4,
  },
  failureWarningText: {
    fontSize: 13,
    color: colors.danger,
    lineHeight: 19,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 10,
    marginTop: 4,
  },
  answerCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  answerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  answerNumber: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.primary,
    minWidth: 24,
  },
  answerScoreBadge: {
    flex: 1,
  },
  answerScoreText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  correctBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  correctBadgePass: {
    backgroundColor: `${colors.success}20`,
  },
  correctBadgeFail: {
    backgroundColor: `${colors.danger}20`,
  },
  correctBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text,
  },
  answerQuestion: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '600',
    marginBottom: 10,
    lineHeight: 19,
  },
  answerContent: {
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  answerLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  answerText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  feedbackSection: {
    marginBottom: 8,
  },
  feedbackLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 4,
  },
  feedbackText: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 20,
  },
  missingSection: {
    marginBottom: 8,
  },
  missingLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.danger,
    marginBottom: 6,
  },
  missingChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  missingChip: {
    backgroundColor: `${colors.danger}15`,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: `${colors.danger}40`,
  },
  missingChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.danger,
  },
  timeSpent: {
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'right',
  },
  actions: {
    marginTop: 8,
    gap: 10,
  },
  remedialButton: {
    backgroundColor: colors.danger,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: colors.danger,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  remedialButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  homeButton: {
    backgroundColor: colors.surface,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  homeButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  errorText: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 16,
  },
})
