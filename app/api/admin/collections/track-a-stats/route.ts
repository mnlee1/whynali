/**
 * app/api/admin/collections/track-a-stats/route.ts
 *
 * [관리자 - 트랙A 시스템 모니터링 통계 API]
 *
 * 트랙A 프로세스의 상태, 실행 이력, 경고 등을 제공합니다.
 */

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

interface TrackAStats {
    lastRun: {
        timestamp: string | null
        nextRun: string
        status: 'success' | 'error' | 'unknown'
        minutesAgo: number | null
    }
    last24h: {
        issuesCreated: number
        trackAIssues: number
        manualIssues: number
        trackAPercentage: number
    }
    communityCollection: {
        lastCollected: string | null
        last24h: number
        last3h: number
        status: 'active' | 'warning' | 'stopped'
        minutesAgo: number | null
    }
    warnings: Array<{
        type: 'critical' | 'warning' | 'info'
        message: string
        details?: string
    }>
    diagnostics: {
        possibleCauses: string[]
        recommendations: string[]
    }
}

export async function GET() {
    try {
        const now = new Date()
        const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
        const last3h = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString()

        // 1. 최근 24시간 이슈 생성 통계
        const { data: issuesData } = await supabaseAdmin
            .from('issues')
            .select('id, source_track, created_at')
            .gte('created_at', last24h)
            .eq('approval_status', '승인')

        const trackAIssues = issuesData?.filter(i => i.source_track === 'track_a').length ?? 0
        const manualIssues = issuesData?.filter(i => i.source_track === 'manual').length ?? 0
        const totalIssues = trackAIssues + manualIssues
        const trackAPercentage = totalIssues > 0 ? Math.round((trackAIssues / totalIssues) * 100) : 0

        // 2. 커뮤니티 수집 상태
        // created_at은 최초 삽입 시간이므로, 수집 cron이 정상 실행돼도 기존 URL 업데이트 시 변하지 않음
        // → updated_at(upsert 시마다 갱신)을 기준으로 판단
        const { data: communityData } = await supabaseAdmin
            .from('community_data')
            .select('updated_at')
            .order('updated_at', { ascending: false })
            .limit(1)
            .single()

        const { count: communityLast24h } = await supabaseAdmin
            .from('community_data')
            .select('id', { count: 'exact', head: true })
            .gte('updated_at', last24h)

        const { count: communityLast3h } = await supabaseAdmin
            .from('community_data')
            .select('id', { count: 'exact', head: true })
            .gte('updated_at', last3h)

        const lastCollected = communityData?.updated_at ?? null
        const minutesSinceCollection = lastCollected
            ? Math.floor((now.getTime() - new Date(lastCollected).getTime()) / 60000)
            : null

        // 커뮤니티 수집 상태 판단
        // GitHub Actions 스케줄 지연으로 실제 실행 간격이 1~3분임을 반영
        // warning: 5분 초과 (지연이 비정상적으로 긴 상태)
        // stopped: 15분 초과 (명백한 중단)
        let communityStatus: 'active' | 'warning' | 'stopped' = 'active'
        if (minutesSinceCollection !== null) {
            if (minutesSinceCollection > 15) communityStatus = 'stopped'
            else if (minutesSinceCollection > 5) communityStatus = 'warning'
        }

        // 3. 트랙A 마지막 실행 시간 추정 (최근 생성된 트랙A 이슈)
        const { data: latestTrackAIssue } = await supabaseAdmin
            .from('issues')
            .select('created_at')
            .eq('source_track', 'track_a')
            .order('created_at', { ascending: false })
            .limit(1)
            .single()

        const lastRunTimestamp = latestTrackAIssue?.created_at ?? null
        const minutesSinceRun = lastRunTimestamp
            ? Math.floor((now.getTime() - new Date(lastRunTimestamp).getTime()) / 60000)
            : null

        // 트랙A 다음 실행 시간 (10분 주기)
        const nextRunMinutes = lastRunTimestamp
            ? 10 - (minutesSinceRun! % 10)
            : 10
        const nextRun = new Date(now.getTime() + nextRunMinutes * 60 * 1000)

        // 4. 경고 생성 및 진단
        const warnings: TrackAStats['warnings'] = []
        const possibleCauses: string[] = []
        const recommendations: string[] = []

        // 커뮤니티 수집 경고 + 진단
        if (communityStatus === 'stopped') {
            warnings.push({
                type: 'critical',
                message: `커뮤니티 수집이 ${minutesSinceCollection}분간 중단되었습니다`,
                details: 'GitHub Actions 정상 지연(1~3분)을 초과한 15분 이상 수집 없음',
            })
            
            possibleCauses.push(
                '⚠️ 가장 가능성 높은 원인:',
                '→ GitHub Actions 크론이 feature 브랜치에서 실행 안 됨',
                '   (크론은 main/develop 브랜치에서만 실행)',
                '',
                '기타 가능한 원인:',
                '1. GitHub Actions 워크플로우 비활성화',
                '   → GitHub Actions 탭에서 "커뮤니티 수집 Cron" 상태 확인',
                '2. Vercel 배포 URL 불일치',
                '   → develop: dev-whynali.vercel.app',
                '   → main: whynali.vercel.app',
                '3. CRON_SECRET 환경변수 미설정',
                '4. 더쿠/네이트판 사이트 접속 차단'
            )
            
            recommendations.push(
                '✅ 즉시 해결 방법:',
                '1. develop 브랜치로 체크아웃',
                '   → git checkout develop',
                '   → git pull origin develop',
                '2. develop 브랜치에 푸시',
                '   → git push origin develop',
                '',
                '📍 또는 수동 실행:',
                '1. GitHub → Actions 탭',
                '2. "커뮤니티 수집 Cron" 선택',
                '3. "Run workflow" 클릭',
                '4. 브랜치: develop 또는 main 선택',
                '',
                '🔍 feature 브랜치에서 테스트:',
                '1. 로컬에서 실행',
                '   → npm run dev',
                '   → curl http://localhost:3000/api/cron/collect-community'
            )
        } else if (communityStatus === 'warning') {
            warnings.push({
                type: 'warning',
                message: `커뮤니티 수집이 ${minutesSinceCollection}분간 없습니다`,
                details: 'GitHub Actions 지연이 비정상적으로 긴 상태 (정상: 1~3분)',
            })
            
            possibleCauses.push(
                '1. 크론 실행 지연 (GitHub Actions 트래픽)',
                '2. 커뮤니티 사이트 일시적 느림'
            )
        }

        // 트랙A 이슈 생성 경고
        if (minutesSinceRun && minutesSinceRun > 180) {
            warnings.push({
                type: 'warning',
                message: `트랙A 이슈 생성이 ${Math.floor(minutesSinceRun / 60)}시간 없습니다`,
            })
        }

        // 트랙A 비율 경고
        if (totalIssues > 0 && trackAPercentage < 20) {
            warnings.push({
                type: 'warning',
                message: `트랙A 이슈 비율이 ${trackAPercentage}%로 낮습니다 (권장: 20% 이상)`,
                details: '커뮤니티 급증 감지가 적거나 AI가 보수적으로 판단 중',
            })
            
            if (possibleCauses.length === 0) {
                possibleCauses.push(
                    '1. 커뮤니티 글이 적음 (급증 감지 어려움)',
                    '2. Groq AI가 "진짜 이슈 아님"으로 판단',
                    '3. 네이버 뉴스 검색 실패 (뉴스 0건)'
                )
                
                recommendations.push(
                    '1. docs/99_트랙A_즉시개선_가이드.md 참고',
                    '2. 임계값 완화 검토 (COMMUNITY_BURST_THRESHOLD)',
                    '3. 트랙A 로그 확인'
                )
            }
        }

        // 5. 응답 구성
        const stats: TrackAStats = {
            lastRun: {
                timestamp: lastRunTimestamp,
                nextRun: nextRun.toISOString(),
                status: lastRunTimestamp ? 'success' : 'unknown',
                minutesAgo: minutesSinceRun,
            },
            last24h: {
                issuesCreated: totalIssues,
                trackAIssues,
                manualIssues,
                trackAPercentage,
            },
            communityCollection: {
                lastCollected,
                last24h: communityLast24h ?? 0,
                last3h: communityLast3h ?? 0,
                status: communityStatus,
                minutesAgo: minutesSinceCollection,
            },
            warnings,
            diagnostics: {
                possibleCauses,
                recommendations,
            },
        }

        return NextResponse.json(stats)
    } catch (error) {
        console.error('트랙A 통계 조회 에러:', error)
        return NextResponse.json(
            { error: 'STATS_ERROR', message: '통계 조회 실패' },
            { status: 500 }
        )
    }
}
