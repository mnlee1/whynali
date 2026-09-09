/**
 * components/issues/PopularRanking.tsx
 *
 * [지금 뜨는 이슈 / 급상승 중 랭킹 — 매거진형 섹션]
 *
 * 메인 상단, 독립된 전체 폭 섹션으로 배치됩니다 (더 이상 투표 위젯과 나란히 붙지 않음).
 * - 기본 모드: 화력 상위 이슈 (최근 7일)
 * - 급상승 모드("🔥 지금 왜 난리야? TOP5"): 1위는 큰 히어로(이미지+제목+설명),
 *   2~5위는 2열 리스트(작은 이미지+제목+설명)로 표시하고, 주기적으로 최신 화력
 *   순위를 다시 불러와 순서가 바뀌면 framer-motion으로 재정렬 모션을 보여줍니다.
 *
 * initialIssues prop이 제공되면 SSR 데이터를 바로 사용하고,
 * 없으면 클라이언트에서 직접 fetch합니다.
 */

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { getIssues } from '@/lib/api/issues'
import type { Issue } from '@/types/issue'
import { decodeHtml } from '@/lib/utils/decode-html'
import { formatDate } from '@/lib/utils/format-date'
import { truncateToSentence } from '@/lib/utils/truncate-to-sentence'

interface IssueWithSurge extends Issue {
    surgePct?: number
}

interface Props {
    initialIssues?: IssueWithSurge[]
    isSurging?: boolean
}

// 랭킹 표시 우선순위: 화제 집중(논란중)이 점화중보다 escalate된 상태라 먼저 노출하고,
// 종결은 가장 뒤로 보낸다. 동일 상태 내에서는 화력 내림차순.
const STATUS_DISPLAY_PRIORITY: Record<string, number> = { '논란중': 0, '점화': 1, '종결': 2 }
function prioritizeIssues(issues: Issue[]): Issue[] {
    return [...issues].sort((a, b) => {
        const pa = STATUS_DISPLAY_PRIORITY[a.status] ?? 3
        const pb = STATUS_DISPLAY_PRIORITY[b.status] ?? 3
        if (pa !== pb) return pa - pb
        return (b.heat_index ?? 0) - (a.heat_index ?? 0)
    })
}

// 1-2위 슬롯 구성: 1위는 화제집중(논란중) 중 화력 최고, 2위는 점화중 중 화력 최고를 우선한다.
// 종결 이슈는 슬롯 후보에서 제외한다. 한쪽 상태의 후보가 없으면 화력 기준으로 빈 슬롯 없이 채운다.
// 3-5위는 나머지 후보 중 상태 우선순위(prioritizeIssues) 기준 상위 3개.
// pool은 화력 내림차순으로 정렬된 상태여야 한다.
function composeRanking(pool: IssueWithSurge[]): IssueWithSurge[] {
    const nonClosed = pool.filter((i) => i.status !== '종결')
    const debateTop = nonClosed.find((i) => i.status === '논란중') ?? null
    const igniteTop = nonClosed.find((i) => i.status === '점화') ?? null

    const slot1 = debateTop ?? igniteTop ?? nonClosed[0] ?? pool[0] ?? null
    const slot2 =
        (igniteTop && igniteTop.id !== slot1?.id ? igniteTop : null) ??
        nonClosed.find((i) => i.id !== slot1?.id) ??
        pool.find((i) => i.id !== slot1?.id) ??
        null

    const primary = [slot1, slot2].filter((i): i is IssueWithSurge => !!i)
    const usedIds = new Set(primary.map((i) => i.id))
    const rest = prioritizeIssues(pool.filter((i) => !usedIds.has(i.id))).slice(0, 5 - primary.length) as IssueWithSurge[]

    return [...primary, ...rest]
}

function filterThisWeek(issues: Issue[]): Issue[] {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    return issues
        .filter((i) => new Date(i.created_at).getTime() >= sevenDaysAgo)
        .slice(0, 5)
}

const CATEGORY_GRADIENTS: Record<string, string> = {
    연예: 'from-pink-500 to-violet-500',
    스포츠: 'from-blue-500 to-teal-500',
    정치: 'from-red-500 to-amber-500',
    사회: 'from-emerald-500 to-cyan-500',
    경제: 'from-amber-500 to-red-500',
    기술: 'from-violet-500 to-cyan-500',
    세계: 'from-indigo-500 to-cyan-500',
}

function metaLine(issue: IssueWithSurge) {
    return (
        <>
            <span className="text-content-secondary font-medium">{issue.category}</span> · {formatDate(issue.created_at)}
        </>
    )
}

