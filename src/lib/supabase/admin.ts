import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { DB_SCHEMA, type AppSupabaseClient } from '@/lib/supabase/schema'

let cached: AppSupabaseClient | null = null

export function createAdminClient(): AppSupabaseClient {
  if (cached) return cached

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error(
      'Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL'
    )
  }

  cached = createClient(url, serviceKey, {
    db: { schema: DB_SCHEMA },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cached
}
