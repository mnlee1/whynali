import { createBrowserClient } from '@supabase/ssr'

/**
 * 브라우저용 Supabase 클라이언트.
 * createBrowserClient를 쓰면 세션이 쿠키에 저장되어 서버(createSupabaseServerClient)에서도 동일 세션을 읽을 수 있음.
 * createClient(supabase-js)만 쓰면 localStorage에만 저장되어 서버가 로그인 상태를 알 수 없음.
 */
type BrowserClient = ReturnType<typeof createBrowserClient>

let _client: BrowserClient | null = null

function getClient(): BrowserClient {
    if (_client) return _client
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) throw new Error('Supabase env not configured')
    _client = createBrowserClient(url, key)
    return _client
}

export const supabase: BrowserClient = new Proxy({} as BrowserClient, {
    get(_, prop) {
        return getClient()[prop as keyof BrowserClient]
    },
})
