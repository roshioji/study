import { Redirect, Tabs } from 'expo-router'
import { Text } from 'react-native'
import { useAuthStore } from '../../src/stores/authStore'
import { colors } from '../../src/lib/theme'

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{label}</Text>
  )
}

export default function TabsLayout() {
  const { session, loading } = useAuthStore()

  if (!loading && !session) {
    return <Redirect href="/(auth)/login" />
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingBottom: 8,
          height: 64,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'ホーム',
          tabBarIcon: ({ focused }) => <TabIcon label="🏠" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="materials"
        options={{
          title: '教材',
          tabBarIcon: ({ focused }) => <TabIcon label="📚" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="test"
        options={{
          title: 'テスト',
          tabBarIcon: ({ focused }) => <TabIcon label="✏️" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '設定',
          tabBarIcon: ({ focused }) => <TabIcon label="⚙️" focused={focused} />,
        }}
      />
    </Tabs>
  )
}
