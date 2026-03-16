/**
 * scripts/fix-suspected-issues.ts
 * 
 * 오분류 의심 케이스를 키워드 기반으로 즉시 수정 (AI 호출 없음)
 */

// 환경변수 로드
import dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(__dirname, '../.env.local') })

import { supabaseAdmin } from '../lib/supabase/server'

async function fixSuspectedIssues() {
    console.log('=== 오분류 의심 케이스 수정 (AI 호출 없음) ===\n')

    // 김연경 IOC 시상식 이슈 수정
    const issueId = '16509c80-5b5d-4eaa-9ae6-5283ce184fa7'
    const newCategory = '스포츠'

    console.log('수정 대상:')
    console.log('  제목: 배구 여제 김연경, IOC GEDI Champions Awards 수상')
    console.log(`  ID: ${issueId}`)
    console.log('  현재: 기술')
    console.log(`  수정: ${newCategory}\n`)

    // 1. 카테고리 업데이트
    const { error: updateError } = await supabaseAdmin
        .from('issues')
        .update({ category: newCategory })
        .eq('id', issueId)

    if (updateError) {
        console.error('❌ 카테고리 업데이트 에러:', updateError)
        return
    }

    console.log('✅ 카테고리 업데이트 완료: 기술 → 스포츠\n')

    // 2. 연결된 뉴스 확인
    const { data: linkedNews } = await supabaseAdmin
        .from('news_data')
        .select('id, title, category')
        .eq('issue_id', issueId)

    if (linkedNews && linkedNews.length > 0) {
        console.log(`연결된 뉴스: ${linkedNews.length}건`)
        
        linkedNews.slice(0, 5).forEach((n, idx) => {
            console.log(`  ${idx + 1}. [${n.category ?? '미분류'}] ${n.title.substring(0, 60)}...`)
        })
        
        if (linkedNews.length > 5) {
            console.log(`  ... 외 ${linkedNews.length - 5}건`)
        }
        
        console.log('\n📌 뉴스 연결은 cron 작업(auto-link)에서 자동으로 재검증됩니다.')
        console.log('   카테고리가 기술→스포츠로 변경되어, 기술 뉴스는 자동 해제되고')
        console.log('   스포츠 뉴스가 자동 연결됩니다.\n')
    }

    // 3. 최종 확인
    const { data: issue } = await supabaseAdmin
        .from('issues')
        .select('id, title, category, heat_index')
        .eq('id', issueId)
        .single()

    if (issue) {
        console.log('=== 최종 확인 ===\n')
        console.log(`제목: ${issue.title}`)
        console.log(`카테고리: ${issue.category} ✅`)
        console.log(`화력: ${issue.heat_index}점`)
        console.log('\n✅ 수정 완료!')
    }
}

fixSuspectedIssues().catch(console.error)
