/**
 * scripts/test_new_logic_fast.ts
 * 
 * 새로운 이슈 등록 로직 빠른 테스트 (AI 중복 체크 비활성화)
 */

import { supabaseAdmin } from '../lib/supabase/server'

async function main() {
    console.log('=== 환경변수 확인 ===\n')
    console.log(`- 최소 뉴스 건수: ${process.env.CANDIDATE_ALERT_THRESHOLD}건`)
    console.log(`- 최소 등록 화력: ${process.env.CANDIDATE_MIN_HEAT_TO_REGISTER}점`)
    console.log(`- 자동 승인 화력: ${process.env.CANDIDATE_AUTO_APPROVE_THRESHOLD}점`)
    console.log(`- AI 중복 체크: ${process.env.ENABLE_AI_DUPLICATE_CHECK}`)

    console.log('\n=== 미연결 데이터 확인 ===\n')
    
    const now = new Date()
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

    const { count: newsCount } = await supabaseAdmin
        .from('news_data')
        .select('*', { count: 'exact', head: true })
        .is('issue_id', null)
        .gte('created_at', since24h)

    console.log(`최근 24시간 내 미연결 뉴스: ${newsCount}건`)

    if ((newsCount ?? 0) < 5) {
        console.log('\n⚠️  미연결 뉴스가 5건 미만입니다. 테스트를 건너뜁니다.')
        return
    }

    console.log('\n=== API 직접 호출 테스트 ===\n')

    // AI 중복 체크 임시 비활성화
    const originalEnv = process.env.ENABLE_AI_DUPLICATE_CHECK
    process.env.ENABLE_AI_DUPLICATE_CHECK = 'false'

    const startTime = Date.now()
    const response = await fetch('http://localhost:3000/api/cron/auto-create-issue', {
        headers: {
            'Authorization': `Bearer ${process.env.CRON_SECRET || 'test'}`
        }
    })

    if (!response.ok) {
        console.log(`❌ API 호출 실패: ${response.status}`)
        console.log(await response.text())
        process.env.ENABLE_AI_DUPLICATE_CHECK = originalEnv
        return
    }

    const result = await response.json()
    const elapsed = Date.now() - startTime

    console.log('평가 결과:')
    console.log(`- 평가된 그룹: ${result.evaluated}개`)
    console.log(`- 자동 승인된 이슈: ${result.created}개`)
    console.log(`- 대기 등록된 이슈: ${result.alerts}개`)
    console.log(`- 소요 시간: ${elapsed}ms`)

    // 환경변수 복원
    process.env.ENABLE_AI_DUPLICATE_CHECK = originalEnv

    console.log('\n=== 새로 생성된 이슈 확인 ===\n')

    const testStartTime = new Date(startTime).toISOString()
    const { data: newIssues } = await supabaseAdmin
        .from('issues')
        .select('id, title, approval_status, status, heat_index, created_at')
        .gte('created_at', testStartTime)
        .order('heat_index', { ascending: false })

    if (newIssues && newIssues.length > 0) {
        console.log(`새로 생성된 이슈 ${newIssues.length}개:`)
        newIssues.forEach(i => {
            const heat = i.heat_index ?? 0
            const status = i.approval_status === '승인' ? '✅ 자동승인' : '⏳ 대기'
            console.log(`\n[${status}] ${i.title}`)
            console.log(`  - 화력: ${heat}점`)
            console.log(`  - 상태: ${i.status}`)
            
            // 검증
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

    console.log('\n테스트 완료!')
}

main().catch(err => {
    console.error('테스트 실패:', err)
    process.exit(1)
})
