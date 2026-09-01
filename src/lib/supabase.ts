import { createClient } from '@supabase/supabase-js'

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://iypddnhvedcumpclkrxv.supabase.co'
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5cGRkbmh2ZWRjdW1wY2xrcnh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyMzIzMzksImV4cCI6MjEwMzgwODMzOX0.5lYYLRyZKMG5dKtdYgJV6eu6gLsEew4pBc2rJ0TNM5A'

/**
 * Universal Supabase Client for VX Player
 * Supports authentication, realtime database subscriptions, and cloud storage.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey)
}
