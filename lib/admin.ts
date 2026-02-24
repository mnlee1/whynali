/**
 * lib/admin.ts
 *
 * 관리자 권한 검증 헬퍼
 *
 * isAdminEmail: 이메일이 ADMIN_EMAILS 환경변수에 포함되어 있는지 확인.
 * requireAdmin: API Route 핸들러 최상단에서 호출해 인증/인가를 강제하는 유틸.
 *   - 미인증 → 401
 *   - 비관리자 → 403
 *   - 관리자 → { adminEmail } 반환
 *
 * 사용 예시:
 *   const auth = await requireAdmin()
 *   if (auth.error) return auth.error
 *   const { adminEmail } = auth
 */

import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

/** .env의 ADMIN_EMAILS (콤마 구분)을 파싱해 Set으로 반환 */
function getAdminEmailSet(): Set<string> {
    const raw = process.env.ADMIN_EMAILS ?? ''
    return new Set(
        raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
    )
}

/**
 * 주어진 이메일이 관리자 목록에 포함되어 있는지 확인.
 * SKIP_ADMIN_CHECK=true 환경변수가 설정된 경우 로그인한 모든 사용자를 허용 (테스트용).
 */
export function isAdminEmail(email: string | null | undefined): boolean {
    if (!email) return false
    if (process.env.SKIP_ADMIN_CHECK === 'true') return true
    return getAdminEmailSet().has(email.toLowerCase())
}

type RequireAdminResult =
    | { adminEmail: string; error: null }
    | { adminEmail: null; error: NextResponse }

/**
 * requireAdmin - API Route 핸들러 상단에서 호출하는 인증/인가 강제 유틸
 *
 * 세션 쿠키로 현재 사용자를 확인하고, 관리자 이메일 여부를 검증한다.
 * 검증 실패 시 바로 반환할 수 있는 NextResponse를 error 필드에 담아 반환.
 *
 * 예시:
 *   const auth = await requireAdmin()
 *   if (auth.error) return auth.error
 */
export async function requireAdmin(): Promise<RequireAdminResult> {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return {
            adminEmail: null,
            error: NextResponse.json(
                { error: 'UNAUTHORIZED', message: '로그인이 필요합니다.' },
                { status: 401 }
            ),
        }
    }

    if (!isAdminEmail(user.email)) {
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
