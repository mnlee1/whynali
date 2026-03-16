/**
 * scripts/fix-stuck-ignite-issues.ts
 * 
 * 점화 상태에 갇힌 이슈들 일괄 종결
 * (24시간 경과 + 화력 10~30점)
 */

import dotenv from 'dotenv'
import { resolve } from 'path'
dotenv.config({ path: resolve(__dirname, '../.env.local') })

import { supabaseAdmin } from '../lib/supabase/server'

const IGNITE_TIMEOUT_HOURS = 24
const IGNITE_MIN_HEAT = 30
const CLOSED_MAX_HEAT = 10

async function fixStuckIgniteIssues() {
    console.log('=== 점화 상태 갇힌 이슈 수정 ===\n')

    // 1. 대상 이슈 찾기
    const { data: issues, error } = await supabaseAdmin
        .from('issues')
        .select('id, title, status, heat_index, approved_at, created_at')
        .eq('status', '점화')
        .eq('approval_status', '승인')

    if (error || !issues || issues.length === 0) {
        console.log('대상 이슈 없음')
        return
    }

    console.log(`총 ${issues.length}개 점화 이슈 검사\n`)

    const now = Date.now()
    const stuckIssues = issues.filter(issue => {
        const baseTime = issue.approved_at ?? issue.created_at
        const elapsedHours = (now - new Date(baseTime).getTime()) / (1000 * 60 * 60)
        const heat = issue.heat_index ?? 0

        // 타임아웃 조건: 24시간 경과 + 화력 < 30점
        return elapsedHours >= IGNITE_TIMEOUT_HOURS && heat < IGNITE_MIN_HEAT && heat >= CLOSED_MAX_HEAT
    })

    if (stuckIssues.length === 0) {
        console.log('✅ 갇힌 이슈 없음\n')
        return
    }

    console.log(`⚠️  갇힌 이슈 발견: ${stuckIssues.length}개\n`)

    // 2. 각 이슈 정보 출력
    for (const issue of stuckIssues) {
        const baseTime = issue.approved_at ?? issue.created_at
        const elapsedHours = (now - new Date(baseTime).getTime()) / (1000 * 60 * 60)
        const heat = issue.heat_index ?? 0

        console.log(`\n제목: "${issue.title}"`)
        console.log(`  ID: ${issue.id}`)
        console.log(`  화력: ${heat}점`)
        console.log(`  경과: ${elapsedHours.toFixed(1)}시간`)
        console.log(`  생성: ${new Date(baseTime).toLocaleString('ko-KR')}`)
        console.log(`  → 종결 처리 예정`)
    }

    // 3. 일괄 종결 처리
    console.log(`\n=== 일괄 종결 시작 ===\n`)

    const issueIds = stuckIssues.map(i => i.id)
    
    const { error: updateError } = await supabaseAdmin
        .from('issues')
        .update({
            status: '종결',
            updated_at: new Date().toISOString(),
        })
        .in('id', issueIds)

    if (updateError) {
        console.error('업데이트 에러:', updateError)
        return
    }

    console.log(`✅ ${stuckIssues.length}개 이슈 종결 완료\n`)

    // 4. 결과 확인
    for (const issue of stuckIssues) {
        const { data: updated } = await supabaseAdmin
            .from('issues')
            .select('status')
            .eq('id', issue.id)
            .single()

        console.log(`  ${issue.title.substring(0, 40)}... → ${updated?.status}`)
    }

    console.log('\n=== 완료 ===')
}

fixStuckIgniteIssues().catch(console.error)
