/**
 * scripts/check_goncheon_issue.ts
 * 
 * 1억 공천헌금 이슈 상태 확인
 */

import { supabaseAdmin } from '../lib/supabase/server'

async function main() {
    const { data } = await supabaseAdmin
        .from('issues')
        .select('*')
        .ilike('title', '%1억 공천헌금%')
        .single()

    if (!data) {
        console.log('이슈를 찾을 수 없습니다.')
        return
    }

    console.log('[ 1억 공천헌금 이슈 상태 ]\n')
    console.log('제목:', data.title)
    console.log('승인상태:', data.approval_status)
    console.log('승인타입:', data.approval_type)
    console.log('화력:', data.heat_index, '점')
    console.log('카테고리:', data.category)
    console.log('생성일:', new Date(data.created_at).toLocaleString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }))
    console.log()
    console.log('[ 분석 ]')
    console.log('화력 10점이므로 반려 기준(< 10점)에 해당하지 않음')
    console.log('따라서 재평가 스크립트에서 "현상 유지" 처리됨')
    console.log('기존 승인 상태가 그대로 유지되어 "관리자 승인"으로 표시됨')
}

main().catch(console.error)
