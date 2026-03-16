/**
 * scripts/analyze-pending-issues.ts
 * 
 * [대기 이슈 분석 스크립트]
 * 
 * 화력 점수가 높은데 타임라인과 뉴스가 연결되지 않은 대기 이슈를 분석합니다.
 */

import * as dotenv from 'dotenv'
import { resolve } from 'path'

// .env.local 로드
dotenv.config({ path: resolve(process.cwd(), '.env.local') })

import { supabaseAdmin } from '@/lib/supabase/server'

interface IssueAnalysis {
    id: string
    title: string
    category: string
    status: string
    approval_status: string
    heat_index: number
    created_at: string
    news_count: number
    timeline_count: number
    issue: string
}

async function analyzePendingIssues() {
    console.log('=== 대기 이슈 분석 시작 ===\n')

    // 1. 대기 상태 이슈 조회 (화력 점수 높은 순)
    const { data: pendingIssues, error: issueError } = await supabaseAdmin
        .from('issues')
        .select('id, title, category, status, approval_status, heat_index, created_at')
        .eq('approval_status', '대기')
        .eq('visibility_status', 'visible')
        .order('heat_index', { ascending: false })
        .limit(50)

    if (issueError) {
        console.error('이슈 조회 에러:', issueError)
        return
    }

    if (!pendingIssues || pendingIssues.length === 0) {
        console.log('대기 상태 이슈가 없습니다.')
        return
    }

    console.log(`대기 이슈 총 ${pendingIssues.length}건 발견\n`)

    const results: IssueAnalysis[] = []

    // 2. 각 이슈별 뉴스·타임라인 연결 상태 확인
    for (const issue of pendingIssues) {
        // 연결된 뉴스 수
        const { count: newsCount } = await supabaseAdmin
            .from('news_data')
            .select('id', { count: 'exact', head: true })
            .eq('issue_id', issue.id)

        // 타임라인 포인트 수
        const { count: timelineCount } = await supabaseAdmin
            .from('timeline_points')
            .select('id', { count: 'exact', head: true })
            .eq('issue_id', issue.id)

        results.push({
            ...issue,
            news_count: newsCount ?? 0,
            timeline_count: timelineCount ?? 0,
            issue: newsCount === 0 ? '뉴스 미연결' : timelineCount === 0 ? '타임라인 미생성' : '정상',
        })
    }

    // 3. 문제 케이스 필터링 및 출력
    const noNews = results.filter((r) => r.news_count === 0)
    const noTimeline = results.filter((r) => r.news_count > 0 && r.timeline_count === 0)
    const normal = results.filter((r) => r.news_count > 0 && r.timeline_count > 0)

    console.log('=== 분석 결과 요약 ===')
    console.log(`총 대기 이슈: ${results.length}건`)
    console.log(`- 뉴스 미연결: ${noNews.length}건`)
    console.log(`- 뉴스 연결됨 + 타임라인 미생성: ${noTimeline.length}건`)
    console.log(`- 정상 (뉴스·타임라인 모두 있음): ${normal.length}건\n`)

    // 4. 뉴스 미연결 케이스 (화력 점수 높은 순 상위 10개)
    if (noNews.length > 0) {
        console.log('=== 🔴 뉴스 미연결 이슈 (상위 10개) ===')
        noNews.slice(0, 10).forEach((item, idx) => {
            console.log(`\n${idx + 1}. [화력 ${item.heat_index}] ${item.title}`)
            console.log(`   ID: ${item.id}`)
            console.log(`   카테고리: ${item.category}`)
            console.log(`   상태: ${item.status}`)
            console.log(`   생성일: ${item.created_at}`)
            console.log(`   뉴스: ${item.news_count}건 / 타임라인: ${item.timeline_count}건`)
        })
        console.log('\n')
    }

    // 5. 타임라인 미생성 케이스 (화력 점수 높은 순 상위 10개)
    if (noTimeline.length > 0) {
        console.log('=== 🟡 타임라인 미생성 이슈 (상위 10개) ===')
        noTimeline.slice(0, 10).forEach((item, idx) => {
            console.log(`\n${idx + 1}. [화력 ${item.heat_index}] ${item.title}`)
            console.log(`   ID: ${item.id}`)
            console.log(`   카테고리: ${item.category}`)
            console.log(`   상태: ${item.status}`)
            console.log(`   생성일: ${item.created_at}`)
            console.log(`   뉴스: ${item.news_count}건 / 타임라인: ${item.timeline_count}건`)
        })
        console.log('\n')
    }

    // 6. 원인 분석
    console.log('=== 원인 분석 ===\n')

    if (noNews.length > 0) {
        console.log('🔴 뉴스 미연결 원인:')
        console.log('1. 키워드 매칭 실패')
        console.log('   - 이슈 제목과 뉴스 제목의 키워드 불일치')
        console.log('   - 임계값 70% 미달')
        console.log('')
        console.log('2. 카테고리 불일치')
        console.log('   - 이슈 카테고리와 뉴스 카테고리가 다름')
        console.log('')
        console.log('3. 날짜 범위 초과')
        console.log(`   - 이슈 생성일 기준 전 ${process.env.LINKER_NEWS_BEFORE_DAYS ?? 1}일 / 후 ${process.env.LINKER_NEWS_AFTER_DAYS ?? 2}일 벗어남`)
        console.log('')
        console.log('4. AI 검증 실패')
        console.log('   - AI가 관련도 70% 미만으로 판단')
        console.log('\n')
    }

    if (noTimeline.length > 0) {
        console.log('🟡 타임라인 미생성 원인:')
        console.log('1. Cron 미실행')
        console.log('   - auto-timeline Cron이 아직 실행되지 않음')
        console.log('')
        console.log('2. 뉴스 연결 후 대기 시간')
        console.log('   - 뉴스가 최근에 연결되어 타임라인 생성 대기 중')
        console.log('\n')
    }

    // 7. 해결 방법 제안
    console.log('=== 해결 방법 ===\n')

    if (noNews.length > 0) {
        console.log('🔴 뉴스 미연결 해결:')
        console.log('')
        console.log('1. 키워드 매칭 개선')
        console.log('   - 이슈 제목 개선: 핵심 키워드 포함')
        console.log('   - 불용어 제거 확인')
        console.log('')
        console.log('2. 날짜 범위 확대')
        console.log('   .env.local 설정:')
        console.log('   LINKER_NEWS_BEFORE_DAYS=30  # 현재: 1일')
        console.log('   LINKER_NEWS_AFTER_DAYS=30   # 현재: 2일')
        console.log('')
        console.log('3. 수동 뉴스 연결')
        console.log('   - 관리자 페이지에서 수동으로 연결')
        console.log('')
        console.log('4. Cron 수동 실행')
        console.log('   curl http://localhost:3000/api/cron/auto-link')
        console.log('\n')
    }

    if (noTimeline.length > 0) {
        console.log('🟡 타임라인 미생성 해결:')
        console.log('')
        console.log('1. Cron 수동 실행')
        console.log('   curl http://localhost:3000/api/cron/auto-timeline')
        console.log('')
        console.log('2. 자동 대기')
        console.log('   - 다음 Cron 주기에 자동 생성됨')
        console.log('\n')
    }

    // 8. 통계 출력
    console.log('=== 통계 ===\n')

    const avgHeatNoNews = noNews.length > 0 
        ? (noNews.reduce((sum, r) => sum + r.heat_index, 0) / noNews.length).toFixed(1)
        : 0
    const avgHeatNoTimeline = noTimeline.length > 0
        ? (noTimeline.reduce((sum, r) => sum + r.heat_index, 0) / noTimeline.length).toFixed(1)
        : 0
    const avgHeatNormal = normal.length > 0
        ? (normal.reduce((sum, r) => sum + r.heat_index, 0) / normal.length).toFixed(1)
        : 0

    console.log(`뉴스 미연결 이슈 평균 화력: ${avgHeatNoNews}`)
    console.log(`타임라인 미생성 이슈 평균 화력: ${avgHeatNoTimeline}`)
    console.log(`정상 이슈 평균 화력: ${avgHeatNormal}`)

    // 9. CSV 출력 (복사해서 엑셀로 분석 가능)
    console.log('\n=== CSV 출력 (엑셀 복사용) ===\n')
    console.log('제목,카테고리,화력,뉴스수,타임라인수,문제유형,생성일')
    results.forEach((r) => {
        console.log(`"${r.title}",${r.category},${r.heat_index},${r.news_count},${r.timeline_count},${r.issue},${r.created_at}`)
    })
}

analyzePendingIssues()
    .then(() => {
        console.log('\n=== 분석 완료 ===')
        process.exit(0)
    })
    .catch((error) => {
        console.error('분석 에러:', error)
        process.exit(1)
    })
