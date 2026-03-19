/**
 * lib/admin.ts
 *
 * 관리자 권한 검증 헬퍼
 *
 * isAdminEmail : @nhnad.com 도메인 OR ADMIN_EMAILS 환경변수에 포함된 이메일
 * requireAdmin : API Route 핸들러 상단에서 호출하는 인증/인가 유틸
 *
 * 사용 예시:
 *   const auth = await requireAdmin()
 *   if (auth.error) return auth.error
 *   const { adminEmail } = auth
 */

import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

/** @nhnad.com 도메인 — 이 도메인의 모든 이메일이 관리자 */
const ADMIN_DOMAIN = '@nhnad.com'

/** .env의 ADMIN_EMAILS (콤마 구분)을 파싱해 Set으로 반환 */
function getAdminEmailSet(): Set<string> {
    const raw = process.env.ADMIN_EMAILS ?? ''
    return new Set(
        raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
    )
}

/**
 * 주어진 이메일이 관리자인지 확인.
 * 1순위: @nhnad.com 도메인 (여러 관리자 자동 지원)
 * 2순위: ADMIN_EMAILS 환경변수에 명시된 계정
 */
export function isAdminEmail(email: string | null | undefined): boolean {
    if (!email) return false
    const lower = email.toLowerCase()
    if (lower.endsWith(ADMIN_DOMAIN)) return true
    return getAdminEmailSet().has(lower)
}

type RequireAdminResult =
    | { adminEmail: string; error: null }
    | { adminEmail: null; error: NextResponse }

/**
 * requireAdmin - API Route 핸들러 상단에서 호출하는 인증/인가 유틸.
 * 세션 미존재 → 401, @nhnad.com 아님 → 403
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
