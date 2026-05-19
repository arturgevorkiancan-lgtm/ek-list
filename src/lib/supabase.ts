import { createClient, SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!)
  : null

export const STORAGE_BUCKET = 'documents'

if (import.meta.env.DEV || import.meta.env.MODE === 'preview') {
  ;(window as Window & { __supabase?: SupabaseClient | null }).__supabase = supabase
}
