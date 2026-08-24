'use client'

/**
 * app/admin/(protected)/shortform/page.tsx
 *
 * [관리자 - 숏폼 job 관리 페이지]
 */

import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import Link from 'next/link'
import AdminPagination from '@/components/admin/AdminPagination'
import AdminTabFilter from '@/components/admin/AdminTabFilter'
import LongformTab from '@/components/admin/LongformTab'
import { wordWrapLines, DESC_MAX_CHARS_PER_LINE, DESC_SAFE_MAX_LINES } from '@/lib/shortform/text-wrap'

interface PlatformStats {
    youtube?: { views: number; likes: number; comments: number; averageViewPercentage: number | null; fetched_at: string }
    instagram?: { plays: number; reach: number; likes: number; comments: number; shares: number; saved: number; avgWatchTimeMs: number | null; fetched_at: string }
}

interface ShortformJob {
    id: string
    issue_id: string
    issue_title: string
    issue_status: string
    heat_grade: string
    source_count: { news: number; community: number }
    issue_url: string
    video_path: string | null
    approval_status: 'pending' | 'approved' | 'rejected'
    upload_status: Record<string, string> | null
    platform_stats: PlatformStats | null
    trigger_type: 'issue_created'
    created_at: string
}

interface IssueOption {
    id: string
    title: string
    approval_status: string
    heat_index: number | null
}

interface InstagramMedia {
    id: string
    caption?: string
    media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM'
    timestamp: string
    thumbnail_url?: string
    media_url?: string
    permalink?: string
}

interface StageSummary {
    stage: string
    stageTitle: string
    bullets: Array<string | { date: string; text: string }>
}

interface SelectedContentItem {
    id: string
    source: 'topic' | 'stage'
    stage?: string
    stageTitle?: string
    text: string
}

const STAGE_STYLE: Record<string, { badge: string; border: string; header: string; row: string }> = {
    '발단': { badge: 'bg-blue-100 text-blue-600',    border: 'border-blue-200',  header: 'bg-blue-50',   row: 'hover:bg-blue-50/60' },
    '전개': { badge: 'bg-green-100 text-green-600',   border: 'border-green-200', header: 'bg-green-50',  row: 'hover:bg-green-50/60' },
    '파생': { badge: 'bg-yellow-100 text-yellow-600', border: 'border-yellow-200',header: 'bg-yellow-50', row: 'hover:bg-yellow-50/60' },
    '진정': { badge: 'bg-gray-200 text-gray-600',     border: 'border-gray-300',  header: 'bg-gray-100',  row: 'hover:bg-gray-50/60' },
    '종결': { badge: 'bg-gray-200 text-gray-600',     border: 'border-gray-300',  header: 'bg-gray-100',  row: 'hover:bg-gray-50/60' },
}

/** 유사한 항목 제거 — 문자 집합 기준 Jaccard 유사도 0.72 초과 시 중복 처리 */
function deduplicateItems(items: SelectedContentItem[]): SelectedContentItem[] {
    const norm = (s: string) => s.replace(/[\s.,!?~""''·]/g, '')
    const kept: SelectedContentItem[] = []
    for (const item of items) {
        const na = norm(item.text)
        const isDuplicate = kept.some(k => {
            const nb = norm(k.text)
            if (na === nb) return true
            if (na.includes(nb) || nb.includes(na)) return true
            const sa = new Set(na.split(''))
            const sb = new Set(nb.split(''))
            const intersection = [...sa].filter(c => sb.has(c)).length
            const union = new Set([...sa, ...sb]).size
            return intersection / union > 0.72
        })
        if (!isDuplicate) kept.push(item)
    }
    return kept
}

function buildItemsFromSummaries(stageSummaries: StageSummary[]): SelectedContentItem[] {
    const items: SelectedContentItem[] = []
    stageSummaries.forEach(({ stage, stageTitle, bullets }) => {
        bullets.forEach((b, i) => {
            const text = typeof b === 'string' ? b : b.text
            if (text?.trim()) items.push({ id: `stage_${stage}_${i}`, source: 'stage', stage, stageTitle, text: text.trim() })
        })
    })
    return items
}

type FilterStatus = '' | 'pending' | 'approved' | 'rejected'

interface ImagePreviewModal {
    open: boolean
    jobId: string
    jobIssueId: string
    jobTitle: string
    jobIssueStatus: string
    images: string[]
    fullImages: string[]
    loading: boolean
    generating: boolean
    error: string | null
    contentLoading: boolean
    selectedItems: SelectedContentItem[]
    allBullets: string[]
    rewrittenTexts: string[]
    rewrittenHighlights: string[][]
    rewriteLoading: boolean
    rewriteError: string | null
    highlightsLoading: boolean
    highlightsBudgetExceeded: boolean
    highlightsFailedIndices: number[]
}

const FILTER_LABELS: { value: FilterStatus; label: string }[] = [
    { value: '', label: '전체' },
    { value: 'pending', label: '대기' },
    { value: 'approved', label: '승인' },
    { value: 'rejected', label: '반려' },
]

const APPROVAL_STATUS_STYLE: Record<string, string> = {
    'pending': 'bg-yellow-100 text-yellow-700',
    'approved': 'bg-green-100 text-green-700',
    'rejected': 'bg-red-100 text-red-700',
}

function formatDate(dateString: string): string {
    const date = new Date(dateString)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hour = String(date.getHours()).padStart(2, '0')
    const minute = String(date.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day} ${hour}:${minute}`
}

function formatVideoTime(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
}

function getStoragePublicUrl(path: string): string {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL
    return `${base}/storage/v1/object/public/shortform/${path}`
}

const PAGE_SIZE = 20

/** 씬 카드 상단 — 배지(씬 번호/타임라인 단계) + 원문 텍스트. 씬 1개/2개 레이아웃 공용. */
function SceneSourceHeader({ sceneIndex, item, className }: {
    sceneIndex: number
    item: SelectedContentItem
    className?: string
}) {
    const sourceStyle = item.source === 'stage' && item.stage
        ? (STAGE_STYLE[item.stage] ?? STAGE_STYLE['진정'])
        : null
    return (
        <div className={className}>
            <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-[10px] font-bold text-white bg-black/50 px-1.5 py-0.5 rounded-full">씬 {sceneIndex + 1}</span>
                {sourceStyle && item.stage ? (
                    <>
                        <span className="text-[10px] font-semibold text-content-muted bg-surface px-1.5 py-0.5 rounded-full border border-border">타임라인</span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${sourceStyle.badge}`}>{item.stage}</span>
                    </>
                ) : (
                    <span className="text-[10px] font-semibold text-content-muted bg-surface px-1.5 py-0.5 rounded-full border border-border">이슈 설명</span>
                )}
            </div>
            <p className="text-[11px] text-content-muted leading-relaxed line-clamp-3">{item.text}</p>
        </div>
    )
}

