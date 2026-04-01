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
    const [aiRules, setAiRules] = useState<SafetyRule[]>([])
    const [aiLoading, setAiLoading] = useState(true)
    const [aiError, setAiError] = useState<string | null>(null)

    /* 제외 목록 */
    const [excludedRules, setExcludedRules] = useState<SafetyRule[]>([])
    const [excludedLoading, setExcludedLoading] = useState(true)
    const [excludedError, setExcludedError] = useState<string | null>(null)

    /* kind 변경 공통 로딩 */
    const [changingKindId, setChangingKindId] = useState<string | null>(null)
    const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null)

    /* 신고 댓글 */
    const [reports, setReports] = useState<ReportItem[]>([])
    const [reportsTotal, setReportsTotal] = useState(0)
    const [reportsLoading, setReportsLoading] = useState(true)
    const [reportsError, setReportsError] = useState<string | null>(null)
    const [processingReportId, setProcessingReportId] = useState<string | null>(null)
    const [processGuideOpen, setProcessGuideOpen] = useState(true)

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

    /* 우선순위 계산 함수 */
    const calculatePriority = (reason: string, count: number): number => {
        let priority = 0
        
        if (reason === '욕설/혐오') {
            priority = 1000 // 최우선
            if (count >= 2) priority += 100 // 2건 이상은 더 높은 우선순위
        } else if (count >= 3) {
            priority = 500 // 3건 이상은 우선 검토
        } else if (count >= 2) {
            priority = 300 // 2건은 일반 검토
        } else {
            priority = 100 // 1건은 낮은 우선순위
        }
        
        priority += count * 10 // 건수가 많을수록 약간 더 높은 우선순위
        
        return priority
    }

    const loadReports = useCallback(async () => {
        setReportsLoading(true); setReportsError(null)
        try {
            const res = await fetch('/api/admin/reports?status=대기')
            const json = await res.json()
            if (!res.ok) {
                throw new Error(json.error ?? `HTTP ${res.status}: 신고 목록 조회 실패`)
            }
            if (!json.data || !Array.isArray(json.data)) {
                console.warn('[safety] 신고 API 응답 구조 이상:', json)
                setReportsError('API 응답 구조가 올바르지 않습니다.')
                return
            }
            
            // 우선순위 기반 정렬
            const sortedData = json.data.sort((a: ReportItem, b: ReportItem) => {
                const priorityA = calculatePriority(a.reason, a.report_count)
                const priorityB = calculatePriority(b.reason, b.report_count)
                return priorityB - priorityA // 높은 우선순위가 먼저
            })
            
            setReports(sortedData)
            setReportsTotal(json.total ?? json.data.length)
        } catch (e) {
            const errorMsg = e instanceof Error ? e.message : '신고 목록 조회 실패'
            setReportsError(errorMsg)
            console.error('[safety] loadReports 에러:', e)
        } finally {
            setReportsLoading(false)
        }
    }, [])

    useEffect(() => {
        loadAiRules()
        loadExcludedRules()
        loadReports()
    }, [loadAiRules, loadExcludedRules, loadReports])

    /* ── kind 변경 (제외 처리 / 복원) ── */
    const handleChangeKind = async (
        id: string,
        newKind: 'excluded_word' | 'ai_banned_word',
        fromKind: 'ai_banned_word' | 'excluded_word'
    ) => {
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
                    'px-3 py-1.5 text-sm rounded-full border transition-colors',
                    active
                        ? 'bg-primary text-white border-primary font-medium'
                        : 'bg-surface text-content-secondary border-border hover:border-border-strong hover:text-content-primary',
                ].join(' ')}
            >
                {label}
                {badge !== undefined && badge > 0 && (
                    <span className={[
                        'ml-1.5 text-xs px-1.5 py-0.5 rounded-full',
                        active ? 'bg-white/20 text-white' : 'bg-surface-muted text-content-secondary',
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
                    <div key={i} className="h-8 bg-surface-muted rounded-xl animate-pulse" />
                ))}
            </div>
        )
    }

    return (
        <div>
            {/* 헤더 */}
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-content-primary">세이프티</h1>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                {/* ── 좌측: AI 금칙어 관리 패널 ── */}
                <div>
                    <h2 className="text-lg font-semibold text-content-primary mb-3">
                        금칙어 관리
                        <span className="ml-2 text-sm font-normal text-content-muted">한국어 온라인 커뮤니티 기본 금칙어 목록</span>
                    </h2>

                    {/* 좌측 탭 */}
                    <div className="flex gap-1 mb-4 border-b border-border pb-2">
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
                                <p className="text-sm text-content-muted text-center py-8">AI가 생성한 금칙어가 없습니다.</p>
                            ) : (
                                <ul className="space-y-2 max-h-[560px] overflow-y-auto">
                                    {aiRules.map((rule) => (
                                        <li key={rule.id} className="flex items-center justify-between px-3 py-2 border border-border rounded-xl card">
                                            <span className="text-sm font-medium text-content-primary">{rule.value}</span>
                                            <button
                                                onClick={() => handleChangeKind(rule.id, 'excluded_word', 'ai_banned_word')}
                                                disabled={changingKindId === rule.id}
                                                className="text-xs text-orange-500 hover:text-orange-700 disabled:opacity-50"
                                            >
                                                {changingKindId === rule.id ? '처리 중...' : '제외 처리'}
                                            </button>
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
                                <p className="text-sm text-content-muted text-center py-8">제외 처리된 단어가 없습니다.</p>
                            ) : (
                                <ul className="space-y-2 max-h-[560px] overflow-y-auto">
                                    {excludedRules.map((rule) => (
                                        <li key={rule.id} className="flex items-center justify-between px-3 py-2 border border-border rounded-xl card">
                                            <span className="text-sm font-medium text-content-secondary line-through">{rule.value}</span>
                                            <div className="flex items-center gap-3">
                                                <button
                                                    onClick={() => handleChangeKind(rule.id, 'ai_banned_word', 'excluded_word')}
                                                    disabled={changingKindId === rule.id}
                                                    className="text-xs text-primary hover:text-primary-dark disabled:opacity-50"
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
                    <div className="mt-4 p-3 bg-surface-subtle border border-border rounded-xl text-sm text-content-secondary space-y-1">
                        <p>AI가 자동으로 금칙어를 탐지합니다.</p>
                        <p>과도하게 차단되는 단어는 &apos;제외 처리&apos;로 필터에서 제외할 수 있습니다.</p>
                    </div>
                </div>

                {/* ── 우측: 신고 댓글 패널 ── */}
                <div>
                    <h2 className="text-lg font-semibold text-content-primary mb-4">
                        신고 댓글
                        {reportsTotal > 0 && (
                            <span className={[
                                'ml-2 text-sm font-normal px-2 py-0.5 rounded-xl',
                                reportsTotal >= 5
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-yellow-100 text-yellow-700',
                            ].join(' ')}>
                                {reportsTotal}건
                            </span>
                        )}
                    </h2>

                    {/* 신고 처리 프로세스 안내 (접기/펼치기) */}
                    <div className="card overflow-hidden mb-4 p-0">
                        <button
                            onClick={() => setProcessGuideOpen(!processGuideOpen)}
                            className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-subtle transition-colors"
                        >
                            <span className="font-bold text-sm text-content-primary">
                                신고 처리 프로세스
                            </span>
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className={`text-content-secondary transition-transform duration-200 ${processGuideOpen ? 'rotate-180' : ''}`}
                            >
                                <path d="m6 9 6 6 6-6" />
                            </svg>
                        </button>
                        
                        {processGuideOpen && (
                            <div className="px-4 pb-4 text-xs text-content-secondary space-y-3 animate-in slide-in-from-top duration-200">
                                <div className="space-y-2">
                                    <div className="bg-surface/60 p-2 rounded-xl">
                                        <p className="font-semibold text-content-primary mb-1">1. 자동 처리 정책 (실시간)</p>
                                        <ul className="space-y-1 leading-relaxed text-content-secondary">
                                            <li className="flex items-start gap-1">
                                                <span className="text-red-600 font-bold shrink-0">즉시 알림:</span>
                                                <span>&apos;욕설/혐오&apos; 신고 1건 이상 → 관리자에게 즉시 이메일 발송 (1시간 쿨다운)</span>
                                            </li>
                                            <li className="flex items-start gap-1">
                                                <span className="text-orange-600 font-bold shrink-0">자동 숨김:</span>
                                                <span>욕설/혐오 2건, 스팸/광고 3건, 허위정보 3건, 기타 5건 이상 → comments.visibility=&apos;pending_review&apos; 자동 전환 (임시 숨김)</span>
                                            </li>
                                            <li className="flex items-start gap-1">
                                                <span className="text-blue-600 font-bold shrink-0">배치 알림:</span>
                                                <span>매일 12시에 미처리 신고 목록 이메일 발송 (긴급 건 제외)</span>
                                            </li>
                                        </ul>
                                    </div>

                                    <div className="bg-surface/60 p-2 rounded-xl">
                                        <p className="font-semibold text-content-primary mb-1">2. 신고 건수 이해하기</p>
                                        <p className="leading-relaxed text-content-secondary">
                                            <span className="font-medium">신고 건수</span>는 같은 댓글에 대해 여러 사용자가 신고한 총 횟수입니다. 
                                            예: 댓글 A를 유저 3명이 각각 신고 → [3건 신고] 표시. 
                                            <span className="font-medium">2건 이상 = 다수가 문제로 인식</span> → 실제 문제일 가능성 높음.
                                        </p>
                                    </div>
                                    
                                    <div className="bg-surface/60 p-2 rounded-xl">
                                        <p className="font-semibold text-content-primary mb-1">3. 우선순위 판단</p>
                                        <ul className="space-y-1 leading-relaxed text-content-secondary">
                                            <li className="flex items-start gap-1">
                                                <span className="text-red-600 font-bold shrink-0">🔴</span>
                                                <span><span className="font-medium">&apos;욕설/혐오&apos; 사유</span>는 1건만 신고되어도 최우선 검토 (심각한 유해 콘텐츠)</span>
                                            </li>
                                            <li className="flex items-start gap-1">
                                                <span className="text-orange-500 font-bold shrink-0">🟡</span>
                                                <span><span className="font-medium">2건 이상 신고</span>는 오신고 가능성 낮음 → 우선 검토</span>
                                            </li>
                                            <li className="flex items-start gap-1">
                                                <span className="text-content-muted font-bold shrink-0">⚪</span>
                                                <span>1건 신고(기타 사유)는 낮은 우선순위</span>
                                            </li>
                                        </ul>
                                    </div>
                                    
                                    <div className="bg-surface/60 p-2 rounded-xl">
                                        <p className="font-semibold text-content-primary mb-1">4. 처리 결정</p>
                                        <div className="space-y-1.5 leading-relaxed text-content-secondary">
                                            <div>
                                                <span className="font-medium text-red-700">[댓글 삭제]</span> 
                                                <span className="ml-1">→ reports.status=&apos;처리완료&apos; + comments.visibility=&apos;deleted&apos;</span>
                                                <p className="ml-3 text-sm text-content-muted mt-0.5">
                                                    · 댓글이 사용자 화면에서 즉시 숨겨짐 (삭제된 댓글로 표시)
                                                    <br />· 명확한 위반(욕설/스팸/허위정보)만 삭제 권장
                                                </p>
                                            </div>
                                            <div>
                                                <span className="font-medium text-content-primary">[무시]</span> 
                                                <span className="ml-1">→ reports.status=&apos;무시&apos; (댓글은 그대로 유지)</span>
                                                <p className="ml-3 text-sm text-content-muted mt-0.5">
                                                    · 정상 의견 표현, 오신고로 판단 시 선택
                                                    <br />· 애매한 경우 무시 우선 (표현의 자유 존중)
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="bg-surface-subtle border border-border p-2 rounded-xl">
                                        <p className="font-semibold text-content-primary mb-1">판단 기준</p>
                                        <p className="leading-relaxed text-content-secondary text-xs">
                                            · 원문 보기로 문맥 파악 필수
                                            <br />· 비판적이지만 욕설 없는 의견은 정상 (무시)
                                            <br />· 신고 건수가 많을수록 실제 문제일 가능성 높음
                                            <br />· 과도한 삭제는 표현의 자유 침해 → 명확한 위반만 삭제
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {reportsError && <p className="text-sm text-red-500 mb-3">{reportsError}</p>}

                    {reportsLoading ? (
                        <div className="space-y-3">
                            {[1, 2].map((i) => (
                                <div key={i} className="card p-3 space-y-2">
                                    <div className="h-3 w-1/3 bg-surface-muted rounded-xl animate-pulse" />
                                    <div className="h-4 w-full bg-surface-muted rounded-xl animate-pulse" />
                                </div>
                            ))}
                        </div>
                    ) : reports.length === 0 ? (
                        <p className="text-sm text-content-muted text-center py-8">신고된 댓글이 없습니다.</p>
                    ) : (
                        <ul className="space-y-3 max-h-[480px] overflow-y-auto">
                            {reports.map((report) => {
                                const isProcessing = processingReportId === report.id
                                const contextLink = report.issue_id ? `/issue/${report.issue_id}` : null
                                const isHate = report.reason === '욕설/혐오'
                                const isMultiReport = report.report_count >= 2
                                
                                // 우선순위 레벨 결정
                                let priorityLevel = 'low' // 기본: 낮은 우선순위
                                let priorityBadge = '⚪'
                                let priorityLabel = '낮은 우선순위'
                                
                                if (isHate && isMultiReport) {
                                    priorityLevel = 'critical'
                                    priorityBadge = '🔴'
                                    priorityLabel = '최우선 검토'
                                } else if (isHate) {
                                    priorityLevel = 'critical'
                                    priorityBadge = '🔴'
                                    priorityLabel = '최우선 검토'
                                } else if (report.report_count >= 3) {
                                    priorityLevel = 'high'
                                    priorityBadge = '🟡'
                                    priorityLabel = '우선 검토'
                                } else if (isMultiReport) {
                                    priorityLevel = 'medium'
                                    priorityBadge = '🟢'
                                    priorityLabel = '일반 검토'
                                }
                                
                                // 우선순위별 badge 색상
                                const priorityColor = priorityLevel === 'critical' 
                                    ? 'bg-red-500 text-white' 
                                    : priorityLevel === 'high' 
                                    ? 'bg-orange-500 text-white' 
                                    : priorityLevel === 'medium'
                                    ? 'bg-yellow-500 text-white'
                                    : 'bg-gray-500 text-white'
                                
                                return (
                                    <li key={report.id} className="p-3 card">
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityColor}`}>
                                                    {priorityBadge} {priorityLabel}
                                                </span>
                                                <span className={[
                                                    'text-xs px-2 py-0.5 rounded-full font-medium',
                                                    isHate ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-orange-100 text-orange-700 border border-orange-200',
                                                ].join(' ')}>
                                                    {report.reason}
                                                </span>
                                                {report.report_count >= 2 && (
                                                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-500 text-white font-medium">
                                                        {report.report_count}건 신고
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {contextLink && (
                                                    <Link href={contextLink} target="_blank" className="text-xs text-primary hover:underline">
                                                        원문 보기
                                                    </Link>
                                                )}
                                                <span className="text-sm text-content-muted">{formatDate(report.created_at)}</span>
                                            </div>
                                        </div>
                                        <p className="text-sm text-content-primary my-2 leading-relaxed">
                                            {report.comment_body ?? <span className="text-content-muted italic">삭제된 댓글</span>}
                                        </p>
                                        <div className="flex gap-2 justify-end">
                                            <button
                                                onClick={() => handleReportAction(report.id, '처리완료')}
                                                disabled={isProcessing}
                                                className="text-xs px-3 py-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 disabled:opacity-50 whitespace-nowrap"
                                            >
                                                {isProcessing ? '처리 중...' : '댓글 삭제'}
                                            </button>
                                            <button
                                                onClick={() => handleReportAction(report.id, '무시')}
                                                disabled={isProcessing}
                                                className="btn-neutral btn-sm text-xs"
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
