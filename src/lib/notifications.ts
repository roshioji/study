import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { supabase } from './supabase'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

export async function registerForPushNotifications(userId: string): Promise<string | null> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  let finalStatus = existingStatus

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== 'granted') return null

  const token = (await Notifications.getExpoPushTokenAsync()).data

  await supabase
    .from('notification_settings')
    .update({ push_token: token })
    .eq('user_id', userId)

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: '学習リマインド',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    })
  }

  return token
}

export async function scheduleStreakReminder(hour: number, minute: number) {
  await Notifications.cancelAllScheduledNotificationsAsync()
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '🔥 学習リマインド',
      body: '今日の学習を忘れずに！ストリークを守りましょう。',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  })
}

export async function scheduleTestReminder(title: string, body: string, date: Date) {
  await Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
  })
}

export async function sendLossWarningNotification(appNames: string[]) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '⚠️ テスト前日の警告',
      body: `明日不合格だと ${appNames.join('・')} が制限されます。しっかり準備しましょう！`,
    },
    trigger: null,
  })
}
