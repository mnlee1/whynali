/**
 * components/issues/HotIssueHighlight.tsx
 *
 * [오늘의 이슈 히어로 캐러셀]
 *
 * 메인화면 최상단에 배치되는 히어로 섹션입니다.
 * 화력 상위 이슈 최대 5개를 자동 슬라이드 캐러셀로 보여줍니다.
 * 5초마다 자동으로 다음 이슈로 전환되며, 하단 인디케이터로 현재 위치를 표시합니다.
 * 카테고리별 그라디언트 배경으로 이미지 없이도 시각적으로 강조합니다.
 */

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { getIssues } from '@/lib/api/issues'
import type { Issue, IssueCategory } from '@/types/issue'
import { decodeHtml } from '@/lib/utils/decode-html'

const SLIDE_INTERVAL_MS = 5000

// 카테고리별 배경 그라디언트
const CATEGORY_GRADIENT: Record<IssueCategory, string> = {
    '연예': 'from-pink-500 via-purple-500 to-indigo-500',
    '스포츠': 'from-blue-500 via-cyan-500 to-teal-500',
    '정치': 'from-red-500 via-orange-500 to-amber-500',
    '사회': 'from-emerald-500 via-teal-500 to-cyan-500',
    '기술': 'from-violet-500 via-blue-500 to-cyan-500',
}

// 상태별 뱃지 스타일
function getStatusBadge(status: string): string {
    switch (status) {
        case '점화': return 'bg-red-500 text-white'
        case '논란중': return 'bg-orange-500 text-white'
        default: return 'bg-neutral-500 text-white'
    }
}

// 날짜 포맷
function formatDate(dateString: string): string {
    const date = new Date(dateString)
    const now = new Date()
    const diffHours = Math.floor((now.getTime() - date.getTime()) / 3600000)
    const diffDays = Math.floor(diffHours / 24)

    if (diffHours < 1) return '방금 전'
    if (diffHours < 24) return `${diffHours}시간 전`
    if (diffDays < 7) return `${diffDays}일 전`
    return date.toLocaleDateString('ko-KR')
}

export default function HotIssueHighlight() {
    const [issues, setIssues] = useState<Issue[]>([])
    const [loading, setLoading] = useState(true)
    const [current, setCurrent] = useState(0)
    const [paused, setPaused] = useState(false)
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

    useEffect(() => {
        async function load() {
            try {
                const res = await getIssues({ sort: 'heat', limit: 10 })
                const active = res.data.filter((i) => i.status !== '종결').slice(0, 5)
                setIssues(active)
            } catch {
                // 실패 시 섹션 미표시
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [])

    // 자동 슬라이드 타이머 관리
    const startTimer = useCallback(() => {
        if (timerRef.current) clearInterval(timerRef.current)
        timerRef.current = setInterval(() => {
            setCurrent((prev) => (prev + 1) % issues.length)
        }, SLIDE_INTERVAL_MS)
    }, [issues.length])

    useEffect(() => {
        if (issues.length === 0 || paused) return
        startTimer()
        return () => {
            if (timerRef.current) clearInterval(timerRef.current)
        }
    }, [issues.length, paused, startTimer])

    const goTo = (idx: number) => {
        setCurrent(idx)
        // 수동 이동 시 타이머 리셋
        if (!paused) startTimer()
    }

    const togglePause = () => setPaused((p) => !p)

    if (loading) {
        return (
            <div className="h-64 bg-neutral-100 rounded-2xl animate-pulse" />
        )
    }

    if (issues.length === 0) return null

    const issue = issues[current]
    const gradient = CATEGORY_GRADIENT[issue.category] ?? 'from-neutral-600 to-neutral-800'

    return (
        <section className="relative">
            {/* 오늘의 이슈 뱃지 */}
            <div className="absolute top-4 left-4 z-10">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-600 text-white text-xs font-bold shadow-lg">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    오늘의 이슈
                </span>
            </div>

            <Link href={`/issue/${issue.id}`}>
                <article
                    className={`relative h-64 rounded-2xl overflow-hidden bg-gradient-to-br ${gradient} cursor-pointer group`}
                >
                    {/* 오버레이 */}
                    <div className="absolute inset-0 bg-black/30 group-hover:bg-black/40 transition-colors" />

                    {/* 콘텐츠 */}
                    <div className="absolute inset-0 flex flex-col justify-end p-5 pb-14">
                        {/* 카테고리 + 상태 */}
                        <div className="flex items-center gap-2 mb-3">
                            <span className="text-xs text-white/80 font-medium">
                                {issue.category}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${getStatusBadge(issue.status)}`}>
                                {issue.status}
                            </span>
                        </div>

                        {/* 제목 */}
                        <h2 className="text-xl font-bold text-white leading-snug line-clamp-2 mb-2">
                            {decodeHtml(issue.title)}
                        </h2>

                        {/* 화력 + 날짜 */}
                        <div className="flex items-center gap-3 text-xs text-white/70">
                            <span>화력 {issue.heat_index ?? 0}</span>
                            <span>·</span>
                            <span>{formatDate(issue.created_at)}</span>
                        </div>
                    </div>
                </article>
            </Link>

            {/* 하단 컨트롤 바 */}
            <div className="absolute bottom-4 left-5 right-5 flex items-center justify-between z-10">
                {/* 슬라이드 점 인디케이터 */}
                <div className="flex items-center gap-1.5">
                    {issues.map((_, idx) => (
                        <button
                            key={idx}
                            onClick={(e) => { e.preventDefault(); goTo(idx) }}
                            className={`transition-all rounded-full ${
                                idx === current
                                    ? 'w-5 h-1.5 bg-white'
                                    : 'w-1.5 h-1.5 bg-white/50 hover:bg-white/70'
                            }`}
                            aria-label={`슬라이드 ${idx + 1}로 이동`}
                        />
                    ))}
                </div>

                {/* 일시정지/재생 + 번호 */}
                <div className="flex items-center gap-2 text-white/80 text-xs">
                    <button
                        onClick={(e) => { e.preventDefault(); togglePause() }}
                        className="w-6 h-6 rounded-full bg-black/30 hover:bg-black/50 flex items-center justify-center transition-colors"
                        aria-label={paused ? '자동 재생' : '일시 정지'}
                    >
                        {paused ? '▶' : '⏸'}
                    </button>
                    <span className="font-medium">{current + 1} / {issues.length}</span>
                </div>
            </div>
        </section>
    )
}
