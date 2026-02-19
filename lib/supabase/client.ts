import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

function getClient(): SupabaseClient {
    if (_client) return _client
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) throw new Error('Supabase env not configured')
    _client = createClient(url, key)
    return _client
}

export const supabase = new Proxy({} as SupabaseClient, {
    get(_, prop) {
        return getClient()[prop as keyof SupabaseClient]
    },
})
