import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '../../src/lib/supabase'
import { useAuthStore } from '../../src/stores/authStore'
import { colors } from '../../src/lib/theme'
import type { CycleType } from '../../src/types/database'

const CYCLE_OPTIONS: { value: CycleType; label: string; days: number; description: string }[] = [
  { value: 'weekly', label: '週次', days: 7, description: '7日間のサイクル' },
  { value: 'biweekly', label: '隔週', days: 14, description: '14日間のサイクル' },
  { value: 'monthly', label: '月次', days: 30, description: '30日間のサイクル' },
]

const PASS_SCORES = [60, 70, 80, 90]

function addDays(date: Date, days: number): string {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result.toISOString().split('T')[0]
}

export default function NewGoalScreen() {
  const { profile } = useAuthStore()
  const [title, setTitle] = useState('')
  const [cycleType, setCycleType] = useState<CycleType>('weekly')
  const [passScore, setPassScore] = useState(70)
  const [customScore, setCustomScore] = useState('')
  const [useCustomScore, setUseCustomScore] = useState(false)
  const [loading, setLoading] = useState(false)

  const today = new Date()
  const selectedCycle = CYCLE_OPTIONS.find((c) => c.value === cycleType)!
  const startDate = today.toISOString().split('T')[0]
  const endDate = addDays(today, selectedCycle.days)
  const finalPassScore = useCustomScore ? parseInt(customScore, 10) || 70 : passScore

  async function handleSubmit() {
    if (!profile?.id) return

    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      Alert.alert('入力エラー', '目標タイトルを入力してください')
      return
    }

    if (useCustomScore) {
      const score = parseInt(customScore, 10)
      if (isNaN(score) || score < 1 || score > 100) {
        Alert.alert('入力エラー', '合格ラインは1〜100の数値で入力してください')
        return
      }
    }

    setLoading(true)

    const { error } = await supabase.from('goals').insert({
      user_id: profile.id,
      title: trimmedTitle,
      cycle_type: cycleType,
      pass_score: finalPassScore,
      start_date: startDate,
      end_date: endDate,
      status: 'active',
    })

    setLoading(false)

    if (error) {
      Alert.alert('エラー', '目標の作成に失敗しました: ' + error.message)
      return
    }

    router.back()
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Modal Header */}
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={() => router.back()} style={styles.cancelButton}>
            <Text style={styles.cancelText}>キャンセル</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>新しい目標</Text>
          <View style={styles.cancelButton} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Title */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>目標タイトル</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="例: 第1章 基礎文法マスター"
              placeholderTextColor={colors.textSecondary}
              returnKeyType="done"
              maxLength={60}
            />
            <Text style={styles.charCount}>{title.length}/60</Text>
          </View>

          {/* Cycle Type */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>サイクルタイプ</Text>
            <View style={styles.cycleRow}>
              {CYCLE_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.cycleButton,
                    cycleType === option.value && styles.cycleButtonActive,
                  ]}
                  onPress={() => setCycleType(option.value)}
                >
                  <Text
                    style={[
                      styles.cycleButtonLabel,
                      cycleType === option.value && styles.cycleButtonLabelActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                  <Text
                    style={[
                      styles.cycleButtonDesc,
                      cycleType === option.value && styles.cycleButtonDescActive,
                    ]}
                  >
                    {option.description}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Pass Score */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>合格ライン</Text>
            <View style={styles.scoreRow}>
              {PASS_SCORES.map((score) => (
                <TouchableOpacity
                  key={score}
                  style={[
                    styles.scoreButton,
                    !useCustomScore && passScore === score && styles.scoreButtonActive,
                  ]}
                  onPress={() => {
                    setPassScore(score)
                    setUseCustomScore(false)
                  }}
                >
                  <Text
                    style={[
                      styles.scoreButtonText,
                      !useCustomScore && passScore === score && styles.scoreButtonTextActive,
                    ]}
                  >
                    {score}点
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={styles.customScoreToggle}
              onPress={() => setUseCustomScore(!useCustomScore)}
            >
              <View
                style={[styles.checkbox, useCustomScore && styles.checkboxActive]}
              >
                {useCustomScore && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.customScoreToggleText}>カスタムスコアを入力</Text>
            </TouchableOpacity>

            {useCustomScore && (
              <View style={styles.customScoreInput}>
                <TextInput
                  style={[styles.input, styles.scoreInput]}
                  value={customScore}
                  onChangeText={setCustomScore}
                  placeholder="例: 75"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="number-pad"
                  maxLength={3}
                />
                <Text style={styles.scoreUnit}>点</Text>
              </View>
            )}
          </View>

          {/* Summary */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>目標サマリー</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>開始日</Text>
              <Text style={styles.summaryValue}>{startDate}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>終了日</Text>
              <Text style={styles.summaryValue}>{endDate}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>期間</Text>
              <Text style={styles.summaryValue}>{selectedCycle.days}日間</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>合格ライン</Text>
              <Text style={[styles.summaryValue, styles.summaryHighlight]}>
                {finalPassScore}点以上
              </Text>
            </View>
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitButton, loading && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.submitButtonText}>目標を作成</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
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
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  cancelButton: {
    minWidth: 70,
  },
  cancelText: {
    fontSize: 16,
    color: colors.primary,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 10,
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 16,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  charCount: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'right',
    marginTop: 4,
  },
  cycleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  cycleButton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  cycleButtonActive: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}10`,
  },
  cycleButtonLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  cycleButtonLabelActive: {
    color: colors.primary,
  },
  cycleButtonDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  cycleButtonDescActive: {
    color: colors.primary,
  },
  scoreRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  scoreButton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  scoreButtonActive: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}10`,
  },
  scoreButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  scoreButtonTextActive: {
    color: colors.primary,
  },
  customScoreToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  checkboxActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  checkmark: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  customScoreToggleText: {
    fontSize: 14,
    color: colors.text,
  },
  customScoreInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scoreInput: {
    flex: 1,
  },
  scoreUnit: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '600',
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  summaryLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  summaryHighlight: {
    color: colors.primary,
  },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
})
