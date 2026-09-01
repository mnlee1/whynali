/**
 * components/admin/LongformTab.tsx
 *
 * [관리자 - 옴니버스형 롱폼(완료된 숏폼 여러 개를 이어붙인 영상) 관리 탭]
 *
 * 완료된 숏폼 중 여러 개를 순서대로 골라 훅 문장과 함께 옴니버스 롱폼을 생성하고,
 * 과거 생성된 롱폼 목록을 확인한다. 훅 문장 A는 직접 입력하고, 강조 단어만 AI로 추출(/api/admin/longform/hook) 가능.
 * 훅 배경 이미지는 훅 문장 A의 여러 줄 중 관리자가 고른 한 줄을 검색어로 사용해 AI가 유추 — 미리보기
 * (/api/admin/longform/hook-image)로 확인한 뒤 그 이미지(seed 고정) 그대로 롱폼 생성에 반영할 수 있다.
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

interface CompletedShortform {
    id: string
    issue_title: string
    video_path: string | null
    approval_status: string
    created_at: string
}

interface LongformJob {
    id: string
    source_job_ids: string[]
    source_titles: string[]
    video_path: string | null
    upload_status: {
        youtube?: { status: string; url?: string }
        stats?: { youtube?: { views: number; likes: number; comments: number; averageViewPercentage: number | null; fetched_at: string } }
    } | null
    created_at: string
}

function getStoragePublicUrl(bucket: string, path: string): string {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL
    return `${base}/storage/v1/object/public/${bucket}/${path}`
}

const DEFAULT_SENTENCE_B = '화제된 이슈, 빠짐없이 담았습니다'

function formatVideoTime(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
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

export default function LongformTab() {
    const [candidates, setCandidates] = useState<CompletedShortform[]>([])
    const [candidatesLoading, setCandidatesLoading] = useState(true)
    const [selected, setSelected] = useState<string[]>([]) // 선택 순서 = 등장 순서, 첫 번째가 훅 대상
    const [draggedId, setDraggedId] = useState<string | null>(null)
    const [sentenceA, setSentenceA] = useState('')
    const [sentenceB, setSentenceB] = useState(DEFAULT_SENTENCE_B)
    const [highlightsA, setHighlightsA] = useState<string[]>([])
    const [highlightInput, setHighlightInput] = useState('')
    const [hookGenerating, setHookGenerating] = useState(false)
    const [hookError, setHookError] = useState<string | null>(null)
    const [imageLineIndex, setImageLineIndex] = useState(0)
    const [imageSeed, setImageSeed] = useState<number | null>(null)
    const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
    const [imagePreviewLoading, setImagePreviewLoading] = useState(false)
    const [imagePreviewError, setImagePreviewError] = useState<string | null>(null)
    const [generating, setGenerating] = useState(false)
    const [generateError, setGenerateError] = useState<string | null>(null)
    const [generateSuccess, setGenerateSuccess] = useState<string | null>(null)

    const [longformJobs, setLongformJobs] = useState<LongformJob[]>([])
    const [jobsLoading, setJobsLoading] = useState(true)
    const [uploadingId, setUploadingId] = useState<string | null>(null)
    const [deletingId, setDeletingId] = useState<string | null>(null)

    const [previewJob, setPreviewJob] = useState<LongformJob | null>(null)
    const videoRef = useRef<HTMLVideoElement>(null)
    const [videoPlaying, setVideoPlaying] = useState(false)
    const [videoCurrentTime, setVideoCurrentTime] = useState(0)
    const [videoDuration, setVideoDuration] = useState(0)

    const loadCandidates = useCallback(async () => {
        setCandidatesLoading(true)
        try {
            const res = await fetch('/api/admin/shortform?approval_status=approved&limit=100')
            const json = await res.json()
            const rows: CompletedShortform[] = (json.data ?? []).filter((j: CompletedShortform) => !!j.video_path)
            setCandidates(rows)
        } catch {
            setCandidates([])
        } finally {
            setCandidatesLoading(false)
        }
    }, [])

    const loadLongformJobs = useCallback(async () => {
        setJobsLoading(true)
        try {
            const res = await fetch('/api/admin/longform?limit=20')
            const json = await res.json()
            setLongformJobs(json.data ?? [])
        } catch {
            setLongformJobs([])
        } finally {
            setJobsLoading(false)
        }
    }, [])

    useEffect(() => {
        loadCandidates()
        loadLongformJobs()
    }, [loadCandidates, loadLongformJobs])

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

    // 두 목록이 모두 로드된 뒤, 이미 다른 롱폼에 쓰인 숏폼을 제외한 나머지 중 최근 3개를 기본 선택
    // + 훅 문장 A를 그 3개 타이틀(줄바꿈 구분)로 최초 1회만 채워줌 — 이미 입력된 내용은 덮어쓰지 않음
    useEffect(() => {
        if (candidatesLoading || jobsLoading || selected.length > 0) return
        const usedIds = new Set(longformJobs.flatMap(job => job.source_job_ids ?? []))
        const unused = candidates.filter(c => !usedIds.has(c.id))
        if (unused.length > 0) {
            const picked = unused.slice(0, 3)
            setSelected(picked.map(c => c.id))
            setSentenceA(prev => prev || picked.map(c => c.issue_title).join('\n'))
        }
    }, [candidatesLoading, jobsLoading, candidates, longformJobs, selected.length])

    const handleUploadYoutube = async (id: string) => {
        if (uploadingId !== null) return
        if (!window.confirm('이 롱폼을 YouTube에 업로드하시겠습니까?')) return
        setUploadingId(id)
        try {
            const res = await fetch(`/api/admin/longform/${id}/upload-youtube`, { method: 'POST' })
            const json = await res.json()
            if (!res.ok) throw new Error(json.message || json.error)
            alert(`YouTube 업로드 완료!\n${json.url}`)
            await loadLongformJobs()
        } catch (e) {
            alert(e instanceof Error ? e.message : 'YouTube 업로드 실패')
        } finally {
            setUploadingId(null)
        }
    }

    const handleDeleteJob = async (job: LongformJob) => {
        const isUploaded = job.upload_status?.youtube?.status === 'success'
        const confirmMsg = isUploaded
            ? '이 롱폼은 이미 YouTube에 업로드되어 있습니다. 삭제해도 YouTube 영상은 그대로 남고 우리 쪽 기록만 삭제됩니다. 계속하시겠습니까?'
            : '이 롱폼을 삭제하시겠습니까? Storage의 영상도 함께 삭제되며 되돌릴 수 없습니다.'
        if (!window.confirm(confirmMsg)) return

        setDeletingId(job.id)
        try {
            const res = await fetch(`/api/admin/longform/${job.id}`, { method: 'DELETE' })
            const json = await res.json()
            if (!res.ok) throw new Error(json.message || json.error)
            await loadLongformJobs()
            // 삭제로 다시 미사용 상태가 된 숏폼이 선택 목록에 반영되도록, 자동 선택 useEffect를 재실행시킴
            setSelected([])
        } catch (e) {
            alert(e instanceof Error ? e.message : '삭제 실패')
        } finally {
            setDeletingId(null)
        }
    }

    const toggleSelect = (id: string) => {
        setGenerateSuccess(null)
        setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
    }

    /** 드래그한 항목(draggedId)을 targetId 위치로 이동 */
    const handleReorderDrop = (targetId: string) => {
        if (!draggedId || draggedId === targetId) return
        setSelected(prev => {
            const from = prev.indexOf(draggedId)
            const to = prev.indexOf(targetId)
            if (from === -1 || to === -1) return prev
            const next = [...prev]
            next.splice(from, 1)
            next.splice(to, 0, draggedId)
            return next
        })
        setDraggedId(null)
    }

    const canGenerate = selected.length >= 2 && sentenceA.trim().length > 0 && !generating
    const canGenerateHook = sentenceA.trim().length > 0 && !hookGenerating

    const handleGenerateHook = async () => {
        if (!canGenerateHook) return
        setHookGenerating(true)
        setHookError(null)
        try {
            const res = await fetch('/api/admin/longform/hook', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: sentenceA }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.message || json.error)
            setHighlightsA(json.highlightsA ?? [])
        } catch (e) {
            setHookError(e instanceof Error ? e.message : '하이라이트 추출 실패')
        } finally {
            setHookGenerating(false)
        }
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

    const sortHighlightsByPosition = (words: string[]): string[] => {
        return [...words].sort((a, b) => {
            const pa = sentenceA.indexOf(a)
            const pb = sentenceA.indexOf(b)
            if (pa === -1 && pb === -1) return 0
            if (pa === -1) return 1
            if (pb === -1) return -1
            return pa - pb
        })
    }

    const handleRemoveHighlight = (wordIndex: number) => {
        setHighlightsA(prev => prev.filter((_, wi) => wi !== wordIndex))
    }

    const handleAddHighlight = (word: string) => {
        const trimmed = word.trim()
        if (!trimmed) return
        const existingCount = highlightsA.filter(w => w === trimmed).length
        // 문장에 실제 등장하는 횟수를 넘어서는 중복 칩은 추가 불가 (강조할 자리가 없음)
        if (existingCount >= countOccurrences(sentenceA, trimmed)) return
        setHighlightsA(prev => sortHighlightsByPosition([...prev, trimmed]))
        setHighlightInput('')
    }

    /**
     * 훅 문장 A는 보통 선택된 이슈 여러 개의 제목이 줄바꿈으로 나열된 형태(예: 3줄).
     * 서로 무관한 이슈 여러 개를 한 장의 이미지로 동시에 표현할 수는 없으므로, 그중 관리자가
     * 고른 한 줄만 이미지 검색에 사용한다. 전체 텍스트를 그대로 넘기면 AI가 그중 하나(주로 마지막 줄)로
     * 임의로 고정돼버리는 문제가 있었음 — 기본값은 등장 순서상 첫 번째(= 훅의 실제 대상) 줄.
     */
    const sentenceALines = sentenceA.split('\n').map(l => l.trim()).filter(l => l.length > 0)
    const hookImageQuery = sentenceALines[imageLineIndex] ?? sentenceALines[0] ?? ''
    const canPreviewImage = hookImageQuery.length > 0 && !imagePreviewLoading

    const handleSelectImageLine = (index: number) => {
        setImageLineIndex(index)
        setImagePreviewUrl(null)
        setImageSeed(null)
    }

    // 관리자가 고른 줄을 이미지 검색어로 사용 — 어떤 이미지를 찾을지는 그 텍스트에서 AI가 유추
    const handlePreviewImage = async () => {
        if (!canPreviewImage) return
        setImagePreviewLoading(true)
        setImagePreviewError(null)
        try {
            const res = await fetch('/api/admin/longform/hook-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: hookImageQuery }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.message || json.error)
            setImagePreviewUrl(json.imageDataUrl)
            setImageSeed(json.seed)
        } catch (e) {
            setImagePreviewError(e instanceof Error ? e.message : '이미지 미리보기 실패')
        } finally {
            setImagePreviewLoading(false)
        }
    }

    const handleGenerate = async () => {
        if (!canGenerate) return
        setGenerating(true)
        setGenerateError(null)
        setGenerateSuccess(null)
        try {
            const res = await fetch('/api/admin/longform', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    shortformJobIds: selected,
                    hook: {
                        sentenceA: sentenceA.trim(),
                        sentenceB: sentenceB.trim() || undefined,
                        highlightsA,
                        imageQuery: hookImageQuery,
                        imageSeed: imageSeed ?? undefined,
                    },
                }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.message || json.error)
            setGenerateSuccess('롱폼 생성 완료!')
            setSelected([])
            setSentenceA('')
            setSentenceB(DEFAULT_SENTENCE_B)
            setHighlightsA([])
            setImageLineIndex(0)
            setImageSeed(null)
            setImagePreviewUrl(null)
            await loadLongformJobs()
        } catch (e) {
            setGenerateError(e instanceof Error ? e.message : '롱폼 생성 실패')
        } finally {
            setGenerating(false)
        }
    }

    const selectedItems = selected.map(id => candidates.find(c => c.id === id)).filter(Boolean) as CompletedShortform[]
    // 이미 다른 롱폼에 쓰인 숏폼은 후보에서 제외
    const usedShortformIds = new Set(longformJobs.flatMap(job => job.source_job_ids ?? []))
    const unusedCandidates = candidates.filter(c => !usedShortformIds.has(c.id))
    const candidatesReady = !candidatesLoading && !jobsLoading
    const insufficientCandidates = candidatesReady && unusedCandidates.length < 2
    // 선택된 항목은 등장 순서대로 위에 고정, 남은 자리(최대 3개 중 선택 후 남는 만큼)만
    // 선택되지 않은 최신 미사용 항목으로 채움 — 선택된 게 최신 3개 밖으로 밀려나도 총 노출 개수는 3개를 넘지 않음
    const fillSlots = Math.max(0, 3 - selectedItems.length)
    const displayList = [
        ...selectedItems,
        ...unusedCandidates.filter(c => !selected.includes(c.id)).slice(0, fillSlots),
    ]

    return (
        <div className="space-y-8">
            {/* 생성 폼 */}
            <div>
                <div className="border border-primary-muted rounded-xl p-4 space-y-4 bg-primary-light/20">
                <h2 className="text-sm font-semibold text-primary-dark">새 롱폼 만들기</h2>
                {candidatesReady && insufficientCandidates ? (
                    <div className="flex items-start gap-2 bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm rounded-lg px-3 py-2.5">
                        <span>⚠</span>
                        <span>
                            승인된 숏폼 중 아직 롱폼에 쓰이지 않은 항목이 {unusedCandidates.length}개뿐입니다.
                            롱폼 생성에는 최소 2개가 필요하니, 숏폼을 더 승인한 뒤 다시 시도해 주세요.
                        </span>
                    </div>
                ) : (
                <>
                {/* 이슈 선택 + 순서 (하나의 목록 — 고른 항목은 위로 모여 번호가 붙고, 그립 아이콘을 드래그해 순서 변경) */}
                <div className="space-y-1.5">
                    <div>
                        <span className="text-xs font-medium text-content-secondary">숏폼 선택 ({selectedItems.length}개 선택됨)</span>
                        <p className="text-xs text-content-muted mt-2">목록에 보이는 순서(위→아래)가 등장 순서입니다. ⠿를 드래그해서 순서를 바꾸세요.</p>
                    </div>
                    {candidatesLoading ? (
                        <p className="text-sm text-content-muted">불러오는 중...</p>
                    ) : (
                        <div className="max-h-72 overflow-y-auto border border-border rounded-lg divide-y divide-border bg-white">
                            {candidatesReady && unusedCandidates.length < 3 && (
                                <p className="text-xs text-yellow-700 bg-yellow-50 px-3 py-2 border-b border-yellow-200">
                                    미사용 숏폼이 {unusedCandidates.length}개뿐이라 전부 노출했습니다.
                                </p>
                            )}
                            {displayList.map(item => {
                                const orderIndex = selected.indexOf(item.id)
                                const isSelected = orderIndex !== -1
                                return (
                                    <div
                                        key={item.id}
                                        draggable={isSelected}
                                        onDragStart={() => setDraggedId(item.id)}
                                        onDragOver={e => { if (isSelected) e.preventDefault() }}
                                        onDrop={() => isSelected && handleReorderDrop(item.id)}
                                        onDragEnd={() => setDraggedId(null)}
                                        className={`flex items-center gap-2 px-3 py-2 text-sm ${isSelected ? 'bg-primary-light/10' : 'hover:bg-surface-subtle'} ${draggedId === item.id ? 'opacity-40' : ''}`}
                                    >
                                        {isSelected && (
                                            <span className="cursor-grab active:cursor-grabbing text-content-muted select-none shrink-0" title="드래그해서 순서 변경">⠿</span>
                                        )}
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => toggleSelect(item.id)}
                                        />
                                        {isSelected && (
                                            <span className="w-5 h-5 flex items-center justify-center text-[11px] font-bold text-white bg-primary rounded-full shrink-0">{orderIndex + 1}</span>
                                        )}
                                        <span
                                            className="flex-1 truncate text-content-primary cursor-pointer"
                                            onClick={() => toggleSelect(item.id)}
                                        >
                                            {item.issue_title}
                                        </span>
                                        <span className="text-xs text-content-muted shrink-0">{formatDate(item.created_at)}</span>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* 훅 문장 */}
                <div className="space-y-2">
                    <span className="text-xs font-medium text-content-secondary">훅 문장</span>

                    <div className="space-y-1">
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-content-muted">A · 직접 입력(줄바꿈한 대로 화면에 표시) · 시작과 동시에 고정 표시</span>
                            <button
                                onClick={handleGenerateHook}
                                disabled={!canGenerateHook}
                                className="text-xs font-semibold text-primary enabled:hover:text-primary-dark disabled:opacity-40 disabled:cursor-not-allowed"
                                title={sentenceA.trim().length === 0 ? '훅 문장 A를 먼저 입력하세요' : 'AI로 하이라이트 추출'}
                            >
                                {hookGenerating ? '추출 중...' : '✦ 하이라이트 추출'}
                            </button>
                        </div>
                        <textarea
                            value={sentenceA}
                            onChange={e => {
                                const value = e.target.value
                                setSentenceA(value)
                                // 텍스트가 바뀌어 더 이상 등장하지 않거나 자리를 잃은 하이라이트 칩만 자동 제거
                                setHighlightsA(prev => {
                                    const seenCount = new Map<string, number>()
                                    return prev.filter(word => {
                                        const used = seenCount.get(word) ?? 0
                                        if (used >= countOccurrences(value, word)) return false
                                        seenCount.set(word, used + 1)
                                        return true
                                    })
                                })
                                // 훅 배경 이미지는 이 문장에서 유추하므로, 문장이 바뀌면 이전 미리보기는 더 이상 유효하지 않음
                                setImagePreviewUrl(null)
                                setImageSeed(null)
                            }}
                            rows={3}
                            placeholder="예: 황정민 스토킹 논란&#10;애플 깜짝 1위&#10;젠슨 황 5000억"
                            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:border-primary"
                        />
                        {hookError && <p className="text-sm text-red-500">{hookError}</p>}
                        <div>
                            <span className="text-[10px] font-semibold text-primary">하이라이트</span>
                            <div className="flex flex-wrap gap-1 mt-1 items-center">
                                {highlightsA.map((word, i) => (
                                    <span key={i} className="inline-flex items-center gap-0.5 text-[11px] font-semibold bg-yellow-200 text-yellow-800 px-1.5 py-0.5 rounded">
                                        {word}
                                        <button
                                            onClick={() => handleRemoveHighlight(i)}
                                            className="ml-0.5 text-yellow-600 hover:text-yellow-900 leading-none"
                                        >×</button>
                                    </span>
                                ))}
                                <input
                                    type="text"
                                    value={highlightInput}
                                    onChange={e => setHighlightInput(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') handleAddHighlight(highlightInput) }}
                                    placeholder="+ 단어 추가"
                                    size={Math.max(4, highlightInput.length + 2)}
                                    style={{ borderRadius: 0 }}
                                    className="text-xs text-content-muted placeholder:text-content-muted bg-transparent outline-none min-w-0 rounded-none border-b border-border"
                                />
                            </div>
                        </div>
                    </div>
                    <div className="space-y-1">
                        <span className="text-xs text-content-muted">B · 기본값 있음(수정 가능) · A 다음 등장</span>
                        <input
                            type="text"
                            value={sentenceB}
                            onChange={e => setSentenceB(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:border-primary"
                        />
                    </div>
                </div>

                {/* 훅 배경 이미지 */}
                <div className="space-y-2">
                    <span className="text-xs font-medium text-content-secondary">훅 배경 이미지</span>
                    <p className="text-xs text-content-muted">
                        고른 줄의 내용을 바탕으로 어울리는 이미지를 자동으로 찾습니다. 마음에 드는 이미지가 나올 때까지 다시 불러올 수 있어요.
                    </p>
                    {sentenceALines.length > 1 && (
                        <div className="flex flex-wrap gap-1.5">
                            {sentenceALines.map((line, i) => (
                                <button
                                    key={i}
                                    onClick={() => handleSelectImageLine(i)}
                                    className={`text-xs px-2.5 py-1 rounded-full border truncate max-w-[220px] ${
                                        i === imageLineIndex
                                            ? 'bg-primary text-white border-primary'
                                            : 'bg-white text-content-secondary border-border hover:border-primary-muted'
                                    }`}
                                    title={line}
                                >
                                    {line}
                                </button>
                            ))}
                        </div>
                    )}
                    <button
                        onClick={handlePreviewImage}
                        disabled={!canPreviewImage}
                        title={hookImageQuery.length === 0 ? '훅 문장 A를 먼저 입력하세요' : undefined}
                        className="text-xs font-semibold px-3 py-2 rounded-lg border border-primary-muted text-primary enabled:hover:bg-primary-light/20 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                        {imagePreviewLoading ? '불러오는 중...' : imagePreviewUrl ? '다시 불러오기' : '미리보기'}
                    </button>
                    {imagePreviewError && <p className="text-sm text-red-500">{imagePreviewError}</p>}
                    {imagePreviewUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={imagePreviewUrl}
                            alt="훅 배경 미리보기"
                            className="w-32 rounded-lg border border-border"
                        />
                    )}
                </div>

                {generateError && <p className="text-sm text-red-500">{generateError}</p>}
                {generateSuccess && <p className="text-sm text-green-600">{generateSuccess}</p>}

                <div className="flex justify-end">
                    <button
                        onClick={handleGenerate}
                        disabled={!canGenerate}
                        className="btn-primary btn-sm disabled:opacity-50"
                    >
                        {generating ? '생성 중...' : '롱폼 생성'}
                    </button>
                </div>
                </>
                )}
                </div>
            </div>

            {/* 과거 롱폼 목록 */}
            <div className="space-y-2">
                <h2 className="text-base font-bold text-content-primary">생성된 롱폼</h2>
                <div className="card overflow-x-auto">
                    <table className="min-w-full divide-y divide-border">
                        <thead className="bg-surface-subtle">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-content-muted uppercase">
                                    구성 이슈
                                </th>
                                <th className="w-36 px-4 py-3 text-left text-xs font-medium text-content-muted uppercase">
                                    성과
                                </th>
                                <th className="w-28 px-4 py-3 text-left text-xs font-medium text-content-muted uppercase">
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
                            {jobsLoading ? (
                                [1, 2, 3].map(i => (
                                    <tr key={i}>
                                        <td colSpan={5} className="px-4 py-3">
                                            <div className="h-3 w-full bg-surface-muted rounded-xl animate-pulse" />
                                        </td>
                                    </tr>
                                ))
                            ) : longformJobs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-4 py-12 text-center text-sm text-content-muted">
                                        생성된 롱폼이 없습니다.
                                    </td>
                                </tr>
                            ) : (
                                longformJobs.map(job => (
                                    <tr key={job.id}>
                                        <td className="px-4 py-3">
                                            <p className="text-sm text-content-primary truncate max-w-md mb-1">
                                                {job.source_titles.join(' → ')}
                                            </p>
                                            {job.video_path && (
                                                <button
                                                    onClick={() => setPreviewJob(job)}
                                                    className="relative block w-28 h-16 rounded-xl border border-border overflow-hidden group"
                                                >
                                                    <video
                                                        src={getStoragePublicUrl('longform', job.video_path)}
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
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-xs text-content-secondary">
                                            {job.upload_status?.stats?.youtube ? (
                                                <div className="space-y-0.5">
                                                    <p className="font-medium text-content-primary">YT</p>
                                                    <p>조회 {job.upload_status.stats.youtube.views.toLocaleString()}</p>
                                                    <p>좋아요 {job.upload_status.stats.youtube.likes.toLocaleString()}</p>
                                                    <p>완시청률 {job.upload_status.stats.youtube.averageViewPercentage != null ? `${job.upload_status.stats.youtube.averageViewPercentage}%` : '—'}</p>
                                                </div>
                                            ) : (
                                                <span className="text-content-muted">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            {job.upload_status?.youtube?.status === 'success' ? (
                                                <span className="inline-block px-2 py-1 text-xs rounded-full bg-green-100 text-green-700 whitespace-nowrap">
                                                    업로드 완료
                                                </span>
                                            ) : (
                                                <span className="inline-block px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-700 whitespace-nowrap">
                                                    업로드 대기
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-xs text-content-muted">
                                            {formatDate(job.created_at)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex flex-col gap-1.5 min-w-max">
                                                {job.upload_status?.youtube?.status === 'success' ? (
                                                    <a
                                                        href={job.upload_status.youtube.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-xs px-2.5 py-1.5 bg-green-100 text-green-700 rounded-full hover:bg-green-200 text-center whitespace-nowrap"
                                                    >
                                                        YouTube 완료 ✓
                                                    </a>
                                                ) : job.video_path && (
                                                    <button
                                                        onClick={() => handleUploadYoutube(job.id)}
                                                        disabled={uploadingId !== null}
                                                        className="text-xs px-2.5 py-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 disabled:opacity-50 whitespace-nowrap"
                                                    >
                                                        {uploadingId === job.id ? 'YouTube 업로드 중...' : 'YouTube 업로드'}
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleDeleteJob(job)}
                                                    disabled={deletingId !== null}
                                                    className="text-xs px-2.5 py-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 disabled:opacity-50 whitespace-nowrap"
                                                >
                                                    {deletingId === job.id ? '삭제 중...' : '삭제'}
                                                </button>
                                                {job.upload_status?.youtube?.status === 'success' && (
                                                    <p className="text-[11px] text-content-muted leading-snug">
                                                        ※ YouTube 게시물은 직접 삭제해야 합니다.
                                                    </p>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 동영상 미리보기 모달 — 롱폼은 가로(16:9) 영상이라 숏폼(세로 9:16)과 박스 비율만 다름 */}
            {previewJob && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
                    onClick={() => setPreviewJob(null)}
                >
                    <div
                        className="bg-black rounded-xl overflow-hidden shadow-2xl flex flex-col"
                        style={{ width: '90vw', maxWidth: 960, aspectRatio: '16 / 9', height: 'auto' }}
                        onClick={(e) => e.stopPropagation()}
                    >
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
                                src={getStoragePublicUrl('longform', previewJob.video_path!)}
                                className="w-full h-full object-contain"
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
                                    {previewJob.source_titles.join(' → ')}
                                </p>
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
        </div>
    )
}
