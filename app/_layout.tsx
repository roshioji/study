import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { PaperProvider } from 'react-native-paper'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { useAuth } from '../src/hooks/useAuth'
import { theme } from '../src/lib/theme'

export default function RootLayout() {
  useAuth()

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PaperProvider theme={theme}>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="goal/new" options={{ presentation: 'modal' }} />
          <Stack.Screen name="material/upload" options={{ presentation: 'modal' }} />
          <Stack.Screen name="material/[id]/study" />
          <Stack.Screen name="material/[id]/summary" />
          <Stack.Screen name="test/[sessionId]" />
          <Stack.Screen name="test/result/[sessionId]" />
        </Stack>
      </PaperProvider>
    </GestureHandlerRootView>
  )
}
