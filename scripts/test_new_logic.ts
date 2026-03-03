/**
 * scripts/test_new_logic.ts
 * 
 * 새로운 이슈 등록 로직 테스트
 */

import { supabaseAdmin } from '../lib/supabase/server'
import { evaluateCandidates } from '../lib/candidate/issue-candidate'

async function main() {
    console.log('=== 1단계: 현재 DB 상태 확인 ===\n')

    const { data: issues } = await supabaseAdmin
        .from('issues')
        .select('id, title, approval_status, status, heat_index, created_at')
        .order('created_at', { ascending: false })
        .limit(10)

    console.log('최근 10개 이슈:')
    if (issues && issues.length > 0) {
        issues.forEach(i => {
            const date = new Date(i.created_at).toLocaleString('ko-KR')
            console.log(`- [${i.approval_status}] ${i.status} | 화력 ${i.heat_index ?? 0}점 | ${i.title.substring(0, 40)}... (${date})`)
        })
    } else {
        console.log('- 이슈 없음')
    }

    console.log('\n=== 2단계: 미연결 수집 데이터 확인 ===\n')

    const now = new Date()
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

    const { count: newsCount } = await supabaseAdmin
        .from('news_data')
        .select('*', { count: 'exact', head: true })
        .is('issue_id', null)
        .gte('created_at', since24h)

    const { count: communityCount } = await supabaseAdmin
        .from('community_data')
        .select('*', { count: 'exact', head: true })
        .is('issue_id', null)
        .gte('created_at', since24h)

    console.log(`최근 24시간 내 미연결 뉴스: ${newsCount}건`)
    console.log(`최근 24시간 내 미연결 커뮤니티: ${communityCount}건`)

    if ((newsCount ?? 0) < 5) {
        console.log('\n⚠️  미연결 뉴스가 5건 미만입니다. 새로운 이슈가 생성되지 않을 수 있습니다.')
    }

    console.log('\n=== 3단계: 이슈 후보 평가 실행 ===\n')

    const startTime = Date.now()
    const result = await evaluateCandidates()
    const elapsed = Date.now() - startTime

    console.log('\n평가 결과:')
    console.log(`- 평가된 그룹: ${result.evaluated}개`)
    console.log(`- 자동 승인된 이슈: ${result.created}개`)
    console.log(`- 대기 등록된 이슈: ${result.alerts.length}개`)
    console.log(`- 소요 시간: ${elapsed}ms`)

    if (result.alerts.length > 0) {
        console.log('\n대기 이슈 목록:')
        result.alerts.forEach(alert => {
            console.log(`- ${alert.title.substring(0, 50)}... (뉴스 ${alert.newsCount}건, 커뮤니티 ${alert.communityCount}건)`)
        })
    }

    console.log('\n=== 4단계: 새로 생성된 이슈 확인 ===\n')

    const testStartTime = new Date(startTime).toISOString()
    const { data: newIssues } = await supabaseAdmin
        .from('issues')
        .select('id, title, approval_status, status, heat_index, created_at')
        .gte('created_at', testStartTime)
        .order('created_at', { ascending: false })

    if (newIssues && newIssues.length > 0) {
        console.log(`새로 생성된 이슈 ${newIssues.length}개:`)
        newIssues.forEach(i => {
            console.log(`- [${i.approval_status}] ${i.status} | 화력 ${i.heat_index ?? 0}점 | ${i.title}`)
            
            // 검증
            const heat = i.heat_index ?? 0
            if (heat < 10) {
                console.log('  ❌ 오류: 화력 10점 미만인데 등록됨!')
            } else if (heat >= 30 && i.approval_status === '대기') {
                console.log('  ⚠️  주의: 화력 30점 이상인데 자동 승인 안됨')
            } else {
                console.log('  ✅ 정상')
            }
        })
    } else {
        console.log('새로 생성된 이슈 없음')
    }

    console.log('\n=== 5단계: 환경변수 확인 ===\n')
    console.log('현재 설정된 기준:')
    console.log(`- 최소 뉴스 건수: ${process.env.CANDIDATE_ALERT_THRESHOLD ?? '5'}건`)
    console.log(`- 최소 등록 화력: ${process.env.CANDIDATE_MIN_HEAT_TO_REGISTER ?? '10'}점`)
    console.log(`- 자동 승인 화력: ${process.env.CANDIDATE_AUTO_APPROVE_THRESHOLD ?? '30'}점`)
    console.log(`- 논란중 전환 화력: ${process.env.STATUS_IGNITE_MIN_HEAT ?? '30'}점`)
    console.log(`- 논란중 전환 최소 커뮤니티: ${process.env.STATUS_DEBATE_MIN_COMMUNITY ?? '1'}건`)
    console.log(`- 점화 타임아웃: ${process.env.STATUS_IGNITE_TIMEOUT_HOURS ?? '24'}시간`)
    console.log(`- 종결 화력 기준: ${process.env.STATUS_CLOSED_MAX_HEAT ?? '10'}점 미만`)

    console.log('\n테스트 완료!')
}

main().catch(console.error)
