import { useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase, supabaseUrl } from '../../../src/lib/supabase'
import { useAuthStore } from '../../../src/stores/authStore'
import { colors } from '../../../src/lib/theme'
import type { MaterialSummary, PeriodType, UserMaterial, WeakUnit } from '../../../src/types/database'

const PERIOD_TABS: { value: PeriodType; label: string }[] = [
  { value: 'weekly', label: '週次' },
  { value: 'monthly', label: '月次' },
]

function WeakUnitBar({ unit, score, maxScore }: { unit: string; score: number; maxScore: number }) {
  const pct = maxScore > 0 ? (score / maxScore) * 100 : 0
  const barColor = score >= 70 ? colors.success : score >= 50 ? colors.warning : colors.danger

  return (
    <View style={barStyles.container}>
      <View style={barStyles.labelRow}>
        <Text style={barStyles.unitName} numberOfLines={1}>{unit}</Text>
        <Text style={[barStyles.scoreText, { color: barColor }]}>{Math.round(score)}点</Text>
      </View>
      <View style={barStyles.track}>
        <View style={[barStyles.fill, { width: `${pct}%`, backgroundColor: barColor }]} />
      </View>
    </View>
  )
}

const barStyles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  unitName: {
    fontSize: 13,
    color: colors.text,
    flex: 1,
    marginRight: 8,
  },
  scoreText: {
    fontSize: 13,
    fontWeight: '700',
  },
  track: {
    height: 8,
    backgroundColor: colors.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
  },
})

