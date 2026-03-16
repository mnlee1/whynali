/**
 * scripts/check_yoonseokjun_issue.ts
 * 
 * [윤석준 관련 이슈 조회 스크립트]
 * 
 * 사용자가 사이트에서 보고한 "윤석준 대구 동구청장 당선무효형 확정" 이슈를 찾아서
 * 해당 이슈의 모든 상태 정보를 출력합니다.
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

// .env.local 로드
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkYoonSeokjunIssue() {
    console.log('=== 윤석준 관련 이슈 검색 ===\n')

    // 1. 윤석준 키워드로 검색
    const { data: issues, error } = await supabase
        .from('issues')
        .select('*')
        .or('title.ilike.%윤석준%,title.ilike.%동구청장%')
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error:', error)
        return
    }

    if (!issues || issues.length === 0) {
        console.log('윤석준 관련 이슈를 찾을 수 없습니다.')
        return
    }

    console.log(`총 ${issues.length}개의 이슈를 찾았습니다.\n`)

    for (const issue of issues) {
        console.log('─'.repeat(80))
        console.log(`ID: ${issue.id}`)
        console.log(`제목: ${issue.title}`)
        console.log(`카테고리: ${issue.category}`)
        console.log(`상태: ${issue.status}`)
        console.log(`승인 상태: ${issue.approval_status}`)
        console.log(`가시성 상태: ${issue.visibility_status}`)
        console.log(`화력 지수: ${issue.heat_index}`)
        console.log(`병합됨 (merged_into_id): ${issue.merged_into_id ?? 'null'}`)
        console.log(`생성일: ${issue.created_at}`)
        console.log(`수정일: ${issue.updated_at}`)

        // API 필터링 조건 체크
        const MIN_HEAT = parseInt(process.env.CANDIDATE_MIN_HEAT_TO_REGISTER ?? '15')
        const passesFilter = 
            issue.approval_status === '승인' &&
            issue.visibility_status === 'visible' &&
            issue.merged_into_id === null &&
            (issue.heat_index ?? 0) >= MIN_HEAT

        console.log(`\n[API 필터링 결과]`)
        console.log(`  - approval_status === '승인': ${issue.approval_status === '승인'}`)
        console.log(`  - visibility_status === 'visible': ${issue.visibility_status === 'visible'}`)
        console.log(`  - merged_into_id === null: ${issue.merged_into_id === null}`)
        console.log(`  - heat_index >= ${MIN_HEAT}: ${(issue.heat_index ?? 0) >= MIN_HEAT} (현재: ${issue.heat_index})`)
        console.log(`  → 최종 필터 통과 여부: ${passesFilter ? '✅ 통과 (API에 노출됨)' : '❌ 차단 (API에서 숨김)'}`)
        console.log('')
    }

    console.log('─'.repeat(80))
}

checkYoonSeokjunIssue().catch(console.error)
