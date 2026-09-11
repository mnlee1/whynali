/**
 * components/home/RecommendedCurationSection.tsx
 *
 * [추천 큐레이션 섹션 — 홈 하단]
 *
 * 화력 급상승 / 토론 활발 / 막 뜨는 이슈를 그룹 구분 없이 하나의 가로 피드로 합쳐 보여준다.
 * 4개씩 노출하고, 화살표로 다음/이전 페이지를 넘긴다.
 * 연령/관심사 기반 개인화 큐레이션은 온보딩 데이터가 쌓인 뒤 별도 슬롯으로 추가될 예정.
 *
 * 사용 예시:
 *   <RecommendedCurationSection items={items} />
 */

'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { Bookmark } from 'lucide-react'
import { decodeHtml } from '@/lib/utils/decode-html'
import { formatDate } from '@/lib/utils/format-date'
import type { Issue } from '@/types/issue'

interface RecommendedCurationSectionProps {
    items: Issue[]
}

const ITEM_GRADIENTS: Record<string, string> = {
    연예: 'from-pink-500 to-violet-500',
    스포츠: 'from-blue-500 to-teal-500',
    정치: 'from-red-500 to-amber-500',
    사회: 'from-emerald-500 to-cyan-500',
    경제: 'from-amber-500 to-red-500',
    기술: 'from-violet-500 to-cyan-500',
    세계: 'from-indigo-500 to-cyan-500',
}

const ITEMS_PER_PAGE = 4

