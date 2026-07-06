/**
 * scripts/monitor_track_a_health.ts
 * 
 * [트랙A 크론 헬스 체크 및 모니터링]
 * 
 * 트랙A 크론이 정상적으로 작동하는지 종합 점검합니다:
 * 1. 최근 실행 기록 확인 (30분마다 실행되어야 함)
 * 2. 생성된 이슈 통계 (시간대별, 일별)
 * 3. 커뮤니티 데이터 수집 상태
 * 4. AI API 상태 (Rate Limit, 실패율)
 * 5. 성공률 및 실패 원인 분석
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

interface CronExecutionLog {
    timestamp: string
    success: number
    failed: number
    total_bursts: number
    rate_limit_hit: boolean
}

async function monitorTrackAHealth() {
    console.log('═'.repeat(80))
    console.log('트랙A 크론 헬스 체크')
    console.log('═'.repeat(80))
    console.log('')

    const now = new Date()
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    // 1. 최근 24시간 트랙A 이슈 생성 통계
    console.log('1️⃣  최근 24시간 트랙A 이슈 생성')
    console.log('─'.repeat(80))

    const { data: recentTrackA, error: recentError } = await supabase
        .from('issues')
        .select('*')
        .eq('source_track', 'track_a')
        .gte('created_at', last24Hours.toISOString())
        .order('created_at', { ascending: false })

    if (recentError) {
        console.error('❌ 조회 실패:', recentError)
    } else {
        const count = recentTrackA?.length ?? 0
        console.log(`생성된 이슈: ${count}개`)
        
        if (count === 0) {
            console.log('⚠️  경고: 최근 24시간 동안 트랙A 이슈가 생성되지 않았습니다!')
        } else {
            console.log('\n최근 생성 이슈:')
            recentTrackA?.slice(0, 5).forEach((issue, idx) => {
                console.log(`  ${idx + 1}. ${issue.title.substring(0, 60)}`)
                console.log(`     생성: ${issue.created_at}, 화력: ${issue.heat_index ?? 0}`)
            })
        }
    }

    // 2. 최근 24시간 track_a_logs 실행 분석
    console.log('')
    console.log('2️⃣  최근 24시간 트랙A 실행 로그 분석')
    console.log('─'.repeat(80))

    const { data: recentLogs } = await supabase
        .from('track_a_logs')
        .select('keyword, burst_count, result, details, run_at')
        .gte('run_at', last24Hours.toISOString())
        .order('run_at', { ascending: false })

    const RESULT_LABELS: Record<string, string> = {
        issue_created:    '이슈 등록',
        auto_approved:    '자동 승인',
        ai_rejected:      'AI 거부',
        no_news:          '뉴스 없음',
        no_community:     '커뮤니티 없음',
        duplicate_linked: '기존 이슈 중복',
        derivative_linked:'파생 이벤트 연결',
        heat_too_low:     '화력 부족',
        no_timeline:      '타임라인 없음',
        no_news_linked:   '뉴스 연결 실패',
        validation_failed:'검증 실패',
        rate_limited:     'Rate Limit',
        error:            '에러',
    }

    const SUCCESS_RESULTS = new Set(['issue_created', 'auto_approved', 'derivative_linked'])

    if (!recentLogs || recentLogs.length === 0) {
        console.log('트랙A 실행 기록 없음 — 크론 미실행 또는 급증 키워드 없음')
    } else {
        const lastRun = new Date(recentLogs[0].run_at)
        const lastRunMinutesAgo = Math.floor((now.getTime() - lastRun.getTime()) / 60000)
        console.log(`마지막 실행: ${lastRunMinutesAgo}분 전 (${lastRun.toLocaleString('ko-KR')})`)

        if (lastRunMinutesAgo > 60) {
            console.log('경고: 트랙A 크론이 1시간 이상 실행되지 않았습니다!')
        }

        const resultCounts: Record<string, number> = {}
        recentLogs.forEach(log => {
            resultCounts[log.result] = (resultCounts[log.result] ?? 0) + 1
        })

        console.log(`\n총 처리: ${recentLogs.length}건`)
        console.log('결과 분포:')
        Object.entries(resultCounts)
            .sort((a, b) => b[1] - a[1])
            .forEach(([result, count]) => {
                const label = RESULT_LABELS[result] ?? result
                const marker = SUCCESS_RESULTS.has(result) ? '[성공]' : '[실패]'
                console.log(`  ${marker} ${label}: ${count}건`)
            })

        const failSamples = recentLogs
            .filter(l => ['ai_rejected', 'error', 'rate_limited', 'no_timeline', 'heat_too_low'].includes(l.result))
            .slice(0, 5)

        if (failSamples.length > 0) {
            console.log('\n주요 실패 사례:')
            failSamples.forEach(log => {
                const reason = (log.details as any)?.reason ?? (log.details as any)?.error ?? ''
                const reasonStr = reason ? `: ${String(reason).slice(0, 80)}` : ''
                console.log(`  - "${log.keyword}" → ${RESULT_LABELS[log.result] ?? log.result}${reasonStr}`)
            })
        }
    }

    // 3. 7일간 트랙A 이슈 트렌드
    console.log('')
    console.log('3️⃣  최근 7일간 트랙A 이슈 트렌드')
    console.log('─'.repeat(80))

    const { data: weeklyTrackA } = await supabase
        .from('issues')
        .select('created_at')
        .eq('source_track', 'track_a')
        .gte('created_at', last7Days.toISOString())
        .order('created_at', { ascending: true })

    if (weeklyTrackA && weeklyTrackA.length > 0) {
        // 일별 카운트
        const dailyCount: Record<string, number> = {}
        weeklyTrackA.forEach(issue => {
            const date = issue.created_at.split('T')[0]
            dailyCount[date] = (dailyCount[date] || 0) + 1
        })

        console.log('일별 생성 개수:')
        Object.entries(dailyCount)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .forEach(([date, count]) => {
                const bar = '█'.repeat(Math.min(count, 50))
                console.log(`  ${date}: ${bar} ${count}개`)
            })

        const avgPerDay = (weeklyTrackA.length / 7).toFixed(1)
        console.log(`\n평균: 하루 ${avgPerDay}개`)

        if (parseFloat(avgPerDay) < 1) {
            console.log('⚠️  경고: 평균 생성률이 하루 1개 미만입니다!')
        }
    } else {
        console.log('⚠️  최근 7일간 트랙A 이슈가 없습니다!')
    }

    // 4. 커뮤니티 데이터 수집 상태
    console.log('')
    console.log('4️⃣  커뮤니티 데이터 수집 상태')
    console.log('─'.repeat(80))

    const { data: recentCommunity } = await supabase
        .from('community_data')
        .select('source_site, created_at')
        .gte('created_at', last24Hours.toISOString())
        .order('created_at', { ascending: false })

    if (recentCommunity && recentCommunity.length > 0) {
        const bySite: Record<string, number> = {}
        recentCommunity.forEach(c => {
            bySite[c.source_site] = (bySite[c.source_site] || 0) + 1
        })

        console.log(`최근 24시간 수집: ${recentCommunity.length}건`)
        Object.entries(bySite).forEach(([site, count]) => {
            console.log(`  - ${site}: ${count}건`)
        })

        // 최근 수집 시간
        const lastCollected = new Date(recentCommunity[0].created_at)
        const minutesAgo = Math.floor((now.getTime() - lastCollected.getTime()) / 60000)
        console.log(`\n마지막 수집: ${minutesAgo}분 전`)

        if (minutesAgo > 60) {
            console.log('⚠️  경고: 커뮤니티 데이터가 1시간 이상 수집되지 않았습니다!')
        }
    } else {
        console.log('❌ 최근 24시간 동안 커뮤니티 데이터가 수집되지 않았습니다!')
        console.log('   → 커뮤니티 수집 크론이 중단되었을 가능성이 높습니다.')
    }

    // 5. AI API 상태 (Rate Limit)
    console.log('')
    console.log('5️⃣  AI API 상태')
    console.log('─'.repeat(80))

    const { data: aiStatus } = await supabase
        .from('ai_key_status')
        .select('*')
        .eq('provider', 'groq')

    if (aiStatus && aiStatus.length > 0) {
        const blocked = aiStatus.filter(k => k.is_blocked)
        const available = aiStatus.filter(k => !k.is_blocked)

        console.log(`Groq API 키 상태:`)
        console.log(`  - 사용 가능: ${available.length}개`)
        console.log(`  - 차단됨: ${blocked.length}개`)

        if (blocked.length > 0) {
            console.log('\n차단된 키:')
            blocked.forEach(k => {
                const until = k.blocked_until ? new Date(k.blocked_until) : null
                const untilStr = until ? until.toLocaleString('ko-KR') : 'N/A'
                console.log(`  - ${k.key_hash.substring(0, 8)}... (해제: ${untilStr})`)
            })
        }

        if (available.length === 0) {
            console.log('\n❌ 치명적: 사용 가능한 Groq API 키가 없습니다!')
            console.log('   → 트랙A 크론이 작동하지 않을 수 있습니다.')
        }
    } else {
        console.log('API 키 상태 정보가 없습니다. (첫 실행일 수 있음)')
    }

    // 6. 트랙A 이슈의 커뮤니티/뉴스 연결 품질
    console.log('')
    console.log('6️⃣  트랙A 이슈 품질 검증')
    console.log('─'.repeat(80))

    const { data: allTrackA } = await supabase
        .from('issues')
        .select('id, title, created_at')
        .eq('source_track', 'track_a')
        .gte('created_at', last7Days.toISOString())

    if (allTrackA && allTrackA.length > 0) {
        let withCommunity = 0
        let withNews = 0
        let complete = 0

        for (const issue of allTrackA) {
            const { count: commCount } = await supabase
                .from('community_data')
                .select('*', { count: 'exact', head: true })
                .eq('issue_id', issue.id)

            const { count: newsCount } = await supabase
                .from('news_data')
                .select('*', { count: 'exact', head: true })
                .eq('issue_id', issue.id)

            if ((commCount ?? 0) > 0) withCommunity++
            if ((newsCount ?? 0) > 0) withNews++
            if ((commCount ?? 0) > 0 && (newsCount ?? 0) > 0) complete++
        }

        const total = allTrackA.length
        console.log(`최근 7일 트랙A 이슈: ${total}개`)
        console.log(`  - 커뮤니티 연결: ${withCommunity}개 (${((withCommunity / total) * 100).toFixed(1)}%)`)
        console.log(`  - 뉴스 연결: ${withNews}개 (${((withNews / total) * 100).toFixed(1)}%)`)
        console.log(`  - 완전 연결: ${complete}개 (${((complete / total) * 100).toFixed(1)}%)`)

        const qualityScore = (complete / total) * 100
        if (qualityScore < 80) {
            console.log(`\n⚠️  경고: 완전 연결 비율이 ${qualityScore.toFixed(1)}%로 낮습니다. (목표: 80% 이상)`)
        } else {
            console.log(`\n✅ 양호: 완전 연결 비율 ${qualityScore.toFixed(1)}%`)
        }
    }

    // 6. 종합 판단 및 권장 조치
    console.log('')
    console.log('═'.repeat(80))
    console.log('종합 판단')
    console.log('═'.repeat(80))

    const issues: string[] = []
    const recommendations: string[] = []

    // 최근 24시간 이슈 생성 체크
    const recent24Count = recentTrackA?.length ?? 0
    if (recent24Count === 0) {
        issues.push('최근 24시간 동안 트랙A 이슈가 생성되지 않음')

        // track_a_logs 기반 실패 원인 분석
        if (!recentLogs || recentLogs.length === 0) {
            recommendations.push('트랙A 크론 자체가 실행되지 않음 — Vercel 크론 스케줄 확인')
        } else {
            const resultCounts: Record<string, number> = {}
            recentLogs.forEach(log => {
                resultCounts[log.result] = (resultCounts[log.result] ?? 0) + 1
            })
            const topFailure = Object.entries(resultCounts)
                .filter(([r]) => !SUCCESS_RESULTS.has(r))
                .sort((a, b) => b[1] - a[1])[0]

            if (topFailure) {
                const [result, count] = topFailure
                const label = RESULT_LABELS[result] ?? result
                recommendations.push(`주요 실패 원인: ${label} (${count}건) — 상세 로그 확인`)
            }

            if ((resultCounts['ai_rejected'] ?? 0) > 0) {
                recommendations.push('AI 거부 다수 — Claude 예산 소진 여부 및 폴백 모델 동작 확인')
            }
            if ((resultCounts['heat_too_low'] ?? 0) > 0) {
                recommendations.push('화력 부족 다수 — CANDIDATE_MIN_HEAT_TO_REGISTER 임계값 조정 검토')
            }
            if ((resultCounts['no_news'] ?? 0) > 0) {
                recommendations.push('뉴스 없음 다수 — 네이버 뉴스 API 상태 및 검색 키워드 품질 확인')
            }
            if ((resultCounts['rate_limited'] ?? 0) > 0) {
                recommendations.push('Rate Limit 발생 — Groq API 키 추가 또는 호출 간격 조정')
            }
        }

        recommendations.push('관리자 대시보드 /admin/collections → 이슈 자동화 로그 탭 확인')
    } else if (recent24Count < 2) {
        issues.push('트랙A 이슈 생성률이 매우 낮음 (24시간 기준 2개 미만)')
        recommendations.push('커뮤니티 급증 감지 임계값 조정 검토')
        recommendations.push('AI 검증 로직이 너무 엄격한지 확인')
    }

    // 커뮤니티 수집 체크
    if (!recentCommunity || recentCommunity.length === 0) {
        issues.push('커뮤니티 데이터 수집 중단')
        recommendations.push('커뮤니티 수집 크론 즉시 재시작 필요')
    }

    // AI API 상태 체크
    const availableKeys = aiStatus?.filter(k => !k.is_blocked).length ?? 0
    if (availableKeys === 0) {
        issues.push('사용 가능한 Groq API 키가 없음')
        recommendations.push('새 API 키 발급 또는 기존 키 해제 대기')
    }

    if (issues.length === 0) {
        console.log('✅ 트랙A 시스템이 정상 작동 중입니다.')
    } else {
        console.log('⚠️  발견된 문제:')
        issues.forEach((issue, idx) => {
            console.log(`  ${idx + 1}. ${issue}`)
        })

        console.log('\n💡 권장 조치:')
        recommendations.forEach((rec, idx) => {
            console.log(`  ${idx + 1}. ${rec}`)
        })
    }

    console.log('')
    console.log('═'.repeat(80))
}

monitorTrackAHealth().catch(console.error)
