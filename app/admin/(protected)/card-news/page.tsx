'use client'

import { useState, useEffect, useRef } from 'react'

interface IssueOption {
  id: string
  title: string
  category: string
  heat_index: number | null
  approval_status: string
  approval_type: string | null
  status: string
}

type CardNewsMode = 'surging' | 'timeline' | 'qa' | 'debate'

const MODE_OPTIONS: { value: CardNewsMode; label: string; desc: string }[] = [
  { value: 'surging',  label: '급상승형', desc: '화력 급상승 이슈 집중 분석' },
  { value: 'timeline', label: '타임라인', desc: '이슈 흐름 단계별 정리' },
  { value: 'qa',       label: 'Q&A형',    desc: '무슨 일 / 왜 논란 / 앞으로 어떻게' },
  { value: 'debate',   label: '찬반형',   desc: '찬성 vs 반대 논점 정리' },
]

export default function CardNewsPage() {
  const [issues, setIssues] = useState<IssueOption[]>([])
  const [loadingIssues, setLoadingIssues] = useState(true)
  const [selectedIssueId, setSelectedIssueId] = useState('')
  const [issueSearchQuery, setIssueSearchQuery] = useState('')
  const [issueDropdownOpen, setIssueDropdownOpen] = useState(false)
  const issueDropdownRef = useRef<HTMLDivElement>(null)

  const [selectedMode, setSelectedMode] = useState<CardNewsMode>('surging')
  const [htmlSlides, setHtmlSlides] = useState<string[]>([])
  const [previewing, setPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [dispatching, setDispatching] = useState(false)
  const [dispatchResult, setDispatchResult] = useState<{ ok: boolean; runUrl?: string; error?: string } | null>(null)

  // 이슈 목록 로드 (최근 7일, 승인된 이슈, 화력 높은 순)
  useEffect(() => {
    async function loadIssues() {
      try {
        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        const res = await fetch(`/api/admin/issues?approval_status=승인&created_after=${encodeURIComponent(since)}&limit=200`)
        const json = await res.json() as { data?: IssueOption[] }
        const sorted = (json.data ?? []).sort((a, b) => (b.heat_index ?? 0) - (a.heat_index ?? 0))
        setIssues(sorted)
      } catch {
        setIssues([])
      } finally {
        setLoadingIssues(false)
      }
    }
    loadIssues()
  }, [])

  // 드롭다운 외부 클릭 닫기
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (issueDropdownRef.current && !issueDropdownRef.current.contains(e.target as Node)) {
        setIssueDropdownOpen(false)
      }
    }
    if (issueDropdownOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [issueDropdownOpen])

  const selectedIssue = issues.find(i => i.id === selectedIssueId) ?? null
  const filteredIssues = issues.filter(i =>
    i.title.toLowerCase().includes(issueSearchQuery.toLowerCase())
  )

  function handleSelectIssue(issue: IssueOption) {
    setSelectedIssueId(issue.id)
    setIssueSearchQuery('')
    setIssueDropdownOpen(false)
    setHtmlSlides([])
    setPreviewError('')
    setDispatchResult(null)
  }

  function handleModeChange(mode: CardNewsMode) {
    setSelectedMode(mode)
    setHtmlSlides([])
    setDispatchResult(null)
  }

  async function handlePreview() {
    if (!selectedIssue) return
    setPreviewing(true)
    setHtmlSlides([])
    setPreviewError('')
    setDispatchResult(null)
    try {
      const res = await fetch('/api/admin/card-news/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueId: selectedIssue.id, mode: selectedMode }),
      })
      const json = await res.json() as { htmlSlides?: string[]; error?: string }
      if (!res.ok || json.error) { setPreviewError(json.error ?? '미리보기 생성 실패'); return }
      setHtmlSlides(json.htmlSlides ?? [])
    } catch (e) {
      setPreviewError((e as Error).message)
    } finally {
      setPreviewing(false)
    }
  }

  async function handleDispatch(publish: boolean) {
    if (!selectedIssue) return
    setDispatching(true)
    setDispatchResult(null)
    try {
      const res = await fetch('/api/admin/card-news/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueId: selectedIssue.id, mode: selectedMode, publish }),
      })
      const json = await res.json() as { ok?: boolean; runUrl?: string; error?: string }
      setDispatchResult({ ok: json.ok ?? false, runUrl: json.runUrl, error: json.error })
    } catch (e) {
      setDispatchResult({ ok: false, error: (e as Error).message })
    } finally {
      setDispatching(false)
    }
  }

  const canAct = !!selectedIssue && !previewing && !dispatching

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-content-primary">카드뉴스 관리</h1>
        <p className="mt-1 text-sm text-content-muted">승인된 이슈를 선택해 카드뉴스를 수동 생성하고 SNS에 발행합니다.</p>
      </div>

      {/* 이슈 선택 */}
      <div className="card p-6 space-y-4">
        <h2 className="text-sm font-semibold text-content-secondary">1. 이슈 선택</h2>
        <div className="space-y-1">
          <label className="text-xs font-medium text-content-secondary">
            대상 이슈 (승인된 이슈만 · 최근 7일)
          </label>

          {loadingIssues ? (
            <p className="text-sm text-content-muted">이슈 목록 불러오는 중...</p>
          ) : (
            <div className="relative" ref={issueDropdownRef}>
              <input
                type="text"
                value={issueDropdownOpen ? issueSearchQuery : (selectedIssue?.title ?? '')}
                onChange={e => {
                  setIssueSearchQuery(e.target.value)
                  setSelectedIssueId('')
                }}
                onFocus={() => {
                  setIssueDropdownOpen(true)
                  setIssueSearchQuery('')
                }}
                placeholder="이슈를 검색하세요"
                className="w-full pl-3 pr-8 py-2 text-sm border border-border rounded-xl focus:outline-none focus:border-primary bg-surface"
                readOnly={!issueDropdownOpen}
              />
              <svg
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>

              {issueDropdownOpen && (
                <div className="absolute z-20 w-full mt-1 bg-surface border border-border rounded-xl shadow-lg max-h-60 overflow-y-auto">
                  {filteredIssues.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-content-muted">검색 결과 없음</div>
                  ) : (
                    filteredIssues.map(issue => (
                      <div
                        key={issue.id}
                        onMouseDown={() => handleSelectIssue(issue)}
                        className={`px-3 py-2 text-sm cursor-pointer hover:bg-surface-subtle ${selectedIssueId === issue.id ? 'bg-primary-light/20 text-primary' : 'text-content-primary'}`}
                      >
                        {issue.title}
                        {issue.heat_index != null && (
                          <span className="text-content-muted ml-1">(화력 {issue.heat_index})</span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {!loadingIssues && issues.length === 0 && (
            <p className="text-xs text-content-muted">최근 7일 내 승인된 이슈가 없습니다.</p>
          )}
        </div>
      </div>

      {/* 템플릿 선택 */}
      <div className="card p-6 space-y-4">
        <h2 className="text-sm font-semibold text-content-secondary">2. 템플릿 선택</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {MODE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleModeChange(opt.value)}
              className={`rounded-xl border-2 p-3 text-left transition-colors ${
                selectedMode === opt.value
                  ? 'border-primary bg-primary-light/20'
                  : 'border-border hover:border-primary-muted'
              }`}
            >
              <p className={`text-sm font-semibold ${selectedMode === opt.value ? 'text-primary' : 'text-content-primary'}`}>
                {opt.label}
              </p>
              <p className="mt-0.5 text-xs text-content-muted">{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* 미리보기 + 발행 */}
      <div className="card p-6 space-y-4">
        <h2 className="text-sm font-semibold text-content-secondary">3. 미리보기 및 발행</h2>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handlePreview}
            disabled={!canAct}
            className="btn-primary btn-md disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {previewing ? '생성 중...' : 'HTML 미리보기'}
          </button>
          <button
            type="button"
            onClick={() => handleDispatch(false)}
            disabled={!canAct}
            className="btn-neutral btn-md disabled:opacity-40 disabled:cursor-not-allowed"
          >
            테스트 실행 (업로드 없음)
          </button>
          <button
            type="button"
            onClick={() => handleDispatch(true)}
            disabled={!canAct}
            className="btn-md rounded-xl bg-green-600 px-5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {dispatching ? '발행 중...' : 'SNS 발행'}
          </button>
        </div>

        {previewError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            ⚠️ {previewError}
          </div>
        )}

        {dispatchResult && (
          <div className={`rounded-xl border px-4 py-3 text-sm ${dispatchResult.ok ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
            {dispatchResult.ok ? (
              <>
                ✅ GitHub Actions 워크플로우 트리거됨.{' '}
                {dispatchResult.runUrl && (
                  <a href={dispatchResult.runUrl} target="_blank" rel="noreferrer" className="underline font-medium">
                    실행 현황 보기 →
                  </a>
                )}
              </>
            ) : (
              `❌ ${dispatchResult.error ?? '발행 실패'}`
            )}
          </div>
        )}
      </div>

      {/* 슬라이드 미리보기 */}
      {htmlSlides.length > 0 && (
        <div className="card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-content-secondary">
              슬라이드 미리보기 ({htmlSlides.length}장)
            </h2>
            <span className="text-xs text-content-muted">실제 크기: 1080 × 1350px · 33% 축소 표시</span>
          </div>
          <div className="flex flex-wrap gap-5">
            {htmlSlides.map((html, i) => (
              <div key={i} className="shrink-0">
                <p className="mb-1 text-center text-xs text-content-muted">슬라이드 {i + 1}</p>
                <div className="overflow-hidden rounded-xl border border-border shadow-sm" style={{ width: 356, height: 445 }}>
                  <iframe
                    srcDoc={html}
                    sandbox="allow-scripts"
                    scrolling="no"
                    style={{
                      width: 1080,
                      height: 1350,
                      transform: 'scale(0.33)',
                      transformOrigin: 'top left',
                      border: 'none',
                      pointerEvents: 'none',
                    }}
                    title={`slide-${i + 1}`}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
