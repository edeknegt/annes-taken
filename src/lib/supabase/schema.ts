import type { SupabaseClient } from '@supabase/supabase-js'

// Deze app deelt de Supabase-database 'annes-apps' met de andere apps van
// Anne; elke app heeft daarin een eigen schema.
export const DB_SCHEMA = 'annes_taken'

// Zonder gegenereerde Database-types; any is hier de standaard van supabase-js.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AppSupabaseClient = SupabaseClient<any, typeof DB_SCHEMA>