export default function PopularRanking({ initialIssues, isSurging = false }: Props) {
    const [issues, setIssues] = useState<IssueWithSurge[]>(
        initialIssues ? (isSurging ? composeRanking(initialIssues) : filterThisWeek(initialIssues)) : []
    )
    const [loading, setLoading] = useState(!initialIssues)
    const [failedImages, setFailedImages] = useState<Record<string, boolean>>({})
    // -1(스포트라이트 없음)에서 시작해 마운트 직후 0으로 전환한다 — 처음부터 0으로 시작하면
    // "값이 안 바뀌는 마운트"로 취급돼 framer-motion이 1위 카드의 플립 모션을 건너뛰는 문제가 있었다.
    const [spotlightIndex, setSpotlightIndex] = useState(-1)

    useEffect(() => {
        if (initialIssues) return
        async function load() {
            try {
                const res = await getIssues({ sort: 'heat', limit: 30 })
                setIssues(isSurging ? composeRanking(res.data) : filterThisWeek(res.data))
            } catch {
                // 실패 시 섹션 미표시
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [initialIssues, isSurging])

    // 급상승 모드: 주기적으로 최신 화력 순위를 다시 불러와 순서 변화를 반영한다.
    useEffect(() => {
        if (!isSurging) return
        const interval = setInterval(async () => {
            try {
                const res = await getIssues({ sort: 'heat', limit: 30 })
                setIssues(composeRanking(res.data))
            } catch {
                // 실패 시 기존 순위 유지
            }
        }, 60000)
        return () => clearInterval(interval)
    }, [isSurging])

    // 급상승 모드: 데이터 변화가 없어도 화면이 "살아있다"는 느낌을 주기 위해
    // 1~5위를 3.5초 간격으로 순차 하이라이트한다(장식용 모션, 데이터 변화와 무관).
    useEffect(() => {
        if (!isSurging || issues.length === 0) return
        setSpotlightIndex(0)
        const interval = setInterval(() => {
            setSpotlightIndex((i) => (i + 1) % issues.length)
        }, 3500)
        return () => clearInterval(interval)
    }, [isSurging, issues.length])

    const [hero, ...rest] = issues
    const failedImage = (id: string) => !!failedImages[id]
    const onImageError = (id: string) => setFailedImages((prev) => ({ ...prev, [id]: true }))

    if (loading) {
        return (
            <section className="flex flex-col min-w-0">
                <div className="flex flex-col gap-6">
                    <div className="h-[260px] bg-border-muted rounded-xl animate-pulse" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
                        {[0, 1, 2, 3].map((i) => (
                            <div key={i} className="h-[86px] bg-border-muted rounded-xl animate-pulse" />
                        ))}
                    </div>
                </div>
            </section>
        )
    }

    return (
        <section className="flex flex-col min-w-0">
            <div className="flex flex-col gap-10">
                {hero && (
                    <RankHero
                        issue={hero}
                        rank={1}
                        failedImage={failedImage(hero.id)}
                        onImageError={() => onImageError(hero.id)}
                        gradient={CATEGORY_GRADIENTS[hero.category] ?? 'from-neutral-400 to-neutral-500'}
                        isSpotlighted={isSurging && spotlightIndex === 0}
                    />
                )}
                {rest.length > 0 && (
                    <ol className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-7">
                        {rest.map((issue, idx) => (
                            <RankListItem
                                key={issue.id}
                                issue={issue}
                                rank={idx + 2}
                                failedImage={failedImage(issue.id)}
                                onImageError={() => onImageError(issue.id)}
                                gradient={CATEGORY_GRADIENTS[issue.category] ?? 'from-neutral-400 to-neutral-500'}
                                isSpotlighted={isSurging && spotlightIndex === idx + 1}
                            />
                        ))}
                    </ol>
                )}
            </div>
        </section>
    )
}

interface RankItemProps {
    issue: IssueWithSurge
    rank: number
    failedImage: boolean
    onImageError: () => void
    gradient: string
    isSpotlighted: boolean
}

function RankHero({ issue, rank, failedImage, onImageError, gradient, isSpotlighted }: RankItemProps) {
    const thumbUrl = issue.thumbnail_urls?.[issue.primary_thumbnail_index ?? 0]
    const showImage = thumbUrl && !failedImage
    const rawDescription = issue.topic_description ?? issue.brief_summary?.intro
    const description = rawDescription ? truncateToSentence(decodeHtml(rawDescription), 100) : null

    const animateText = isSpotlighted

    return (
        <motion.div layout transition={{ type: 'spring', stiffness: 300, damping: 30 }}>
            <Link
                href={`/issue/${issue.id}`}
                className="block group -m-3 p-3 rounded-xl [@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-1.5 transition-transform duration-300 ease-out"
                style={{ perspective: 700 }}
            >
                <motion.div
                    key={animateText ? 'flip-in' : 'flip-out'}
                    initial={false}
                    animate={animateText ? { rotateX: [0, 100, 0], opacity: [1, 0.3, 1] } : { rotateX: 0, opacity: 1 }}
                    transition={{ duration: 1, times: [0, 0.02, 1], ease: [0.16, 1, 0.3, 1], delay: 1.5 }}
                    style={{ transformOrigin: 'center', transformStyle: 'preserve-3d', backfaceVisibility: 'hidden' }}
                    className="flex flex-col sm:flex-row gap-5 sm:gap-8"
                >
                    <div className={`relative w-full sm:w-1/2 shrink-0 aspect-[16/9] rounded-xl overflow-hidden ${showImage ? '' : `bg-gradient-to-br ${gradient}`}`}>
                        {showImage && (
                            <Image
                                src={thumbUrl}
                                alt=""
                                fill
                                className="object-cover"
                                sizes="(min-width: 640px) 40vw, 100vw"
                                onError={onImageError}
                            />
                        )}
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <div className="grid grid-cols-[auto_1fr] gap-3 items-start">
                            <span className="text-primary font-extrabold text-[26px] sm:text-3xl leading-none">{rank}</span>
                            <div className="min-w-0">
                                <h3 className="text-[19px] sm:text-[22px] font-bold leading-snug line-clamp-2 text-content-primary">
                                    {decodeHtml(issue.title)}
                                </h3>
                                {description && (
                                    <p className="text-[15px] sm:text-[16px] text-content-secondary leading-relaxed line-clamp-2 mt-2">{description}</p>
                                )}
                                <span className="text-[13px] text-content-muted mt-5 block">{metaLine(issue)}</span>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </Link>
        </motion.div>
    )
}

function RankListItem({ issue, rank, failedImage, onImageError, gradient, isSpotlighted }: RankItemProps) {
    const thumbUrl = issue.thumbnail_urls?.[issue.primary_thumbnail_index ?? 0]
    const showImage = thumbUrl && !failedImage
    const rawDescription = issue.topic_description ?? issue.brief_summary?.intro
    const description = rawDescription ? truncateToSentence(decodeHtml(rawDescription), 90) : null

    return (
        <motion.li layout transition={{ type: 'spring', stiffness: 300, damping: 30 }}>
            <Link
                href={`/issue/${issue.id}`}
                className="block group -m-2.5 p-2.5 rounded-lg [@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-1.5 transition-transform duration-300 ease-out"
                style={{ perspective: 700 }}
            >
                <motion.div
                    key={isSpotlighted ? 'flip-in' : 'flip-out'}
                    initial={false}
                    animate={isSpotlighted ? { rotateX: [0, 100, 0], opacity: [1, 0.3, 1] } : { rotateX: 0, opacity: 1 }}
                    transition={{ duration: 1, times: [0, 0.02, 1], ease: [0.16, 1, 0.3, 1], delay: 1.5 }}
                    style={{ transformOrigin: 'center', transformStyle: 'preserve-3d', backfaceVisibility: 'hidden' }}
                    className="flex items-stretch gap-5"
                >
                    <div className={`relative w-[130px] min-[900px]:w-[180px] h-auto min-h-[80px] shrink-0 rounded-lg overflow-hidden ${showImage ? '' : `bg-gradient-to-br ${gradient}`}`}>
                        {showImage && (
                            <Image
                                src={thumbUrl}
                                alt=""
                                fill
                                className="object-cover"
                                sizes="(min-width: 900px) 180px, 130px"
                                onError={onImageError}
                            />
                        )}
                    </div>
                    <div className="min-w-0 flex-1 grid grid-cols-[auto_1fr] gap-2.5 items-start">
                        <span className="text-primary font-extrabold text-2xl leading-none">{rank}</span>
                        <div className="min-w-0">
                            <h4 className="text-[16px] font-bold leading-snug line-clamp-2 text-content-primary">
                                {decodeHtml(issue.title)}
                            </h4>
                            {description && (
                                <p className="text-[14px] text-content-secondary line-clamp-2 mt-1">{description}</p>
                            )}
                            <span className="text-[12.5px] text-content-muted mt-3 block">{metaLine(issue)}</span>
                        </div>
                    </div>
                </motion.div>
            </Link>
        </motion.li>
    )
}
