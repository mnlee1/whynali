'use client'

/**
 * components/issue/RelatedCategoryShortforms.tsx
 *
 * 같은 카테고리 최신 숏폼 리스트.
 * 현재 이슈를 제외하지 않음 → 이 이슈 자체의 숏폼이 조건에 맞으면 자연스럽게 리스트에 포함됨.
 * 클릭 시 모달로 재생(지연 로딩), "자세히보기"로 해당 이슈 상세로 이동.
 *
 * variant='grid'    - 9:16 썸네일 그리드 3열 고정 (xl 미만, 폭 넉넉한 위치용)
 * variant='compact' - 9:16 썸네일 그리드 2열 고정(4개까지) 확대 노출 (xl+ 사이드바, 폭 272px 좁은 위치용)
 * 열 수는 항상 고정하고(카드 크기가 페이지마다 달라지지 않게), 아이템 개수가 열 수로 안 나눠지면
 * 마지막 줄이 채워지는 만큼만 보여주고 나머지는 잘라냄(예: 3열에서 4개면 3개만, 1줄로 표기).
 */

import { useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { X, Play, ChevronLeft, ChevronRight } from 'lucide-react'

interface ShortformItem {
    id: string
    issueId: string
    issueTitle: string
    videoId: string
}

interface Props {
    items: ShortformItem[]
    currentIssueId: string
    variant?: 'grid' | 'compact'
}

/* 아이템이 maxCols보다 적으면 있는 만큼 한 줄로, 많으면 딱 채워지는 줄까지만 잘라서 보여준다. */
function trimToFullRows(n: number, maxCols: number): number {
    if (n <= maxCols) return n
    return Math.floor(n / maxCols) * maxCols
}

export default function RelatedCategoryShortforms({ items, currentIssueId, variant = 'grid' }: Props) {
    const [openIndex, setOpenIndex] = useState<number | null>(null)

    /* 모달 열려있는 동안 배경 스크롤 잠금 */
    useEffect(() => {
        if (openIndex === null) return
        document.body.style.overflow = 'hidden'
        return () => { document.body.style.overflow = '' }
    }, [openIndex])

    if (!items || items.length === 0) return null

    const maxCols = variant === 'grid' ? 3 : 2
    // compact(사이드바)는 2x2로 크게 보여주기 위해 4개까지만 사용
    const capped = variant === 'compact' ? items.slice(0, 4) : items
    // 열 수로 안 나눠지는 나머지는 잘라내서 마지막 줄이 항상 가득 차게 함
    const displayItems = capped.slice(0, trimToFullRows(capped.length, maxCols))
    const openItem = openIndex !== null ? displayItems[openIndex] : null

    const goNext = useCallback(() => setOpenIndex((i) => i === null ? i : ((i + 1) % displayItems.length)), [displayItems.length])
    const goPrev = useCallback(() => setOpenIndex((i) => i === null ? i : ((i - 1 + displayItems.length) % displayItems.length)), [displayItems.length])

    // 잘라낸 뒤 남은 개수가 한 줄 미만이면 그 개수만큼만, 아니면 고정 열 수(maxCols) 사용
    const cols = Math.min(displayItems.length, maxCols)

    return (
        <div className="card overflow-hidden mb-6">
            <div className="px-4 py-3 border-b border-border-muted">
                <h2 className="text-sm font-bold text-content-primary">함께 보면 좋은 컨텐츠</h2>
            </div>
            <div
                className={variant === 'grid' ? 'p-4 grid gap-3' : 'p-3 grid gap-2'}
                style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
            >
                {displayItems.map((item, i) => (
                    <button
                        key={item.id}
                        type="button"
                        onClick={() => setOpenIndex(i)}
                        className="group relative rounded-lg overflow-hidden bg-surface-muted border border-border-muted text-left"
                        style={{ aspectRatio: '9 / 16' }}
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={`https://img.youtube.com/vi/${item.videoId}/hqdefault.jpg`}
                            alt={item.issueTitle}
                            className="w-full h-full object-cover"
                            loading="lazy"
                        />
                        {item.issueId === currentIssueId && (
                            <span className={
                                variant === 'grid'
                                    ? 'absolute top-1 right-1 px-1.5 py-0.5 rounded-full bg-primary text-white text-[10px] font-bold'
                                    : 'absolute top-1 right-1 px-1.5 py-0.5 rounded-full bg-primary text-white text-[9px] font-bold'
                            }>
                                이 이슈
                            </span>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
                            <Play className={variant === 'grid' ? 'w-7 h-7 text-white drop-shadow opacity-90' : 'w-6 h-6 text-white drop-shadow opacity-90'} fill="white" strokeWidth={0} />
                        </div>
                    </button>
                ))}
            </div>

            {openItem && createPortal(
                <div
                    className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4"
                    onClick={() => setOpenIndex(null)}
                >
                    <div
                        className="relative flex items-center gap-2"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {displayItems.length > 1 && (
                            <button
                                type="button"
                                onClick={goPrev}
                                aria-label="이전 영상"
                                className="shrink-0 w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
                            >
                                <ChevronLeft className="w-8 h-8" />
                            </button>
                        )}

                        <div className="relative flex flex-col bg-black rounded-xl overflow-hidden max-h-[62vh]">
                            {/* 영상 영역만 9:16로 고정 - 하단 버튼이 이 비율에 끼어들지 않도록 분리 */}
                            <div className="relative w-[min(60vw,30vh)]" style={{ aspectRatio: '9 / 16' }}>
                                <iframe
                                    key={openItem.id}
                                    className="absolute inset-0 w-full h-full"
                                    src={`https://www.youtube.com/embed/${openItem.videoId}?autoplay=1&mute=1&rel=0&modestbranding=1&controls=0`}
                                    title={openItem.issueTitle}
                                    allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                                    allowFullScreen
                                />
                                <button
                                    type="button"
                                    onClick={() => setOpenIndex(null)}
                                    className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center"
                                    aria-label="닫기"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <Link
                                href={`/issue/${openItem.issueId}`}
                                className="shrink-0 py-5 text-center text-base font-bold text-white bg-primary hover:opacity-90 transition-opacity"
                            >
                                이 이슈 자세히 보기 →
                            </Link>
                        </div>

                        {displayItems.length > 1 && (
                            <button
                                type="button"
                                onClick={goNext}
                                aria-label="다음 영상"
                                className="shrink-0 w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
                            >
                                <ChevronRight className="w-8 h-8" />
                            </button>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </div>
    )
}
