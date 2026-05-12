/**
 * scripts/fix-beksang-shinheunbin-news.ts
 *
 * '백상예술대상 레드카펫 신현빈 넘어짐' 이슈에 오연결된 기사 정리
 *
 * 원인: cause-article-searcher가 "신현빈" 단독 키워드로 검색하여
 *       이슈 제목과 키워드 1개만 겹쳐도 연결 → 무관한 신현빈 기사 대량 유입
 *
 * 정리 기준: 이슈 제목 키워드와 2개 미만 겹치는 news_data를
 *            issue_id=null 처리 + timeline_points에서도 제거
 *
 * 실행 (dry-run): npx ts-node scripts/fix-beksang-shinheunbin-news.ts
 * 실행 (실제):    DRY_RUN=false npx ts-node scripts/fix-beksang-shinheunbin-news.ts
 */

import { createClient } from '@supabase/supabase-js'

const DRY_RUN = process.env.DRY_RUN !== 'false'

const supabase = createClient(
    'https://mdxshmfmcdcotteevwgi.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1keHNobWZtY2Rjb3R0ZWV2d2dpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTYyNzAyMCwiZXhwIjoyMDkxMjAzMDIwfQ.Eo354xCPQxr2XOdxwvQfu0X-E6d9cdm7lqSJP6DkcRM'
)

const STOPWORDS = new Set([
    '이', '가', '은', '는', '을', '를', '의', '에', '로', '으로', '와', '과', '이나', '나',
    '도', '만', '등', '및', '또', '그', '더', '이후', '관련', '대해', '위해', '따라',
    '통해', '대한', '위한', '같은', '지난', '현재', '오늘', '해당', '기자',
])

function extractKeywords(title: string): Set<string> {
    return new Set(
        title
            .split(/[\s\[\]()「」『』<>【】·,./…!?"']+/)
            .map((t: string) => t.trim())
            .filter((t: string) => t.length >= 2 && !STOPWORDS.has(t))
    )
}

async function main() {
    console.log(`\n=== 백상예술대상 신현빈 이슈 오연결 기사 정리 ===`)
    console.log(`모드: ${DRY_RUN ? '🔍 DRY RUN (실제 변경 없음)' : '🔧 실제 실행'}\n`)

    // 1. 이슈 찾기
    const { data: issues } = await supabase
        .from('issues')
        .select('id, title, status')
        .ilike('title', '%신현빈%')
        .ilike('title', '%백상%')

    if (!issues || issues.length === 0) {
        console.log('❌ 이슈를 찾을 수 없습니다. ("신현빈" + "백상" 포함 조건)')
        return
    }

    console.log(`찾은 이슈 (${issues.length}건):`)
    issues.forEach((i: { id: string; title: string; status: string }, idx: number) => {
        console.log(`  ${idx + 1}. [${i.status}] ${i.title} (${i.id})`)
    })
    console.log()

    const issue = issues[0] as { id: string; title: string; status: string }
    const issueTitleKeywords = extractKeywords(issue.title)
    console.log(`대상 이슈: "${issue.title}"`)
    console.log(`이슈 제목 키워드: ${[...issueTitleKeywords].join(', ')}\n`)

    // 2. 연결된 뉴스 전체 조회
    const { data: allNews } = await supabase
        .from('news_data')
        .select('id, title, link, published_at, source')
        .eq('issue_id', issue.id)
        .order('published_at', { ascending: true })

    if (!allNews || allNews.length === 0) {
        console.log('✅ 연결된 뉴스가 없습니다.')
        return
    }

    console.log(`연결된 뉴스 총 ${allNews.length}건\n`)

    // 3. 필터링: "신현빈"이 제목에 없는 기사는 무관 기사로 분류
    // (이 이슈의 핵심 인물이 신현빈이므로, 신현빈 미포함 기사는 오연결로 판단)
    const toKeep: typeof allNews = []
    const toUnlink: typeof allNews = []

    for (const news of allNews) {
        if ((news.title ?? '').includes('신현빈')) {
            toKeep.push(news)
        } else {
            toUnlink.push(news)
        }
    }

    console.log(`✅ 유지 (제목에 "신현빈" 포함): ${toKeep.length}건`)
    toKeep.forEach((n: { title: string }) => {
        console.log(`  ${n.title?.substring(0, 75)}`)
    })

    console.log(`\n❌ 제거 대상 (제목에 "신현빈" 없음): ${toUnlink.length}건`)
    toUnlink.forEach((n: { title: string }) => {
        console.log(`  ${n.title?.substring(0, 75)}`)
    })

    if (toUnlink.length === 0) {
        console.log('\n✅ 제거할 오연결 기사가 없습니다.')
        return
    }

    console.log('\n' + '─'.repeat(60))

    if (DRY_RUN) {
        console.log('\n🔍 DRY RUN 완료. 실제 적용하려면:')
        console.log('  DRY_RUN=false npx ts-node scripts/fix-beksang-shinheunbin-news.ts\n')
        return
    }

    // 4. 실제 제거
    const unlinkIds = toUnlink.map((n: { id: string }) => n.id)
    const unlinkLinks = toUnlink.map((n: { link: string }) => n.link).filter(Boolean)

    // 4-1. timeline_points 제거 (source_url 기준)
    if (unlinkLinks.length > 0) {
        const { error: tpError, count: tpCount } = await supabase
            .from('timeline_points')
            .delete({ count: 'exact' })
            .eq('issue_id', issue.id)
            .in('source_url', unlinkLinks)

        if (tpError) {
            console.error('❌ timeline_points 제거 실패:', tpError.message)
        } else {
            console.log(`✅ timeline_points 제거: ${tpCount ?? 0}건`)
        }
    }

    // 4-2. news_data issue_id 해제
    const { error: unlinkError } = await supabase
        .from('news_data')
        .update({ issue_id: null })
        .in('id', unlinkIds)

    if (unlinkError) {
        console.error('❌ news_data 연결 해제 실패:', unlinkError.message)
        return
    }

    console.log(`✅ news_data 연결 해제: ${toUnlink.length}건`)

    // 5. 최종 확인
    const { count: remainingCount } = await supabase
        .from('news_data')
        .select('id', { count: 'exact', head: true })
        .eq('issue_id', issue.id)

    console.log(`\n📊 최종 결과:`)
    console.log(`  이전 연결: ${allNews.length}건`)
    console.log(`  제거:      ${toUnlink.length}건`)
    console.log(`  남은 연결: ${remainingCount ?? toKeep.length}건`)
    console.log('\n✅ 정리 완료!')
}

main().catch(console.error)
