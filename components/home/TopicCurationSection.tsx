/**
 * components/home/TopicCurationSection.tsx
 *
 * [매체별 토픽 큐레이션 섹션 — 홈 하단 "왜난리야?" 대체]
 *
 * 카테고리별 화력(heat_index) 상위 이슈를 채널 형태로 묶어 보여준다.
 * 채널 1개 = 헤더(아이콘+카테고리명) + 히어로 카드(1개) + 서브 아이템(최대 3개).
 * 별도 큐레이션 DB 없이 기존 category/heat_index 데이터만으로 구성된다.
 *
 * 사용 예시:
 *   <TopicCurationSection channels={channels} />
 */

'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Bookmark } from 'lucide-react'
import { formatDate } from '@/lib/utils/format-date'
import { decodeHtml } from '@/lib/utils/decode-html'
import { truncateToSentence } from '@/lib/utils/truncate-to-sentence'
import type { Issue, IssueCategory } from '@/types/issue'

const SUB_TEXT_MAX_LENGTH = 70

export interface TopicChannel {
    category: IssueCategory
    hero: Issue
    subs: Issue[]
}

interface TopicCurationSectionProps {
    channels: TopicChannel[]
}

const CHANNEL_META: Record<IssueCategory, { gradient: string; icon: React.ReactNode }> = {
    경제: {
        gradient: 'from-amber-500 to-red-500',
        icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#b91c1c" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 17 9 11 13 15 21 6" /><polyline points="15 6 21 6 21 12" />
            </svg>
        ),
    },
    연예: {
        gradient: 'from-pink-500 to-violet-500',
        icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#be185d" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4" />
            </svg>
        ),
    },
    세계: {
        gradient: 'from-indigo-500 to-cyan-500',
        icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0e7490" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 3.8 5.7 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.7-3.8-9s1.3-6.5 3.8-9z" />
            </svg>
        ),
    },
    정치: {
        gradient: 'from-red-500 via-orange-500 to-amber-500',
        icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7e22ce" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l8 4v2H4V7l8-4z" /><path d="M5 10v8M9 10v8M15 10v8M19 10v8" /><path d="M3 21h18" />
            </svg>
        ),
    },
    사회: {
        gradient: 'from-emerald-500 via-teal-500 to-cyan-500',
        icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
        ),
    },
    기술: {
        gradient: 'from-violet-500 via-blue-500 to-cyan-500',
        icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round">
                <rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />
            </svg>
        ),
    },
    스포츠: {
        gradient: 'from-blue-500 via-cyan-500 to-teal-500',
        icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" /><path d="M12 3v18M3 12h18" />
            </svg>
        ),
    },
}

// 채널 헤더 아이콘과 동일한 색상 — 서브 아이템 도트에 재사용해 같은 채널임을 시각적으로 연결한다.
const ACCENT_COLOR: Record<IssueCategory, string> = {
    경제: '#b91c1c',
    연예: '#be185d',
    세계: '#0e7490',
    정치: '#7e22ce',
    사회: '#15803d',
    기술: '#b45309',
    스포츠: '#1d4ed8',
}