/** 씬 카드 하단 — "씬 자막" textarea + 줄수 표시 + 하이라이트 칩/입력. 씬 1개/2개 레이아웃 공용. */
function SceneCaptionEditor({
    sceneIndex, text, highlights, highlightInput, refreshIcon,
    isRewriting, rewritingBusy, rewriteLoading,
    isHighlighting, highlightingBusy, highlightsLoading, highlightExtractDisabled, extractionFailed,
    onChangeText, onExtractHighlight, onRefreshText, onRemoveHighlight, onAddHighlight, onChangeHighlightInput,
}: {
    sceneIndex: number
    text: string
    highlights: string[]
    highlightInput: string
    refreshIcon: ReactNode
    isRewriting: boolean
    rewritingBusy: boolean
    rewriteLoading: boolean
    isHighlighting: boolean
    highlightingBusy: boolean
    highlightsLoading: boolean
    highlightExtractDisabled: boolean
    extractionFailed: boolean
    onChangeText: (value: string) => void
    onExtractHighlight: () => void
    onRefreshText: () => void
    onRemoveHighlight: (wordIndex: number) => void
    onAddHighlight: (word: string) => void
    onChangeHighlightInput: (value: string) => void
}) {
    const descLines = wordWrapLines(text, DESC_MAX_CHARS_PER_LINE)
    const isOverLimit = descLines.length > DESC_SAFE_MAX_LINES
    return (
        <>
            <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-semibold text-primary">씬 자막</span>
                <div className="flex items-center gap-1.5">
                    <button
                        onClick={onExtractHighlight}
                        disabled={highlightExtractDisabled || highlightingBusy || highlightsLoading || !text.trim()}
                        className="text-content-muted enabled:hover:text-primary disabled:opacity-40 transition-colors"
                        title="하이라이트 추출"
                    >
                        {isHighlighting
                            ? <div className="w-4 h-4 border border-current border-t-transparent rounded-full animate-spin" />
                            : <span className="w-4 h-4 flex items-center justify-center text-[18px] leading-none">✦</span>
                        }
                    </button>
                    <button
                        onClick={onRefreshText}
                        disabled={rewritingBusy || rewriteLoading}
                        className="text-content-muted hover:text-primary disabled:opacity-40 transition-colors"
                        title="텍스트 재생성"
                    >
                        {isRewriting
                            ? <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                            : refreshIcon
                        }
                    </button>
                </div>
            </div>
            {rewriteLoading ? (
                <div className="space-y-1.5">
                    <div className="h-2.5 bg-surface-muted rounded animate-pulse" />
                    <div className="h-2.5 bg-surface-muted rounded animate-pulse w-4/5" />
                    <div className="h-2.5 bg-surface-muted rounded animate-pulse w-3/5" />
                </div>
            ) : (
                <>
                <textarea
                    value={text}
                    onChange={e => onChangeText(e.target.value)}
                    rows={3}
                    placeholder="씬 자막을 입력하세요."
                    className="w-full text-xs font-medium text-content-primary resize-none bg-transparent outline-none leading-relaxed placeholder:text-content-muted rounded-none"
                />
                <div
                    className={`mt-1 text-[10px] font-medium ${isOverLimit ? 'text-red-500' : 'text-content-muted'}`}
                    title={`최대 ${DESC_SAFE_MAX_LINES}줄까지 입력 가능`}
                >
                    {descLines.length}/<span className="text-content-secondary font-semibold">{DESC_SAFE_MAX_LINES}</span>줄{isOverLimit ? ' · 하단 UI와 겹칠 수 있어요' : ''}
                </div>
                <div className="mt-2">
                    <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-semibold text-primary">하이라이트 자막</span>
                        {extractionFailed && (
                            <span className="text-[10px] font-medium text-red-500">추출 실패 · ✦ 버튼으로 다시 시도해 주세요</span>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1 items-center">
                        {highlights.map((word, wi) => (
                            <span key={wi} className="inline-flex items-center gap-0.5 text-[10px] font-semibold bg-yellow-200 text-yellow-800 px-1.5 py-0.5 rounded">
                                {word}
                                <button
                                    onClick={() => onRemoveHighlight(wi)}
                                    className="ml-0.5 text-yellow-600 hover:text-yellow-900 leading-none"
                                >×</button>
                            </span>
                        ))}
                        <input
                            type="text"
                            value={highlightInput}
                            onChange={e => onChangeHighlightInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') onAddHighlight(highlightInput) }}
                            placeholder="+ 단어 추가"
                            size={Math.max(4, highlightInput.length + 2)}
                            style={{ borderRadius: 0 }}
                            className="text-[10px] text-content-muted placeholder:text-content-muted bg-transparent outline-none min-w-0 rounded-none"
                        />
                    </div>
                </div>
                </>
            )}
        </>
    )
}

export default function AdminShortformPage() {
    const [pageTab, setPageTab] = useState<'shortform' | 'longform'>('shortform')
    const [jobs, setJobs] = useState<ShortformJob[]>([])
    const [total, setTotal] = useState(0)
    const [filter, setFilter] = useState<FilterStatus>('pending')
    const [page, setPage] = useState(1)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [processingId, setProcessingId] = useState<string | null>(null)
    const [uploadingAction, setUploadingAction] = useState<'youtube' | 'tiktok' | 'instagram' | 'instagram-media-id' | 'all' | null>(null)
    const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null)
    const [rewritingIndex, setRewritingIndex] = useState<number | null>(null)
    const [highlightingGroupIndex, setHighlightingGroupIndex] = useState<number | null>(null)
    const [copiedTiktokId, setCopiedTiktokId] = useState<string | null>(null)
    const [lastAiCallAt, setLastAiCallAt] = useState(0)

    const [previewJob, setPreviewJob] = useState<ShortformJob | null>(null)
    const [tabCounts, setTabCounts] = useState<Record<string, number>>({})
    const [imagePreview, setImagePreview] = useState<ImagePreviewModal>({
        open: false,
        jobId: '',
        jobIssueId: '',
        jobTitle: '',
        jobIssueStatus: '',
        images: [],
        fullImages: [],
        loading: false,
        generating: false,
        error: null,
        contentLoading: false,
        selectedItems: [],
        allBullets: [],
        rewrittenTexts: [],
        rewrittenHighlights: [],
        rewriteLoading: false,
        rewriteError: null,
        highlightsLoading: false,
        highlightsBudgetExceeded: false,
        highlightsFailedIndices: [],
    })

    // Instagram 미디어 선택 모달
    const [igMediaModal, setIgMediaModal] = useState<{
        open: boolean
        jobId: string | null
        jobTitle: string
        media: InstagramMedia[]
        loading: boolean
        loadingMore: boolean
        error: string | null
        nextCursor: string | null
        hasMore: boolean
    }>({ open: false, jobId: null, jobTitle: '', media: [], loading: false, loadingMore: false, error: null, nextCursor: null, hasMore: false })

    // 수동 생성 인라인 영역
    const [selectedIssueId, setSelectedIssueId] = useState('')
    const [manualCreateLoading, setManualCreateLoading] = useState(false)
    const [manualCreateError, setManualCreateError] = useState<string | null>(null)
    const [issueOptions, setIssueOptions] = useState<IssueOption[]>([])
    const [issueOptionsLoading, setIssueOptionsLoading] = useState(false)
    const [issueSearchQuery, setIssueSearchQuery] = useState('')
    const [issueDropdownOpen, setIssueDropdownOpen] = useState(false)
    const issueDropdownRef = useRef<HTMLDivElement>(null)
    const videoRef = useRef<HTMLVideoElement>(null)
    const igScrollContainerRef = useRef<HTMLDivElement>(null)
    const igSentinelRef = useRef<HTMLDivElement>(null)
    const shortformModalRef = useRef<HTMLDivElement>(null)
    const [videoPlaying, setVideoPlaying] = useState(false)
    const [videoCurrentTime, setVideoCurrentTime] = useState(0)
    const [videoDuration, setVideoDuration] = useState(0)

    const AI_CALL_COOLDOWN_MS = 3000
    /** 과금되는 AI 재생성 호출(텍스트/이미지/하이라이트) 연타 방지 — 쿨다운 중이면 false */
    const tryStartAiCall = (): boolean => {
        const now = Date.now()
        if (now - lastAiCallAt < AI_CALL_COOLDOWN_MS) return false
        setLastAiCallAt(now)
        return true
    }

    const loadTabCounts = useCallback(async () => {
        const tabParams: { value: FilterStatus; params: Record<string, string> }[] = [
            { value: '', params: {} },
            { value: 'pending', params: { approval_status: 'pending' } },
            { value: 'approved', params: { approval_status: 'approved' } },
            { value: 'rejected', params: { approval_status: 'rejected' } },
        ]
        try {
            const results = await Promise.all(
                tabParams.map(({ params }) => {
                    const p = new URLSearchParams({ limit: '1', offset: '0', ...params })
                    return fetch(`/api/admin/shortform?${p}`).then(r => r.ok ? r.json() : null)
                })
            )
            const counts: Record<string, number> = {}
            tabParams.forEach(({ value }, i) => {
                counts[value] = results[i]?.total ?? 0
            })
            setTabCounts(counts)
        } catch {
            // 카운트 로드 실패 시 무시
        }
    }, [])

    const loadJobs = useCallback(async (status: FilterStatus, targetPage: number = 1) => {
        setLoading(true)
        setError(null)
        try {
            const offset = (targetPage - 1) * PAGE_SIZE
            const params = new URLSearchParams({
                limit: String(PAGE_SIZE),
                offset: String(offset),
            })

            if (status) {
                params.set('approval_status', status)
            }

            const res = await fetch(`/api/admin/shortform?${params}`)
            const json = await res.json()
            if (!res.ok) throw new Error(json.message || json.error)

            setJobs(json.data ?? [])
            setTotal(json.total ?? 0)
        } catch (e) {
            setError(e instanceof Error ? e.message : '조회 실패')
        } finally {
            setLoading(false)
        }
    }, [])

    const loadIssueOptions = useCallback(async () => {
        setIssueOptionsLoading(true)
        try {
            const params = new URLSearchParams({
                approval_status: '승인',
                limit: '100',
                offset: '0',
            })
            const res = await fetch(`/api/admin/issues?${params}`)
            const json = await res.json()
            if (!res.ok) throw new Error(json.message || json.error)
            setIssueOptions(json.data ?? [])
        } catch {
            setIssueOptions([])
        } finally {
            setIssueOptionsLoading(false)
        }
    }, [])

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (issueDropdownRef.current && !issueDropdownRef.current.contains(e.target as Node)) {
                setIssueDropdownOpen(false)
            }
        }
        if (issueDropdownOpen) {
            document.addEventListener('mousedown', handleClickOutside)
        }
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [issueDropdownOpen])

    /* 숏폼 제작 팝업 열릴 때 body 스크롤 잠금 — 내부 스크롤 끝/시작 지점에서
       배경 페이지로 스크롤이 체이닝되는 것을 방지 */
    useEffect(() => {
        if (imagePreview.open) {
            document.body.style.overflow = 'hidden'
        } else {
            document.body.style.overflow = ''
        }
        return () => {
            document.body.style.overflow = ''
        }
    }, [imagePreview.open])

    // 숏폼 제작 팝업에서 "지금 뭔가 진행 중인가"를 한 곳에서 판단 — 개별 재생성 중에도
    // 닫기 버튼이 활성화돼 있던 문제(레이스 컨디션의 원인) 방지
    const isImagePreviewBusy = imagePreview.generating
        || imagePreview.loading
        || imagePreview.rewriteLoading
        || imagePreview.highlightsLoading
        || regeneratingIndex !== null
        || rewritingIndex !== null
        || highlightingGroupIndex !== null

    /* 숏폼 제작 팝업 — ESC로 닫기(작업 진행 중이면 무시) + Tab 포커스 트랩 */
    useEffect(() => {
        if (!imagePreview.open) return
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (!isImagePreviewBusy) setImagePreview(prev => ({ ...prev, open: false }))
                return
            }
            if (e.key === 'Tab' && shortformModalRef.current) {
                const focusable = Array.from(
                    shortformModalRef.current.querySelectorAll<HTMLElement>(
                        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                    )
                ).filter(el => !el.hasAttribute('disabled'))
                if (focusable.length === 0) return
                const first = focusable[0]
                const last = focusable[focusable.length - 1]
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault()
                    last.focus()
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault()
                    first.focus()
                }
            }
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [imagePreview.open, isImagePreviewBusy])

    /* 팝업 열릴 때 포커스를 모달 안으로 이동 (배경 콘텐츠로 Tab이 새는 것 방지) */
    useEffect(() => {
        if (imagePreview.open) shortformModalRef.current?.focus()
    }, [imagePreview.open])

    const filteredIssueOptions = issueOptions.filter((issue) =>
        issue.title.toLowerCase().includes(issueSearchQuery.toLowerCase())
    )

    const selectedIssueObj = issueOptions.find((issue) => issue.id === selectedIssueId)

    useEffect(() => {
        loadTabCounts()
    }, [loadTabCounts])

    useEffect(() => {
        loadIssueOptions()
    }, [loadIssueOptions])

    useEffect(() => {
        setPage(1)
        loadJobs(filter, 1)
    }, [filter, loadJobs])

    useEffect(() => {
        if (!previewJob) return
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'Space' && videoRef.current) {
                e.preventDefault()
                videoRef.current.paused ? videoRef.current.play() : videoRef.current.pause()
            }
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [previewJob])

    const handleAction = async (id: string, action: 'approve' | 'reject') => {
        const confirmMsg = action === 'approve'
            ? '이 숏폼 job을 승인하시겠습니까? 영상 생성 대상이 됩니다.'
            : '이 숏폼 job을 반려하시겠습니까?'

        if (!window.confirm(confirmMsg)) return

        setProcessingId(id)
        try {
            const endpoint = `/api/admin/shortform/${id}/${action}`
            const res = await fetch(endpoint, { method: 'PATCH' })
            const json = await res.json()
            if (!res.ok) throw new Error(json.message || json.error)

            await Promise.all([loadJobs(filter, page), loadTabCounts()])
        } catch (e) {
            alert(e instanceof Error ? e.message : '처리 실패')
        } finally {
            setProcessingId(null)
        }
    }

    const handleGenerate = async (id: string, images?: string[]) => {
        if (!window.confirm('이 숏폼의 동영상을 생성하시겠습니까?')) return

        setProcessingId(id)
        try {
            const res = await fetch(`/api/admin/shortform/${id}/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ images: images ?? [] }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.message || json.error)

            alert('동영상 생성 완료!')
            await loadJobs(filter, page)
        } catch (e) {
            alert(e instanceof Error ? e.message : '동영상 생성 실패')
        } finally {
            setProcessingId(null)
        }
    }

    const fetchPreviewImages = async (jobId: string, sceneTexts: string[], seed?: number) => {
        setImagePreview((prev) => ({ ...prev, loading: true, error: null, images: [], fullImages: [] }))
        try {
            const body: { sceneTexts: string[]; seed?: number } = { sceneTexts }
            if (seed !== undefined) body.seed = seed
            const res = await fetch(`/api/admin/shortform/${jobId}/preview-images`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.message || json.error)
            setImagePreview((prev) => {
                if (prev.jobId !== jobId) return prev // 그 사이 다른 이슈 팝업이 열렸으면 무시
                return {
                    ...prev,
                    loading: false,
                    images: json.images ?? [],
                    fullImages: json.fullImages ?? [],
                }
            })
        } catch (e) {
            setImagePreview((prev) => {
                if (prev.jobId !== jobId) return prev
                return {
                    ...prev,
                    loading: false,
                    error: e instanceof Error ? e.message : '이미지 조회 실패',
                }
            })
        }
    }

    const handlePreviewImages = async (job: ShortformJob) => {
        const requestJobId = job.id
        setImagePreview({
            open: true,
            jobId: job.id,
            jobIssueId: job.issue_id,
            jobTitle: job.issue_title,
            jobIssueStatus: job.issue_status,
            images: [],
            fullImages: [],
            loading: false,
            generating: false,
            error: null,
            contentLoading: true,
            selectedItems: [],
            allBullets: [],
            rewrittenTexts: [],
            rewrittenHighlights: [],
            rewriteLoading: false,
            rewriteError: null,
            highlightsLoading: false,
            highlightsBudgetExceeded: false,
            highlightsFailedIndices: [],
        })
        try {
            const summaryRes = await fetch(`/api/issues/${job.issue_id}/timeline/summary`)
            const summaryJson = await summaryRes.json()
            const stageSummaries: StageSummary[] = summaryJson.data ?? []

            const MIN_SCENES = 3
            const MAX_SCENES = 5
            const rawItems = buildItemsFromSummaries(stageSummaries)
            const dedupedItems = deduplicateItems(rawItems).slice(0, MAX_SCENES)
            // 중복 제거 후 MIN_SCENES 미만이면 원본(비중복 제거)으로 보완
            const allItems = dedupedItems.length >= MIN_SCENES
                ? dedupedItems
                : rawItems.slice(0, MAX_SCENES)

            // 전체 이슈 맥락 — AI에 배경 정보로 전달하기 위해 모든 bullets 수집
            const allBullets = stageSummaries.flatMap(s =>
                s.bullets.map((b) => (typeof b === 'string' ? b : b.text))
            ).filter(Boolean)

            setImagePreview(prev => {
                if (prev.jobId !== requestJobId) return prev
                return {
                    ...prev,
                    contentLoading: false,
                    selectedItems: allItems,
                    allBullets,
                    loading: allItems.length > 0,
                }
            })
            if (allItems.length === 0) return

            await fetchPreviewImages(requestJobId, allItems.map(item => item.text))
        } catch {
            setImagePreview(prev => (prev.jobId !== requestJobId ? prev : { ...prev, contentLoading: false }))
        }
    }

    /** timeline/points 소스 텍스트를 1회 AI로 압축·흐름 처리 */
    const fetchRewrittenTexts = async (items: SelectedContentItem[], issueTitle: string, issueStatus?: string, contextBullets?: string[]) => {
        const requestJobId = imagePreview.jobId
        setImagePreview(prev => ({ ...prev, rewriteLoading: true, rewriteError: null }))
        const sceneTexts = items.map(item => item.text)
        try {
            const res = await fetch('/api/admin/shortform/rewrite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    issueTitle,
                    issueStatus: issueStatus ?? '',
                    scenes: items.map((item, i) => ({ index: i, text: item.text, stage: item.stage })),
                    contextBullets: contextBullets ?? [],
                }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.message || json.error)
            setImagePreview(prev => {
                if (prev.jobId !== requestJobId) return prev
                return {
                    ...prev,
                    rewriteLoading: false,
                    rewrittenTexts: json.texts ?? sceneTexts,
                    rewrittenHighlights: (json.highlights ?? []).map((words: string[], i: number) =>
                        sortHighlightsByPosition(words, (json.texts ?? sceneTexts)[i] ?? '')
                    ),
                }
            })
        } catch (e) {
            setImagePreview(prev => {
                if (prev.jobId !== requestJobId) return prev
                return {
                    ...prev,
                    rewriteLoading: false,
                    rewrittenTexts: sceneTexts,
                    rewriteError: e instanceof Error ? e.message : '재작성 실패 — 원문을 사용합니다',
                }
            })
        }
    }

    const handleUpdateRewrittenText = (index: number, value: string) => {
        // 5줄(DESC_SAFE_MAX_LINES) 초과로 래핑되는 입력은 반영하지 않음 — 하단 UI 침범 방지
        if (wordWrapLines(value, DESC_MAX_CHARS_PER_LINE).length > DESC_SAFE_MAX_LINES) return
        setImagePreview(prev => {
            const newTexts = [...prev.rewrittenTexts]
            newTexts[index] = value
            // 텍스트가 바뀌어 더 이상 등장하지 않거나(또는 등장 횟수가 줄어) 자리를 잃은
            // 하이라이트 칩은 자동으로 제거 — 본문에 없는 단어가 생성 요청에 실리는 것을 방지
            const currentHighlights = prev.rewrittenHighlights[index] ?? []
            const seenCount = new Map<string, number>()
            const filteredHighlights = currentHighlights.filter(word => {
                const used = seenCount.get(word) ?? 0
                if (used >= countOccurrences(value, word)) return false
                seenCount.set(word, used + 1)
                return true
            })
            const newHighlights = filteredHighlights.length === currentHighlights.length
                ? prev.rewrittenHighlights
                : prev.rewrittenHighlights.map((hl, i) => (i === index ? filteredHighlights : hl))
            // 텍스트가 바뀌었으니 이전 텍스트 기준의 "추출 실패" 표시는 더 이상 유효하지 않음
            const newFailedIndices = prev.highlightsFailedIndices.includes(index)
                ? prev.highlightsFailedIndices.filter(i => i !== index)
                : prev.highlightsFailedIndices
            return { ...prev, rewrittenTexts: newTexts, rewrittenHighlights: newHighlights, highlightsFailedIndices: newFailedIndices }
        })
    }

    const handleRefreshAllTexts = () => {
        if (!tryStartAiCall()) return
        fetchRewrittenTexts(imagePreview.selectedItems, imagePreview.jobTitle, imagePreview.jobIssueStatus, imagePreview.allBullets)
    }

    const handleExtractHighlights = async () => {
        if (!tryStartAiCall()) return
        const allTexts = imagePreview.rewrittenTexts
        const nonEmptyIndices: number[] = []
        const filteredTexts: string[] = []
        allTexts.forEach((t, i) => {
            if (t.trim().length > 0) { nonEmptyIndices.push(i); filteredTexts.push(t) }
        })
        if (filteredTexts.length === 0) return
        const requestJobId = imagePreview.jobId
        setImagePreview(prev => ({ ...prev, highlightsLoading: true, highlightsBudgetExceeded: false, highlightsFailedIndices: [] }))
        try {
            const res = await fetch('/api/admin/shortform/highlights', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ texts: filteredTexts }),
            })
            const json = await res.json()
            const apiHighlights: string[][] = json.highlights ?? []
            const apiFailedIndices: number[] = json.failedIndices ?? []
            // 원본 씬 인덱스에 맞게 재매핑 (빈 텍스트 제거로 인한 인덱스 어긋남 방지)
            const remapped: string[][] = Array.from({ length: allTexts.length }, () => [])
            const failedOrigIndices: number[] = []
            nonEmptyIndices.forEach((origIdx, apiIdx) => {
                const words = apiHighlights[apiIdx] ?? []
                remapped[origIdx] = sortHighlightsByPosition(words, allTexts[origIdx])
                if (apiFailedIndices.includes(apiIdx)) failedOrigIndices.push(origIdx)
            })
            setImagePreview(prev => {
                if (prev.jobId !== requestJobId) return prev
                return {
                    ...prev,
                    rewrittenHighlights: remapped,
                    highlightsLoading: false,
                    highlightsBudgetExceeded: !!json.budgetExceeded,
                    highlightsFailedIndices: failedOrigIndices,
                }
            })
        } catch {
            setImagePreview(prev => (prev.jobId !== requestJobId ? prev : { ...prev, highlightsLoading: false }))
        }
    }

    const handleExtractSingleHighlight = async (imgIndex: number, sceneIndices: number[]) => {
        if (highlightingGroupIndex !== null) return
        const texts = sceneIndices.map(i => imagePreview.rewrittenTexts[i] ?? '').filter(t => t.trim().length > 0)
        if (texts.length === 0) return
        if (!tryStartAiCall()) return
        const requestJobId = imagePreview.jobId
        setHighlightingGroupIndex(imgIndex)
        try {
            const res = await fetch('/api/admin/shortform/highlights', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ texts }),
            })
            const json = await res.json()
            const newHighlights: string[][] = json.highlights ?? []
            const apiFailedIndices: number[] = json.failedIndices ?? []
            setImagePreview(prev => {
                if (prev.jobId !== requestJobId) return prev
                const updated = [...prev.rewrittenHighlights]
                const stillFailed = new Set(prev.highlightsFailedIndices)
                sceneIndices.forEach((si, idx) => {
                    const words = newHighlights[idx] ?? []
                    updated[si] = sortHighlightsByPosition(words, prev.rewrittenTexts[si] ?? '')
                    if (apiFailedIndices.includes(idx)) stillFailed.add(si)
                    else stillFailed.delete(si)
                })
                return {
                    ...prev,
                    rewrittenHighlights: updated,
                    highlightsBudgetExceeded: !!json.budgetExceeded,
                    highlightsFailedIndices: Array.from(stillFailed),
                }
            })
        } catch {
            // silent fail
        } finally {
            setHighlightingGroupIndex(null)
        }
    }

    const [highlightInputs, setHighlightInputs] = useState<Record<number, string>>({})

    const sortHighlightsByPosition = (words: string[], text: string): string[] => {
        // 같은 단어가 문장에 여러 번 등장하면 칩도 그만큼 분리 유지 (중복 제거하지 않음)
        const flat = words.flatMap(w => w.split(/\s+/).filter(Boolean))
        return flat.sort((a, b) => {
            const pa = text.indexOf(a)
            const pb = text.indexOf(b)
            if (pa === -1 && pb === -1) return 0
            if (pa === -1) return 1
            if (pb === -1) return -1
            return pa - pb
        })
    }

    /** 텍스트 내 word(부분 문자열)가 등장하는 횟수 — 하이라이트 렌더링(indexOf 순차 매칭)과 동일 기준 */
    const countOccurrences = (text: string, word: string): number => {
        if (!word) return 0
        let count = 0
        let idx = 0
        while (true) {
            const found = text.indexOf(word, idx)
            if (found === -1) break
            count++
            idx = found + word.length
        }
        return count
    }

    const handleRemoveHighlight = (sceneIndex: number, wordIndex: number) => {
        setImagePreview(prev => {
            const updated = prev.rewrittenHighlights.map(hl => [...hl])
            updated[sceneIndex] = (updated[sceneIndex] ?? []).filter((_, wi) => wi !== wordIndex)
            return { ...prev, rewrittenHighlights: updated }
        })
    }

    const handleAddHighlight = (sceneIndex: number, word: string) => {
        const trimmed = word.trim()
        if (!trimmed) return
        setImagePreview(prev => {
            const maxLen = Math.max(prev.rewrittenHighlights.length, sceneIndex + 1)
            const updated = Array.from({ length: maxLen }, (_, idx) => prev.rewrittenHighlights[idx] ?? [])
            const current = updated[sceneIndex]
            const sceneText = prev.rewrittenTexts[sceneIndex] ?? ''
            const existingCount = current.filter(w => w === trimmed).length
            // 문장에 실제 등장하는 횟수를 넘어서는 중복 칩은 추가 불가 (강조할 자리가 없음)
            if (existingCount >= countOccurrences(sceneText, trimmed)) return prev
            updated[sceneIndex] = sortHighlightsByPosition([...current, trimmed], sceneText)
            return { ...prev, rewrittenHighlights: updated }
        })
        setHighlightInputs(prev => ({ ...prev, [sceneIndex]: '' }))
    }

    const handleRefreshAllImages = () => {
        if (!tryStartAiCall()) return
        const sceneTexts = imagePreview.selectedItems.map((item, i) =>
            imagePreview.rewrittenTexts[i] ?? item.text
        )
        fetchPreviewImages(imagePreview.jobId, sceneTexts, Math.floor(Math.random() * 100000))
    }

    const handleRefreshSingleText = async (index: number) => {
        if (rewritingIndex !== null) return
        const item = imagePreview.selectedItems[index]
        if (!item) return
        if (!tryStartAiCall()) return
        const requestJobId = imagePreview.jobId
        setRewritingIndex(index)
        try {
            const res = await fetch('/api/admin/shortform/rewrite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    issueTitle: imagePreview.jobTitle,
                    issueStatus: imagePreview.jobIssueStatus,
                    totalScenes: imagePreview.selectedItems.length,
                    variation: true,
                    scenes: [{ index: index, text: item.text, stage: item.stage }],
                    contextBullets: imagePreview.allBullets,
                }),
            })
            const json = await res.json()
            if (!res.ok) {
                setImagePreview(prev => (prev.jobId !== requestJobId ? prev : {
                    ...prev,
                    rewriteError: json.message || 'AI 자막 재생성 실패',
                }))
                return
            }
            if (json.texts?.[0]) {
                const newText: string = json.texts[0]
                // 5줄(DESC_SAFE_MAX_LINES) 초과 결과는 반영하지 않음 — 반영 안 하면서
                // 하이라이트만 새 텍스트 기준으로 갱신되는 불일치를 막기 위해 텍스트·하이라이트를 함께 처리
                const exceedsLineLimit = wordWrapLines(newText, DESC_MAX_CHARS_PER_LINE).length > DESC_SAFE_MAX_LINES
                setImagePreview(prev => {
                    if (prev.jobId !== requestJobId) return prev
                    if (exceedsLineLimit) {
                        return { ...prev, rewriteError: 'AI가 생성한 자막이 너무 길어 반영하지 못했습니다 (5줄 초과)' }
                    }
                    const newTexts = [...prev.rewrittenTexts]
                    newTexts[index] = newText
                    const newHL = [...prev.rewrittenHighlights]
                    const words = json.highlights?.[0] ?? []
                    newHL[index] = sortHighlightsByPosition(words, newText)
                    return { ...prev, rewrittenTexts: newTexts, rewrittenHighlights: newHL }
                })
            }
        } catch (e) {
            setImagePreview(prev => (prev.jobId !== requestJobId ? prev : {
                ...prev,
                rewriteError: e instanceof Error ? e.message : 'AI 자막 재생성 실패',
            }))
        } finally {
            setRewritingIndex(null)
        }
    }

    const handleRefreshSingleImage = async (index: number) => {
        if (regeneratingIndex !== null || imagePreview.generating) return
        if (!tryStartAiCall()) return
        const requestJobId = imagePreview.jobId
        setRegeneratingIndex(index)
        try {
            const seed = Math.floor(Math.random() * 100000)
            const sceneText = imagePreview.rewrittenTexts[index] ?? imagePreview.selectedItems[index]?.text ?? ''
            const res = await fetch(`/api/admin/shortform/${imagePreview.jobId}/preview-images`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sceneTexts: [sceneText], seed }),
            })
            const json = await res.json()
            if (res.ok && json.images?.length > 0) {
                const picked = json.images[0] as string
                const pickedFull = json.fullImages?.[0] ?? picked
                setImagePreview(prev => {
                    if (prev.jobId !== requestJobId) return prev
                    const newImages = [...prev.images]
                    const newFullImages = [...prev.fullImages]
                    newImages[index] = picked
                    newFullImages[index] = pickedFull
                    return { ...prev, images: newImages, fullImages: newFullImages }
                })
            }
        } catch {
            // 실패 무시
        } finally {
            setRegeneratingIndex(null)
        }
    }

    const handleDownload = async (videoPath: string, issueTitle: string) => {
        try {
            const url = getStoragePublicUrl(videoPath)
            const res = await fetch(url)
            const blob = await res.blob()
            const blobUrl = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = blobUrl
            a.download = `${issueTitle}.mp4`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(blobUrl)
        } catch {
            alert('다운로드 실패')
        }
    }

    const handleDeleteStorage = async (id: string) => {
        if (!window.confirm('Supabase Storage의 영상 파일만 삭제합니다. DB 기록은 유지됩니다. 계속하시겠습니까?')) return

        setProcessingId(id)
        try {
            const res = await fetch(`/api/admin/shortform/${id}/delete-storage`, { method: 'DELETE' })
            const json = await res.json()
            if (!res.ok) throw new Error(json.message || json.error)
            await loadJobs(filter, page)
        } catch (e) {
            alert(e instanceof Error ? e.message : 'Storage 삭제 실패')
        } finally {
            setProcessingId(null)
        }
    }

    const handleDelete = async (id: string) => {
        if (!window.confirm('이 숏폼 job을 삭제하시겠습니까? 되돌릴 수 없습니다.')) return

        setProcessingId(id)
        try {
            const res = await fetch(`/api/admin/shortform/${id}`, { method: 'DELETE' })
            const json = await res.json()
            if (!res.ok) throw new Error(json.message || json.error)
            await Promise.all([loadJobs(filter, page), loadTabCounts()])
        } catch (e) {
            alert(e instanceof Error ? e.message : '삭제 실패')
        } finally {
            setProcessingId(null)
        }
    }

    const handleManualCreate = async () => {
        if (!selectedIssueId) {
            setManualCreateError('이슈를 선택해 주세요')
            return
        }

        setManualCreateLoading(true)
        setManualCreateError(null)
        try {
            const res = await fetch('/api/admin/shortform', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ issueId: selectedIssueId, triggerType: 'issue_created' }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.message || json.error)

            setSelectedIssueId('')
            setFilter('pending')
            await Promise.all([loadJobs('pending', 1), loadTabCounts()])
        } catch (e) {
            setManualCreateError(e instanceof Error ? e.message : 'Job 생성 실패')
        } finally {
            setManualCreateLoading(false)
        }
    }

    const handleAllUpload = async (id: string, targets: { youtube: boolean; tiktok: boolean; instagram: boolean }) => {
        const platforms = [
            targets.youtube && 'YouTube',
            targets.tiktok && 'TikTok',
            targets.instagram && 'Instagram',
        ].filter(Boolean).join(', ')

        if (!window.confirm(`${platforms}에 한번에 업로드하시겠습니까?`)) return

        setProcessingId(id)
        setUploadingAction('all')
        const results: string[] = []
        const errors: string[] = []

        try {
            if (targets.youtube) {
                try {
                    const res = await fetch(`/api/admin/shortform/${id}/upload-youtube`, { method: 'POST' })
                    const json = await res.json()
                    if (!res.ok) throw new Error(json.message || json.error)
                    results.push(`YouTube ✓`)
                } catch (e) {
                    errors.push(`YouTube 실패: ${e instanceof Error ? e.message : '오류'}`)
                }
            }

            if (targets.tiktok) {
                try {
                    const res = await fetch(`/api/admin/shortform/${id}/upload-tiktok`, { method: 'POST' })
                    const json = await res.json()
                    if (!res.ok) throw new Error(json.message || json.error)
                    results.push(`TikTok ✓`)
                } catch (e) {
                    errors.push(`TikTok 실패: ${e instanceof Error ? e.message : '오류'}`)
                }
            }

            if (targets.instagram) {
                try {
                    const res = await fetch(`/api/admin/shortform/${id}/upload-instagram`, { method: 'POST' })
                    const json = await res.json()
                    if (!res.ok) throw new Error(json.message || json.error)
                    results.push(`Instagram ✓`)
                } catch (e) {
                    errors.push(`Instagram 실패: ${e instanceof Error ? e.message : '오류'}`)
                }
            }

            const lines = [...results, ...errors]
            if (errors.length > 0) lines.push('\n실패한 매체는 개별 업로드 버튼으로 재시도하세요.')
            alert(lines.join('\n'))
            await loadJobs(filter, page)
        } finally {
            setProcessingId(null)
            setUploadingAction(null)
        }
    }

    const handleYoutubeUpload = async (id: string) => {
        if (!window.confirm('이 숏폼을 YouTube Shorts에 업로드하시겠습니까?')) return

        setProcessingId(id)
        setUploadingAction('youtube')
        try {
            const res = await fetch(`/api/admin/shortform/${id}/upload-youtube`, { method: 'POST' })
            const json = await res.json()
            if (!res.ok) throw new Error(json.message || json.error)

            alert(`YouTube 업로드 완료!\n${json.url}`)
            await loadJobs(filter, page)
        } catch (e) {
            alert(e instanceof Error ? e.message : 'YouTube 업로드 실패')
        } finally {
            setProcessingId(null)
            setUploadingAction(null)
        }
    }

    const handleUnapprove = async (id: string) => {
        if (!window.confirm('승인을 취소하고 대기 상태로 되돌리겠습니까?')) return

        setProcessingId(id)
        try {
            const res = await fetch(`/api/admin/shortform/${id}/unapprove`, { method: 'PATCH' })
            const json = await res.json()
            if (!res.ok) throw new Error(json.message || json.error)
            await Promise.all([loadJobs(filter, page), loadTabCounts()])
        } catch (e) {
            alert(e instanceof Error ? e.message : '승인 취소 실패')
        } finally {
            setProcessingId(null)
        }
    }

    const handleTiktokUpload = async (id: string) => {
        if (!window.confirm('이 숏폼을 TikTok에 업로드하시겠습니까?')) return

        setProcessingId(id)
        setUploadingAction('tiktok')
        try {
            const res = await fetch(`/api/admin/shortform/${id}/upload-tiktok`, { method: 'POST' })
            const json = await res.json()
            if (!res.ok) throw new Error(json.message || json.error)

            alert(`TikTok 업로드 완료!\n프로필에서 확인하세요: ${json.profileUrl}`)
            await loadJobs(filter, page)
        } catch (e) {
            alert(e instanceof Error ? e.message : 'TikTok 업로드 실패')
        } finally {
            setProcessingId(null)
            setUploadingAction(null)
        }
    }

    const handleInstagramUpload = async (id: string) => {
        if (!window.confirm('이 숏폼을 Instagram Reels에 업로드하시겠습니까?')) return

        setProcessingId(id)
        setUploadingAction('instagram')
        try {
            const res = await fetch(`/api/admin/shortform/${id}/upload-instagram`, { method: 'POST' })
            const json = await res.json()
            if (!res.ok) throw new Error(json.message || json.error)

            alert(`Instagram 업로드 완료!\n프로필에서 확인하세요: ${json.profileUrl}`)
            await loadJobs(filter, page)
        } catch (e) {
            alert(e instanceof Error ? e.message : 'Instagram 업로드 실패')
        } finally {
            setProcessingId(null)
            setUploadingAction(null)
        }
    }

    const handleFetchStats = async (id: string) => {
        setProcessingId(id)
        try {
            const res = await fetch(`/api/admin/shortform/${id}/fetch-stats`, { method: 'POST' })
            const json = await res.json()
            if (!res.ok) throw new Error(json.message || json.error)
            await loadJobs(filter, page)
            const ig = json.platform_stats?.instagram
            const yt = json.platform_stats?.youtube
            const lines: string[] = []
            if (ig) lines.push(`✅ IG — 재생 ${ig.plays.toLocaleString()} · 좋아요 ${ig.likes.toLocaleString()} · 평균시청 ${ig.avgWatchTimeMs != null ? `${(ig.avgWatchTimeMs / 1000).toFixed(1)}초` : '—'}`)
            else lines.push('⚠️ IG — mediaId 미등록 (IG mediaId 수동 등록 필요)')
            if (yt) lines.push(`✅ YT — 조회 ${yt.views.toLocaleString()} · 좋아요 ${yt.likes.toLocaleString()}`)
            alert(lines.join('\n'))
        } catch (e) {
            alert(e instanceof Error ? e.message : '성과 데이터 조회 실패')
        } finally {
            setProcessingId(null)
        }
    }

    // Instagram 최근 미디어 모달 열기 → API 조회
    const handleSetInstagramMediaId = async (id: string, jobTitle: string) => {
        setIgMediaModal({ open: true, jobId: id, jobTitle, media: [], loading: true, loadingMore: false, error: null, nextCursor: null, hasMore: false })
        try {
            const res = await fetch('/api/admin/shortform/instagram-recent-media')
            const json = await res.json()
            if (!res.ok) throw new Error(json.message || json.error)
            setIgMediaModal(prev => ({ ...prev, media: json.media, loading: false, nextCursor: json.nextCursor, hasMore: json.hasMore }))
        } catch (e) {
            setIgMediaModal(prev => ({
                ...prev,
                loading: false,
                error: e instanceof Error ? e.message : '미디어 목록 조회 실패',
            }))
        }
    }

    // 더 불러오기
    const handleLoadMoreIgMedia = async () => {
        if (!igMediaModal.nextCursor || igMediaModal.loadingMore) return
        setIgMediaModal(prev => ({ ...prev, loadingMore: true }))
        try {
            const res = await fetch(`/api/admin/shortform/instagram-recent-media?after=${encodeURIComponent(igMediaModal.nextCursor)}`)
            const json = await res.json()
            if (!res.ok) throw new Error(json.message || json.error)
            setIgMediaModal(prev => ({
                ...prev,
                media: [...prev.media, ...json.media],
                loadingMore: false,
                nextCursor: json.nextCursor,
                hasMore: json.hasMore,
            }))
        } catch (e) {
            setIgMediaModal(prev => ({ ...prev, loadingMore: false }))
        }
    }

    // 무한 스크롤 — sentinel 뷰포트 진입 시 다음 페이지 로드
    useEffect(() => {
        if (!igMediaModal.open || !igMediaModal.hasMore || igMediaModal.loadingMore) return
        const sentinel = igSentinelRef.current
        const container = igScrollContainerRef.current
        if (!sentinel || !container) return
        const observer = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting) handleLoadMoreIgMedia() },
            { root: container, threshold: 0 },
        )
        observer.observe(sentinel)
        return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [igMediaModal.open, igMediaModal.hasMore, igMediaModal.loadingMore, igMediaModal.nextCursor])

    // 모달에서 게시물 선택 → mediaId 등록
    const handleSelectInstagramMedia = async (mediaId: string) => {
        const jobId = igMediaModal.jobId
        if (!jobId) return

        setIgMediaModal(prev => ({ ...prev, open: false }))
        setProcessingId(jobId)
        setUploadingAction('instagram-media-id')
        try {
            const res = await fetch(`/api/admin/shortform/${jobId}/instagram-media-id`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mediaId }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.message || json.error)

            alert(
                json.statsFetched
                    ? 'Media ID 등록 및 성과 데이터 수집 완료!'
                    : `Media ID는 등록됐지만 성과 데이터 조회에 실패했습니다.\n(${json.warning})\n성과 조회 버튼으로 다시 시도해주세요.`
            )
            await loadJobs(filter, page)
        } catch (e) {
            alert(e instanceof Error ? e.message : 'Media ID 등록 실패')
        } finally {
            setProcessingId(null)
            setUploadingAction(null)
        }
    }

    return (
        <div>
            {/* 페이지 타이틀 — 탭과 무관하게 항상 노출 */}
            <h1 className="text-2xl font-bold text-content-primary mb-4">숏폼/롱폼 관리</h1>

            {/* 페이지 레벨 탭 (숏폼/롱폼) — 하위 필터(pill)와 위계가 다르므로 밑줄(bar) 스타일 사용 */}
            <nav className="flex gap-7 border-b border-border mb-6">
                {[{ value: 'shortform' as const, label: '숏폼' }, { value: 'longform' as const, label: '롱폼' }].map(tab => (
                    <button
                        key={tab.value}
                        onClick={() => setPageTab(tab.value)}
                        className={`-mb-px pb-3 pt-1 text-[15px] font-semibold border-b-2 transition-colors ${
                            pageTab === tab.value
                                ? 'text-primary-dark border-primary'
                                : 'text-content-muted border-transparent hover:text-content-secondary'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </nav>

            {pageTab === 'longform' && <LongformTab />}

            {pageTab === 'shortform' && (
            <>
            {/* 헤더 */}
            <div className="mb-6">
                <p className="text-sm text-content-muted">이슈를 선택해 숏폼 Job을 생성합니다.</p>
            </div>

            {/* 수동 생성 인라인 폼 */}
            <div className="mb-6 p-4 border border-primary-muted bg-primary-light/20 rounded-xl space-y-3">
                    <h2 className="text-sm font-semibold text-primary-dark">숏폼 Job 생성</h2>

                    {manualCreateError && <p className="text-sm text-red-500">{manualCreateError}</p>}

                    {/* 이슈 선택 */}
                    <div className="space-y-1">
                        <label className="text-xs font-medium text-content-secondary">대상 이슈 (승인된 이슈만)</label>
                        {issueOptionsLoading ? (
                            <p className="text-sm text-content-muted">이슈 목록 불러오는 중...</p>
                        ) : (
                            <div className="relative" ref={issueDropdownRef}>
                                <input
                                    type="text"
                                    value={issueDropdownOpen ? issueSearchQuery : (selectedIssueObj?.title ?? '')}
                                    onChange={(e) => {
                                        setIssueSearchQuery(e.target.value)
                                        setSelectedIssueId('')
                                        setManualCreateError(null)
                                    }}
                                    onFocus={() => {
                                        setIssueDropdownOpen(true)
                                        setIssueSearchQuery('')
                                    }}
                                    placeholder="이슈를 검색하세요"
                                    disabled={manualCreateLoading}
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
                                        {filteredIssueOptions.length === 0 ? (
                                            <div className="px-3 py-2 text-sm text-content-muted">검색 결과 없음</div>
                                        ) : (
                                            filteredIssueOptions.map((issue) => (
                                                <div
                                                    key={issue.id}
                                                    onMouseDown={() => {
                                                        setSelectedIssueId(issue.id)
                                                        setIssueSearchQuery('')
                                                        setIssueDropdownOpen(false)
                                                        setManualCreateError(null)
                                                    }}
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
                        {!issueOptionsLoading && issueOptions.length === 0 && (
                            <p className="text-xs text-content-muted">승인된 이슈가 없습니다.</p>
                        )}
                    </div>

                    {/* 하단 버튼 */}
                    <div className="flex gap-2 justify-end">
                        <button
                            type="button"
                            onClick={() => { setSelectedIssueId(''); setManualCreateError(null) }}
                            className="btn-neutral btn-sm"
                        >
                            초기화
                        </button>
                        <button
                            type="button"
                            onClick={handleManualCreate}
                            disabled={!selectedIssueId || manualCreateLoading || issueOptionsLoading}
                            className="btn-primary btn-sm disabled:opacity-50"
                        >
                            {manualCreateLoading ? '생성 중...' : '등록'}
                        </button>
                    </div>
            </div>

            {/* 필터 탭 */}
            <div className="mb-4">
                <AdminTabFilter
                    tabs={FILTER_LABELS}
                    active={filter}
                    counts={tabCounts}
                    onChange={setFilter}
                />
            </div>

            {error && (
                <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                    {error}
                </div>
            )}

            {/* Job 목록 */}
            <div className="card overflow-x-auto">
                <table className="min-w-full divide-y divide-border">
                    <thead className="bg-surface-subtle">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-content-muted uppercase">
                                이슈 정보
                            </th>
                            <th className="w-36 px-4 py-3 text-left text-xs font-medium text-content-muted uppercase">
                                성과
                            </th>
                            <th className="w-24 px-4 py-3 text-left text-xs font-medium text-content-muted uppercase">
                                상태
                            </th>
                            <th className="w-44 px-4 py-3 text-left text-xs font-medium text-content-muted uppercase">
                                생성일
                            </th>
                            <th className="w-48 px-4 py-3 text-left text-xs font-medium text-content-muted uppercase">
                                액션
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-surface divide-y divide-border">
                        {loading ? (
                            [1, 2, 3].map((i) => (
                                <tr key={i}>
                                    <td colSpan={5} className="px-4 py-3">
                                        <div className="h-3 w-full bg-surface-muted rounded-xl animate-pulse" />
                                    </td>
                                </tr>
                            ))
                        ) : jobs.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-4 py-12 text-center text-sm text-content-muted">
                                    해당 상태의 숏폼 job이 없습니다.
                                </td>
                            </tr>
                        ) : (
                            jobs.map((job) => {
                                const isProcessing = processingId === job.id
                                return (
                                    <tr key={job.id} className="hover:bg-surface-subtle">
                                        <td className="px-4 py-3 text-sm">
                                            <div className="flex items-center gap-2 flex-wrap mb-1">
                                                <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                                                    job.issue_status === '점화' ? 'bg-orange-100 text-orange-700' :
                                                    job.issue_status === '논란중' ? 'bg-red-100 text-red-700' :
                                                    'bg-surface-muted text-content-secondary'
                                                }`}>
                                                    {job.issue_status}
                                                </span>
                                                <Link
                                                    href={`/issue/${job.issue_id}`}
                                                    target="_blank"
                                                    className="text-primary hover:underline font-medium"
                                                >
                                                    {job.issue_title}
                                                </Link>
                                            </div>
                                            {job.video_path && (
                                                <div className="mt-2 flex items-start gap-2">
                                                    <button
                                                        onClick={() => setPreviewJob(job)}
                                                        className="relative w-14 h-24 rounded-xl border border-border overflow-hidden group flex-shrink-0"
                                                    >
                                                        <video
                                                            src={getStoragePublicUrl(job.video_path)}
                                                            className="w-full h-full object-cover"
                                                            preload="metadata"
                                                            muted
                                                        />
                                                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center group-hover:bg-black/50 transition-colors">
                                                            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                                                <path d="M6.3 2.84A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.27l9.344-5.891a1.5 1.5 0 000-2.538L6.3 2.84z"/>
                                                            </svg>
                                                        </div>
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-xs text-content-secondary">
                                            {job.platform_stats?.youtube ? (
                                                <div className="space-y-0.5">
                                                    <p className="font-medium text-content-primary">YT</p>
                                                    <p>조회 {job.platform_stats.youtube.views.toLocaleString()}</p>
                                                    <p>좋아요 {job.platform_stats.youtube.likes.toLocaleString()}</p>
                                                    <p>완시청률 {job.platform_stats.youtube.averageViewPercentage != null ? `${job.platform_stats.youtube.averageViewPercentage}%` : '—'}</p>
                                                </div>
                                            ) : null}
                                            {job.platform_stats?.youtube && job.platform_stats?.instagram && (
                                                <div className="my-1.5 border-t border-border" />
                                            )}
                                            {job.platform_stats?.instagram ? (
                                                <div className="space-y-0.5">
                                                    <p className="font-medium text-content-primary">IG</p>
                                                    <p>재생 {job.platform_stats.instagram.plays.toLocaleString()}</p>
                                                    <p>좋아요 {job.platform_stats.instagram.likes.toLocaleString()}</p>
                                                    <p>평균시청 {job.platform_stats.instagram.avgWatchTimeMs != null ? `${(job.platform_stats.instagram.avgWatchTimeMs / 1000).toFixed(1)}초` : '—'}</p>
                                                    <p className="text-[10px] text-content-muted">
                                                        {new Date(job.platform_stats.instagram.fetched_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })} 기준
                                                    </p>
                                                </div>
                                            ) : null}
                                            {!job.platform_stats?.youtube && !job.platform_stats?.instagram && (
                                                <span className="text-content-muted">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-block px-2 py-1 text-xs rounded-full ${APPROVAL_STATUS_STYLE[job.approval_status]}`}>
                                                {job.approval_status === 'pending' ? '대기' :
                                                 job.approval_status === 'approved' ? '승인' : '반려'}
                                            </span>
                                            {job.upload_status && (
                                                <div className="mt-1 text-sm text-content-secondary">
                                                    {Object.entries(job.upload_status).map(([platform, statusObj]) => {
                                                        const status = typeof statusObj === 'object' && statusObj !== null
                                                            ? (statusObj as any).status || 'unknown'
                                                            : String(statusObj)
                                                        return (
                                                            <div key={platform}>
                                                                {platform}: {status}
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-content-secondary whitespace-nowrap">
                                            {formatDate(job.created_at)}
                                        </td>
                                        <td className="px-4 py-3 text-sm">
                                            {job.approval_status === 'pending' && (
                                                <div className="flex flex-col gap-1.5 min-w-max">
                                                    {!job.video_path && (
                                                        <div className="flex flex-nowrap gap-1.5">
                                                            <button
                                                                onClick={() => handlePreviewImages(job)}
                                                                disabled={isProcessing}
                                                                className="text-xs px-2.5 py-1.5 bg-blue-500 text-white rounded-full hover:bg-blue-600 disabled:opacity-50 whitespace-nowrap"
                                                            >
                                                                숏폼 제작
                                                            </button>
                                                            <button
                                                                onClick={() => handleDelete(job.id)}
                                                                disabled={isProcessing}
                                                                className="text-xs px-2.5 py-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 disabled:opacity-50 whitespace-nowrap"
                                                            >
                                                                삭제
                                                            </button>
                                                        </div>
                                                    )}
                                                    {job.video_path && (
                                                        <div className="flex flex-nowrap gap-1.5">
                                                            <button
                                                                onClick={() => handleAction(job.id, 'approve')}
                                                                disabled={isProcessing}
                                                                className="text-xs px-2.5 py-1.5 bg-green-500 text-white rounded-full hover:bg-green-600 disabled:opacity-50 whitespace-nowrap"
                                                            >
                                                                승인
                                                            </button>
                                                            <button
                                                                onClick={() => handleAction(job.id, 'reject')}
                                                                disabled={isProcessing}
                                                                className="text-xs px-2.5 py-1.5 bg-orange-500 text-white rounded-full hover:bg-orange-600 disabled:opacity-50 whitespace-nowrap"
                                                            >
                                                                반려
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            {job.approval_status === 'approved' && (() => {
                                                const youtubeStatus = (job.upload_status as any)?.youtube?.status
                                                const youtubeUrl = (job.upload_status as any)?.youtube?.url
                                                const isYoutubeUploaded = youtubeStatus === 'success'

                                                const tiktokStatus = (job.upload_status as any)?.tiktok?.status
                                                const tiktokProfileUrl = (job.upload_status as any)?.tiktok?.profileUrl
                                                const tiktokUtmUrl = (job.upload_status as any)?.tiktok?.utmUrl as string | undefined
                                                const isTiktokUploaded = tiktokStatus === 'success'

                                                const instagramStatus = (job.upload_status as any)?.instagram?.status
                                                const instagramProfileUrl = (job.upload_status as any)?.instagram?.profileUrl
                                                const isInstagramUploaded = instagramStatus === 'success'

                                                const hasAnySuccessfulUpload = isYoutubeUploaded || isTiktokUploaded || isInstagramUploaded
                                                const allUploaded = isYoutubeUploaded && isTiktokUploaded && isInstagramUploaded
                                                const uploadTargets = {
                                                    youtube: !isYoutubeUploaded,
                                                    tiktok: !isTiktokUploaded,
                                                    instagram: !isInstagramUploaded,
                                                }

                                                if (!job.video_path && !hasAnySuccessfulUpload) {
                                                    return (
                                                        <button
                                                            onClick={() => handleGenerate(job.id)}
                                                            disabled={isProcessing}
                                                            className="text-xs px-2.5 py-1.5 bg-primary text-white rounded-full hover:bg-primary-dark disabled:opacity-50 whitespace-nowrap"
                                                        >
                                                            동영상 생성
                                                        </button>
                                                    )
                                                }

                                                return (
                                                    <div className="flex flex-col gap-1.5 min-w-max">
                                                        {job.video_path && !allUploaded && (
                                                            <button
                                                                onClick={() => handleAllUpload(job.id, uploadTargets)}
                                                                disabled={isProcessing}
                                                                className="text-xs px-2.5 py-1.5 bg-purple-600 text-white rounded-full hover:bg-purple-700 disabled:opacity-50 whitespace-nowrap"
                                                            >
                                                                {isProcessing && uploadingAction === 'all' ? '업로드 중...' : '전체 업로드'}
                                                            </button>
                                                        )}

                                                        {isYoutubeUploaded ? (
                                                            <a
                                                                href={youtubeUrl}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-xs px-2.5 py-1.5 bg-green-100 text-green-700 rounded-full hover:bg-green-200 text-center whitespace-nowrap"
                                                            >
                                                                YouTube 완료 ✓
                                                            </a>
                                                        ) : job.video_path ? (
                                                            <button
                                                                onClick={() => handleYoutubeUpload(job.id)}
                                                                disabled={isProcessing}
                                                                className="text-xs px-2.5 py-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 disabled:opacity-50 whitespace-nowrap"
                                                            >
                                                                {isProcessing && uploadingAction === 'youtube' ? 'YouTube 업로드 중...' : 'YouTube 업로드'}
                                                            </button>
                                                        ) : null}

                                                        {isTiktokUploaded ? (
                                                            <a
                                                                href={tiktokProfileUrl}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-xs px-2.5 py-1.5 bg-green-100 text-green-700 rounded-full hover:bg-green-200 text-center whitespace-nowrap"
                                                            >
                                                                TikTok 완료 ✓
                                                            </a>
                                                        ) : job.video_path ? (
                                                            <button
                                                                onClick={() => handleTiktokUpload(job.id)}
                                                                disabled={isProcessing}
                                                                className="text-xs px-2.5 py-1.5 bg-cyan-500 text-white rounded-full hover:bg-cyan-600 disabled:opacity-50 whitespace-nowrap"
                                                            >
                                                                {isProcessing && uploadingAction === 'tiktok' ? 'TikTok 업로드 중...' : 'TikTok 업로드'}
                                                            </button>
                                                        ) : null}

                                                        {isInstagramUploaded ? (
                                                            <a
                                                                href={instagramProfileUrl}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-xs px-2.5 py-1.5 bg-green-100 text-green-700 rounded-full hover:bg-green-200 text-center whitespace-nowrap"
                                                            >
                                                                Instagram 완료 ✓
                                                            </a>
                                                        ) : job.video_path ? (
                                                            <button
                                                                onClick={() => handleInstagramUpload(job.id)}
                                                                disabled={isProcessing}
                                                                className="text-xs px-2.5 py-1.5 bg-pink-500 text-white rounded-full hover:bg-pink-600 disabled:opacity-50 whitespace-nowrap"
                                                            >
                                                                {isProcessing && uploadingAction === 'instagram' ? 'Instagram 업로드 중...' : 'Instagram 업로드'}
                                                            </button>
                                                        ) : null}

                                                        <button
                                                            onClick={() => handleSetInstagramMediaId(job.id, job.issue_title)}
                                                            disabled={isProcessing}
                                                            title="자동등록 삭제 후 인스타그램에 직접 수동으로 올린 게시물의 media ID를 등록해 성과 수집을 재개합니다"
                                                            className="text-xs px-2.5 py-1.5 border border-border text-content-muted rounded-full hover:bg-surface-hover disabled:opacity-50 whitespace-nowrap"
                                                        >
                                                            {isProcessing && uploadingAction === 'instagram-media-id' ? '등록 중...' : 'IG mediaId 수동 등록'}
                                                        </button>

                                                        {hasAnySuccessfulUpload && (
                                                            <button
                                                                onClick={() => handleFetchStats(job.id)}
                                                                disabled={isProcessing}
                                                                className="text-xs px-2.5 py-1.5 border border-border text-content-muted rounded-full hover:bg-surface-hover disabled:opacity-50 whitespace-nowrap"
                                                            >
                                                                {isProcessing && processingId === job.id && uploadingAction === null ? '조회 중...' : 'YT/IG 성과 조회'}
                                                            </button>
                                                        )}

                                                        {hasAnySuccessfulUpload ? (
                                                            <>
                                                                {isTiktokUploaded && tiktokUtmUrl && (
                                                                    <button
                                                                        onClick={() => {
                                                                            const caption = `지금 뜨거운 이슈! ${job.issue_title}\n📌 왜난리에서 실시간 여론·토론·타임라인 확인하기\n${tiktokUtmUrl}`
                                                                            navigator.clipboard.writeText(caption)
                                                                            setCopiedTiktokId(job.id)
                                                                            setTimeout(() => setCopiedTiktokId(null), 2000)
                                                                        }}
                                                                        className="text-xs px-2.5 py-1.5 bg-cyan-50 text-cyan-700 rounded-full hover:bg-cyan-100 whitespace-nowrap border border-cyan-200"
                                                                    >
                                                                        {copiedTiktokId === job.id ? 'TikTok 게시글 복사됨 ✓' : 'TikTok 게시글 복사'}
                                                                    </button>
                                                                )}
                                                                {job.video_path && (
                                                                    <button
                                                                        onClick={() => handleDownload(job.video_path!, job.issue_title)}
                                                                        className="text-xs px-2.5 py-1.5 bg-pink-50 text-pink-700 rounded-full hover:bg-pink-100 whitespace-nowrap border border-pink-200"
                                                                    >
                                                                        숏폼 다운로드
                                                                    </button>
                                                                )}
                                                                {allUploaded && job.video_path && (
                                                                    <button
                                                                        onClick={() => handleDeleteStorage(job.id)}
                                                                        disabled={isProcessing}
                                                                        className="text-xs px-2.5 py-1.5 bg-gray-500 text-white rounded-full hover:bg-gray-600 disabled:opacity-50 whitespace-nowrap"
                                                                    >
                                                                        Storage 삭제
                                                                    </button>
                                                                )}
                                                                <button
                                                                    onClick={() => handleDelete(job.id)}
                                                                    disabled={isProcessing}
                                                                    className="text-xs px-2.5 py-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 disabled:opacity-50 whitespace-nowrap"
                                                                >
                                                                    삭제
                                                                </button>
                                                                <p className="text-xs text-content-muted leading-snug">
                                                                    ※ 업로드된 게시물은 각 플랫폼에서 직접 삭제해야 합니다.
                                                                </p>
                                                            </>
                                                        ) : (
                                                            job.video_path && (
                                                                <button
                                                                    onClick={() => handleUnapprove(job.id)}
                                                                    disabled={isProcessing}
                                                                    className="text-xs px-2.5 py-1.5 bg-orange-500 text-white rounded-full hover:bg-orange-600 disabled:opacity-50 whitespace-nowrap"
                                                                >
                                                                    승인 취소
                                                                </button>
                                                            )
                                                        )}
                                                    </div>
                                                )
                                            })()}
                                            {job.approval_status === 'rejected' && (
                                                <button
                                                    onClick={() => handleDelete(job.id)}
                                                    disabled={isProcessing}
                                                    className="text-xs px-3 py-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 disabled:opacity-50 whitespace-nowrap"
                                                >
                                                    삭제
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* 페이지네이션 */}
            <AdminPagination
                page={page}
                totalPages={Math.ceil(total / PAGE_SIZE)}
                total={total}
                pageSize={PAGE_SIZE}
                disabled={loading}
                onChange={(p) => { setPage(p); loadJobs(filter, p) }}
            />

            {/* 숏폼 제작 모달 — 씬 카드 단일화면 */}
            {imagePreview.open && (() => {
                const refreshIcon = (
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                        <path d="M21 3v5h-5"/>
                        <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                        <path d="M3 21v-5h5"/>
                    </svg>
                )
                return (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
                    >
                        <div
                            ref={shortformModalRef}
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="shortform-modal-title"
                            tabIndex={-1}
                            className="bg-surface rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col outline-none"
                            onClick={e => e.stopPropagation()}
                        >
                            {/* 헤더 */}
                            <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
                                <div>
                                    <h2 id="shortform-modal-title" className="text-lg font-bold text-content-primary">숏폼 제작</h2>
                                    <p className="text-sm text-content-secondary mt-0.5">{imagePreview.jobTitle}</p>
                                </div>
                                <button
                                    onClick={() => { if (!isImagePreviewBusy) setImagePreview(prev => ({ ...prev, open: false })) }}
                                    disabled={isImagePreviewBusy}
                                    title={isImagePreviewBusy ? '작업이 진행 중입니다' : undefined}
                                    className="w-8 h-8 text-content-secondary rounded-full flex items-center justify-center hover:bg-surface-subtle disabled:opacity-40"
                                >
                                    ✕
                                </button>
                            </div>

                            {/* 바디 */}
                            <div className="flex-1 overflow-y-auto px-6 py-5 min-h-0">
                                {imagePreview.contentLoading ? (
                                    /* 최초 콘텐츠 로딩 스켈레톤 */
                                    <div className="grid grid-cols-3 gap-4">
                                        {[1, 2, 3].map(i => (
                                            <div key={i} className="border border-border rounded-xl overflow-hidden">
                                                <div className="h-40 bg-surface-muted animate-pulse" />
                                                <div className="p-3 bg-surface-subtle border-b border-border space-y-1.5">
                                                    <div className="h-2.5 bg-surface-muted rounded animate-pulse w-1/3" />
                                                    <div className="h-2.5 bg-surface-muted rounded animate-pulse" />
                                                    <div className="h-2.5 bg-surface-muted rounded animate-pulse w-4/5" />
                                                </div>
                                                <div className="p-3 space-y-1.5">
                                                    <div className="h-2.5 bg-surface-muted rounded animate-pulse w-1/4" />
                                                    <div className="h-2.5 bg-surface-muted rounded animate-pulse" />
                                                    <div className="h-2.5 bg-surface-muted rounded animate-pulse w-3/5" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : imagePreview.selectedItems.length === 0 ? (
                                    <p className="text-sm text-content-muted text-center py-16">불러올 콘텐츠 데이터가 없습니다.</p>
                                ) : (
                                    <>
                                        {imagePreview.rewriteError && (
                                            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg mb-4">
                                                ⚠️ {imagePreview.rewriteError}
                                            </p>
                                        )}
                                        {imagePreview.error && (
                                            <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg mb-4">
                                                {imagePreview.error}
                                            </p>
                                        )}
                                        {/* 씬 별 이미지 1:1 레이아웃 */}
                                        {(() => {
                                            const N = imagePreview.selectedItems.length
                                            const imgCount = N
                                            const groups = Array.from({ length: imgCount }, (_, gi) => ({
                                                imgIndex: gi,
                                                sceneIndices: [gi],
                                            }))
                                            return (
                                                <div className="grid grid-cols-2 gap-4">
                                                    {groups.map(({ imgIndex, sceneIndices }) => {
                                                        const imageUrl = imagePreview.images[imgIndex]
                                                        const isImgLoading = imagePreview.loading
                                                        const isGroupRegenerating = sceneIndices.some(si => regeneratingIndex === si)

                                                        return (
                                                            <div key={imgIndex} className="border border-border rounded-xl overflow-hidden flex flex-col">
                                                                {/* 이미지 그룹 헤더 */}
                                                                <div className="flex items-center justify-between px-3 py-2 bg-surface-subtle border-b border-border">
                                                                    <span className="text-xs font-semibold text-content-secondary">이미지 {imgIndex + 1}</span>
                                                                    <button
                                                                        onClick={() => handleRefreshSingleImage(sceneIndices[0])}
                                                                        disabled={imagePreview.generating || regeneratingIndex !== null || imagePreview.loading}
                                                                        className="text-content-muted hover:text-primary disabled:opacity-40 transition-colors"
                                                                        title="이미지 재생성"
                                                                    >
                                                                        {isGroupRegenerating
                                                                            ? <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                                                                            : refreshIcon
                                                                        }
                                                                    </button>
                                                                </div>

                                                                {/* 전체 너비 이미지 */}
                                                                <div className="relative h-44 bg-surface-muted">
                                                                    {isImgLoading || isGroupRegenerating ? (
                                                                        <div className="w-full h-full bg-surface-muted animate-pulse flex items-center justify-center">
                                                                            {isGroupRegenerating && (
                                                                                <div className="w-5 h-5 border-2 border-content-muted border-t-transparent rounded-full animate-spin" />
                                                                            )}
                                                                        </div>
                                                                    ) : imageUrl ? (
                                                                        <img
                                                                            src={`/api/admin/shortform/image-proxy?url=${encodeURIComponent(imageUrl)}`}
                                                                            alt={`이미지 ${imgIndex + 1}`}
                                                                            className="w-full h-full object-cover"
                                                                            onError={e => {
                                                                                const img = e.currentTarget
                                                                                img.style.display = 'none'
                                                                                const p = img.parentElement
                                                                                if (p && !p.querySelector('.img-err')) {
                                                                                    const el = document.createElement('span')
                                                                                    el.className = 'img-err text-xs text-content-muted absolute inset-0 flex items-center justify-center text-center px-2'
                                                                                    el.textContent = '이미지 로딩 실패'
                                                                                    p.appendChild(el)
                                                                                }
                                                                            }}
                                                                        />
                                                                    ) : (
                                                                        <div className="w-full h-full flex items-center justify-center">
                                                                            <span className="text-xs text-content-muted">이미지 없음</span>
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                {/* 씬 카드: 원문/AI 행 분리로 같은 그룹 내 높이 자동 통일 */}
                                                                {sceneIndices.length === 1 ? (
                                                                    // 씬 1개: 전체 너비 단일 카드
                                                                    (() => {
                                                                        const i = sceneIndices[0]
                                                                        const item = imagePreview.selectedItems[i]
                                                                        return (
                                                                            <div className="flex-1 flex flex-col border-t border-border">
                                                                                <SceneSourceHeader
                                                                                    sceneIndex={i}
                                                                                    item={item}
                                                                                    className="px-3 py-2.5 bg-surface-subtle border-b border-border"
                                                                                />
                                                                                <div className="flex-1 flex flex-col px-3 py-2.5 bg-surface">
                                                                                    <SceneCaptionEditor
                                                                                        sceneIndex={i}
                                                                                        text={imagePreview.rewrittenTexts[i] ?? ''}
                                                                                        highlights={imagePreview.rewrittenHighlights[i] ?? []}
                                                                                        highlightInput={highlightInputs[i] ?? ''}
                                                                                        refreshIcon={refreshIcon}
                                                                                        isRewriting={rewritingIndex === i}
                                                                                        rewritingBusy={rewritingIndex !== null}
                                                                                        rewriteLoading={imagePreview.rewriteLoading}
                                                                                        isHighlighting={highlightingGroupIndex === i}
                                                                                        highlightingBusy={highlightingGroupIndex !== null}
                                                                                        highlightsLoading={imagePreview.highlightsLoading}
                                                                                        highlightExtractDisabled={imagePreview.generating || !(imagePreview.rewrittenTexts[i] ?? '').trim()}
                                                                                        extractionFailed={imagePreview.highlightsFailedIndices.includes(i)}
                                                                                        onChangeText={value => handleUpdateRewrittenText(i, value)}
                                                                                        onExtractHighlight={() => handleExtractSingleHighlight(i, [i])}
                                                                                        onRefreshText={() => handleRefreshSingleText(i)}
                                                                                        onRemoveHighlight={wi => handleRemoveHighlight(i, wi)}
                                                                                        onAddHighlight={word => handleAddHighlight(i, word)}
                                                                                        onChangeHighlightInput={value => setHighlightInputs(prev => ({ ...prev, [i]: value }))}
                                                                                    />
                                                                                </div>
                                                                            </div>
                                                                        )
                                                                    })()
                                                                ) : (
                                                                    // 씬 2개: 원문 행 / AI 자막 행을 grid row로 분리 → 같은 높이 자동 통일
                                                                    <div className="flex-1 grid grid-cols-2 grid-rows-[auto_1fr] border-t border-border">
                                                                        {/* 원문 행 */}
                                                                        {sceneIndices.map((i, colIdx) => (
                                                                            <SceneSourceHeader
                                                                                key={`원문-${imagePreview.selectedItems[i].id}`}
                                                                                sceneIndex={i}
                                                                                item={imagePreview.selectedItems[i]}
                                                                                className={`px-3 py-2.5 bg-surface-subtle border-b border-border ${colIdx === 0 ? 'border-r' : ''}`}
                                                                            />
                                                                        ))}
                                                                        {/* AI 자막 행 */}
                                                                        {sceneIndices.map((i, colIdx) => (
                                                                            <div key={`ai-${imagePreview.selectedItems[i].id}`} className={`flex flex-col px-3 py-2.5 bg-surface ${colIdx === 0 ? 'border-r border-border' : ''}`}>
                                                                                <SceneCaptionEditor
                                                                                    sceneIndex={i}
                                                                                    text={imagePreview.rewrittenTexts[i] ?? ''}
                                                                                    highlights={imagePreview.rewrittenHighlights[i] ?? []}
                                                                                    highlightInput={highlightInputs[i] ?? ''}
                                                                                    refreshIcon={refreshIcon}
                                                                                    isRewriting={rewritingIndex === i}
                                                                                    rewritingBusy={rewritingIndex !== null}
                                                                                    rewriteLoading={imagePreview.rewriteLoading}
                                                                                    isHighlighting={highlightingGroupIndex === i}
                                                                                    highlightingBusy={highlightingGroupIndex !== null}
                                                                                    highlightsLoading={imagePreview.highlightsLoading}
                                                                                    highlightExtractDisabled={imagePreview.generating || !(imagePreview.rewrittenTexts[i] ?? '').trim()}
                                                                                    extractionFailed={imagePreview.highlightsFailedIndices.includes(i)}
                                                                                    onChangeText={value => handleUpdateRewrittenText(i, value)}
                                                                                    onExtractHighlight={() => handleExtractSingleHighlight(i, [i])}
                                                                                    onRefreshText={() => handleRefreshSingleText(i)}
                                                                                    onRemoveHighlight={wi => handleRemoveHighlight(i, wi)}
                                                                                    onAddHighlight={word => handleAddHighlight(i, word)}
                                                                                    onChangeHighlightInput={value => setHighlightInputs(prev => ({ ...prev, [i]: value }))}
                                                                                />
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            )
                                        })()}
                                    </>
                                )}
                            </div>

                            {/* 하단 액션 바 */}
                            {!imagePreview.contentLoading && imagePreview.selectedItems.length > 0 && (
                                <div className="flex items-center justify-between px-6 py-4 border-t border-border flex-shrink-0">
                                    <div className="flex items-center gap-4">
                                        <button
                                            onClick={handleRefreshAllImages}
                                            disabled={imagePreview.loading || imagePreview.generating || regeneratingIndex !== null}
                                            className="flex items-center gap-1.5 text-xs text-content-secondary enabled:hover:text-primary disabled:opacity-40 transition-colors"
                                        >
                                            {refreshIcon}
                                            이미지 전체 재생성
                                        </button>
                                        <button
                                            onClick={handleRefreshAllTexts}
                                            disabled={imagePreview.rewriteLoading || imagePreview.generating}
                                            className="flex items-center gap-1.5 text-xs text-content-secondary enabled:hover:text-primary disabled:opacity-40 transition-colors"
                                        >
                                            {refreshIcon}
                                            텍스트 전체 재생성
                                        </button>
                                        <button
                                            onClick={handleExtractHighlights}
                                            disabled={imagePreview.highlightsLoading || imagePreview.rewriteLoading || imagePreview.generating || imagePreview.rewrittenTexts.filter(t => t?.trim()).length < imagePreview.selectedItems.length}
                                            className="flex items-center gap-1.5 text-xs text-content-secondary enabled:hover:text-primary disabled:opacity-40 transition-colors"
                                        >
                                            {imagePreview.highlightsLoading
                                                ? <div className="w-4 h-4 border border-current border-t-transparent rounded-full animate-spin" />
                                                : <span className="w-4 h-4 flex items-center justify-center text-[18px] leading-none">✦</span>
                                            }
                                            하이라이트 전체 추출
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-3">
                                    {!imagePreview.generating && (imagePreview.rewrittenHighlights.length < imagePreview.selectedItems.length || imagePreview.rewrittenHighlights.some(hl => hl.length === 0)) && (
                                        <p className="text-[11px] text-content-muted">
                                            {imagePreview.highlightsBudgetExceeded
                                                ? '* 하이라이트 예산 소진. 수동 입력을 사용하세요.'
                                                : '* 하이라이트 추출 후 생성 가능합니다.'}
                                        </p>
                                    )}
                                    <button
                                        onClick={async () => {
                                            const jobId = imagePreview.jobId
                                            const fullImages = imagePreview.fullImages.length > 0
                                                ? imagePreview.fullImages
                                                : imagePreview.images
                                            const sceneTexts = imagePreview.rewrittenTexts
                                            const selectedItems = imagePreview.selectedItems
                                            setImagePreview(prev => ({ ...prev, generating: true }))
                                            try {
                                                const res = await fetch(`/api/admin/shortform/${jobId}/generate`, {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ images: fullImages, selectedItems, sceneTexts, highlights: imagePreview.rewrittenHighlights }),
                                                })
                                                const json = await res.json()
                                                if (!res.ok) throw new Error(json.message || json.error)
                                                setImagePreview(prev => ({ ...prev, open: false, generating: false }))
                                                alert('동영상 생성 완료!')
                                                await loadJobs(filter, page)
                                            } catch (e) {
                                                setImagePreview(prev => ({ ...prev, generating: false }))
                                                alert(e instanceof Error ? e.message : '동영상 생성 실패')
                                            }
                                        }}
                                        disabled={imagePreview.loading || imagePreview.rewriteLoading || imagePreview.images.length === 0 || imagePreview.generating || imagePreview.rewrittenHighlights.length < imagePreview.selectedItems.length || imagePreview.rewrittenHighlights.some(hl => hl.length === 0)}
                                        className="btn-primary btn-md disabled:opacity-50"
                                    >
                                        {imagePreview.generating ? '동영상 생성 중...' : '동영상 생성'}
                                    </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )
            })()}

            {/* 동영상 미리보기 모달 */}
            {previewJob && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
                    onClick={() => setPreviewJob(null)}
                >
                    <div
                        className="bg-black rounded-xl overflow-hidden shadow-2xl flex flex-col"
                        style={{ width: 360, height: 640 }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* 비디오 + 오버레이 */}
                        <div
                            className="relative flex-1 overflow-hidden min-h-0 cursor-pointer"
                            onClick={() => {
                                if (!videoRef.current) return
                                videoRef.current.paused ? videoRef.current.play() : videoRef.current.pause()
                            }}
                        >
                            <button
                                onClick={(e) => { e.stopPropagation(); setPreviewJob(null) }}
                                className="absolute top-3 right-3 z-10 w-8 h-8 bg-transparent text-white rounded-full flex items-center justify-center hover:bg-black/40"
                            >
                                ✕
                            </button>
                            <video
                                key={previewJob.id}
                                ref={videoRef}
                                src={getStoragePublicUrl(previewJob.video_path!)}
                                className="w-full h-full object-cover"
                                autoPlay
                                loop
                                playsInline
                                onTimeUpdate={() => setVideoCurrentTime(videoRef.current?.currentTime ?? 0)}
                                onLoadedMetadata={() => {
                                    setVideoDuration(videoRef.current?.duration ?? 0)
                                    setVideoCurrentTime(0)
                                    setVideoPlaying(true)
                                }}
                                onPlay={() => setVideoPlaying(true)}
                                onPause={() => setVideoPlaying(false)}
                            />
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-8 pointer-events-none">
                                <p className="text-white text-sm font-medium line-clamp-2">
                                    {previewJob.issue_title}
                                </p>
                                <a
                                    href={previewJob.issue_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-400 text-xs mt-1 block hover:underline hover:text-blue-300 pointer-events-auto"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    이슈 상세 보기 →
                                </a>
                            </div>
                        </div>

                        {/* 커스텀 컨트롤바 — 항상 표시 */}
                        <div className="flex-shrink-0 bg-black border-t border-white/10 px-3 py-2.5 flex items-center gap-2.5">
                            <button
                                className="text-white/80 hover:text-white flex-shrink-0"
                                onClick={() => {
                                    if (!videoRef.current) return
                                    videoRef.current.paused ? videoRef.current.play() : videoRef.current.pause()
                                }}
                            >
                                {videoPlaying ? (
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                        <rect x="5" y="3" width="3" height="14" rx="1"/>
                                        <rect x="12" y="3" width="3" height="14" rx="1"/>
                                    </svg>
                                ) : (
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                        <path d="M6.3 2.84A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.27l9.344-5.891a1.5 1.5 0 000-2.538L6.3 2.84z"/>
                                    </svg>
                                )}
                            </button>
                            <span className="text-white/60 text-xs tabular-nums flex-shrink-0">
                                {formatVideoTime(videoCurrentTime)} / {formatVideoTime(videoDuration)}
                            </span>
                            <div
                                className="flex-1 h-1 bg-white/20 rounded-full cursor-pointer"
                                onClick={(e) => {
                                    const rect = e.currentTarget.getBoundingClientRect()
                                    const pct = (e.clientX - rect.left) / rect.width
                                    if (videoRef.current && videoDuration > 0) {
                                        videoRef.current.currentTime = pct * videoDuration
                                    }
                                }}
                            >
                                <div
                                    className="h-full bg-white rounded-full pointer-events-none"
                                    style={{ width: `${videoDuration > 0 ? (videoCurrentTime / videoDuration) * 100 : 0}%` }}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Instagram 미디어 선택 모달 */}
            {igMediaModal.open && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
                    onClick={() => setIgMediaModal(prev => ({ ...prev, open: false }))}
                >
                    <div
                        className="bg-surface rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="relative px-5 py-4 border-b border-border">
                            <button
                                onClick={() => setIgMediaModal(prev => ({ ...prev, open: false }))}
                                className="absolute top-3 right-4 w-8 h-8 flex items-center justify-center text-content-muted hover:text-content rounded-full hover:bg-surface-subtle text-lg leading-none"
                            >✕</button>
                            <div className="pr-8">
                                <h2 className="font-bold text-base truncate">
                                    {igMediaModal.jobTitle || 'Instagram 릴스 목록'}
                                </h2>
                                <p className="text-xs text-content-muted mt-0.5">Instagram 릴스 · 등록할 게시물을 선택하세요</p>
                            </div>
                        </div>

                        <div ref={igScrollContainerRef} className="overflow-y-auto flex-1 p-4">
                            {igMediaModal.loading && (
                                <div className="flex items-center justify-center h-32 text-content-muted text-sm">
                                    불러오는 중...
                                </div>
                            )}
                            {igMediaModal.error && (
                                <div className="text-sm text-red-500 p-2">{igMediaModal.error}</div>
                            )}
                            {!igMediaModal.loading && !igMediaModal.error && igMediaModal.media.length === 0 && (
                                <div className="text-sm text-content-muted text-center py-8">게시물이 없습니다</div>
                            )}
                            {(() => {
                                const titleWords = igMediaModal.jobTitle
                                    .replace(/[^가-힣\w\s]/g, ' ')
                                    .split(/\s+/)
                                    .filter(w => w.length > 1)
                                const scored = igMediaModal.media.map(item => ({
                                    ...item,
                                    matchScore: titleWords.filter(w => (item.caption ?? '').includes(w)).length,
                                }))
                                const sorted = [...scored].sort((a, b) => b.matchScore - a.matchScore)
                                const bestScore = sorted[0]?.matchScore ?? 0
                                return (
                                    <div className="grid grid-cols-3 gap-2">
                                        {sorted.map((item) => {
                                            const isRecommended = bestScore > 0 && item.matchScore === bestScore
                                            return (
                                                <button
                                                    key={item.id}
                                                    onClick={() => handleSelectInstagramMedia(item.id)}
                                                    className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all group text-left ${isRecommended ? 'border-pink-500' : 'border-transparent hover:border-pink-400'}`}
                                                >
                                                    {(item.thumbnail_url || item.media_url) ? (
                                                        <img
                                                            src={item.thumbnail_url ?? item.media_url}
                                                            alt=""
                                                            className="w-full h-full object-cover"
                                                        />
                                                    ) : (
                                                        <div className="w-full h-full bg-surface-alt flex items-center justify-center text-xs text-content-muted">
                                                            미리보기 없음
                                                        </div>
                                                    )}
                                                    {isRecommended && (
                                                        <span className="absolute top-1 left-1 bg-pink-500 text-white text-[10px] px-1.5 py-0.5 rounded font-medium">일치</span>
                                                    )}
                                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all" />
                                                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <p className="text-white text-[10px] truncate">
                                                            {item.caption?.split('\n')[0]?.slice(0, 28) ?? '캡션 없음'}
                                                        </p>
                                                        <p className="text-white/70 text-[9px] mt-0.5">
                                                            {new Date(item.timestamp).toLocaleDateString('ko-KR')}
                                                        </p>
                                                    </div>
                                                </button>
                                            )
                                        })}
                                    </div>
                                )
                            })()}
                            {igMediaModal.loadingMore && (
                                <div className="flex justify-center py-4">
                                    <div className="w-5 h-5 border-2 border-border border-t-transparent rounded-full animate-spin" />
                                </div>
                            )}
                            {igMediaModal.hasMore && !igMediaModal.loadingMore && (
                                <div ref={igSentinelRef} className="h-4" />
                            )}
                        </div>
                    </div>
                </div>
            )}
            </>
            )}
        </div>
    )
}
