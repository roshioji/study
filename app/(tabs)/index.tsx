import { useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
} from 'react-native'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '../../src/lib/supabase'
import { useAuthStore } from '../../src/stores/authStore'
import { useAppStore } from '../../src/stores/appStore'
import { colors } from '../../src/lib/theme'
import type { Goal, Badge } from '../../src/types/database'

export default function HomeScreen() {
  const { profile } = useAuthStore()
  const { activeGoal, setActiveGoal } = useAppStore()
  const [badges, setBadges] = useState<Badge[]>([])
  const [weeklyScore, setWeeklyScore] = useState<number | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    fetchData()
  }, [profile?.id])

  async function fetchData() {
    if (!profile?.id) return

    const [goalRes, badgesRes, sessionRes] = await Promise.all([
      supabase
        .from('goals')
        .select('*')
        .eq('user_id', profile.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
      supabase
        .from('badges')
        .select('*')
        .eq('user_id', profile.id)
        .order('earned_at', { ascending: false }),
      supabase
        .from('test_sessions')
        .select('score')
        .eq('user_id', profile.id)
        .order('completed_at', { ascending: false })
        .limit(1)
        .single(),
    ])

    if (goalRes.data) setActiveGoal(goalRes.data as Goal)
    if (badgesRes.data) setBadges(badgesRes.data as Badge[])
    if (sessionRes.data) setWeeklyScore(sessionRes.data.score)
  }

  async function onRefresh() {
    setRefreshing(true)
    await fetchData()
    setRefreshing(false)
  }

  const streakCount = profile?.streak_count ?? 0
  const streakAtRisk = streakCount > 0 && (() => {
    if (!profile?.streak_updated_at) return false
    const last = new Date(profile.streak_updated_at)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24))
    return diffDays >= 1
  })()

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>
              こんにちは、{profile?.display_name ?? 'さん'} 👋
            </Text>
            <Text style={styles.date}>{new Date().toLocaleDateString('ja-JP', {
              year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
            })}</Text>
          </View>
        </View>

        {/* Streak Card */}
        <View style={[styles.card, streakAtRisk && styles.cardWarning]}>
          <View style={styles.streakRow}>
            <Text style={styles.streakIcon}>🔥</Text>
            <View style={styles.streakInfo}>
              <Text style={styles.streakCount}>{streakCount}日連続</Text>
              <Text style={styles.streakLabel}>学習ストリーク</Text>
            </View>
            {streakAtRisk && (
              <View style={styles.warningBadge}>
                <Text style={styles.warningText}>今日途切れる!</Text>
              </View>
            )}
          </View>
          {streakCount > 0 && (
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.min((streakCount % 7) / 7 * 100, 100)}%` },
                ]}
              />
            </View>
          )}
          <Text style={styles.progressLabel}>
            次のバッジまで {7 - (streakCount % 7)} 日
          </Text>
        </View>

        {/* Active Goal */}
        {activeGoal ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>今週の目標</Text>
            <Text style={styles.goalTitle}>{activeGoal.title}</Text>
            <View style={styles.goalMeta}>
              <Text style={styles.metaText}>
                合格ライン: {activeGoal.pass_score}点
              </Text>
              {weeklyScore !== null && (
                <Text style={[
                  styles.metaText,
                  weeklyScore >= activeGoal.pass_score ? styles.passText : styles.failText,
                ]}>
                  最新スコア: {weeklyScore}点
                </Text>
              )}
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.card, styles.emptyCard]}
            onPress={() => router.push('/goal/new')}
          >
            <Text style={styles.emptyIcon}>🎯</Text>
            <Text style={styles.emptyTitle}>目標を設定しましょう</Text>
            <Text style={styles.emptySubtitle}>タップして目標を追加</Text>
          </TouchableOpacity>
        )}

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>クイックアクション</Text>
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push('/material/upload')}
          >
            <Text style={styles.actionIcon}>📤</Text>
            <Text style={styles.actionLabel}>教材アップロード</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push('/(tabs)/test')}
          >
            <Text style={styles.actionIcon}>✏️</Text>
            <Text style={styles.actionLabel}>テストを受ける</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push('/(tabs)/materials')}
          >
            <Text style={styles.actionIcon}>📊</Text>
            <Text style={styles.actionLabel}>学習まとめ</Text>
          </TouchableOpacity>
        </View>

        {/* Badges */}
        {badges.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>獲得バッジ</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {badges.map((badge) => (
                <View key={badge.id} style={styles.badge}>
                  <Text style={styles.badgeIcon}>{getBadgeIcon(badge.badge_type ?? '')}</Text>
                  <Text style={styles.badgeLabel}>{getBadgeLabel(badge.badge_type ?? '')}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        )}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  greeting: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  date: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardWarning: {
    borderWidth: 2,
    borderColor: colors.warning,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  streakIcon: {
    fontSize: 40,
    marginRight: 12,
  },
  streakInfo: {
    flex: 1,
  },
  streakCount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.streak,
  },
  streakLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  warningBadge: {
    backgroundColor: colors.warning,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  warningText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  progressBar: {
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.streak,
    borderRadius: 3,
  },
  progressLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 6,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
    marginHorizontal: 16,
    marginTop: 4,
  },
  goalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  goalMeta: {
    flexDirection: 'row',
    gap: 16,
  },
  metaText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  passText: {
    color: colors.success,
    fontWeight: '600',
  },
  failText: {
    color: colors.danger,
    fontWeight: '600',
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 32,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  actionsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 12,
  },
  actionButton: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  actionIcon: {
    fontSize: 28,
    marginBottom: 4,
  },
  actionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  badge: {
    alignItems: 'center',
    marginRight: 16,
    padding: 8,
  },
  badgeIcon: {
    fontSize: 32,
    marginBottom: 4,
  },
  badgeLabel: {
    fontSize: 11,
    color: colors.textSecondary,
  },
})
