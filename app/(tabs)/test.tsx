import { useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '../../src/lib/supabase'
import { useAuthStore } from '../../src/stores/authStore'
import { colors } from '../../src/lib/theme'
import type { Goal, TestSession } from '../../src/types/database'

export default function TestScreen() {
  const { profile } = useAuthStore()
  const [activeGoals, setActiveGoals] = useState<Goal[]>([])
  const [recentSessions, setRecentSessions] = useState<TestSession[]>([])
  const [failedSessions, setFailedSessions] = useState<TestSession[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [startingTest, setStartingTest] = useState<string | null>(null)

  useEffect(() => {
    fetchData()
  }, [profile?.id])

  async function fetchData() {
    if (!profile?.id) return

    const [goalsRes, sessionsRes] = await Promise.all([
      supabase
        .from('goals')
        .select('*')
        .eq('user_id', profile.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false }),
      supabase
        .from('test_sessions')
        .select('*')
        .eq('user_id', profile.id)
        .order('completed_at', { ascending: false })
        .limit(20),
    ])

    if (goalsRes.data) setActiveGoals(goalsRes.data as Goal[])
    if (sessionsRes.data) {
      const sessions = sessionsRes.data as TestSession[]
      setRecentSessions(sessions)
      setFailedSessions(sessions.filter((s) => s.restriction_active))
    }
    setLoading(false)
  }

  async function onRefresh() {
    setRefreshing(true)
    await fetchData()
    setRefreshing(false)
  }

  async function startTest(goal: Goal, sessionType: 'weekly' | 'monthly' | 'remedial' = 'weekly') {
    if (!profile?.id) return
    setStartingTest(goal.id)

    const { data, error } = await supabase
      .from('test_sessions')
      .insert({
        user_id: profile.id,
        goal_id: goal.id,
        session_type: sessionType,
        restriction_active: false,
      })
      .select()
      .single()

    setStartingTest(null)

    if (error || !data) {
      Alert.alert('エラー', 'テストを開始できませんでした')
      return
    }

    router.push(`/test/${data.id}`)
  }

  function getScoreColor(score: number | null) {
    if (score === null) return colors.textSecondary
    if (score >= 80) return colors.success
    if (score >= 60) return colors.warning
    return colors.danger
  }

  function getSessionTypeLabel(type: string | null) {
    const labels: Record<string, string> = {
      weekly: '週次テスト',
      monthly: '月次テスト',
      remedial: '補講テスト',
    }
    return labels[type ?? ''] ?? type ?? '—'
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('ja-JP', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>テスト</Text>
        <Text style={styles.headerSubtitle}>目標に向けてテストに挑戦しましょう</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Active Goals Section */}
        <Text style={styles.sectionTitle}>アクティブな目標</Text>
        {activeGoals.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>🎯</Text>
            <Text style={styles.emptyText}>アクティブな目標がありません</Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => router.push('/goal/new')}
            >
              <Text style={styles.emptyButtonText}>目標を作成</Text>
            </TouchableOpacity>
          </View>
        ) : (
          activeGoals.map((goal) => (
            <View key={goal.id} style={styles.goalCard}>
              <View style={styles.goalInfo}>
                <Text style={styles.goalTitle}>{goal.title}</Text>
                <View style={styles.goalMeta}>
                  <Text style={styles.goalMetaText}>
                    合格ライン: {goal.pass_score}点
                  </Text>
                  <Text style={styles.goalMetaText}>
                    {goal.cycle_type === 'weekly' ? '週次' : goal.cycle_type === 'biweekly' ? '隔週' : '月次'}
                  </Text>
                </View>
                {goal.end_date && (
                  <Text style={styles.goalDeadline}>
                    期限: {new Date(goal.end_date).toLocaleDateString('ja-JP')}
                  </Text>
                )}
              </View>
              <TouchableOpacity
                style={[styles.startButton, startingTest === goal.id && styles.startButtonDisabled]}
                onPress={() => startTest(goal)}
                disabled={startingTest === goal.id}
              >
                {startingTest === goal.id ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.startButtonText}>テスト開始</Text>
                )}
              </TouchableOpacity>
            </View>
          ))
        )}

        {/* Remedial Tests Section */}
        {failedSessions.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, styles.remedialTitle]}>補講テスト</Text>
            <View style={styles.remedialWarning}>
              <Text style={styles.remedialWarningIcon}>⚠️</Text>
              <Text style={styles.remedialWarningText}>
                不合格のテストがあります。スマホ制限が発動中です。補講テストを受けて制限を解除しましょう。
              </Text>
            </View>
            {failedSessions.map((session) => {
              const relatedGoal = activeGoals.find((g) => g.id === session.goal_id)
              return (
                <View key={session.id} style={[styles.goalCard, styles.remedialCard]}>
                  <View style={styles.goalInfo}>
                    <Text style={styles.goalTitle}>
                      {relatedGoal?.title ?? '不合格テスト'}
                    </Text>
                    <Text style={styles.remedialScore}>
                      前回スコア: {session.score ?? '—'}点
                    </Text>
                    <Text style={styles.remedialDate}>
                      {formatDate(session.completed_at)}
                    </Text>
                  </View>
                  {relatedGoal && (
                    <TouchableOpacity
                      style={styles.remedialButton}
                      onPress={() => startTest(relatedGoal, 'remedial')}
                    >
                      <Text style={styles.remedialButtonText}>補講受験</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )
            })}
          </>
        )}

        {/* Score History */}
        <Text style={styles.sectionTitle}>スコア履歴</Text>
        {recentSessions.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>📊</Text>
            <Text style={styles.emptyText}>テスト履歴はまだありません</Text>
          </View>
        ) : (
          recentSessions.map((session) => (
            <TouchableOpacity
              key={session.id}
              style={styles.historyCard}
              onPress={() => router.push(`/test/result/${session.id}`)}
              activeOpacity={0.75}
            >
              <View style={styles.historyLeft}>
                <View
                  style={[
                    styles.sessionTypeBadge,
                    session.session_type === 'remedial' && styles.remedialBadge,
                  ]}
                >
                  <Text style={styles.sessionTypeBadgeText}>
                    {getSessionTypeLabel(session.session_type)}
                  </Text>
                </View>
                <Text style={styles.historyDate}>{formatDate(session.completed_at)}</Text>
              </View>
              <View style={styles.historyRight}>
                {session.score !== null ? (
                  <>
                    <Text style={[styles.historyScore, { color: getScoreColor(session.score) }]}>
                      {session.score}点
                    </Text>
                    <View
                      style={[
                        styles.passBadge,
                        session.passed ? styles.passBadgeGreen : styles.passBadgeRed,
                      ]}
                    >
                      <Text style={styles.passBadgeText}>
                        {session.passed ? '合格' : '不合格'}
                      </Text>
                    </View>
                  </>
                ) : (
                  <Text style={styles.historyScoreEmpty}>採点中</Text>
                )}
                <Text style={styles.historyArrow}>›</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  )
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
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
  },
  headerSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
  },
  remedialTitle: {
    color: colors.danger,
  },
  goalCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  remedialCard: {
    borderWidth: 1,
    borderColor: colors.danger,
  },
  goalInfo: {
    flex: 1,
    marginRight: 12,
  },
  goalTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  goalMeta: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 2,
  },
  goalMetaText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  goalDeadline: {
    fontSize: 12,
    color: colors.warning,
    marginTop: 2,
  },
  startButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    minWidth: 90,
    alignItems: 'center',
  },
  startButtonDisabled: {
    opacity: 0.6,
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  remedialButton: {
    backgroundColor: colors.danger,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    minWidth: 80,
    alignItems: 'center',
  },
  remedialButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  remedialScore: {
    fontSize: 12,
    color: colors.danger,
    fontWeight: '600',
    marginBottom: 2,
  },
  remedialDate: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  remedialWarning: {
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  remedialWarningIcon: {
    fontSize: 16,
  },
  remedialWarningText: {
    flex: 1,
    fontSize: 13,
    color: colors.danger,
    lineHeight: 19,
  },
  historyCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  historyLeft: {
    flex: 1,
  },
  sessionTypeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: `${colors.primary}20`,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 4,
  },
  remedialBadge: {
    backgroundColor: `${colors.danger}20`,
  },
  sessionTypeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },
  historyDate: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  historyRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  historyScore: {
    fontSize: 20,
    fontWeight: '800',
  },
  historyScoreEmpty: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  passBadge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  passBadgeGreen: {
    backgroundColor: `${colors.success}20`,
  },
  passBadgeRed: {
    backgroundColor: `${colors.danger}20`,
  },
  passBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text,
  },
  historyArrow: {
    fontSize: 22,
    color: colors.textSecondary,
    fontWeight: '300',
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 32,
    marginHorizontal: 16,
    marginBottom: 12,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  emptyButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
})
