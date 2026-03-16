/**
 * scripts/delete_low_heat_issues.ts
 * 
 * 화력 15점 미만 이슈 삭제
 * 
 * 목적:
 * - 화력 15점 미만으로 등록된 이슈들을 DB에서 삭제
 * - 트랙 A 등록 기준(15점 이상)을 위반한 이슈 정리
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MIN_HEAT = 15

async function main() {
    console.log('='.repeat(60))
    console.log('화력 15점 미만 이슈 삭제')
    console.log('='.repeat(60))
    console.log()

    // 1. 화력 15점 미만 이슈 조회
    console.log(`1. 화력 ${MIN_HEAT}점 미만 이슈 조회...`)
    const { data: lowHeatIssues, error: fetchError } = await supabase
        .from('issues')
        .select('id, title, heat_index, created_heat_index, approval_status, category, created_at')
        .lt('heat_index', MIN_HEAT)
        .not('approval_status', 'is', null)
        .order('heat_index', { ascending: true })

    if (fetchError) {
        console.error('❌ 조회 실패:', fetchError.message)
        process.exit(1)
    }

    if (!lowHeatIssues || lowHeatIssues.length === 0) {
        console.log(`✅ 화력 ${MIN_HEAT}점 미만 이슈가 없습니다.`)
        process.exit(0)
    }

    console.log(`\n📋 총 ${lowHeatIssues.length}개 이슈 발견\n`)

    // 2. 이슈 목록 출력
    console.log('='.repeat(60))
    console.log('삭제 대상 이슈 목록')
    console.log('='.repeat(60))

    const statusGroups = {
        '대기': lowHeatIssues.filter(i => i.approval_status === '대기'),
        '승인': lowHeatIssues.filter(i => i.approval_status === '승인'),
        '반려': lowHeatIssues.filter(i => i.approval_status === '반려'),
    }

    for (const [status, issues] of Object.entries(statusGroups)) {
        if (issues.length === 0) continue

        console.log(`\n[${status}] ${issues.length}개`)
        console.log('-'.repeat(60))

        for (const issue of issues) {
            const heatInfo = issue.created_heat_index != null
                ? `${issue.created_heat_index}점 → ${issue.heat_index}점`
                : `${issue.heat_index}점`

            console.log(`  • [${issue.category}] ${issue.title.substring(0, 40)}...`)
            console.log(`    화력: ${heatInfo}`)
            console.log(`    ID: ${issue.id}`)
            console.log(`    생성: ${new Date(issue.created_at).toLocaleString('ko-KR')}`)
            console.log()
        }
    }

    // 3. 확인 메시지
    console.log('='.repeat(60))
    console.log(`⚠️  ${lowHeatIssues.length}개 이슈를 삭제합니다.`)
    console.log('='.repeat(60))
    console.log()

    // 4. 삭제 실행
    console.log('삭제 실행 중...')
    const issueIds = lowHeatIssues.map(i => i.id)

    // 관련 데이터도 함께 삭제 (CASCADE가 설정되어 있어야 함)
    const { error: deleteError } = await supabase
        .from('issues')
        .delete()
        .in('id', issueIds)

    if (deleteError) {
        console.error('❌ 삭제 실패:', deleteError.message)
        process.exit(1)
    }

    console.log()
    console.log('='.repeat(60))
    console.log(`✅ ${lowHeatIssues.length}개 이슈 삭제 완료`)
    console.log('='.repeat(60))
    console.log()

    // 5. 통계
    console.log('삭제 통계:')
    for (const [status, issues] of Object.entries(statusGroups)) {
        if (issues.length > 0) {
            console.log(`  - ${status}: ${issues.length}개`)
        }
    }

    console.log()
    console.log('🎯 작업 완료')
}

main().catch(console.error)