export default function SummaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { profile } = useAuthStore()
  const [material, setMaterial] = useState<UserMaterial | null>(null)
  const [summaries, setSummaries] = useState<MaterialSummary[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>('weekly')
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    fetchData()
  }, [id, profile?.id])

  async function fetchData() {
    if (!id || !profile?.id) return

    const [materialRes, summariesRes] = await Promise.all([
      supabase
        .from('user_materials')
        .select('*, shared_material:shared_materials(*)')
        .eq('id', id)
        .eq('user_id', profile.id)
        .single(),
      supabase
        .from('material_summaries')
        .select('*')
        .eq('user_material_id', id)
        .eq('user_id', profile.id)
        .order('generated_at', { ascending: false }),
    ])

    if (materialRes.data) setMaterial(materialRes.data as UserMaterial)
    if (summariesRes.data) setSummaries(summariesRes.data as MaterialSummary[])
    setLoading(false)
  }

  async function generateSummary() {
    if (!profile?.id || !id) return
    setGenerating(true)

    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData.session?.access_token ?? ''

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/generate-summary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          userId: profile.id,
          userMaterialId: id,
          periodType: selectedPeriod,
        }),
      })

      if (response.ok) {
        await fetchData()
      }
    } catch {
      // ignore
    }
    setGenerating(false)
  }

  const currentSummary = summaries.find((s) => s.period_type === selectedPeriod) ?? null

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    )
  }

  const weakUnits: WeakUnit[] = (currentSummary?.weak_units ?? []) as WeakUnit[]
  const maxScore = weakUnits.length > 0 ? Math.max(...weakUnits.map((u) => u.avg_score), 100) : 100

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹ 戻る</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {material?.nickname ?? '学習まとめ'}
        </Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Period Tabs */}
      <View style={styles.tabBar}>
        {PERIOD_TABS.map((tab) => (
          <TouchableOpacity
            key={tab.value}
            style={[styles.tab, selectedPeriod === tab.value && styles.tabActive]}
            onPress={() => setSelectedPeriod(tab.value)}
          >
            <Text style={[styles.tabText, selectedPeriod === tab.value && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {currentSummary ? (
          <>
            {/* Period Info */}
            <View style={styles.periodCard}>
              <View style={styles.periodStats}>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{currentSummary.total_attempts ?? 0}</Text>
                  <Text style={styles.statLabel}>学習回数</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={[
                    styles.statValue,
                    {
                      color: (currentSummary.avg_score ?? 0) >= 70
                        ? colors.success
                        : (currentSummary.avg_score ?? 0) >= 50
                        ? colors.warning
                        : colors.danger,
                    },
                  ]}>
                    {Math.round(currentSummary.avg_score ?? 0)}点
                  </Text>
                  <Text style={styles.statLabel}>平均スコア</Text>
                </View>
              </View>
              {currentSummary.period_start && currentSummary.period_end && (
                <Text style={styles.periodRange}>
                  {new Date(currentSummary.period_start).toLocaleDateString('ja-JP')} 〜{' '}
                  {new Date(currentSummary.period_end).toLocaleDateString('ja-JP')}
                </Text>
              )}
            </View>

            {/* AI Summary Text */}
            {currentSummary.ai_summary_text && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>AIフィードバック</Text>
                <Text style={styles.summaryText}>{currentSummary.ai_summary_text}</Text>
              </View>
            )}

            {/* Weak Units Bar Chart */}
            {weakUnits.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>単元別スコア</Text>
                <Text style={styles.cardSubtitle}>（低いほど要復習）</Text>
                {weakUnits.map((unit, idx) => (
                  <WeakUnitBar
                    key={idx}
                    unit={unit.unit}
                    score={unit.avg_score}
                    maxScore={maxScore}
                  />
                ))}
              </View>
            )}

            {/* Frequent Missing Keywords */}
            {currentSummary.frequent_missing_kw && currentSummary.frequent_missing_kw.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>よく抜けるキーワード</Text>
                <View style={styles.chipsContainer}>
                  {currentSummary.frequent_missing_kw.map((kw, idx) => (
                    <View key={idx} style={styles.keywordChip}>
                      <Text style={styles.keywordText}>{kw}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Recommended Pages */}
            {currentSummary.recommended_pages && currentSummary.recommended_pages.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>復習推奨ページ</Text>
                {currentSummary.recommended_pages.map((rec, idx) => (
                  <View key={idx} style={styles.recommendRow}>
                    <View style={styles.recommendBullet} />
                    <View style={styles.recommendContent}>
                      <Text style={styles.recommendChapter}>{rec.chapter}</Text>
                      <Text style={styles.recommendReason}>{rec.reason}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            <Text style={styles.generatedAt}>
              生成日時: {new Date(currentSummary.generated_at).toLocaleString('ja-JP')}
            </Text>

            {/* Regenerate */}
            <TouchableOpacity
              style={[styles.generateButton, styles.regenerateButton]}
              onPress={generateSummary}
              disabled={generating}
            >
              {generating ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.regenerateButtonText}>まとめを再生成</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📊</Text>
            <Text style={styles.emptyTitle}>
              {selectedPeriod === 'weekly' ? '週次' : '月次'}まとめがまだありません
            </Text>
            <Text style={styles.emptySubtitle}>
              学習データが蓄積されたらAIがまとめを生成します
            </Text>
            <TouchableOpacity
              style={styles.generateButton}
              onPress={generateSummary}
              disabled={generating}
            >
              {generating ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.generateButtonText}>まとめを生成する</Text>
              )}
            </TouchableOpacity>
          </View>
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
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.primary,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  periodCard: {
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
  periodStats: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
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
    marginVertical: 8,
  },
  periodRange: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
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
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 12,
  },
  summaryText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 22,
    marginTop: 8,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  keywordChip: {
    backgroundColor: `${colors.danger}15`,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: `${colors.danger}40`,
  },
  keywordText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.danger,
  },
  recommendRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 10,
    gap: 10,
  },
  recommendBullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginTop: 5,
  },
  recommendContent: {
    flex: 1,
  },
  recommendChapter: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  recommendReason: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  generatedAt: {
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyIcon: {
    fontSize: 64,
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
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  generateButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    minWidth: 180,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  generateButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  regenerateButton: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.primary,
    shadowOpacity: 0,
    elevation: 0,
    marginBottom: 8,
  },
  regenerateButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
})
