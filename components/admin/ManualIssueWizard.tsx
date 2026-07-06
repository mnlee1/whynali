'use client'

/**
 * components/admin/ManualIssueWizard.tsx
 *
 * 수동 이슈 등록 3단계 위저드
 * Step 1: 키워드 → AI 제목·예상 화력·커뮤니티·뉴스 확인, 제목 수정
 * Step 2: 타임라인 미리보기, 단계별 소제목·요약 수정
 * Step 3 (commit): 확정 데이터 DB 저장, 결과 표시
 */

import { useState } from 'react'

// ─── 타입 ────────────────────────────────────────────────────────────────────

interface Step1Result {
    keyword: string
    ai: {
        title: string
        searchKeyword: string
        category: string
        topic: string
        topicDescription: string | null
        isIssue: boolean
        confidence: number
    }
    estimatedHeat: number
    community: { count: number; posts: Array<{ title: string; source_site: string }> }
    news: { count: number; items: Array<{ title: string }> }
    similarIssues: Array<{ id: string; title: string; status: string; heat_index: number }>
}

interface TimelineStage {
    stage: string
    stageTitle: string
    summary: string
    dateStart: string
    dateEnd: string
}

interface CommitData {
    communityPostIds: string[]
    newsIds: string[]
    timelinePoints: Array<{
        stage: string
        title: string
        occurred_at: string
        source_url: string
        ai_summary: string | null
    }>
    briefSummary: { intro: string; bullets: string[]; conclusion: string } | null
    topicDescription: string | null
}

interface Step2Result {
    finalTitle: string
    timeline: TimelineStage[]
    commitData: CommitData
}

type WizardStep = 'input' | 's1_loading' | 'step1' | 's2_loading' | 'step2' | 'committing' | 'done'

interface Props {
    onClose: () => void
    onSuccess: () => void
}

// ─── 유틸 ─────────────────────────────────────────────────────────────────────

