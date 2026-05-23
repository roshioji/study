import { Redirect, Stack } from 'expo-router'
import { useAuthStore } from '../../src/stores/authStore'

export default function AuthLayout() {
  const { session, loading } = useAuthStore()

  if (!loading && session) {
    return <Redirect href="/(tabs)" />
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
    </Stack>
  )
}
