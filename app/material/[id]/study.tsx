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
import type { UserMaterial, Question } from '../../../src/types/database'

function DifficultyStars({ difficulty }: { difficulty: number }) {
  return (
    <Text style={{ fontSize: 14 }}>
      {'★'.repeat(Math.min(difficulty, 5))}{'☆'.repeat(Math.max(0, 5 - difficulty))}
    </Text>
  )
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
          fontSize: 11,
          fontWeight: '700',
          color: isLong ? colors.secondary : colors.primary,
        }}
      >
        {isLong ? '記述式' : '短答式'}
      </Text>
    </View>
  )
}

export default function StudyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { profile } = useAuthStore()
  const [material, setMaterial] = useState<UserMaterial | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [summaryExpanded, setSummaryExpanded] = useState(false)

  useEffect(() => {
    fetchData()
  }, [id])

  async function fetchData() {
    if (!id || !profile?.id) return

    const [materialRes, questionsRes] = await Promise.all([
      supabase
        .from('user_materials')
        .select('*, shared_material:shared_materials(*)')
        .eq('id', id)
        .eq('user_id', profile.id)
        .single(),
      supabase
        .from('questions')
        .select('*')
        .order('difficulty', { ascending: true }),
    ])

    if (materialRes.data) {
      const mat = materialRes.data as UserMaterial
      setMaterial(mat)

      // Filter questions by shared_material_id
      if (questionsRes.data && mat.shared_material_id) {
        const filtered = (questionsRes.data as Question[]).filter(
          (q) => q.shared_material_id === mat.shared_material_id
        )
        setQuestions(filtered)
      }
    }
    setLoading(false)
  }

  async function startTest() {
    if (!profile?.id || !material?.goal_id) {
      Alert.alert('目標未設定', 'テストを開始するには目標に紐づけてください')
      return
    }

    const { data, error } = await supabase
      .from('test_sessions')
      .insert({
        user_id: profile.id,
        goal_id: material.goal_id,
        session_type: 'weekly',
        restriction_active: false,
      })
      .select()
      .single()

    if (error || !data) {
      Alert.alert('エラー', 'テストを開始できませんでした')
      return
    }

    router.push(`/test/${data.id}`)
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

  if (!material) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>教材が見つかりませんでした</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>戻る</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  const sharedMaterial = material.shared_material
  const summary = sharedMaterial?.summary

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹ 戻る</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {material.nickname ?? sharedMaterial?.title ?? '教材詳細'}
        </Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Material Info Card */}
        <View style={styles.infoCard}>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {material.avg_score > 0 ? `${Math.round(material.avg_score)}点` : '—'}
              </Text>
              <Text style={styles.statLabel}>平均スコア</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{material.total_attempts}回</Text>
              <Text style={styles.statLabel}>学習回数</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{questions.length}問</Text>
              <Text style={styles.statLabel}>問題数</Text>
            </View>
          </View>

          {material.last_studied_at && (
            <Text style={styles.lastStudied}>
              最終学習: {new Date(material.last_studied_at).toLocaleDateString('ja-JP')}
            </Text>
          )}
        </View>

        {/* AI Summary */}
        {summary && (
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.summaryHeader}
              onPress={() => setSummaryExpanded(!summaryExpanded)}
            >
              <Text style={styles.cardTitle}>AIサマリー</Text>
              <Text style={styles.expandIcon}>{summaryExpanded ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {summaryExpanded && (
              <Text style={styles.summaryText}>{summary}</Text>
            )}
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionButton, styles.studyButton]}
            onPress={() => router.push(`/material/${id}/summary`)}
          >
            <Text style={styles.studyButtonText}>📊 学習まとめ</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.testButton]}
            onPress={startTest}
          >
            <Text style={styles.testButtonText}>✏️ テストへ進む</Text>
          </TouchableOpacity>
        </View>

        {/* Questions List */}
        <Text style={styles.sectionTitle}>問題一覧 ({questions.length}問)</Text>
        {questions.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>📝</Text>
            <Text style={styles.emptyText}>問題がまだ生成されていません</Text>
          </View>
        ) : (
          questions.map((question, index) => (
            <View key={question.id} style={styles.questionCard}>
              <View style={styles.questionHeader}>
                <Text style={styles.questionNumber}>Q{index + 1}</Text>
                <TypeBadge type={question.type} />
                <View style={styles.questionHeaderRight}>
                  <DifficultyStars difficulty={question.difficulty} />
                  <Text style={styles.questionPoints}>{question.points}点</Text>
                </View>
              </View>
              <Text style={styles.questionText}>{question.question_text}</Text>
              {question.keywords && question.keywords.length > 0 && (
                <View style={styles.keywordsRow}>
                  {question.keywords.slice(0, 4).map((kw, i) => (
                    <View key={i} style={styles.keywordChip}>
                      <Text style={styles.keywordText}>{kw}</Text>
                    </View>
                  ))}
                  {question.keywords.length > 4 && (
                    <Text style={styles.moreKeywords}>+{question.keywords.length - 4}</Text>
                  )}
                </View>
              )}
            </View>
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
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    minWidth: 60,
  },
  backBtnText: {
    fontSize: 17,
    color: colors.primary,
    fontWeight: '600',
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  statsRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginVertical: 4,
  },
  lastStudied: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'right',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  expandIcon: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  summaryText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 22,
    marginTop: 8,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  studyButton: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  studyButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
  },
  testButton: {
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  testButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 10,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  questionCard: {
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
  questionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  questionNumber: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
    minWidth: 24,
  },
  questionHeaderRight: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
  },
  questionPoints: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  questionText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 21,
    marginBottom: 8,
  },
  keywordsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  keywordChip: {
    backgroundColor: colors.background,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  keywordText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  moreKeywords: {
    fontSize: 11,
    color: colors.textSecondary,
    alignSelf: 'center',
  },
  errorText: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 16,
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
