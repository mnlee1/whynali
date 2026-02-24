/**
 * components/issues/ActiveIssueStrip.tsx
 *
 * [진행 중 이슈 가로 스트립]
 *
 * 메인화면에서 현재 진행 중인 이슈(점화/논란중)를 가로 스크롤 형태로 보여줍니다.
 * 종결된 이슈는 제외하고, 최신 활성 이슈를 최대 8개까지 가로로 나열합니다.
 * 사용자가 빠르게 훑어보고 관심 이슈를 클릭할 수 있도록 설계됩니다.
 */

'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { getIssues } from '@/lib/api/issues'
import type { Issue } from '@/types/issue'

// 상태별 칩 스타일
function getStatusChipClass(status: string): string {
    switch (status) {
        case '점화':
            return 'text-red-600 bg-red-50 border-red-200'
        case '논란중':
            return 'text-orange-600 bg-orange-50 border-orange-200'
        default:
            return 'text-neutral-500 bg-neutral-50 border-neutral-200'
    }
}

function getStatusIcon(status: string): string {
    switch (status) {
        case '점화': return '▲'
        case '논란중': return '●'
        default: return '○'
    }
}

export default function ActiveIssueStrip() {
    const [issues, setIssues] = useState<Issue[]>([])
    const [loading, setLoading] = useState(true)

    const scrollRef = useRef<HTMLDivElement>(null)
    const isDragging = useRef(false)
    const startX = useRef(0)
    const scrollLeft = useRef(0)
    const hasDragged = useRef(false)

    const onMouseDown = (e: React.MouseEvent) => {
        if (!scrollRef.current) return
        isDragging.current = true
        hasDragged.current = false
        startX.current = e.pageX - scrollRef.current.offsetLeft
        scrollLeft.current = scrollRef.current.scrollLeft
    }

    const onMouseMove = (e: React.MouseEvent) => {
        if (!isDragging.current || !scrollRef.current) return
        e.preventDefault()
        const x = e.pageX - scrollRef.current.offsetLeft
        const walk = (x - startX.current) * 1.5
        if (Math.abs(x - startX.current) > 5) hasDragged.current = true
        scrollRef.current.scrollLeft = scrollLeft.current - walk
    }

    const onMouseUp = () => { isDragging.current = false }

    // 드래그 후 링크 클릭 방지
    const onClickCapture = (e: React.MouseEvent) => {
        if (hasDragged.current) {
            e.stopPropagation()
            e.preventDefault()
        }
    }

    useEffect(() => {
        async function load() {
            try {
                // 최신 15개 가져와서 진행 중인 것만 최대 8개 추출
                const res = await getIssues({ sort: 'latest', limit: 15 })
                const active = res.data.filter((i) => i.status !== '종결').slice(0, 8)
                setIssues(active)
            } catch {
                // 실패 시 섹션 미표시
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [])

    if (loading) {
        return (
            <div className="flex gap-3 overflow-hidden">
                {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="h-24 w-48 shrink-0 bg-neutral-100 rounded-xl animate-pulse" />
                ))}
            </div>
        )
    }

    if (issues.length === 0) return null

    return (
        <section>
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-bold text-neutral-900">지금 진행 중</h2>
                <Link
                    href="/"
                    className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
                >
                    전체 이슈
                </Link>
            </div>

            {/* 가로 스크롤 스트립 — 터치/마우스 드래그 모두 지원 */}
            <div
                ref={scrollRef}
                className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide touch-pan-x overscroll-x-contain cursor-grab active:cursor-grabbing select-none"
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseUp}
                onClickCapture={onClickCapture}
            >
                {issues.map((issue) => {
                    const chipClass = getStatusChipClass(issue.status)
                    const icon = getStatusIcon(issue.status)

                    return (
                        <Link key={issue.id} href={`/issue/${issue.id}`} className="shrink-0 w-52">
                            <article className="h-full p-3.5 bg-white border border-neutral-200 rounded-xl hover:border-neutral-300 hover:shadow-sm transition-all">
                                {/* 상태 칩 */}
                                <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border font-medium mb-2 ${chipClass}`}>
                                    <span className="text-[10px]">{icon}</span>
                                    {issue.status}
                                </span>

                                {/* 제목 */}
                                <p className="text-sm font-semibold text-neutral-900 line-clamp-2 leading-snug">
                                    {issue.title}
                                </p>

                                {/* 카테고리 */}
                                <p className="text-xs text-neutral-400 mt-2">{issue.category}</p>
                            </article>
                        </Link>
                    )
                })}
            </div>
        </section>
    )
}
