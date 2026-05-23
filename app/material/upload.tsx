import { useState, useEffect } from 'react'
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system'
import { supabase, supabaseUrl } from '../../src/lib/supabase'
import { useAuthStore } from '../../src/stores/authStore'
import { colors } from '../../src/lib/theme'
import type { Goal } from '../../src/types/database'

type UploadStep = 'idle' | 'file_selected' | 'uploading' | 'extracting' | 'generating' | 'done' | 'error'

const STEPS = [
  { key: 'file_selected', label: 'ファイル選択' },
  { key: 'uploading', label: 'アップロード' },
  { key: 'extracting', label: 'テキスト抽出' },
  { key: 'generating', label: 'AI問題生成' },
]

function getStepIndex(step: UploadStep): number {
  return STEPS.findIndex((s) => s.key === step)
}

export default function UploadScreen() {
  const { profile } = useAuthStore()
  const [activeGoals, setActiveGoals] = useState<Goal[]>([])
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null)
  const [nickname, setNickname] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [mimeType, setMimeType] = useState<string | null>(null)
  const [fileUri, setFileUri] = useState<string | null>(null)
  const [step, setStep] = useState<UploadStep>('idle')
  const [questionCount, setQuestionCount] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    fetchGoals()
  }, [profile?.id])

  async function fetchGoals() {
    if (!profile?.id) return
    const { data } = await supabase
      .from('goals')
      .select('*')
      .eq('user_id', profile.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
    if (data) {
      setActiveGoals(data as Goal[])
      if (data.length > 0) setSelectedGoalId(data[0].id)
    }
  }

  async function handlePickPDF() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      })
      if (result.canceled) return
      const asset = result.assets[0]
      setFileUri(asset.uri)
      setFileName(asset.name)
      setMimeType(asset.mimeType ?? 'application/pdf')
      setStep('file_selected')
      if (!nickname) setNickname(asset.name.replace(/\.pdf$/i, ''))
    } catch {
      Alert.alert('エラー', 'ファイルの選択に失敗しました')
    }
  }

  async function handlePickImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('権限エラー', 'カメラロールへのアクセスを許可してください')
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsMultipleSelection: false,
    })

    if (result.canceled) return
    const asset = result.assets[0]
    setFileUri(asset.uri)
    const ext = asset.uri.split('.').pop() ?? 'jpg'
    const name = `image_${Date.now()}.${ext}`
    setFileName(name)
    setMimeType(asset.mimeType ?? `image/${ext}`)
    setStep('file_selected')
    if (!nickname) setNickname('スキャン画像')
  }

  async function handleUpload() {
    if (!profile?.id || !fileUri || !fileName || !mimeType) return

    setErrorMessage('')
    setStep('uploading')

    try {
      // Read file as base64
      const fileBase64 = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64,
      })

      setStep('extracting')

      // Call Edge Function
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token ?? ''

      const response = await fetch(`${supabaseUrl}/functions/v1/upload-material`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          fileBase64,
          fileName,
          mimeType,
          userId: profile.id,
          goalId: selectedGoalId,
          nickname: nickname.trim() || fileName,
        }),
      })

      setStep('generating')

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.error ?? `HTTP ${response.status}`)
      }

      const result = await response.json()
      setQuestionCount(result.questionCount ?? 0)
      setStep('done')
    } catch (err: any) {
      setErrorMessage(err?.message ?? 'アップロードに失敗しました')
      setStep('error')
    }
  }

  function handleReset() {
    setStep('idle')
    setFileUri(null)
    setFileName(null)
    setMimeType(null)
    setNickname('')
    setErrorMessage('')
    setQuestionCount(0)
  }

  const isProcessing = ['uploading', 'extracting', 'generating'].includes(step)
  const currentStepIndex = getStepIndex(step)

  if (step === 'done') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.doneContainer}>
          <Text style={styles.doneIcon}>🎉</Text>
          <Text style={styles.doneTitle}>完了！</Text>
          <Text style={styles.doneMessage}>
            問題が{questionCount}問生成されました
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.back()}
          >
            <Text style={styles.primaryButtonText}>教材一覧へ戻る</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleReset}
          >
            <Text style={styles.secondaryButtonText}>別の教材をアップロード</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Modal Header */}
      <View style={styles.modalHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.cancelButton} disabled={isProcessing}>
          <Text style={[styles.cancelText, isProcessing && styles.disabledText]}>キャンセル</Text>
        </TouchableOpacity>
        <Text style={styles.modalTitle}>教材アップロード</Text>
        <View style={styles.cancelButton} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Progress Steps */}
        {step !== 'idle' && (
          <View style={styles.progressContainer}>
            {STEPS.map((s, idx) => {
              const isComplete = currentStepIndex > idx || step === 'done'
              const isActive = currentStepIndex === idx && isProcessing
              return (
                <View key={s.key} style={styles.progressStep}>
                  <View
                    style={[
                      styles.stepDot,
                      isComplete && styles.stepDotComplete,
                      isActive && styles.stepDotActive,
                    ]}
                  >
                    {isComplete ? (
                      <Text style={styles.stepDotCheckmark}>✓</Text>
                    ) : isActive ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.stepDotNumber}>{idx + 1}</Text>
                    )}
                  </View>
                  <Text
                    style={[
                      styles.stepLabel,
                      isActive && styles.stepLabelActive,
                      isComplete && styles.stepLabelComplete,
                    ]}
                  >
                    {s.label}
                  </Text>
                  {idx < STEPS.length - 1 && (
                    <View style={[styles.stepLine, isComplete && styles.stepLineComplete]} />
                  )}
                </View>
              )
            })}
          </View>
        )}

        {/* Error State */}
        {step === 'error' && (
          <View style={styles.errorCard}>
            <Text style={styles.errorIcon}>❌</Text>
            <Text style={styles.errorTitle}>エラーが発生しました</Text>
            <Text style={styles.errorMessage}>{errorMessage}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={handleReset}>
              <Text style={styles.retryButtonText}>やり直す</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Upload Options (idle/file_selected) */}
        {(step === 'idle' || step === 'file_selected') && !isProcessing && (
          <>
            {/* File Pickers */}
            <Text style={styles.sectionTitle}>ファイルを選択</Text>
            <View style={styles.pickerRow}>
              <TouchableOpacity style={styles.pickerCard} onPress={handlePickPDF}>
                <Text style={styles.pickerIcon}>📄</Text>
                <Text style={styles.pickerLabel}>PDFをアップロード</Text>
                <Text style={styles.pickerSub}>テキストPDFに対応</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.pickerCard} onPress={handlePickImage}>
                <Text style={styles.pickerIcon}>🖼️</Text>
                <Text style={styles.pickerLabel}>画像をアップロード</Text>
                <Text style={styles.pickerSub}>JPG / PNG対応</Text>
              </TouchableOpacity>
            </View>

            {/* Selected File Info */}
            {fileName && (
              <View style={styles.selectedFileCard}>
                <Text style={styles.selectedFileIcon}>
                  {mimeType?.includes('pdf') ? '📄' : '🖼️'}
                </Text>
                <View style={styles.selectedFileInfo}>
                  <Text style={styles.selectedFileName} numberOfLines={2}>{fileName}</Text>
                  <Text style={styles.selectedFileType}>{mimeType}</Text>
                </View>
                <TouchableOpacity onPress={handleReset}>
                  <Text style={styles.removeFile}>✕</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Nickname */}
            {step === 'file_selected' && (
              <>
                <Text style={styles.sectionTitle}>ニックネーム（任意）</Text>
                <TextInput
                  style={styles.input}
                  value={nickname}
                  onChangeText={setNickname}
                  placeholder="例: 第1章 発音の基礎"
                  placeholderTextColor={colors.textSecondary}
                  maxLength={60}
                />

                {/* Goal Selection */}
                <Text style={styles.sectionTitle}>目標に紐づける</Text>
                {activeGoals.length === 0 ? (
                  <View style={styles.noGoalCard}>
                    <Text style={styles.noGoalText}>アクティブな目標がありません</Text>
                    <TouchableOpacity onPress={() => router.push('/goal/new')}>
                      <Text style={styles.noGoalLink}>目標を作成する →</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.goalScroll}>
                    {activeGoals.map((goal) => (
                      <TouchableOpacity
                        key={goal.id}
                        style={[
                          styles.goalChip,
                          selectedGoalId === goal.id && styles.goalChipActive,
                        ]}
                        onPress={() => setSelectedGoalId(goal.id)}
                      >
                        <Text
                          style={[
                            styles.goalChipText,
                            selectedGoalId === goal.id && styles.goalChipTextActive,
                          ]}
                        >
                          {goal.title}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      style={[styles.goalChip, selectedGoalId === null && styles.goalChipActive]}
                      onPress={() => setSelectedGoalId(null)}
                    >
                      <Text
                        style={[
                          styles.goalChipText,
                          selectedGoalId === null && styles.goalChipTextActive,
                        ]}
                      >
                        紐づけなし
                      </Text>
                    </TouchableOpacity>
                  </ScrollView>
                )}

                {/* Upload Button */}
                <TouchableOpacity style={styles.uploadButton} onPress={handleUpload}>
                  <Text style={styles.uploadButtonText}>アップロードして問題生成</Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}

        {/* Processing State */}
        {isProcessing && (
          <View style={styles.processingCard}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.processingTitle}>処理中...</Text>
            <Text style={styles.processingSubtitle}>
              {step === 'uploading' && 'ファイルをアップロードしています'}
              {step === 'extracting' && 'テキストを抽出しています'}
              {step === 'generating' && 'AIが問題を生成しています（しばらくお待ちください）'}
            </Text>
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
  disabledText: {
    color: colors.textSecondary,
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
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    paddingVertical: 16,
    backgroundColor: colors.surface,
    borderRadius: 16,
  },
  progressStep: {
    alignItems: 'center',
    position: 'relative',
  },
  stepDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  stepDotActive: {
    backgroundColor: colors.primary,
  },
  stepDotComplete: {
    backgroundColor: colors.success,
  },
  stepDotCheckmark: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  stepDotNumber: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  stepLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 60,
  },
  stepLabelActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  stepLabelComplete: {
    color: colors.success,
  },
  stepLine: {
    position: 'absolute',
    top: 16,
    left: 32,
    width: 24,
    height: 2,
    backgroundColor: colors.border,
  },
  stepLineComplete: {
    backgroundColor: colors.success,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 10,
    marginTop: 4,
  },
  pickerRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  pickerCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  pickerIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  pickerLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
    textAlign: 'center',
  },
  pickerSub: {
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  selectedFileCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: `${colors.primary}40`,
  },
  selectedFileIcon: {
    fontSize: 28,
    marginRight: 10,
  },
  selectedFileInfo: {
    flex: 1,
  },
  selectedFileName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
  selectedFileType: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  removeFile: {
    fontSize: 18,
    color: colors.textSecondary,
    paddingLeft: 8,
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
    marginBottom: 16,
  },
  goalScroll: {
    marginBottom: 20,
  },
  goalChip: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
    backgroundColor: colors.surface,
  },
  goalChipActive: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}10`,
  },
  goalChipText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  goalChipTextActive: {
    color: colors.primary,
  },
  noGoalCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  noGoalText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  noGoalLink: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
  uploadButton: {
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
  uploadButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  processingCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 40,
    alignItems: 'center',
    gap: 16,
  },
  processingTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  processingSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
  },
  errorCard: {
    backgroundColor: '#FEF2F2',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.danger,
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 13,
    color: colors.danger,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 19,
  },
  retryButton: {
    backgroundColor: colors.danger,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  doneContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  doneIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  doneTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
  },
  doneMessage: {
    fontSize: 18,
    color: colors.textSecondary,
    marginBottom: 40,
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 14,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    paddingVertical: 14,
    width: '100%',
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '600',
  },
})
