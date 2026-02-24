/**
 * lib/admin-log.ts
 *
 * 관리자 액션 로그 기록 헬퍼
 *
 * requireAdmin()으로 얻은 adminEmail을 함께 전달하면
 * admin_logs 테이블에 액터 정보가 함께 기록된다.
 * 로그 기록 실패는 메인 액션을 막지 않도록 에러를 무시한다.
 */

import { supabaseAdmin } from '@/lib/supabase/server'

export async function writeAdminLog(
    action: string,
    targetType: string,
    targetId: string | null = null,
    adminEmail: string | null = null
): Promise<void> {
    try {
        await supabaseAdmin.from('admin_logs').insert({
            action,
            target_type: targetType,
            target_id: targetId,
            admin_id: adminEmail,
        })
    } catch {
        /* intentionally silent */
    }
}
