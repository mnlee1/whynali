import { supabaseAdmin } from '@/lib/supabase/server'

/* 관리자 액션 로그 기록 헬퍼
   실패해도 메인 액션을 막지 않도록 에러를 무시함
   admin_id: 추후 작업(인증 재활성화) 시 실제 관리자 ID로 교체 */
export async function writeAdminLog(
    action: string,
    targetType: string,
    targetId: string | null = null
): Promise<void> {
    try {
        await supabaseAdmin.from('admin_logs').insert({
            action,
            target_type: targetType,
            target_id: targetId,
            admin_id: null,
        })
    } catch {
        /* intentionally silent */
    }
}
