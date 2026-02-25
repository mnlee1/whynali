/**
 * lib/ensure-user.ts
 *
 * Auth 사용자가 public.users에 없으면 삽입.
 * 감정/댓글 등 user_id FK가 있을 때 FK 위반을 막기 위해 사용.
 */

import type { User } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

const PROVIDER_MAP: Record<string, '구글' | '네이버' | '카카오'> = {
    google: '구글',
    kakao: '카카오',
    naver: '네이버',
}

function toProvider(provider?: string): '구글' | '네이버' | '카카오' {
    if (provider && provider in PROVIDER_MAP) return PROVIDER_MAP[provider]
    return '네이버'
}

/** 닉네임 우선(실명 부담 완화). 이메일은 작성자명으로 쓰지 않음(없으면 null → UI에서 "사용자 …****"). */
function toDisplayName(user: User): string | null {
    const m = user.user_metadata
    if (!m) return null
    return (m.nickname ?? m.user_name ?? m.full_name ?? m.name) ?? null
}

/**
 * 현재 Auth 사용자가 public.users에 있도록 보장.
 * upsert로 없으면 삽입, 있으면 갱신해 FK 위반을 막는다.
 */
export async function ensurePublicUser(
    _supabase: SupabaseClient,
    admin: SupabaseClient,
    user: User
): Promise<void> {
    const provider = toProvider(user.app_metadata?.provider ?? user.user_metadata?.provider)
    const display_name = toDisplayName(user)

    const { error } = await admin
        .from('users')
        .upsert(
            { id: user.id, provider, provider_id: user.id, display_name },
            { onConflict: 'id' }
        )

    if (error) throw error
}
