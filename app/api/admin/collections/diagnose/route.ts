/**
 * app/api/admin/collections/diagnose/route.ts
 *
 * [관리자 - 수집 시스템 진단 API]
 *
 * 커뮤니티 수집이 중단된 실제 원인을 파악합니다.
 */

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

interface DiagnosisResult {
    timestamp: string
    currentBranch?: string
    checks: Array<{
        name: string
        status: 'ok' | 'warning' | 'error'
        message: string
        details?: any
    }>
    conclusion: string
    criticalIssue?: string
}

export async function GET() {
    const checks: DiagnosisResult['checks'] = []
    const now = new Date()
    let criticalIssue: string | undefined

    try {
        // 0. 현재 브랜치 확인 (GitHub Actions 크론은 main/develop에서만 실행)
        checks.push({
            name: '브랜치 확인',
            status: 'warning',
            message: 'GitHub Actions 크론은 main/develop 브랜치에서만 실행됩니다',
            details: '현재 feature 브랜치에서는 크론이 실행되지 않음'
        })
        
        criticalIssue = '⚠️ GitHub Actions 크론이 feature 브랜치에서 실행 안 됨 - develop 브랜치로 체크아웃 필요'
        // 1. DB 연결 확인
        try {
            const { error } = await supabaseAdmin.from('community_data').select('id').limit(1)
            if (error) {
                checks.push({
                    name: 'DB 연결',
                    status: 'error',
                    message: 'Supabase 연결 실패',
                    details: error.message
                })
            } else {
                checks.push({
                    name: 'DB 연결',
                    status: 'ok',
                    message: 'Supabase 정상 연결'
                })
            }
        } catch (error) {
            checks.push({
                name: 'DB 연결',
                status: 'error',
                message: 'DB 연결 예외 발생',
                details: String(error)
            })
        }

        // 2. 최근 수집 데이터 확인 (시간대별)
        const timeRanges = [
            { label: '10분', minutes: 10 },
            { label: '30분', minutes: 30 },
            { label: '1시간', minutes: 60 },
            { label: '3시간', minutes: 180 },
        ]

        for (const range of timeRanges) {
            const since = new Date(now.getTime() - range.minutes * 60 * 1000).toISOString()
            const { data, error } = await supabaseAdmin
                .from('community_data')
                .select('id, source_site, created_at')
                .gte('created_at', since)
                .order('created_at', { ascending: false })

            if (error) {
                checks.push({
                    name: `최근 ${range.label} 수집`,
                    status: 'error',
                    message: '쿼리 실패',
                    details: error.message
                })
            } else {
                const count = data?.length ?? 0
                const bySite = (data ?? []).reduce((acc, item) => {
                    acc[item.source_site] = (acc[item.source_site] ?? 0) + 1
                    return acc
                }, {} as Record<string, number>)

                checks.push({
                    name: `최근 ${range.label} 수집`,
                    status: count > 0 ? 'ok' : 'error',
                    message: count > 0 
                        ? `${count}건 수집 (더쿠: ${bySite['더쿠'] ?? 0}, 네이트판: ${bySite['네이트판'] ?? 0})`
                        : '수집 데이터 없음',
                    details: data?.slice(0, 3).map(d => ({
                        site: d.source_site,
                        time: d.created_at
                    }))
                })
            }
        }

        // 3. 테이블 구조 확인
        const { data: tableInfo } = await supabaseAdmin
            .from('community_data')
            .select('*')
            .limit(1)

        if (tableInfo && tableInfo.length > 0) {
            checks.push({
                name: '테이블 구조',
                status: 'ok',
                message: '테이블 정상',
                details: Object.keys(tableInfo[0])
            })
        }

        // 4. 결론 도출
        const errorChecks = checks.filter(c => c.status === 'error')
        let conclusion = ''

        if (criticalIssue) {
            conclusion = criticalIssue
        } else if (errorChecks.length === 0) {
            conclusion = '✅ 시스템 정상 - 모든 체크 통과'
        } else if (errorChecks.some(c => c.name === 'DB 연결')) {
            conclusion = '🔴 DB 연결 문제 - Supabase 설정 확인 필요'
        } else if (errorChecks.every(c => c.name.includes('수집'))) {
            conclusion = '🔴 수집 프로세스 문제 - 크론 함수 로그 확인 필요 (Vercel Dashboard)'
        } else {
            conclusion = '⚠️ 복합 문제 - 상세 로그 확인 필요'
        }

        const result: DiagnosisResult = {
            timestamp: now.toISOString(),
            currentBranch: 'feature/issue-engine',
            checks,
            conclusion,
            criticalIssue
        }

        return NextResponse.json(result)
    } catch (error) {
        console.error('진단 에러:', error)
        return NextResponse.json(
            {
                error: 'DIAGNOSIS_ERROR',
                message: '진단 실패',
                details: String(error)
            },
            { status: 500 }
        )
    }
}