export default function TopicCurationSection({ channels }: TopicCurationSectionProps) {
    const [failedImages, setFailedImages] = useState<Record<string, boolean>>({})
    const [bookmarked, setBookmarked] = useState<Set<string>>(new Set())

    const toggleBookmark = (id: string) => {
        setBookmarked(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    if (channels.length === 0) return null

    return (
        <section className="!mt-[72px]">
            <div className="mb-5">
                <h2 className="text-[24px] font-bold text-content-primary mb-1">매체별 토픽 큐레이션</h2>
                <p className="text-[14.5px] text-content-secondary">카테고리별로 지금 가장 화제인 이슈만 골랐어요</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {channels.map(({ category, hero, subs }) => {
                    const meta = CHANNEL_META[category]
                    const rawImage = hero.thumbnail_urls?.[hero.primary_thumbnail_index ?? 0] ?? null
                    const heroImage = rawImage && !failedImages[hero.id] ? rawImage : null
                    return (
                        <div key={category} className="flex flex-col gap-3.5">
                            <Link href={`/${category === '기술' ? 'tech' : category === '세계' ? 'world' : category === '연예' ? 'entertain' : category === '스포츠' ? 'sports' : category === '정치' ? 'politics' : category === '경제' ? 'economy' : 'society'}`} className="flex items-center gap-2 group">
                                {meta.icon}
                                <span className="text-[17px] font-bold text-content-primary">{category}</span>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="text-content-muted group-hover:text-content-primary transition-colors">
                                    <polyline points="9 6 15 12 9 18" />
                                </svg>
                            </Link>

                            {/* 히어로 카드 + 서브 아이템 — 에디토리얼 오버레이 스타일 */}
                            <div className="card-hover overflow-visible">
                                <div className={`aspect-[16/9] relative rounded-t-xl overflow-hidden group ${heroImage ? '' : `bg-gradient-to-br ${meta.gradient}`}`}>
                                    <Link href={`/issue/${hero.id}`} className="absolute inset-0 block">
                                        {heroImage && (
                                            <Image
                                                src={heroImage}
                                                alt=""
                                                fill
                                                className="object-cover"
                                                sizes="(min-width: 768px) 33vw, 100vw"
                                                onError={() => setFailedImages(prev => ({ ...prev, [hero.id]: true }))}
                                            />
                                        )}
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
                                        <div className="absolute inset-x-0 bottom-0 p-3.5">
                                            <h3 className="text-[19px] font-bold text-white leading-snug truncate mb-1">
                                                {decodeHtml(hero.title)}
                                            </h3>
                                            {(hero.topic_description || hero.brief_summary?.intro) && (
                                                <p className="text-[14px] text-white/80 leading-relaxed line-clamp-1 mb-1">
                                                    {hero.topic_description ?? hero.brief_summary!.intro}
                                                </p>
                                            )}
                                            <div className="flex items-center justify-between">
                                                <span className="text-[12px] text-white/60">{category} · {formatDate(hero.created_at)}</span>
                                                <span className="w-6 h-6 shrink-0" aria-hidden="true" />
                                            </div>
                                        </div>
                                    </Link>
                                    <button
                                        type="button"
                                        onClick={() => toggleBookmark(hero.id)}
                                        className={`absolute right-3.5 bottom-3.5 w-6 h-6 rounded-full flex items-center justify-center transition-colors ${bookmarked.has(hero.id) ? 'text-primary' : 'text-white/70 hover:text-white'}`}
                                        aria-label="북마크"
                                    >
                                        <Bookmark className="w-4 h-4" fill={bookmarked.has(hero.id) ? 'currentColor' : 'none'} strokeWidth={2.2} />
                                    </button>
                                </div>

                                {/* 서브 아이템 — 채널 포인트 컬러 세로선을 아이템별로 끊어서 헤더와의 연결감을 표현 */}
                                {subs.length > 0 && (
                                    <div className="border-t border-border-muted px-4 pt-4 pb-4 flex flex-col">
                                        {subs.map((sub, i) => (
                                            <div
                                                key={sub.id}
                                                className={`relative group ${i > 0 ? 'mt-3 pt-3 border-t border-border-muted' : ''}`}
                                            >
                                                <Link href={`/issue/${sub.id}`} className="block">
                                                    <div className="relative pl-3 mb-2 min-h-[44px]">
                                                        <span
                                                            className="absolute left-0 top-[7px] w-[5px] h-[5px] rounded-full"
                                                            style={{ backgroundColor: ACCENT_COLOR[category] }}
                                                        />
                                                        <h4 className="text-[16px] font-semibold text-content-primary leading-snug line-clamp-2 group-hover:text-primary [.group:has(button:hover)_&]:!text-content-primary transition-colors">
                                                            {truncateToSentence(decodeHtml(sub.topic_description ?? sub.brief_summary?.intro ?? sub.title), SUB_TEXT_MAX_LENGTH)}
                                                        </h4>
                                                    </div>
                                                    <div className="flex items-center justify-between pl-3">
                                                        <span className="text-[12.5px] text-content-muted">
                                                            <span className="text-content-secondary font-medium">{category}</span> · {formatDate(sub.created_at)}
                                                        </span>
                                                        <span className="w-6 h-6 shrink-0" aria-hidden="true" />
                                                    </div>
                                                </Link>
                                                <button
                                                    type="button"
                                                    onClick={() => toggleBookmark(sub.id)}
                                                    className={`absolute right-0 bottom-0 w-6 h-6 rounded-full flex items-center justify-center transition-colors ${bookmarked.has(sub.id) ? 'text-primary' : 'text-content-muted hover:text-content-secondary'}`}
                                                    aria-label="북마크"
                                                >
                                                    <Bookmark className="w-4 h-4" fill={bookmarked.has(sub.id) ? 'currentColor' : 'none'} strokeWidth={2.2} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>
        </section>
    )
}
