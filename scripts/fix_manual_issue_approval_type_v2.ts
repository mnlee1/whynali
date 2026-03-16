/**
 * scripts/fix_manual_issue_approval_type_v2.ts
 * 
 * 수동 등록 이슈의 approval_type을 'manual'로 수정
 * 
 * 문제:
 * - source_track = 'manual'인 수동 등록 이슈의 approval_type이 null
 * - 자동 승인 필터에서도 보이는 문제 발생
 * 
 * 해결:
 * - source_track = 'manual' AND approval_status = '승인' → approval_type = 'manual'
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
    console.log('수동 등록 이슈의 approval_type을 "manual"로 수정')
    console.log('='.repeat(80))
    console.log()

    // 1. 수동 등록 이슈 중 approval_type이 null인 것 조회
    console.log('1. source_track = "manual" AND approval_type IS NULL 이슈 조회...')
    const { data: issues, error: fetchError } = await supabase
        .from('issues')
        .select('id, title, source_track, approval_status, approval_type, heat_index, created_at')
        .eq('source_track', 'manual')
        .is('approval_type', null)
        .not('approval_status', 'is', null)
        .order('created_at', { ascending: false })

    if (fetchError) {
        console.error('❌ 조회 실패:', fetchError.message)
        process.exit(1)
    }

    if (!issues || issues.length === 0) {
        console.log('✅ 수정이 필요한 이슈가 없습니다.')
        process.exit(0)
    }

    console.log(`\n📋 총 ${issues.length}개 이슈 발견\n`)

    // 2. 이슈 목록 출력
    console.log('='.repeat(80))
    console.log('수정 대상 이슈 목록')
    console.log('='.repeat(80))
    console.log()

    for (const issue of issues) {
        console.log(`[${issue.approval_status}] ${issue.title}`)
        console.log(`  ID: ${issue.id}`)
        console.log(`  화력: ${issue.heat_index}점`)
        console.log(`  현재 approval_type: null → 'manual'`)
        console.log(`  생성: ${new Date(issue.created_at).toLocaleString('ko-KR')}`)
        console.log()
    }

    // 3. 수정 실행
    console.log('='.repeat(80))
    console.log('수정 실행 중...')
    console.log('='.repeat(80))
    console.log()

    const { error: updateError } = await supabase
        .from('issues')
        .update({ approval_type: 'manual' })
        .eq('source_track', 'manual')
        .is('approval_type', null)
        .not('approval_status', 'is', null)

    if (updateError) {
        console.error('❌ 수정 실패:', updateError.message)
        process.exit(1)
    }

    console.log(`✅ ${issues.length}개 이슈의 approval_type을 'manual'로 수정 완료`)
    console.log()

    // 4. 검증
    console.log('='.repeat(80))
    console.log('수정 결과 검증')
    console.log('='.repeat(80))
    console.log()

    const { data: verifyIssues, error: verifyError } = await supabase
        .from('issues')
        .select('id, title, source_track, approval_status, approval_type')
        .eq('approval_status', '승인')
        .order('created_at', { ascending: false })

    if (verifyError) {
        console.error('❌ 검증 실패:', verifyError.message)
        process.exit(1)
    }

    const autoCount = verifyIssues?.filter(i => i.approval_type === 'auto').length || 0
    const manualCount = verifyIssues?.filter(i => i.approval_type === 'manual').length || 0
    const nullCount = verifyIssues?.filter(i => i.approval_type === null).length || 0

    console.log('승인된 이슈 분포:')
    console.log(`  - 자동 승인 (approval_type='auto'): ${autoCount}개`)
    console.log(`  - 관리자 승인 (approval_type='manual'): ${manualCount}개`)
    console.log(`  - 타입 미지정 (approval_type=null): ${nullCount}개 ${nullCount > 0 ? '❌' : '✅'}`)
    console.log()

    console.log('='.repeat(80))
    console.log('🎯 작업 완료')
    console.log('='.repeat(80))
    console.log()
    console.log('변경 사항:')
    console.log('  - source_track = "manual" 이슈의 approval_type을 "manual"로 변경')
    console.log('  - UI에서 "관리자 승인"으로 표시됨')
    console.log('  - 자동 승인 필터에서 제외됨')
}

main().catch(console.error)
