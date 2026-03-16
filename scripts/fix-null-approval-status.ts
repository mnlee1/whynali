/**
 * scripts/fix-null-approval-status.ts
 * 
 * approval_status가 null인 이슈를 화력 기준으로 처리
 * - 화력 15점 이상: 대기 상태로 변경
 * - 화력 15점 미만: 반려 상태로 변경
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function fixNullApprovalStatus() {
    console.log('='.repeat(60))
    console.log('approval_status null 이슈 수정')
    console.log('='.repeat(60))
    console.log()

    // 1. null 상태 이슈 조회
    const { data: nullIssues, error: fetchError } = await supabase
        .from('issues')
        .select('id, title, category, heat_index, created_at')
        .is('approval_status', null)
        .order('heat_index', { ascending: false })

    if (fetchError) {
        console.error('❌ 조회 실패:', fetchError)
        return
    }

    if (!nullIssues || nullIssues.length === 0) {
        console.log('✅ approval_status가 null인 이슈 없음')
        return
    }

    console.log(`📊 null 상태 이슈 ${nullIssues.length}건 발견`)
    console.log()

    // 2. 화력 기준으로 분류
    const toPending = nullIssues.filter(issue => (issue.heat_index || 0) >= 15)
    const toReject = nullIssues.filter(issue => (issue.heat_index || 0) < 15)

    console.log(`대기 처리 대상: ${toPending.length}건 (화력 15점 이상)`)
    console.log(`반려 처리 대상: ${toReject.length}건 (화력 15점 미만)`)
    console.log()

    // 3. 대기 상태로 변경
    if (toPending.length > 0) {
        console.log('🔄 대기 상태로 변경 중...')
        for (const issue of toPending) {
            const { error: updateError } = await supabase
                .from('issues')
                .update({
                    approval_status: '대기',
                    updated_at: new Date().toISOString()
                })
                .eq('id', issue.id)

            if (updateError) {
                console.error(`  ❌ 실패: ${issue.title}`, updateError)
            } else {
                console.log(`  ✅ [대기] ${issue.title} (화력: ${issue.heat_index?.toFixed(1)}점)`)
            }
        }
        console.log()
    }

    // 4. 반려 상태로 변경
    if (toReject.length > 0) {
        console.log('🔄 반려 상태로 변경 중...')
        for (const issue of toReject) {
            const { error: updateError } = await supabase
                .from('issues')
                .update({
                    approval_status: '반려',
                    updated_at: new Date().toISOString()
                })
                .eq('id', issue.id)

            if (updateError) {
                console.error(`  ❌ 실패: ${issue.title}`, updateError)
            } else {
                console.log(`  ✅ [반려] ${issue.title} (화력: ${issue.heat_index?.toFixed(1)}점)`)
            }
        }
        console.log()
    }

    console.log('✅ 수정 완료')
    console.log()

    // 5. 재확인
    const { data: remainingNull } = await supabase
        .from('issues')
        .select('id')
        .is('approval_status', null)

    console.log(`🔍 남은 null 이슈: ${remainingNull?.length || 0}건`)
}

fixNullApprovalStatus()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('에러:', err)
        process.exit(1)
    })
