import 'react-native-url-polyfill/auto'
import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'

const supabaseUrl = (Constants.expoConfig?.extra?.supabaseUrl as string) ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const supabaseAnonKey = (Constants.expoConfig?.extra?.supabaseAnonKey as string) ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
