/**
 * scripts/fix_wbc_issue_category.ts
 * 
 * WBC 이슈의 카테고리를 IT과학 → 경제로 수정
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabaseAdmin = createClient(supabaseUrl, supabaseKey)

async function main() {
    console.log('=== WBC 이슈 카테고리 수정 ===\n')

    const issueId = 'e95ec64d-18ff-45e3-b56f-dd671f75876b'
    const issueTitle = '"WBC 점수 조작 죄송"…대만에서 \'혐한\' 마케팅 펼친 한국 기업'

    // 1. 현재 상태 확인
    const { data: issue } = await supabaseAdmin
        .from('issues')
        .select('*')
        .eq('id', issueId)
        .single()

    if (!issue) {
        console.log('이슈를 찾을 수 없습니다.')
        return
    }

    console.log('[ 현재 상태 ]')
    console.log(`제목: ${issue.title}`)
    console.log(`현재 카테고리: ${issue.category}`)
    console.log()

    // 2. 카테고리 분석
    console.log('[ 카테고리 분석 ]')
    console.log()
    console.log('이슈 내용: 한국 기업(두끼)이 대만에서 WBC 관련 혐한 마케팅')
    console.log()
    console.log('가능한 카테고리:')
    console.log('  1. 스포츠: WBC 관련')
    console.log('  2. 경제: 기업 마케팅 논란')
    console.log('  3. 사회: 혐한 이슈')
    console.log()
    console.log('권장: 경제 (기업의 마케팅 논란이 핵심)')
    console.log()

    // 3. 카테고리 수정
    const newCategory = '경제'
    
    const { error } = await supabaseAdmin
        .from('issues')
        .update({ category: newCategory })
        .eq('id', issueId)

    if (error) {
        console.error('수정 실패:', error)
        return
    }

    console.log('[ 수정 완료 ]')
    console.log(`IT과학 → ${newCategory}`)
    console.log()
    console.log('✅ 카테고리가 올바르게 수정되었습니다.')
}

main().catch(console.error)
