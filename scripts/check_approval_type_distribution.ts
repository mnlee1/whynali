/**
 * scripts/check_approval_type_distribution.ts
 * 
 * 승인 상태별 approval_type 분포 확인
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
    console.log('='.repeat(80))
    console.log('승인 상태별 approval_type 분포 확인')
    console.log('='.repeat(80))
    console.log()

    // 승인된 이슈 조회
    const { data: approvedIssues, error } = await supabase
        .from('issues')
        .select('id, title, approval_status, approval_type, source_track, heat_index, created_at')
        .eq('approval_status', '승인')
        .order('created_at', { ascending: false })

    if (error) {
        console.error('❌ 조회 실패:', error.message)
        process.exit(1)
    }

    if (!approvedIssues || approvedIssues.length === 0) {
        console.log('✅ 승인된 이슈가 없습니다.')
        process.exit(0)
    }

    console.log(`📋 총 승인된 이슈: ${approvedIssues.length}개\n`)

    // approval_type별 분류
    const autoApproved = approvedIssues.filter(i => i.approval_type === 'auto')
    const manualApproved = approvedIssues.filter(i => i.approval_type === 'manual')
    const nullApproved = approvedIssues.filter(i => i.approval_type === null)

    console.log('승인 상태 분포:')
    console.log(`  - 자동 승인 (approval_type='auto'): ${autoApproved.length}개`)
    console.log(`  - 관리자 승인 (approval_type='manual'): ${manualApproved.length}개`)
    console.log(`  - 타입 미지정 (approval_type=null): ${nullApproved.length}개`)
    console.log()

    if (nullApproved.length > 0) {
        console.log('='.repeat(80))
        console.log(`⚠️  approval_type이 null인 승인 이슈 ${nullApproved.length}개 발견`)
        console.log('='.repeat(80))
        console.log()

        for (const issue of nullApproved.slice(0, 10)) {
            console.log(`[${issue.source_track || 'unknown'}] ${issue.title.substring(0, 60)}`)
            console.log(`  ID: ${issue.id}`)
            console.log(`  화력: ${issue.heat_index}점`)
            console.log(`  생성: ${new Date(issue.created_at).toLocaleString('ko-KR')}`)
            console.log()
        }

        if (nullApproved.length > 10) {
            console.log(`... 외 ${nullApproved.length - 10}개`)
            console.log()
        }
    }

    console.log('='.repeat(80))
    console.log('🎯 확인 완료')
    console.log('='.repeat(80))
}

main().catch(console.error)
