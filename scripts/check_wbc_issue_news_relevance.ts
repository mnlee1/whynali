/**
 * scripts/check_wbc_issue_news_relevance.ts
 * 
 * WBC 이슈에 연결된 뉴스가 실제로 관련이 있는지 확인
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabaseAdmin = createClient(supabaseUrl, supabaseKey)

async function main() {
    console.log('=== WBC 이슈 연결 뉴스 관련성 확인 ===\n')

    const issueId = 'e95ec64d-18ff-45e3-b56f-dd671f75876b'
    const issueTitle = '"WBC 점수 조작 죄송"…대만에서 \'혐한\' 마케팅 펼친 한국 기업'

    console.log(`이슈 제목: ${issueTitle}`)
    console.log()

    // 연결된 뉴스 조회
    const { data: newsData } = await supabaseAdmin
        .from('news_data')
        .select('id, title, published_at')
        .eq('issue_id', issueId)
        .order('published_at', { ascending: false })

    console.log(`[ 연결된 뉴스 ${newsData?.length || 0}개 ]`)
    console.log()

    if (newsData && newsData.length > 0) {
        let relevantCount = 0
        let irrelevantCount = 0

        newsData.forEach((news, idx) => {
            const isRelevant = 
                news.title.includes('대만') || 
                news.title.includes('혐한') || 
                news.title.includes('WBC') ||
                news.title.includes('월드베이스볼')

            if (isRelevant) {
                relevantCount++
                console.log(`✅ ${idx + 1}. ${news.title}`)
            } else {
                irrelevantCount++
                console.log(`❌ ${idx + 1}. ${news.title}`)
            }
            console.log(`    (${news.published_at})`)
            console.log()
        })

        console.log('[ 관련성 분석 ]')
        console.log(`관련 있음: ${relevantCount}개`)
        console.log(`관련 없음: ${irrelevantCount}개`)
        console.log()

        if (irrelevantCount > 0) {
            console.log('⚠️ 잘못 연결된 뉴스가 있습니다.')
            console.log('   → 트랙A 시스템의 키워드 매칭 오류 가능성')
            console.log('   → 또는 이슈 제목이 변경되었을 가능성')
            console.log()
            console.log('실제 유효한 화력:')
            console.log(`  기존 계산: ${newsData.length}점`)
            console.log(`  수정 계산: ${relevantCount}점 (관련 뉴스만)`)
            console.log()

            if (relevantCount < 15) {
                console.log(`✅ 해결: 관련 뉴스만 카운트하면 ${relevantCount}점 < 15점`)
                console.log('   → 자동 반려가 정상입니다.')
            } else {
                console.log(`⚠️ 의문: 관련 뉴스만 카운트해도 ${relevantCount}점 ≥ 15점`)
                console.log('   → 반려된 이유를 추가 조사 필요')
            }
        }
    }
}

main().catch(console.error)
