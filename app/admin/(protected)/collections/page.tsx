/**
 * app/admin/collections/page.tsx
 *
 * [관리자 - AI 자동화 로그]
 *
 * AI 자동화 파이프라인 실행 기록 및 에러를 조회합니다.
 * 현재: 트랙A 이슈 자동화 로그
 */

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

// ─── 타입 ────────────────────────────────────────────────

type TrackAResult =
    | 'issue_created'
    | 'auto_approved'
    | 'duplicate_linked'
    | 'ai_rejected'
    | 'no_news'
    | 'no_community'
    | 'heat_too_low'
    | 'no_news_linked'
    | 'no_timeline'
    | 'validation_failed'
    | 'rate_limited'
    | 'error'

interface TrackALog {
    id: string
    run_at: string
    keyword: string
    burst_count: number
    result: TrackAResult
    issue_id: string | null
    details: Record<string, unknown> | null
    issues: { id: string; title: string; heat_index: number; approval_status: string } | null
}

interface TrackALogsResponse {
    data: TrackALog[]
    total: number
    summary: Record<string, number>
}

// ─── 메인 페이지 ─────────────────────────────────────────

export default function AdminCollectionsPage() {
    const [pipelineLogs, setPipelineLogs] = useState<TrackALogsResponse | null>(null)
    const [pipelineLoading, setPipelineLoading] = useState(false)
    const [pipelineResultFilter, setPipelineResultFilter] = useState<TrackAResult | 'all'>('all')
    const [pipelineDateFilter, setPipelineDateFilter] = useState<string>(
        new Date().toLocaleDateString('sv-SE')
    )
    const [availableDates, setAvailableDates] = useState<string[]>([])

    // ─── fetch ──────────────────────────────────────────

    const fetchAvailableDates = async () => {
        try {
            const res = await fetch('/api/admin/track-a-logs?available_dates=true')
            if (res.ok) {
                const { dates } = await res.json()
                setAvailableDates(dates ?? [])
            }
        } catch (error) {
            console.error('사용 가능한 날짜 조회 실패:', error)
        }
    }

    const fetchPipelineLogs = async (
        resultFilter: TrackAResult | 'all' = 'all',
        dateFilter: string = '',
    ) => {
        setPipelineLoading(true)
        try {
            const resultParam = resultFilter !== 'all' ? `&result=${resultFilter}` : ''
            const dateParam = dateFilter ? `&date=${dateFilter}` : ''
            const res = await fetch(`/api/admin/track-a-logs?limit=100${resultParam}${dateParam}`)
            if (res.ok) setPipelineLogs(await res.json())
        } catch (error) {
            console.error('이슈 자동화 로그 조회 실패:', error)
        } finally {
            setPipelineLoading(false)
        }
    }

    // ─── 초기 로드 ───────────────────────────────────────

    useEffect(() => {
        fetchPipelineLogs()
        fetchAvailableDates()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // ─── 렌더 ────────────────────────────────────────────

    return (
        <div>
            {/* 헤더 */}
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-content-primary">이슈 자동화 로그</h1>
            </div>

            {/* 필터 바 */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
                <div className="relative">
                    <select
                        value={pipelineResultFilter}
                        onChange={(e) => {
                            const v = e.target.value as TrackAResult | 'all'
                            setPipelineResultFilter(v)
                            fetchPipelineLogs(v, pipelineDateFilter)
                        }}
                        className="appearance-none text-sm border border-border rounded-xl pl-3 pr-8 py-2 bg-surface focus:outline-none focus:border-primary"
                    >
                        <option value="all">전체 결과</option>
                        <option value="issue_created">이슈 생성</option>
                        <option value="auto_approved">자동 승인</option>
                        <option value="duplicate_linked">기존 이슈 연결</option>
                        <option value="ai_rejected">AI 검증 실패</option>
                        <option value="no_news">뉴스 없음</option>
                        <option value="no_community">커뮤니티 없음</option>
                        <option value="heat_too_low">화력 미달</option>
                        <option value="no_news_linked">뉴스 연결 실패</option>
                        <option value="no_timeline">타임라인 없음</option>
                        <option value="validation_failed">검증 실패</option>
                        <option value="rate_limited">Rate Limit</option>
                        <option value="error">에러</option>
                    </select>
                    <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-content-muted">
                        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                        </svg>
                    </span>
                </div>
                <div className="relative">
                    <select
                        value={pipelineDateFilter}
                        onChange={(e) => {
                            setPipelineDateFilter(e.target.value)
                            fetchPipelineLogs(pipelineResultFilter, e.target.value)
                        }}
                        className="appearance-none text-sm border border-border rounded-xl pl-3 pr-8 py-2 bg-surface focus:outline-none focus:border-primary"
                    >
                        {availableDates.length === 0 ? (
                            <option value={pipelineDateFilter}>{pipelineDateFilter}</option>
                        ) : (
                            availableDates.map((d) => {
                                const label = new Date(d + 'T00:00:00').toLocaleDateString('ko-KR', {
                                    month: 'long', day: 'numeric', weekday: 'short',
                                })
                                return <option key={d} value={d}>{label}</option>
                            })
                        )}
                    </select>
                    <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-content-muted">
                        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                        </svg>
                    </span>
                </div>
            </div>

            {/* 요약 뱃지 */}
            {pipelineLogs && (
                        <div className="flex flex-wrap gap-2 mb-4">
                            {Object.entries(pipelineLogs.summary)
                                .sort((a, b) => b[1] - a[1])
                                .map(([result, count]) => {
                                    const RESULT_LABEL: Record<string, string> = {
                                        issue_created: '이슈 생성',
                                        auto_approved: '자동 승인',
                                        duplicate_linked: '기존 연결',
                                        ai_rejected: 'AI 거부',
                                        no_news: '뉴스 없음',
                                        no_community: '커뮤니티 없음',
                                        heat_too_low: '화력 미달',
                                        no_news_linked: '뉴스 연결 실패',
                                        no_timeline: '타임라인 없음',
                                        validation_failed: '검증 실패',
                                        rate_limited: 'Rate Limit',
                                        error: '에러',
                                    }
                                    const RESULT_COLOR: Record<string, string> = {
                                        issue_created: 'bg-green-100 text-green-700',
                                        auto_approved: 'bg-emerald-100 text-emerald-700',
                                        duplicate_linked: 'bg-blue-100 text-blue-700',
                                        ai_rejected: 'bg-orange-100 text-orange-700',
                                        no_news: 'bg-yellow-100 text-yellow-700',
                                        no_community: 'bg-yellow-100 text-yellow-700',
                                        heat_too_low: 'bg-red-100 text-red-700',
                                        no_news_linked: 'bg-red-100 text-red-700',
                                        no_timeline: 'bg-red-100 text-red-700',
                                        validation_failed: 'bg-red-100 text-red-700',
                                        rate_limited: 'bg-purple-100 text-purple-700',
                                        error: 'bg-gray-100 text-gray-700',
                                    }
                                    return (
                                        <span
                                            key={result}
                                            className={`text-xs font-medium px-2.5 py-1 rounded-full ${RESULT_COLOR[result] ?? 'bg-gray-100 text-gray-600'}`}
                                        >
                                            {RESULT_LABEL[result] ?? result} {count}
                                        </span>
                    )
                })}
            </div>
            )}

            {/* 로그 목록 */}
            {pipelineLoading ? (
                <div className="space-y-2">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="h-14 bg-surface-muted rounded-xl animate-pulse" />
                    ))}
                </div>
            ) : !pipelineLogs || pipelineLogs.data.length === 0 ? (
                <div className="card p-10 text-center text-sm text-content-muted">
                    로그가 없습니다.{' '}
                    {pipelineLogs === null && 'track_a_logs 테이블 마이그레이션 후 Track A가 실행되면 기록됩니다.'}
                </div>
            ) : (
                <div className="card overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-surface-subtle border-b border-border-muted">
                                    <tr>
                                        <th className="px-4 py-2.5 text-left text-xs font-medium text-content-muted w-36">실행 시각</th>
                                        <th className="px-4 py-2.5 text-left text-xs font-medium text-content-muted w-36">키워드</th>
                                        <th className="px-4 py-2.5 text-center text-xs font-medium text-content-muted w-16">감지 건수</th>
                                        <th className="px-4 py-2.5 text-left text-xs font-medium text-content-muted w-28">결과</th>
                                        <th className="px-4 py-2.5 text-left text-xs font-medium text-content-muted w-48">상세</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border-muted">
                                    {pipelineLogs.data.map((log) => {
                                        const RESULT_LABEL: Record<string, string> = {
                                            issue_created: '이슈 생성',
                                            auto_approved: '자동 승인',
                                            duplicate_linked: '기존 연결',
                                            ai_rejected: 'AI 거부',
                                            no_news: '뉴스 없음',
                                            no_community: '커뮤니티 없음',
                                            heat_too_low: '화력 미달',
                                            no_news_linked: '뉴스 연결 실패',
                                            no_timeline: '타임라인 없음',
                                            validation_failed: '검증 실패',
                                            rate_limited: 'Rate Limit',
                                            error: '에러',
                                        }
                                        const RESULT_COLOR: Record<string, string> = {
                                            issue_created: 'bg-green-100 text-green-700',
                                            auto_approved: 'bg-emerald-100 text-emerald-700',
                                            duplicate_linked: 'bg-blue-100 text-blue-700',
                                            ai_rejected: 'bg-orange-100 text-orange-700',
                                            no_news: 'bg-yellow-100 text-yellow-700',
                                            no_community: 'bg-yellow-100 text-yellow-700',
                                            heat_too_low: 'bg-red-100 text-red-700',
                                            no_news_linked: 'bg-red-100 text-red-700',
                                            no_timeline: 'bg-red-100 text-red-700',
                                            validation_failed: 'bg-red-100 text-red-700',
                                            rate_limited: 'bg-purple-100 text-purple-700',
                                            error: 'bg-gray-100 text-gray-700',
                                        }
                                        const detail = log.details
                                        const detailText = detail
                                            ? [
                                                detail.aiConfidence !== undefined && `AI 신뢰도 ${detail.aiConfidence}%`,
                                                detail.reason && `사유: ${detail.reason}`,
                                                detail.newsCount !== undefined && `뉴스 ${detail.newsCount}건`,
                                                detail.heatIndex !== undefined && `화력 ${detail.heatIndex}점`,
                                                detail.communityLinked !== undefined && `커뮤니티 ${detail.communityLinked}건 연결`,
                                                detail.existingIssueTitle && `→ "${detail.existingIssueTitle}"`,
                                                detail.finalIssueTitle && `"${detail.finalIssueTitle}"`,
                                                detail.error && `오류: ${detail.error}`,
                                            ].filter(Boolean).join(' · ')
                                            : ''
                                        return (
                                            <tr key={log.id} className="hover:bg-surface-subtle">
                                                <td className="px-4 py-3 text-sm text-content-muted whitespace-nowrap">
                                                    {new Date(log.run_at).toLocaleString('ko-KR', {
                                                        month: '2-digit', day: '2-digit',
                                                        hour: '2-digit', minute: '2-digit',
                                                    })}
                                                </td>
                                                <td className="px-4 py-3 font-medium text-content-primary">
                                                    {log.keyword}
                                                </td>
                                                <td className="px-4 py-3 text-center text-content-secondary">
                                                    {log.burst_count}건
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${RESULT_COLOR[log.result] ?? 'bg-surface-muted text-content-secondary'}`}>
                                                        {RESULT_LABEL[log.result] ?? log.result}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-sm text-content-secondary w-48">
                                                    {log.issues ? (
                                                        <Link
                                                            href={`/admin/issues/${log.issue_id}`}
                                                            className="text-primary hover:underline"
                                                        >
                                                            {log.issues.title}
                                                        </Link>
                                                    ) : detailText}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
        </div>
    )
}
