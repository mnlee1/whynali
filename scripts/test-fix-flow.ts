/**
 * scripts/test-fix-flow.ts
 *
 * [테스트] 오매칭 수정 플로우 검증
 *
 * 1. '[테스트] 국회의원 막말 논란 사과 거부' 이슈 확인
 * 2. 관련 뉴스 3건 + 무관한 뉴스 2건 news_data에 삽입 후 이슈에 연결
 * 3. update-timeline cron 호출 (로컬)
 * 4. 결과 확인: 무관한 뉴스(키워드 겹침 0)가 타임라인에서 제외됐는지 검증
 *
 * 실행: npx ts-node scripts/test-fix-flow.ts
 */

import { createClient } from '@supabase/supabase-js'

const DEV_URL = 'https://daiwwuofyqjhknidkois.supabase.co'
const DEV_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhaXd3dW9meXFqaGtuaWRrb2lzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTU4Mjg0MiwiZXhwIjoyMDkxMTU4ODQyfQ.UX4nEogflLOi303Qvr2qImkHfR6-TodB2oMfAByyUZ8'
const LOCAL_URL = 'http://localhost:3000'
const CRON_SECRET = 'local-test-secret-key'

const supabase = createClient(DEV_URL, DEV_SERVICE_KEY)

// 관련 뉴스 (이슈 제목 "국회의원 막말 논란 사과 거부"와 키워드 겹침 있음)
const RELATED_NEWS = [
    {
        title: '국회의원 막말 발언 파문, 야당 사과 촉구',
        link: 'https://test-news.example.com/news/1',
        source: 'test-news',
        published_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    },
    {
        title: '막말 논란 국회의원, 사과 거부 입장 고수',
        link: 'https://test-news.example.com/news/2',
        source: 'test-news',
        published_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    },
    {
        title: '국회의원 막말 논란 지역구 주민 반발 확산',
        link: 'https://test-news.example.com/news/3',
        source: 'test-news',
        published_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    },
]

// 무관한 뉴스 (이슈 제목과 키워드 겹침 0)
const UNRELATED_NEWS = [
    {
        title: '삼성전자 2분기 실적 발표, 반도체 부문 흑자 전환',
        link: 'https://test-news.example.com/news/4',
        source: 'test-news',
        published_at: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
    },
    {
        title: '아이유 새 앨범 발매, 팬들 뜨거운 반응',
        link: 'https://test-news.example.com/news/5',
        source: 'test-news',
        published_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    },
    {
        title: '손흥민 시즌 20호골 기록 달성',
        link: 'https://test-news.example.com/news/6',
        source: 'test-news',
        published_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    },
]

