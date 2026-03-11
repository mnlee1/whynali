'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface SafetyRule {
    id: string
    kind: string
    value: string
    created_at: string
}

interface ReportItem {
    id: string
    comment_id: string
    reason: string
    status: string
    created_at: string
    comment_body: string | null
    issue_id: string | null
    discussion_topic_id: string | null
    report_count: number
}

type LeftTab = 'ai_banned_word' | 'excluded_word'

const USE_MOCK = true

const MOCK_AI_RULES: SafetyRule[] = [
    { id: 'mock-1', kind: 'ai_banned_word', value: '개새끼', created_at: '2026-03-10T09:12:00Z' },
    { id: 'mock-2', kind: 'ai_banned_word', value: '씨발놈', created_at: '2026-03-10T10:05:00Z' },
    { id: 'mock-3', kind: 'ai_banned_word', value: '죽어버려', created_at: '2026-03-09T22:47:00Z' },
    { id: 'mock-4', kind: 'ai_banned_word', value: '찐따', created_at: '2026-03-09T18:33:00Z' },
    { id: 'mock-5', kind: 'ai_banned_word', value: '병신같은', created_at: '2026-03-08T14:20:00Z' },
]

const MOCK_EXCLUDED_RULES: SafetyRule[] = [
    { id: 'mock-ex-1', kind: 'excluded_word', value: '찐따', created_at: '2026-03-09T20:00:00Z' },
    { id: 'mock-ex-2', kind: 'excluded_word', value: '바보', created_at: '2026-03-08T11:00:00Z' },
]

const MOCK_REPORTS: ReportItem[] = [
    {
        id: 'report-1',
        comment_id: 'cmt-1',
        reason: '욕설/혐오',
        status: '대기',
        created_at: '2026-03-11T08:30:00Z',
        comment_body: '진짜 개같은 새끼들만 모여있네 여기',
        issue_id: 'issue-abc-123',
        discussion_topic_id: null,
        report_count: 3,
    },
    {
        id: 'report-2',
        comment_id: 'cmt-2',
        reason: '스팸/광고',
        status: '대기',
        created_at: '2026-03-11T07:15:00Z',
        comment_body: '카카오톡 오픈채팅 ㅇㅇ1234 들어오세요 무료 정보 드려요',
        issue_id: null,
        discussion_topic_id: 'topic-xyz-456',
        report_count: 1,
    },
    {
        id: 'report-3',
        comment_id: 'cmt-3',
        reason: '욕설/혐오',
        status: '대기',
        created_at: '2026-03-10T23:50:00Z',
        comment_body: '이게 기사야? 기자새끼들 제발 좀 공부하고 써라',
        issue_id: 'issue-def-789',
        discussion_topic_id: null,
        report_count: 2,
    },
]

function formatDate(dateString: string): string {
    const d = new Date(dateString)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}


const LEFT_TABS: { key: LeftTab; label: string }[] = [
    { key: 'ai_banned_word', label: 'AI 자동 생성' },
    { key: 'excluded_word', label: '제외 목록' },
]

