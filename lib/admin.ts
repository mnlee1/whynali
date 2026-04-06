/**
 * lib/admin.ts
 *
 * 관리자 권한 검증 헬퍼
 *
 * isAdminUser  : app_metadata.is_admin 플래그로 관리자 여부 확인
 * requireAdmin : API Route 핸들러 상단에서 호출하는 인증/인가 유틸
 * resolveEmail : 표시용 실제 이메일 반환 (합성 이메일 대신)
 *
 * ※ admin 판단은 이메일에 의존하지 않음.
 *    Supabase 대시보드에서 app_metadata: { "is_admin": true } 로 설정.
 *    app_metadata는 service_role key로만 수정 가능 → 사용자 조작 불가.
 *
 * 사용 예시:
 *   const auth = await requireAdmin()
 *   if (auth.error) return auth.error
 *   const { adminEmail } = auth
 */

import { NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

/**
 * 합성 이메일({id}@kakao.oauth 등) 사용자의 실제 이메일을 반환. (표시 전용)
 * user_metadata.real_email이 있으면 그 값을, 없으면 auth email을 반환.
 */
export function resolveEmail(user: Pick<User, 'email' | 'user_metadata'>): string | null {
    const real = user.user_metadata?.real_email
    if (typeof real === 'string' && real) return real
    return user.email ?? null
}

/**
 * app_metadata.is_admin 플래그로 관리자 여부 확인.
 * 이메일 형식·도메인·provider와 무관하게 동작.
 */
export function isAdminUser(user: Pick<User, 'app_metadata'>): boolean {
    return user.app_metadata?.is_admin === true
}

type RequireAdminResult =
    | { adminEmail: string; error: null }
    | { adminEmail: null; error: NextResponse }

/**
 * requireAdmin - API Route 핸들러 상단에서 호출하는 인증/인가 유틸.
 * 세션 미존재 → 401, is_admin 플래그 없음 → 403
 */
export async function requireAdmin(): Promise<RequireAdminResult> {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return {
            adminEmail: null,
            error: NextResponse.json(
                { error: 'UNAUTHORIZED', message: '관리자 로그인이 필요합니다.' },
                { status: 401 }
            ),
        }
    }

    if (!isAdminUser(user)) {
        return {
            adminEmail: null,
            error: NextResponse.json(
                { error: 'FORBIDDEN', message: '관리자 권한이 없습니다.' },
                { status: 403 }
            ),
        }
    }

    return { adminEmail: user.email!, error: null }
}