export default function RecommendedCurationSection({ items }: RecommendedCurationSectionProps) {
    const [page, setPage] = useState(0)
    const [direction, setDirection] = useState(1)
    const [failedImages, setFailedImages] = useState<Record<string, boolean>>({})
    const [bookmarked, setBookmarked] = useState<Set<string>>(new Set())
    const isDraggingRef = useRef(false)
    // 모바일/태블릿(lg 미만, 화살표 없이 스와이프+점 네비게이션만 쓰는 화면)에서는 순환,
    // 데스크톱(화살표 노출)에서는 처음/끝에서 멈추게 — 두 입력 방식의 기대 동작이 다르다.
    const [loopNav, setLoopNav] = useState(false)
    useEffect(() => {
        const mq = window.matchMedia('(max-width: 1023px)')
        const update = () => setLoopNav(mq.matches)
        update()
        mq.addEventListener('change', update)
        return () => mq.removeEventListener('change', update)
    }, [])

    const goPrev = () => { setDirection(-1); setPage(p => loopNav ? (p - 1 + totalPages) % totalPages : Math.max(0, p - 1)) }
    const goNext = () => { setDirection(1); setPage(p => loopNav ? (p + 1) % totalPages : Math.min(totalPages - 1, p + 1)) }

    const toggleBookmark = (id: string) => {
        setBookmarked(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    if (items.length === 0) return null

    // 마지막 페이지가 4개 미만으로 잘리지 않도록, 꽉 채운 페이지 단위로만 노출한다.
    const fullItems = items.slice(0, Math.floor(items.length / ITEMS_PER_PAGE) * ITEMS_PER_PAGE)
    if (fullItems.length === 0) return null

    const totalPages = fullItems.length / ITEMS_PER_PAGE
    const visibleItems = fullItems.slice(page * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE + ITEMS_PER_PAGE)

    return (
        <section className="!mt-[72px]">
            <div className="mb-5">
                <h2 className="text-2xl font-bold text-content-primary">추천 큐레이션</h2>
            </div>

            <div className="relative">
                {totalPages > 1 && page > 0 && (
                    <button
                        type="button"
                        onClick={goPrev}
                        className="hidden lg:flex absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 w-9 h-9 rounded-full bg-white border border-border shadow-card-hover items-center justify-center text-content-primary hover:border-border-strong transition-colors"
                        aria-label="이전"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="15 6 9 12 15 18" />
                        </svg>
                    </button>
                )}
                {totalPages > 1 && page < totalPages - 1 && (
                    <button
                        type="button"
                        onClick={goNext}
                        className="hidden lg:flex absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-10 w-9 h-9 rounded-full bg-white border border-border shadow-card-hover items-center justify-center text-content-primary hover:border-border-strong transition-colors"
                        aria-label="다음"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="9 6 15 12 9 18" />
                        </svg>
                    </button>
                )}

                <div className="overflow-hidden -m-4 p-4">
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.div
                        key={page}
                        initial={{ x: direction > 0 ? 48 : -48, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: direction > 0 ? -48 : 48, opacity: 0 }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                        drag="x"
                        dragConstraints={{ left: 0, right: 0 }}
                        dragElastic={0.12}
                        onDragStart={() => { isDraggingRef.current = true }}
                        onDragEnd={(_e, info) => {
                            if (info.offset.x < -60 || info.velocity.x < -400) goNext()
                            else if (info.offset.x > 60 || info.velocity.x > 400) goPrev()
                            setTimeout(() => { isDraggingRef.current = false }, 50)
                        }}
                        onClickCapture={(e) => {
                            if (isDraggingRef.current) { e.preventDefault(); e.stopPropagation() }
                        }}
                        className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 cursor-grab active:cursor-grabbing"
                    >
                        {visibleItems.map(item => {
                            const rawImage = item.thumbnail_urls?.[item.primary_thumbnail_index ?? 0] ?? null
                            const thumbImage = rawImage && !failedImages[item.id] ? rawImage : null
                            return (
                                <div key={item.id} className="relative card-hover overflow-visible group">
                                    <Link href={`/issue/${item.id}`} draggable={false} onDragStart={(e) => e.preventDefault()} className="block">
                                        <div className={`relative aspect-[16/9] rounded-t-xl overflow-hidden ${thumbImage ? '' : `bg-gradient-to-br ${ITEM_GRADIENTS[item.category] ?? 'from-neutral-400 to-neutral-500'}`}`}>
                                            {thumbImage && (
                                                <Image
                                                    src={thumbImage}
                                                    alt=""
                                                    fill
                                                    draggable={false}
                                                    className="object-cover"
                                                    sizes="(min-width: 768px) 25vw, 50vw"
                                                    onError={() => setFailedImages(prev => ({ ...prev, [item.id]: true }))}
                                                />
                                            )}
                                        </div>
                                        <div className="p-3.5">
                                            <p className="text-[15.5px] font-bold text-content-primary leading-snug line-clamp-1 mb-5 group-hover:text-primary [.group:has(button:hover)_&]:!text-content-primary transition-colors">
                                                {decodeHtml(item.title)}
                                            </p>
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs text-content-muted">
                                                    <span className="text-content-secondary font-medium">{item.category}</span> · {formatDate(item.created_at)}
                                                </span>
                                                <span className="w-6 h-6 shrink-0" aria-hidden="true" />
                                            </div>
                                        </div>
                                    </Link>
                                    <button
                                        type="button"
                                        onClick={() => toggleBookmark(item.id)}
                                        className={[
                                            'absolute right-3.5 bottom-3.5 w-6 h-6 rounded-full flex items-center justify-center transition-colors',
                                            bookmarked.has(item.id) ? 'text-primary' : 'text-content-muted hover:text-content-secondary',
                                        ].join(' ')}
                                        aria-label="북마크"
                                    >
                                        <Bookmark
                                            className="w-4 h-4"
                                            fill={bookmarked.has(item.id) ? 'currentColor' : 'none'}
                                            strokeWidth={2.2}
                                        />
                                    </button>
                                </div>
                            )
                        })}
                    </motion.div>
                </AnimatePresence>
                </div>

                {totalPages > 1 && (
                    <div className="flex lg:hidden items-center justify-center gap-1.5 mt-4">
                        {Array.from({ length: totalPages }).map((_, i) => (
                            <button
                                key={i}
                                type="button"
                                onClick={() => { setDirection(i > page ? 1 : -1); setPage(i) }}
                                aria-label={`${i + 1}페이지`}
                                className={`rounded-full transition-all ${
                                    i === page ? 'w-5 h-1.5 bg-primary' : 'w-1.5 h-1.5 bg-border-strong'
                                }`}
                            />
                        ))}
                    </div>
                )}
            </div>
        </section>
    )
}