function HeatBar({ score }: { score: number }) {
    const color = score >= 60 ? 'bg-red-500' : score >= 30 ? 'bg-orange-400' : 'bg-gray-300'
    return (
        <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-surface-muted rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${score}%` }} />
            </div>
            <span className={`text-sm font-bold tabular-nums ${score >= 60 ? 'text-red-600' : score >= 30 ? 'text-orange-500' : 'text-content-muted'}`}>
                {score}점
            </span>
        </div>
    )
}

const STAGE_STYLE: Record<string, { header: string; card: string; dot: string }> = {
    '발단': { header: 'text-blue-600', card: 'bg-blue-50 border-blue-200', dot: 'bg-blue-400' },
    '전개': { header: 'text-green-600', card: 'bg-green-50 border-green-200', dot: 'bg-green-400' },
    '파생': { header: 'text-yellow-600', card: 'bg-yellow-50 border-yellow-200', dot: 'bg-yellow-400' },
    '진정': { header: 'text-gray-500', card: 'bg-gray-50 border-gray-200', dot: 'bg-gray-300' },
}

function formatDateRange(dateStart: string, dateEnd: string): string {
    const fmt = (s: string) => {
        const d = new Date(s)
        if (isNaN(d.getTime())) return ''
        return `${d.getMonth() + 1}월 ${d.getDate()}일`
    }
    const s = fmt(dateStart)
    const e = fmt(dateEnd)
    if (!s) return ''
    return s === e ? s : `${s} ~ ${e}`
}

// ─── 위저드 컴포넌트 ──────────────────────────────────────────────────────────

export default function ManualIssueWizard({ onClose, onSuccess }: Props) {
    const [step, setStep] = useState<WizardStep>('input')
    const [keyword, setKeyword] = useState('')
    const [step1, setStep1] = useState<Step1Result | null>(null)
    const [editedTitle, setEditedTitle] = useState('')
    const [step2, setStep2] = useState<Step2Result | null>(null)
    const [editedTimeline, setEditedTimeline] = useState<TimelineStage[]>([])
    const [error, setError] = useState<string | null>(null)
    const [commitResult, setCommitResult] = useState<{ issueId: string; issueTitle: string; heatIndex: number; warning?: string } | null>(null)

    const isBusy = step === 's1_loading' || step === 's2_loading' || step === 'committing'

    // ── Step 1: 기본 정보 조회 ────────────────────────────────────────────────

    const handleStep1 = async () => {
        if (!keyword.trim()) return
        setStep('s1_loading')
        setError(null)
        try {
            const res = await fetch('/api/admin/issues/preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keyword: keyword.trim() }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error ?? '조회 실패')
            setStep1(data)
            setEditedTitle(data.ai.title ?? keyword.trim())
            setStep('step1')
        } catch (err) {
            setError(err instanceof Error ? err.message : '조회 실패')
            setStep('input')
        }
    }

    // ── Step 2: 타임라인 생성 ─────────────────────────────────────────────────

    const handleStep2 = async () => {
        if (!step1) return
        setStep('s2_loading')
        setError(null)
        try {
            const res = await fetch('/api/admin/issues/preview/timeline', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    keyword: step1.keyword,
                    title: editedTitle,
                    searchKeyword: step1.ai.searchKeyword,
                    category: step1.ai.category,
                    topicDescription: step1.ai.topicDescription,
                }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error ?? '타임라인 생성 실패')
            setStep2(data)
            setEditedTimeline(data.timeline)
            setStep('step2')
        } catch (err) {
            setError(err instanceof Error ? err.message : '타임라인 생성 실패')
            setStep('step1')
        }
    }

    // ── Step 3: 등록 ─────────────────────────────────────────────────────────

    const handleCommit = async () => {
        if (!step1 || !step2) return
        setStep('committing')
        setError(null)
        try {
            const res = await fetch('/api/admin/issues/manual', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mode: 'commit',
                    keyword: step1.keyword,
                    confirmedTitle: editedTitle,
                    category: step1.ai.category,
                    topic: step1.ai.topic,
                    topicDescription: step1.ai.topicDescription,
                    communityPostIds: step2.commitData.communityPostIds,
                    newsIds: step2.commitData.newsIds,
                    timelinePoints: step2.commitData.timelinePoints,
                    timelineSummaries: editedTimeline,
                    briefSummary: step2.commitData.briefSummary,
                }),
            })
            const data = await res.json()
            if (!res.ok || !data.success) throw new Error(data.message ?? '등록 실패')
            setCommitResult({
                issueId: data.issueId,
                issueTitle: data.issueTitle,
                heatIndex: data.heatIndex,
                warning: data.warning,
            })
            setStep('done')
            onSuccess()
            setTimeout(() => onClose(), 2500)
        } catch (err) {
            setError(err instanceof Error ? err.message : '등록 실패')
            setStep('step2')
        }
    }

    // ── 타임라인 수정 헬퍼 ────────────────────────────────────────────────────

    const updateTimeline = (index: number, field: 'stageTitle' | 'summary', value: string) => {
        setEditedTimeline(prev => prev.map((t, i) => i === index ? { ...t, [field]: value } : t))
    }

    // ── 단계 표시 인디케이터 ──────────────────────────────────────────────────

    const currentStepNum = step === 'input' || step === 's1_loading' ? 1
        : step === 'step1' || step === 's2_loading' ? 2
        : 3

    const StepIndicator = () => (
        <div className="flex items-center gap-1 text-xs text-content-muted">
            {[1, 2, 3].map(n => (
                <div key={n} className="flex items-center gap-1">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center font-semibold text-[10px] transition-colors
                        ${n < currentStepNum ? 'bg-primary text-white' : n === currentStepNum ? 'bg-primary/15 text-primary' : 'bg-surface-muted text-content-muted'}`}>
                        {n < currentStepNum ? '✓' : n}
                    </div>
                    {n < 3 && <div className={`w-4 h-px ${n < currentStepNum ? 'bg-primary' : 'bg-border'}`} />}
                </div>
            ))}
        </div>
    )

    // ── 렌더링 ────────────────────────────────────────────────────────────────

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
        >
            <div className="w-full max-w-lg bg-surface rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>

                {/* 헤더 */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
                    <div className="flex items-center gap-3">
                        <h2 className="text-base font-bold text-content-primary">이슈 수동 등록</h2>
                        <StepIndicator />
                    </div>
                    <button onClick={onClose} disabled={isBusy} className="text-content-muted hover:text-content-secondary disabled:opacity-40">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* 바디 */}
                <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

                    {/* ── 공통: 키워드 입력 (input, step1) ── */}
                    {(step === 'input' || step === 's1_loading' || step === 'step1' || step === 's2_loading') && (
                        <div>
                            <label className="block text-xs font-medium text-content-secondary mb-1.5">키워드 / 주제</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={keyword}
                                    onChange={e => { setKeyword(e.target.value); setStep('input'); setStep1(null) }}
                                    onKeyDown={e => { if (e.key === 'Enter' && step === 'input') handleStep1() }}
                                    placeholder="예: 뉴진스 계약 분쟁, 배달의민족 수수료 인상"
                                    disabled={isBusy}
                                    className="flex-1 px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                                />
                                <button
                                    onClick={handleStep1}
                                    disabled={!keyword.trim() || isBusy || step === 'step1'}
                                    className="text-sm px-4 py-2 bg-surface-subtle border border-border text-content-secondary rounded-lg hover:bg-surface-muted disabled:opacity-40 whitespace-nowrap font-medium"
                                >
                                    {step === 's1_loading' ? '조회 중...' : step === 'step1' ? '조회됨' : '조회'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── Step 1 로딩 ── */}
                    {step === 's1_loading' && (
                        <div className="py-6 text-center space-y-2">
                            <div className="text-sm font-medium text-content-primary">AI 분석 중...</div>
                            <div className="text-xs text-content-muted">커뮤니티 현황 확인 · 제목 생성 · 뉴스 검색</div>
                        </div>
                    )}

                    {/* ── Step 1 결과 ── */}
                    {step1 && (step === 'step1' || step === 's2_loading') && (
                        <div className="space-y-4">
                            {/* 예상 화력 + 통계 */}
                            <div>
                                <p className="text-xs font-medium text-content-secondary mb-1.5">예상 화력</p>
                                <HeatBar score={step1.estimatedHeat} />
                            </div>

                            <div className="space-y-3">
                                {/* 카운트 카드 */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className={`p-3 rounded-xl border ${step1.community.count > 0 ? 'bg-green-50 border-green-200' : 'bg-surface-subtle border-border'}`}>
                                        <p className={`text-xs font-semibold mb-0.5 ${step1.community.count > 0 ? 'text-green-700' : 'text-content-muted'}`}>커뮤니티 반응</p>
                                        <p className={`text-2xl font-bold ${step1.community.count > 0 ? 'text-green-600' : 'text-content-muted'}`}>{step1.community.count}건</p>
                                    </div>
                                    <div className={`p-3 rounded-xl border ${step1.news.count > 0 ? 'bg-blue-50 border-blue-200' : 'bg-red-50 border-red-200'}`}>
                                        <p className={`text-xs font-semibold mb-0.5 ${step1.news.count > 0 ? 'text-blue-700' : 'text-red-700'}`}>네이버 뉴스</p>
                                        <p className={`text-2xl font-bold ${step1.news.count > 0 ? 'text-blue-600' : 'text-red-600'}`}>{step1.news.count}건</p>
                                        {step1.news.count === 0 && <p className="text-xs text-red-600 mt-0.5">뉴스 없으면 등록 불가</p>}
                                    </div>
                                </div>

                                {/* 커뮤니티 목록 */}
                                {step1.community.posts.length > 0 && (
                                    <div>
                                        <p className="text-xs font-medium text-content-secondary mb-1">커뮤니티 매칭 글 <span className="font-normal text-content-muted">(최근 48h 샘플)</span></p>
                                        <ul className="space-y-1">
                                            {step1.community.posts.map((p, i) => (
                                                <li key={i} className="text-xs text-content-secondary bg-surface-subtle rounded-lg px-2.5 py-1.5 line-clamp-1">
                                                    <span className="text-content-muted mr-1">[{p.source_site}]</span>{p.title}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {/* 뉴스 목록 */}
                                {step1.news.items.length > 0 && (
                                    <div>
                                        <p className="text-xs font-medium text-content-secondary mb-1">네이버 뉴스 검색 목록</p>
                                        <ul className="space-y-1">
                                            {step1.news.items.map((n, i) => (
                                                <li key={i} className="text-xs text-content-secondary bg-surface-subtle rounded-lg px-2.5 py-1.5 line-clamp-1">{n.title}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>

                            {/* AI 생성 제목 (수정 가능) */}
                            <div>
                                <label className="block text-xs font-medium text-content-secondary mb-1.5">
                                    이슈 제목
                                    <span className="ml-1 text-content-muted font-normal">(수정 가능)</span>
                                </label>
                                <input
                                    type="text"
                                    value={editedTitle}
                                    onChange={e => setEditedTitle(e.target.value)}
                                    disabled={step === 's2_loading'}
                                    className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 font-medium"
                                />
                                <p className="mt-1 text-xs text-content-muted">제목이 뉴스 필터링과 타임라인 생성에 영향을 미칩니다</p>
                            </div>

                            {/* 유사 이슈 */}
                            {step1.similarIssues.length > 0 && (
                                <div>
                                    <p className="text-xs font-medium text-amber-700 mb-1.5">유사 이슈 (중복 가능)</p>
                                    <ul className="space-y-1">
                                        {step1.similarIssues.map(issue => (
                                            <li key={issue.id} className="text-xs bg-amber-50 border border-amber-200 px-2.5 py-1.5 rounded-lg flex items-center justify-between gap-2">
                                                <span className="line-clamp-1 text-content-primary">{issue.title}</span>
                                                <span className="shrink-0 text-amber-700">{issue.heat_index}점</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Step 2 로딩 ── */}
                    {step === 's2_loading' && (
                        <div className="py-6 text-center space-y-2">
                            <div className="text-sm font-medium text-content-primary">타임라인 생성 중...</div>
                            <div className="text-xs text-content-muted">뉴스 필터링 · 단계 분류 · 요약 작성 (20~30초)</div>
                        </div>
                    )}

                    {/* ── Step 2 결과: 타임라인 편집 ── */}
                    {step === 'step2' && step2 && (
                        <div className="space-y-3">
                            {/* 확정 제목 표시 */}
                            <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl">
                                <p className="text-xs text-content-muted mb-0.5">확정 제목</p>
                                <p className="text-sm font-semibold text-content-primary">{editedTitle}</p>
                                {step2.finalTitle !== editedTitle && (
                                    <p className="text-xs text-content-muted mt-1">AI 정제 제안: <span className="text-primary">{step2.finalTitle}</span></p>
                                )}
                            </div>

                            {editedTimeline.length === 0 ? (
                                <p className="text-sm text-content-muted text-center py-4">타임라인 데이터가 없습니다</p>
                            ) : (
                                <>
                                    <p className="text-xs font-medium text-content-secondary">타임라인 <span className="text-content-muted font-normal">(소제목·내용 수정 가능)</span></p>
                                    {editedTimeline.map((stage, i) => {
                                        const style = STAGE_STYLE[stage.stage] ?? STAGE_STYLE['전개']
                                        const dateRange = formatDateRange(stage.dateStart, stage.dateEnd)
                                        return (
                                            <div key={i} className={`border rounded-xl p-3 space-y-2 ${style.card}`}>
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
                                                    <span className={`text-xs font-bold ${style.header}`}>{stage.stage}</span>
                                                    {dateRange && <span className="text-xs text-content-muted ml-auto">{dateRange}</span>}
                                                </div>
                                                <input
                                                    type="text"
                                                    value={stage.stageTitle}
                                                    onChange={e => updateTimeline(i, 'stageTitle', e.target.value)}
                                                    placeholder="소제목 (선택)"
                                                    maxLength={20}
                                                    className="w-full px-2.5 py-1.5 text-xs font-medium border border-border/60 bg-white/70 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30"
                                                />
                                                <textarea
                                                    value={stage.summary}
                                                    onChange={e => updateTimeline(i, 'summary', e.target.value)}
                                                    placeholder="단계 요약 내용"
                                                    rows={3}
                                                    className="w-full px-2.5 py-1.5 text-xs border border-border/60 bg-white/70 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30 resize-none leading-relaxed"
                                                />
                                            </div>
                                        )
                                    })}
                                </>
                            )}
                        </div>
                    )}

                    {/* ── Done ── */}
                    {step === 'done' && commitResult && (
                        <div className="py-4 space-y-3">
                            <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
                                <p className="text-sm font-bold text-green-800">등록 완료</p>
                                <p className="text-xs text-green-700 mt-1">"{commitResult.issueTitle}"</p>
                                <p className="text-xs text-green-600 mt-0.5">화력 {commitResult.heatIndex}점</p>
                                {commitResult.warning && (
                                    <p className="text-xs text-amber-700 mt-1">{commitResult.warning}</p>
                                )}
                                <a
                                    href={`/issue/${commitResult.issueId}`}
                                    target="_blank"
                                    className="mt-2 inline-block text-xs text-green-700 underline underline-offset-2"
                                >
                                    이슈 페이지 열기 →
                                </a>
                            </div>
                        </div>
                    )}

                    {/* ── 에러 ── */}
                    {error && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">{error}</div>
                    )}

                    {/* ── Committing ── */}
                    {step === 'committing' && (
                        <div className="py-4 text-center space-y-1">
                            <div className="text-sm font-medium text-content-primary">등록 중...</div>
                            <div className="text-xs text-content-muted">이슈·뉴스·타임라인 저장 중입니다</div>
                        </div>
                    )}
                </div>

                {/* 푸터 */}
                <div className="px-5 py-4 border-t border-border flex items-center justify-between gap-2 shrink-0">
                    <button
                        onClick={onClose}
                        disabled={isBusy}
                        className="text-sm px-4 py-2 bg-surface-subtle border border-border text-content-secondary rounded-full hover:bg-surface-muted disabled:opacity-40"
                    >
                        {step === 'done' ? '닫기' : '취소'}
                    </button>

                    <div className="flex gap-2">
                        {/* 이전 버튼 */}
                        {(step === 'step2') && (
                            <button
                                onClick={() => { setStep('step1'); setStep2(null) }}
                                className="text-sm px-4 py-2 border border-border text-content-secondary rounded-full hover:bg-surface-muted"
                            >
                                ← 이전
                            </button>
                        )}

                        {/* Step 1 → 2 */}
                        {step === 'step1' && (
                            <button
                                onClick={handleStep2}
                                disabled={!editedTitle.trim() || step1?.news.count === 0}
                                className="text-sm px-5 py-2 bg-primary text-white rounded-full hover:bg-primary/90 disabled:opacity-40 font-medium"
                            >
                                타임라인 생성 →
                            </button>
                        )}

                        {/* Step 2 → 등록 */}
                        {step === 'step2' && (
                            <button
                                onClick={handleCommit}
                                disabled={!step2 || step2.commitData.newsIds.length === 0}
                                className="text-sm px-5 py-2 bg-primary text-white rounded-full hover:bg-primary/90 disabled:opacity-40 font-medium"
                            >
                                등록하기
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
