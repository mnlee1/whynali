/**
 * lib/env-check.ts
 *
 * 런타임 필수 환경변수 검증 유틸
 *
 * 서버 시작 시 또는 Cron/API 핸들러 최상단에서 호출해
 * 환경변수 누락을 조기에 감지한다.
 *
 * 사용 예시 (서버 컴포넌트 / route.ts):
 *   assertEnvVars()  // 누락 시 Error throw
 */

const REQUIRED_ENV_VARS = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'NAVER_CLIENT_ID',
    'NAVER_CLIENT_SECRET',
] as const

const PRODUCTION_REQUIRED_ENV_VARS = [
    'CRON_SECRET',
    'ADMIN_EMAILS',
] as const

/**
 * assertEnvVars - 필수 환경변수 누락 시 Error throw
 *
 * NODE_ENV=production 이면 CRON_SECRET, ADMIN_EMAILS도 필수로 검증한다.
 */
export function assertEnvVars(): void {
    const missing: string[] = []

    for (const key of REQUIRED_ENV_VARS) {
        if (!process.env[key]) {
            missing.push(key)
        }
    }

    if (process.env.NODE_ENV === 'production') {
        for (const key of PRODUCTION_REQUIRED_ENV_VARS) {
            if (!process.env[key]) {
                missing.push(key)
            }
        }
    }

    if (missing.length > 0) {
        throw new Error(
            `[env-check] 필수 환경변수 누락:\n  ${missing.join('\n  ')}\n` +
            `.env.example을 참고해 설정하세요.`
        )
    }
}

/**
 * checkEnvVars - 누락된 환경변수 목록 반환 (throw 없음)
 *
 * 상태 보고용 또는 /api/admin/health 체크에서 사용.
 */
export function checkEnvVars(): { ok: boolean; missing: string[] } {
    const missing: string[] = []

    for (const key of [...REQUIRED_ENV_VARS, ...PRODUCTION_REQUIRED_ENV_VARS]) {
        if (!process.env[key]) {
            missing.push(key)
        }
    }

    return { ok: missing.length === 0, missing }
}
