/** lib/admin.ts — 관리자 권한 헬퍼 */

/** .env의 ADMIN_EMAILS (콤마 구분)을 파싱해 Set으로 반환 */
function getAdminEmailSet(): Set<string> {
    const raw = process.env.ADMIN_EMAILS ?? ''
    return new Set(
        raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
    )
}

/** 주어진 이메일이 관리자 목록에 포함되어 있는지 확인 */
export function isAdminEmail(email: string | null | undefined): boolean {
    if (!email) return false
    return getAdminEmailSet().has(email.toLowerCase())
}