async function run() {
    console.log('=== 오매칭 수정 플로우 테스트 시작 ===\n')

    // 1. 이슈 조회
    const { data: issue } = await supabase
        .from('issues')
        .select('id, title, status, approval_status')
        .ilike('title', '%국회의원 막말 논란%')
        .single()

    if (!issue) {
        console.error('❌ 이슈를 찾을 수 없습니다. 이슈 제목을 확인해주세요.')
        process.exit(1)
    }

    console.log(`✓ 이슈 확인: "${issue.title}"`)
    console.log(`  ID: ${issue.id}`)
    console.log(`  상태: ${issue.status} / 승인: ${issue.approval_status}\n`)

    // 이슈가 점화 상태여야 update-timeline cron 대상이 됨
    if (issue.status !== '점화' && issue.status !== '논란중') {
        console.log(`⚠️  이슈 상태가 '${issue.status}'입니다. update-timeline은 점화/논란중만 처리합니다.`)
        console.log('   상태를 점화로 변경합니다...')
        await supabase
            .from('issues')
            .update({ status: '점화', approval_status: '승인' })
            .eq('id', issue.id)
        console.log('   ✓ 점화/승인 처리 완료\n')
    }

    // 2. 기존 테스트 데이터 정리
    console.log('이전 테스트 데이터 정리 중...')
    await supabase.from('timeline_points').delete().eq('issue_id', issue.id)
    await supabase.from('timeline_summaries').delete().eq('issue_id', issue.id)
    await supabase.from('news_data').delete().in('link', [
        ...RELATED_NEWS.map(n => n.link),
        ...UNRELATED_NEWS.map(n => n.link),
    ])
    console.log('✓ 정리 완료\n')

    // 3. 테스트 뉴스 삽입 후 이슈에 연결
    console.log('테스트 뉴스 삽입 중...')

    const { data: insertedRelated } = await supabase
        .from('news_data')
        .insert(RELATED_NEWS.map(n => ({ ...n, issue_id: issue.id })))
        .select('id, title')

    const { data: insertedUnrelated } = await supabase
        .from('news_data')
        .insert(UNRELATED_NEWS.map(n => ({ ...n, issue_id: issue.id })))
        .select('id, title')

    console.log(`✓ 관련 뉴스 ${insertedRelated?.length ?? 0}건 연결:`)
    insertedRelated?.forEach(n => console.log(`   - ${n.title}`))
    console.log(`✓ 무관한 뉴스 ${insertedUnrelated?.length ?? 0}건 연결 (이것들이 제외되어야 함):`)
    insertedUnrelated?.forEach(n => console.log(`   - ${n.title}`))
    console.log()

    // 4. update-timeline cron 호출
    console.log('update-timeline cron 호출 중...')
    const cronRes = await fetch(`${LOCAL_URL}/api/cron/update-timeline`, {
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
    })

    if (!cronRes.ok) {
        const text = await cronRes.text()
        console.error(`❌ cron 호출 실패 (${cronRes.status}): ${text}`)
        process.exit(1)
    }

    const cronData = await cronRes.json()
    console.log('✓ cron 완료:', cronData, '\n')

    // 5. 결과 확인
    await new Promise(r => setTimeout(r, 2000))

    const { data: timelinePoints } = await supabase
        .from('timeline_points')
        .select('id, title, stage, source_url')
        .eq('issue_id', issue.id)
        .order('occurred_at', { ascending: true })

    console.log(`=== 타임라인 포인트 결과 (총 ${timelinePoints?.length ?? 0}건) ===`)

    const relatedLinks = new Set(RELATED_NEWS.map(n => n.link))
    const unrelatedLinks = new Set(UNRELATED_NEWS.map(n => n.link))

    let pass = true
    timelinePoints?.forEach(p => {
        const isRelated = relatedLinks.has(p.source_url)
        const isUnrelated = unrelatedLinks.has(p.source_url)
        const tag = isRelated ? '✓ 관련' : isUnrelated ? '❌ 무관 (버그!)' : '? 기타'
        console.log(`  [${p.stage}] ${tag} — ${p.title}`)
        if (isUnrelated) pass = false
    })

    const unrelatedInTimeline = timelinePoints?.filter(p => unrelatedLinks.has(p.source_url)) ?? []
    const relatedInTimeline = timelinePoints?.filter(p => relatedLinks.has(p.source_url)) ?? []

    console.log()
    console.log(`관련 뉴스 타임라인 추가: ${relatedInTimeline.length}/${RELATED_NEWS.length}건`)
    console.log(`무관한 뉴스 타임라인 추가: ${unrelatedInTimeline.length}/${UNRELATED_NEWS.length}건 (0이어야 정상)`)
    console.log()

    if (pass && unrelatedInTimeline.length === 0) {
        console.log('✅ 테스트 통과: 무관한 뉴스가 타임라인에 추가되지 않았습니다.')
    } else {
        console.log('❌ 테스트 실패: 무관한 뉴스가 타임라인에 포함됐습니다.')
    }

    console.log(`\n로컬에서 확인: http://localhost:3000/issue/${issue.id}`)
}

run().then(() => process.exit(0)).catch(err => {
    console.error('스크립트 오류:', err)
    process.exit(1)
})
