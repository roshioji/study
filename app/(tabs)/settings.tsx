import { useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '../../src/lib/supabase'
import { useAuthStore } from '../../src/stores/authStore'
import { colors } from '../../src/lib/theme'
import type { NotificationSettings } from '../../src/types/database'

const REMINDER_TIMES = ['19:00', '20:00', '21:00', '22:00']

export default function SettingsScreen() {
  const { profile, supabaseUser, signOut } = useAuthStore()
  const [notifSettings, setNotifSettings] = useState<NotificationSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchSettings()
  }, [profile?.id])

  async function fetchSettings() {
    if (!profile?.id) return

    const { data } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('user_id', profile.id)
      .single()

    if (data) {
      setNotifSettings(data as NotificationSettings)
    } else {
      // Create default settings
      const defaults: Omit<NotificationSettings, 'id'> = {
        user_id: profile.id,
        daily_reminder_time: '21:00',
        test_reminder_enabled: true,
        loss_warning_enabled: true,
        push_token: null,
      }
      const { data: created } = await supabase
        .from('notification_settings')
        .insert(defaults)
        .select()
        .single()
      if (created) setNotifSettings(created as NotificationSettings)
    }
    setLoading(false)
  }

  async function saveSettings(updates: Partial<NotificationSettings>) {
    if (!notifSettings?.id) return
    setSaving(true)
    const updated = { ...notifSettings, ...updates }
    setNotifSettings(updated)

    const { error } = await supabase
      .from('notification_settings')
      .update(updates)
      .eq('id', notifSettings.id)

    setSaving(false)
    if (error) {
      Alert.alert('エラー', '設定の保存に失敗しました')
    }
  }

  async function handleSignOut() {
    Alert.alert(
      'サインアウト',
      'サインアウトしますか？',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: 'サインアウト',
          style: 'destructive',
          onPress: () => signOut(),
        },
      ]
    )
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
        <Text style={styles.headerTitle}>設定</Text>
        {saving && <ActivityIndicator size="small" color={colors.primary} />}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Profile Section */}
        <Text style={styles.sectionLabel}>プロフィール</Text>
        <View style={styles.card}>
          <View style={styles.avatarRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(profile?.display_name ?? supabaseUser?.email ?? '?')[0].toUpperCase()}
              </Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.displayName}>
                {profile?.display_name ?? '名前未設定'}
              </Text>
              <Text style={styles.email}>{supabaseUser?.email ?? ''}</Text>
              <View style={styles.streakRow}>
                <Text style={styles.streakIcon}>🔥</Text>
                <Text style={styles.streakText}>{profile?.streak_count ?? 0}日連続</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Notification Settings */}
        <Text style={styles.sectionLabel}>通知設定</Text>
        <View style={styles.card}>
          {/* Reminder Time */}
          <Text style={styles.settingLabel}>毎日のリマインド時間</Text>
          <View style={styles.timePickerRow}>
            {REMINDER_TIMES.map((time) => (
              <TouchableOpacity
                key={time}
                style={[
                  styles.timeOption,
                  notifSettings?.daily_reminder_time === time && styles.timeOptionActive,
                ]}
                onPress={() => saveSettings({ daily_reminder_time: time })}
              >
                <Text
                  style={[
                    styles.timeOptionText,
                    notifSettings?.daily_reminder_time === time && styles.timeOptionTextActive,
                  ]}
                >
                  {time}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.divider} />

          {/* Test Reminder Toggle */}
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>テストリマインダー</Text>
              <Text style={styles.toggleSubLabel}>テスト期限が近づいたら通知</Text>
            </View>
            <Switch
              value={notifSettings?.test_reminder_enabled ?? true}
              onValueChange={(val) => saveSettings({ test_reminder_enabled: val })}
              trackColor={{ false: colors.border, true: `${colors.primary}80` }}
              thumbColor={notifSettings?.test_reminder_enabled ? colors.primary : '#f4f3f4'}
            />
          </View>

          <View style={styles.divider} />

          {/* Loss Warning Toggle */}
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>ストリーク消滅警告</Text>
              <Text style={styles.toggleSubLabel}>ストリークが途切れそうなとき通知</Text>
            </View>
            <Switch
              value={notifSettings?.loss_warning_enabled ?? true}
              onValueChange={(val) => saveSettings({ loss_warning_enabled: val })}
              trackColor={{ false: colors.border, true: `${colors.primary}80` }}
              thumbColor={notifSettings?.loss_warning_enabled ? colors.primary : '#f4f3f4'}
            />
          </View>
        </View>

        {/* App Info */}
        <Text style={styles.sectionLabel}>アプリ情報</Text>
        <View style={styles.card}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>バージョン</Text>
            <Text style={styles.infoValue}>1.0.0</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>ロール</Text>
            <Text style={styles.infoValue}>{profile?.role ?? '—'}</Text>
          </View>
        </View>

        {/* Sign Out */}
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Text style={styles.signOutText}>サインアウト</Text>
        </TouchableOpacity>
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
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    marginHorizontal: 16,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 16,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  profileInfo: {
    flex: 1,
  },
  displayName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  email: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  streakIcon: {
    fontSize: 14,
  },
  streakText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.streak,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  timePickerRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 8,
  },
  timeOption: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
  },
  timeOptionActive: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}10`,
  },
  timeOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  timeOptionTextActive: {
    color: colors.primary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: 16,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  toggleInfo: {
    flex: 1,
    marginRight: 12,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
  toggleSubLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  infoLabel: {
    fontSize: 15,
    color: colors.text,
  },
  infoValue: {
    fontSize: 15,
    color: colors.textSecondary,
  },
  signOutButton: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.danger,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.danger,
  },
})
