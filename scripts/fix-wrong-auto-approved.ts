/**
 * scripts/fix-wrong-auto-approved.ts
 * 
 * 화력 30점 미만이거나 연예/정치 카테고리인데 자동 승인된 이슈를 수정합니다.
 * 
 * 자동 승인 조건:
 * - 화력 30점 이상 AND 카테고리가 사회/기술/스포츠
 * 
 * 수정 대상:
 * 1. 화력 30점 미만 + 자동 승인 → 관리자 승인으로 변경
 * 2. 연예/정치 카테고리 + 자동 승인 → 관리자 승인으로 변경
 */

import { config } from 'dotenv'
import { resolve } from 'path'

// 환경변수 로드
config({ path: resolve(process.cwd(), '.env.local') })

import { supabaseAdmin } from '@/lib/supabase/server'
import {
    CANDIDATE_AUTO_APPROVE_THRESHOLD as AUTO_APPROVE_THRESHOLD,
    AUTO_APPROVE_CATEGORIES,
} from '@/lib/config/candidate-thresholds'

async function fixWrongAutoApprovedIssues() {
    console.log('=== 잘못된 자동 승인 이슈 수정 ===\n')
    console.log(`자동 승인 조건: 화력 ${AUTO_APPROVE_THRESHOLD}점 이상 + 카테고리 ${AUTO_APPROVE_CATEGORIES.join('/')}`)
    console.log()

    const { data: issues, error } = await supabaseAdmin
        .from('issues')
        .select('id, title, category, heat_index, approval_heat_index, created_heat_index, approval_status, approval_type')
        .eq('approval_type', 'auto')
        .eq('approval_status', '승인')

    if (error) {
        console.error('조회 에러:', error)
        return
    }

    if (!issues || issues.length === 0) {
        console.log('자동 승인된 이슈가 없습니다.')
        return
    }

    console.log(`총 ${issues.length}개의 자동 승인 이슈를 검사합니다...\n`)

    const wrongIssues: Array<{
        id: string
        title: string
        category: string
        heat_index: number
        reason: string
    }> = []

    for (const issue of issues) {
        const heat = issue.heat_index ?? issue.approval_heat_index ?? issue.created_heat_index ?? 0
        const category = issue.category ?? '미분류'

        // 조건 1: 화력 30점 미만
        if (heat < AUTO_APPROVE_THRESHOLD) {
            wrongIssues.push({
                id: issue.id,
                title: issue.title,
                category,
                heat_index: heat,
                reason: `화력 ${heat}점 (${AUTO_APPROVE_THRESHOLD}점 미만)`,
            })
            continue
        }

        // 조건 2: 연예/정치 카테고리
        if (!AUTO_APPROVE_CATEGORIES.includes(category)) {
            wrongIssues.push({
                id: issue.id,
                title: issue.title,
                category,
                heat_index: heat,
                reason: `${category} 카테고리 (자동 승인 불가)`,
            })
        }
    }

    if (wrongIssues.length === 0) {
        console.log('✅ 모든 자동 승인 이슈가 조건에 부합합니다.')
        return
    }

    console.log(`\n❌ ${wrongIssues.length}개의 잘못된 자동 승인 이슈 발견:\n`)

    wrongIssues.forEach((issue, idx) => {
        console.log(`${idx + 1}. "${issue.title.substring(0, 50)}..."`)
        console.log(`   - 카테고리: ${issue.category}, 화력: ${issue.heat_index}점`)
        console.log(`   - 문제: ${issue.reason}`)
        console.log()
    })

    console.log('→ 관리자 승인(manual)으로 변경합니다...\n')

    // 일괄 업데이트
    let successCount = 0
    let failCount = 0

    for (const issue of wrongIssues) {
        const { error: updateError } = await supabaseAdmin
            .from('issues')
            .update({ approval_type: 'manual' })
            .eq('id', issue.id)

        if (updateError) {
            console.error(`❌ 업데이트 실패 (${issue.id}):`, updateError.message)
            failCount++
        } else {
            successCount++
        }
    }

    console.log('\n=== 수정 완료 ===')
    console.log(`✅ 성공: ${successCount}개`)
    if (failCount > 0) {
        console.log(`❌ 실패: ${failCount}개`)
    }
}

// 실행
fixWrongAutoApprovedIssues()
    .then(() => {
        console.log('\n스크립트 종료')
        process.exit(0)
    })
    .catch((error) => {
        console.error('스크립트 에러:', error)
        process.exit(1)
    })
