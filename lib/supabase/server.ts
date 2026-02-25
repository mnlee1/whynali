import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _admin: SupabaseClient | null = null

function getAdmin(): SupabaseClient {
    if (_admin) return _admin
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
        throw new Error('Supabase env not configured')
    }
    _admin = createClient(url, key)
    return _admin
}

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
    get(_, prop) {
        return getAdmin()[prop as keyof SupabaseClient]
    },
})
