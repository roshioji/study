import { useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '../../src/lib/supabase'
import { useAuthStore } from '../../src/stores/authStore'
import { colors } from '../../src/lib/theme'
import type { UserMaterial } from '../../src/types/database'

export default function MaterialsScreen() {
  const { profile } = useAuthStore()
  const [materials, setMaterials] = useState<UserMaterial[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    fetchMaterials()
  }, [profile?.id])

  async function fetchMaterials() {
    if (!profile?.id) return
    const { data, error } = await supabase
      .from('user_materials')
      .select('*, shared_material:shared_materials(*)')
      .eq('user_id', profile.id)
      .order('added_at', { ascending: false })

    if (!error && data) {
      setMaterials(data as UserMaterial[])
    }
    setLoading(false)
  }

  async function onRefresh() {
    setRefreshing(true)
    await fetchMaterials()
    setRefreshing(false)
  }

  function getScoreColor(score: number) {
    if (score >= 80) return colors.success
    if (score >= 60) return colors.warning
    return colors.danger
  }

  function getDifficultyStars(count: number) {
    return '★'.repeat(Math.min(count, 5)) + '☆'.repeat(Math.max(0, 5 - count))
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
        <Text style={styles.headerTitle}>教材一覧</Text>
        <Text style={styles.headerSubtitle}>{materials.length}件の教材</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={materials.length === 0 ? styles.emptyContainer : styles.listContent}
      >
        {materials.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📚</Text>
            <Text style={styles.emptyTitle}>教材がまだありません</Text>
            <Text style={styles.emptySubtitle}>
              右下のボタンから教材をアップロードして{'\n'}AI問題を生成しましょう
            </Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => router.push('/material/upload')}
            >
              <Text style={styles.emptyButtonText}>教材をアップロード</Text>
            </TouchableOpacity>
          </View>
        ) : (
          materials.map((material) => (
            <TouchableOpacity
              key={material.id}
              style={styles.card}
              onPress={() => router.push(`/material/${material.id}/study`)}
              activeOpacity={0.75}
            >
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.materialIcon}>📄</Text>
                  <View style={styles.cardTitleInfo}>
                    <Text style={styles.cardTitle} numberOfLines={2}>
                      {material.nickname ?? material.shared_material?.title ?? '無題の教材'}
                    </Text>
                    {material.shared_material?.title && material.nickname && (
                      <Text style={styles.cardSubtitle} numberOfLines={1}>
                        {material.shared_material.title}
                      </Text>
                    )}
                  </View>
                </View>
                <View style={styles.arrowContainer}>
                  <Text style={styles.arrow}>›</Text>
                </View>
              </View>

              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>平均スコア</Text>
                  <Text style={[styles.statValue, { color: getScoreColor(material.avg_score) }]}>
                    {material.avg_score > 0 ? `${Math.round(material.avg_score)}点` : '—'}
                  </Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>学習回数</Text>
                  <Text style={styles.statValue}>{material.total_attempts}回</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>問題数</Text>
                  <Text style={styles.statValue}>
                    {material.shared_material?.questions_generated ? '生成済み' : '未生成'}
                  </Text>
                </View>
              </View>

              {material.last_studied_at && (
                <Text style={styles.lastStudied}>
                  最終学習: {new Date(material.last_studied_at).toLocaleDateString('ja-JP')}
                </Text>
              )}
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/material/upload')}
        activeOpacity={0.85}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>
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
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  emptyContainer: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    marginTop: 80,
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
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
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
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  materialIcon: {
    fontSize: 28,
    marginRight: 10,
    marginTop: 2,
  },
  cardTitleInfo: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 22,
  },
  cardSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  arrowContainer: {
    justifyContent: 'center',
    paddingLeft: 8,
  },
  arrow: {
    fontSize: 24,
    color: colors.textSecondary,
    fontWeight: '300',
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 10,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginVertical: 4,
  },
  lastStudied: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 10,
    textAlign: 'right',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  fabIcon: {
    fontSize: 28,
    color: '#FFFFFF',
    fontWeight: '300',
    lineHeight: 32,
  },
})
