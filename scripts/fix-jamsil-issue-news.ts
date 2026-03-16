/**
 * scripts/fix-jamsil-issue-news.ts
 * 
 * 잠실 스포츠 MICE 파크 이슈의 오연결된 뉴스 제거
 */

import dotenv from 'dotenv'
import { resolve } from 'path'
dotenv.config({ path: resolve(__dirname, '../.env.local') })

import { supabaseAdmin } from '../lib/supabase/server'

async function fixJamsilIssueNews() {
    console.log('=== 잠실 이슈 뉴스 오연결 제거 ===\n')

    const issueId = '37173edc-2554-458b-9c7e-e028d360e8e1'

    // 1. 이슈 정보 확인
    const { data: issue } = await supabaseAdmin
        .from('issues')
        .select('id, title, category')
        .eq('id', issueId)
        .single()

    if (!issue) {
        console.log('❌ 이슈를 찾을 수 없습니다.')
        return
    }

    console.log(`이슈: ${issue.title}`)
    console.log(`카테고리: ${issue.category}\n`)

    // 2. 현재 연결된 뉴스 확인
    const { data: linkedNews, count: linkedCount } = await supabaseAdmin
        .from('news_data')
        .select('id, title', { count: 'exact' })
        .eq('issue_id', issueId)

    console.log(`현재 연결된 뉴스: ${linkedCount}건\n`)

    if (linkedCount && linkedCount > 0 && linkedNews) {
        console.log('샘플 (처음 10건):')
        linkedNews.slice(0, 10).forEach((news, idx) => {
            console.log(`  ${idx + 1}. ${news.title.substring(0, 60)}...`)
        })
        console.log()
    }

    // 3. 모든 뉴스 연결 해제
    console.log('━'.repeat(80) + '\n')
    console.log('🔄 모든 뉴스 연결 해제 중...\n')

    const { error: unlinkError } = await supabaseAdmin
        .from('news_data')
        .update({ issue_id: null })
        .eq('issue_id', issueId)

    if (unlinkError) {
        console.error('❌ 연결 해제 실패:', unlinkError)
        return
    }

    console.log(`✅ ${linkedCount}건 연결 해제 완료\n`)

    // 4. 확인
    const { count: remainingCount } = await supabaseAdmin
        .from('news_data')
        .select('id', { count: 'exact', head: true })
        .eq('issue_id', issueId)

    console.log('━'.repeat(80) + '\n')
    console.log('📊 결과:\n')
    console.log(`  연결 해제: ${linkedCount}건`)
    console.log(`  남은 연결: ${remainingCount}건`)
    console.log()

    if (remainingCount === 0) {
        console.log('✅ 모든 오연결 제거 완료!')
        console.log()
        console.log('💡 다음 단계:')
        console.log('  1. 뉴스 자동 연결 cron 대기 (30분마다 실행)')
        console.log('  2. 또는 수동 실행: curl http://localhost:3000/api/cron/link-news')
        console.log('  3. AI 검증으로 관련 뉴스만 정확하게 연결됨')
    }
}

fixJamsilIssueNews().catch(console.error)
