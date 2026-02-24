/**
 * components/votes/VotePreview.tsx
 *
 * [투표 미리보기 컴포넌트]
 *
 * 메인화면에서 현재 진행 중인 투표를 미리 보여줘 참여를 유도합니다.
 * 화력 상위 이슈 중 첫 번째로 투표가 등록된 이슈의 가장 최근 투표를 표시합니다.
 * 선택지와 현재 득표 비율을 바 형태로 보여주고, 클릭하면 해당 이슈 상세로 이동합니다.
 *
 * 투표가 하나도 없으면 섹션 전체를 숨깁니다.
 */

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getIssues } from '@/lib/api/issues'
import type { Issue } from '@/types/issue'
import type { Vote, VoteChoice } from '@/types/index'
import { decodeHtml } from '@/lib/utils/decode-html'

// votes API 응답 형태 (vote_choices가 조인됨)
interface VoteWithChoices extends Vote {
    vote_choices: VoteChoice[]
}

// 득표 비율을 Tailwind 단계 클래스로 변환 (인라인 스타일 없이 표현)
function getRatioBarClass(ratio: number): string {
    if (ratio >= 90) return 'w-11/12'
    if (ratio >= 75) return 'w-3/4'
    if (ratio >= 60) return 'w-3/5'
    if (ratio >= 50) return 'w-1/2'
    if (ratio >= 40) return 'w-2/5'
    if (ratio >= 25) return 'w-1/4'
    if (ratio >= 10) return 'w-1/12'
    return 'w-1'
}

export default function VotePreview() {
    const [vote, setVote] = useState<VoteWithChoices | null>(null)
    const [issue, setIssue] = useState<Issue | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function load() {
            try {
                // 1. 화력순 이슈 목록 가져오기 (진행 중인 것 우선)
                const res = await getIssues({ sort: 'heat', limit: 10 })
                const activeIssues = res.data.filter((i) => i.status !== '종결')

                // 2. 투표가 있는 첫 번째 이슈 찾기
                for (const candidate of activeIssues) {
                    const voteRes = await fetch(`/api/votes?issue_id=${candidate.id}`)
                    if (!voteRes.ok) continue

                    const voteJson = await voteRes.json()
                    if (voteJson.data && voteJson.data.length > 0) {
                        // 가장 최근 투표 사용
                        setVote(voteJson.data[voteJson.data.length - 1])
                        setIssue(candidate)
                        break
                    }
                }
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
            <div className="h-32 bg-neutral-100 rounded-xl animate-pulse" />
        )
    }

    if (!vote || !issue) return null

    const choices = vote.vote_choices ?? []
    const totalCount = choices.reduce((sum, c) => sum + (c.count ?? 0), 0)

    return (
        <section>
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-bold text-neutral-900">지금 투표 중</h2>
                <Link
                    href={`/issue/${issue.id}`}
                    className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
                >
                    이슈 보기
                </Link>
            </div>

            <Link href={`/issue/${issue.id}`}>
                <div className="p-4 bg-white border border-violet-200 rounded-xl hover:border-violet-300 hover:shadow-sm transition-all">
                    {/* 연결된 이슈 제목 */}
                    <p className="text-xs text-violet-600 font-medium mb-1 line-clamp-1">
                        {decodeHtml(issue.title)}
                    </p>

                    {/* 투표 제목 */}
                    <p className="text-sm font-bold text-neutral-900 mb-4">
                        {vote.title ?? '이 이슈에 대해 어떻게 생각하시나요?'}
                    </p>

                    {/* 선택지 + 득표 바 */}
                    <div className="space-y-2.5">
                        {choices.map((choice, idx) => {
                            const ratio = totalCount > 0
                                ? Math.round((choice.count / totalCount) * 100)
                                : 0
                            const barClass = getRatioBarClass(ratio)

                            // 득표 1위 여부
                            const maxCount = Math.max(...choices.map((c) => c.count))
                            const isLeading = choice.count === maxCount && totalCount > 0

                            return (
                                <div key={choice.id}>
                                    <div className="flex items-center justify-between text-xs mb-1">
                                        <span className={`font-medium ${isLeading ? 'text-violet-700' : 'text-neutral-600'}`}>
                                            {choice.label}
                                        </span>
                                        <span className={`${isLeading ? 'text-violet-600 font-semibold' : 'text-neutral-400'}`}>
                                            {ratio}%
                                        </span>
                                    </div>
                                    <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full ${barClass} ${isLeading ? 'bg-violet-500' : 'bg-neutral-300'}`} />
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {/* 총 투표 수 + 참여 유도 */}
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-neutral-100">
                        <span className="text-xs text-neutral-400">
                            총 {totalCount.toLocaleString()}명 참여
                        </span>
                        <span className="text-xs text-violet-600 font-medium">
                            로그인 후 투표 참여
                        </span>
                    </div>
                </div>
            </Link>
        </section>
    )
}
