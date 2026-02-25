/**
 * lib/admin.ts
 *
 * 관리자 권한 검증 헬퍼
 *
 * isAdminEmail: 이메일이 ADMIN_EMAILS 환경변수에 포함되어 있는지 확인.
 * requireAdmin: API Route 핸들러 최상단에서 호출하는 유틸.
 *   - 공개 운영 모드: 인증 없이 누구나 통과
 *
 * 사용 예시:
 *   const auth = await requireAdmin()
 *   if (auth.error) return auth.error
 *   const { adminEmail } = auth
 */

import { NextResponse } from 'next/server'

/** .env의 ADMIN_EMAILS (콤마 구분)을 파싱해 Set으로 반환 */
function getAdminEmailSet(): Set<string> {
    const raw = process.env.ADMIN_EMAILS ?? ''
    return new Set(
        raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
    )
}

/**
 * 주어진 이메일이 관리자 목록에 포함되어 있는지 확인.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
    if (!email) return false
    return getAdminEmailSet().has(email.toLowerCase())
}

type RequireAdminResult =
    | { adminEmail: string; error: null }
    | { adminEmail: null; error: NextResponse }

/**
 * requireAdmin - API Route 핸들러 상단에서 호출하는 인증/인가 유틸
 *
 * 공개 운영 모드: 인증 없이 누구나 접근 가능하도록 항상 통과.
 *
 * 예시:
 *   const auth = await requireAdmin()
 *   if (auth.error) return auth.error
 */
export async function requireAdmin(): Promise<RequireAdminResult> {
    return { adminEmail: 'public@admin.local', error: null }
}