export default function AdminSafetyPage() {
    const [leftTab, setLeftTab] = useState<LeftTab>('ai_banned_word')

    /* AI 생성 금칙어 */
    const [aiRules, setAiRules] = useState<SafetyRule[]>(MOCK_AI_RULES)
    const [aiLoading, setAiLoading] = useState(false)
    const [aiError, setAiError] = useState<string | null>(null)

    /* 제외 목록 */
    const [excludedRules, setExcludedRules] = useState<SafetyRule[]>(MOCK_EXCLUDED_RULES)
    const [excludedLoading, setExcludedLoading] = useState(false)
    const [excludedError, setExcludedError] = useState<string | null>(null)

    /* kind 변경 공통 로딩 */
    const [changingKindId, setChangingKindId] = useState<string | null>(null)
    const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null)

    /* 신고 댓글 */
    const [reports, setReports] = useState<ReportItem[]>(MOCK_REPORTS)
    const [reportsTotal, setReportsTotal] = useState(MOCK_REPORTS.length)
    const [reportsLoading, setReportsLoading] = useState(false)
    const [reportsError, setReportsError] = useState<string | null>(null)
    const [processingReportId, setProcessingReportId] = useState<string | null>(null)

    const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null)

    /* ── 로드 함수 ── */
    const loadAiRules = useCallback(async () => {
        setAiLoading(true); setAiError(null)
        try {
            const res = await fetch('/api/admin/safety/rules?kind=ai_banned_word')
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            setAiRules(json.data ?? [])
        } catch (e) {
            setAiError(e instanceof Error ? e.message : '조회 실패')
        } finally {
            setAiLoading(false)
        }
    }, [])

    const loadExcludedRules = useCallback(async () => {
        setExcludedLoading(true); setExcludedError(null)
        try {
            const res = await fetch('/api/admin/safety/rules?kind=excluded_word')
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            setExcludedRules(json.data ?? [])
        } catch (e) {
            setExcludedError(e instanceof Error ? e.message : '조회 실패')
        } finally {
            setExcludedLoading(false)
        }
    }, [])

    const loadReports = useCallback(async () => {
        setReportsLoading(true); setReportsError(null)
        try {
            const res = await fetch('/api/admin/reports?status=대기')
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            setReports(json.data ?? [])
            setReportsTotal(json.total ?? 0)
        } catch (e) {
            setReportsError(e instanceof Error ? e.message : '조회 실패')
        } finally {
            setReportsLoading(false)
        }
    }, [])

    useEffect(() => {
        if (USE_MOCK) { setLastRefreshedAt(new Date()); return }
        loadAiRules()
        loadExcludedRules()
        loadReports()
        setLastRefreshedAt(new Date())
    }, [loadAiRules, loadExcludedRules, loadReports])

    const handleRefresh = () => {
        if (USE_MOCK) { setLastRefreshedAt(new Date()); return }
        loadAiRules()
        loadExcludedRules()
        loadReports()
        setLastRefreshedAt(new Date())
    }

    /* ── kind 변경 (제외 처리 / 복원) ── */
    const handleChangeKind = async (
        id: string,
        newKind: 'excluded_word' | 'ai_banned_word',
        fromKind: 'ai_banned_word' | 'excluded_word'
    ) => {
        if (USE_MOCK) {
            if (fromKind === 'ai_banned_word') {
                const item = aiRules.find((r) => r.id === id)
                if (!item) return
                setAiRules((prev) => prev.filter((r) => r.id !== id))
                setExcludedRules((prev) => [{ ...item, kind: 'excluded_word' }, ...prev])
            } else {
                const item = excludedRules.find((r) => r.id === id)
                if (!item) return
                setExcludedRules((prev) => prev.filter((r) => r.id !== id))
                setAiRules((prev) => [{ ...item, kind: 'ai_banned_word' }, ...prev])
            }
            return
        }
        setChangingKindId(id)
        try {
            const res = await fetch(`/api/admin/safety/rules/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ kind: newKind }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            const item: SafetyRule = json.data
            if (fromKind === 'ai_banned_word') {
                setAiRules((prev) => prev.filter((r) => r.id !== id))
                setExcludedRules((prev) => [item, ...prev])
            } else {
                setExcludedRules((prev) => prev.filter((r) => r.id !== id))
                setAiRules((prev) => [item, ...prev])
            }
        } catch (e) {
            alert(e instanceof Error ? e.message : '변경 실패')
        } finally {
            setChangingKindId(null)
        }
    }

    /* ── 삭제 ── */
    const handleDeleteRule = async (id: string, value: string) => {
        if (!window.confirm(`"${value}" 항목을 삭제하시겠습니까?`)) return
        if (USE_MOCK) {
            setExcludedRules((prev) => prev.filter((r) => r.id !== id))
            return
        }
        setDeletingRuleId(id)
        try {
            const res = await fetch(`/api/admin/safety/rules?id=${id}`, { method: 'DELETE' })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            setExcludedRules((prev) => prev.filter((r) => r.id !== id))
        } catch (e) {
            alert(e instanceof Error ? e.message : '삭제 실패')
        } finally {
            setDeletingRuleId(null)
        }
    }

    /* ── 신고 처리 ── */
    const handleReportAction = async (reportId: string, action: '처리완료' | '무시') => {
        if (action === '처리완료' && !window.confirm('댓글을 삭제 처리하시겠습니까?')) return
        if (USE_MOCK) {
            setReports((prev) => prev.filter((r) => r.id !== reportId))
            setReportsTotal((prev) => Math.max(0, prev - 1))
            return
        }
        setProcessingReportId(reportId)
        try {
            const res = await fetch(`/api/admin/reports/${reportId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            setReports((prev) => prev.filter((r) => r.id !== reportId))
            setReportsTotal((prev) => Math.max(0, prev - 1))
        } catch (e) {
            alert(e instanceof Error ? e.message : '처리 실패')
        } finally {
            setProcessingReportId(null)
        }
    }

    /* ── 탭 버튼 헬퍼 ── */
    function TabBtn<T extends string>({
        current, value, label, badge, onClick,
    }: { current: T; value: T; label: string; badge?: number; onClick: (v: T) => void }) {
        const active = current === value
        return (
            <button
                onClick={() => onClick(value)}
                className={[
                    'px-3 py-1.5 text-sm rounded transition-colors',
                    active
                        ? 'bg-gray-800 text-white font-medium'
                        : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100',
                ].join(' ')}
            >
                {label}
                {badge !== undefined && badge > 0 && (
                    <span className={[
                        'ml-1.5 text-xs px-1.5 py-0.5 rounded-full',
                        active ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600',
                    ].join(' ')}>
                        {badge}
                    </span>
                )}
            </button>
        )
    }

    function RuleListSkeleton() {
        return (
            <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
                ))}
            </div>
        )
    }

    return (
        <div>
            {/* 헤더 */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
                <h1 className="text-2xl font-bold">세이프티</h1>
                <div className="flex items-center gap-3">
                    {lastRefreshedAt && (
                        <span className="text-xs text-gray-400">
                            마지막 갱신: {lastRefreshedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    )}
                    <button
                        onClick={handleRefresh}
                        className="px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
                    >
                        새로고침
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                {/* ── 좌측: AI 금칙어 관리 패널 ── */}
                <div>
                    <h2 className="text-lg font-semibold mb-3">금칙어 관리</h2>

                    {/* 좌측 탭 */}
                    <div className="flex gap-1 mb-4 border-b border-gray-200 pb-2">
                        {LEFT_TABS.map(({ key, label }) => (
                            <TabBtn
                                key={key}
                                current={leftTab}
                                value={key}
                                label={label}
                                badge={key === 'ai_banned_word' ? aiRules.length : excludedRules.length}
                                onClick={setLeftTab}
                            />
                        ))}
                    </div>

                    {/* 탭: AI 자동 생성 목록 */}
                    {leftTab === 'ai_banned_word' && (
                        <div>
                            {aiError && <p className="text-sm text-red-500 mb-3">{aiError}</p>}
                            {aiLoading ? <RuleListSkeleton /> : aiRules.length === 0 ? (
                                <p className="text-sm text-gray-400 text-center py-8">AI가 생성한 금칙어가 없습니다.</p>
                            ) : (
                                <ul className="space-y-2 max-h-80 overflow-y-auto">
                                    {aiRules.map((rule) => (
                                        <li key={rule.id} className="flex items-center justify-between px-3 py-2 border border-gray-200 rounded bg-white">
                                            <span className="text-sm font-medium text-gray-800">{rule.value}</span>
                                            <div className="flex items-center gap-3">
                                                <span className="text-xs text-gray-400">{formatDate(rule.created_at)}</span>
                                                <button
                                                    onClick={() => handleChangeKind(rule.id, 'excluded_word', 'ai_banned_word')}
                                                    disabled={changingKindId === rule.id}
                                                    className="text-xs text-orange-500 hover:text-orange-700 disabled:opacity-50"
                                                >
                                                    {changingKindId === rule.id ? '처리 중...' : '제외 처리'}
                                                </button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    {/* 탭: 제외 목록 */}
                    {leftTab === 'excluded_word' && (
                        <div>
                            {excludedError && <p className="text-sm text-red-500 mb-3">{excludedError}</p>}
                            {excludedLoading ? <RuleListSkeleton /> : excludedRules.length === 0 ? (
                                <p className="text-sm text-gray-400 text-center py-8">제외 처리된 단어가 없습니다.</p>
                            ) : (
                                <ul className="space-y-2 max-h-80 overflow-y-auto">
                                    {excludedRules.map((rule) => (
                                        <li key={rule.id} className="flex items-center justify-between px-3 py-2 border border-gray-200 rounded bg-white">
                                            <span className="text-sm font-medium text-gray-500 line-through">{rule.value}</span>
                                            <div className="flex items-center gap-3">
                                                <span className="text-xs text-gray-400">{formatDate(rule.created_at)}</span>
                                                <button
                                                    onClick={() => handleChangeKind(rule.id, 'ai_banned_word', 'excluded_word')}
                                                    disabled={changingKindId === rule.id}
                                                    className="text-xs text-blue-500 hover:text-blue-700 disabled:opacity-50"
                                                >
                                                    {changingKindId === rule.id ? '처리 중...' : '복원'}
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteRule(rule.id, rule.value)}
                                                    disabled={deletingRuleId === rule.id}
                                                    className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                                                >
                                                    삭제
                                                </button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    {/* 프로세스 안내 */}
                    <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded text-xs text-gray-500 space-y-1">
                        <p>AI가 자동으로 금칙어를 탐지합니다.</p>
                        <p>과도하게 차단되는 단어는 &apos;제외 처리&apos;로 필터에서 제외할 수 있습니다.</p>
                    </div>
                </div>

                {/* ── 우측: 신고 댓글 패널 ── */}
                <div>
                    <h2 className="text-lg font-semibold mb-4">
                        신고 댓글
                        {reportsTotal > 0 && (
                            <span className={[
                                'ml-2 text-sm font-normal px-2 py-0.5 rounded',
                                reportsTotal >= 5
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-yellow-100 text-yellow-700',
                            ].join(' ')}>
                                {reportsTotal}건
                            </span>
                        )}
                    </h2>

                    {/* 신고 처리 프로세스 안내 */}
                    <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700 space-y-1">
                        <p className="font-medium">신고 처리 프로세스:</p>
                        <ol className="list-decimal pl-4 space-y-0.5">
                            <li>신고 건수 2건 이상 또는 &apos;욕설/혐오&apos; 사유는 우선 검토 권장</li>
                            <li>댓글 내용 확인 후 &apos;댓글 삭제&apos; — 해당 댓글이 즉시 숨김 처리됨</li>
                            <li>정상 댓글로 판단되면 &apos;무시&apos; — 신고가 기각되고 댓글 유지</li>
                        </ol>
                    </div>

                    {reportsError && <p className="text-sm text-red-500 mb-3">{reportsError}</p>}

                    {reportsLoading ? (
                        <div className="space-y-3">
                            {[1, 2].map((i) => (
                                <div key={i} className="p-3 border rounded space-y-2">
                                    <div className="h-3 w-1/3 bg-gray-100 rounded animate-pulse" />
                                    <div className="h-4 w-full bg-gray-100 rounded animate-pulse" />
                                </div>
                            ))}
                        </div>
                    ) : reports.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-8">신고된 댓글이 없습니다.</p>
                    ) : (
                        <ul className="space-y-3 max-h-[480px] overflow-y-auto">
                            {reports.map((report) => {
                                const isProcessing = processingReportId === report.id
                                const contextLink = report.issue_id ? `/issue/${report.issue_id}` : null
                                const isHate = report.reason === '욕설/혐오'
                                return (
                                    <li key={report.id} className="p-3 border border-red-100 bg-red-50 rounded">
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-2">
                                                <span className={[
                                                    'text-xs px-2 py-0.5 rounded font-medium text-white',
                                                    isHate ? 'bg-red-600' : 'bg-red-400',
                                                ].join(' ')}>
                                                    {report.reason}
                                                </span>
                                                {report.report_count >= 2 && (
                                                    <span className="text-xs px-2 py-0.5 rounded bg-red-500 text-white font-medium">
                                                        {report.report_count}건 신고
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {contextLink && (
                                                    <Link href={contextLink} target="_blank" className="text-xs text-blue-500 hover:underline">
                                                        원문 보기
                                                    </Link>
                                                )}
                                                <span className="text-xs text-gray-400">{formatDate(report.created_at)}</span>
                                            </div>
                                        </div>
                                        <p className="text-sm text-gray-800 my-2 leading-relaxed">
                                            {report.comment_body ?? <span className="text-gray-400 italic">삭제된 댓글</span>}
                                        </p>
                                        <div className="flex gap-2 justify-end">
                                            <button
                                                onClick={() => handleReportAction(report.id, '처리완료')}
                                                disabled={isProcessing}
                                                className="text-xs px-3 py-1.5 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
                                            >
                                                {isProcessing ? '처리 중...' : '댓글 삭제'}
                                            </button>
                                            <button
                                                onClick={() => handleReportAction(report.id, '무시')}
                                                disabled={isProcessing}
                                                className="text-xs px-3 py-1.5 border border-gray-300 text-gray-600 rounded hover:bg-gray-50 disabled:opacity-50"
                                            >
                                                무시
                                            </button>
                                        </div>
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                </div>

            </div>
        </div>
    )
}
