'use client'

import { useState } from 'react'
import { Bot } from 'lucide-react'

interface BriefSummary {
    intro: string
    bullets: string[]
    conclusion: string
}

interface IssueBriefProps {
    brief: BriefSummary
}

const ALWAYS_SHOW = 3

export default function IssueBrief({ brief }: IssueBriefProps) {
    const [expanded, setExpanded] = useState(false)
    const hasMore = brief.bullets.length > ALWAYS_SHOW
    const visibleBullets = expanded ? brief.bullets : brief.bullets.slice(0, ALWAYS_SHOW)

    return (
        <div className="card overflow-hidden mb-6">
            <div className="px-4 py-3 border-b border-border-muted flex items-center gap-2">
                <span className="text-base">✨</span>
                <h2 className="text-sm font-bold text-content-primary">한줄요약</h2>
                <span className="text-xs text-content-muted ml-auto">AI 생성</span>
            </div>
            <div className="p-4 space-y-3">
                <p className="text-sm text-content-primary font-medium leading-relaxed">
                    {brief.intro}
                </p>
                <ul className="space-y-1.5">
                    {visibleBullets.map((bullet, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-content-secondary">
                            <span className="mt-1.5 w-1 h-1 rounded-full bg-content-muted shrink-0" />
                            {bullet}
                        </li>
                    ))}
                </ul>
                {hasMore && (
                    <button
                        onClick={() => setExpanded(prev => !prev)}
                        className="text-xs text-content-muted hover:text-content-secondary transition-colors"
                    >
                        {expanded ? '접기 ▲' : `${brief.bullets.length - ALWAYS_SHOW}개 더 보기 ▼`}
                    </button>
                )}
                <p className="text-sm font-semibold text-content-primary pt-1 border-t border-border-muted">
                    {brief.conclusion}
                </p>
            </div>
            <div className="px-4 pb-3">
                <div className="flex items-start gap-2 p-2 bg-gray-50 border border-gray-200 rounded">
                    <Bot className="w-4 h-4 text-gray-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-gray-600 leading-relaxed">
                        AI가 자동 생성한 요약으로, 실제 내용과 다를 수 있습니다.
                    </p>
                </div>
            </div>
        </div>
    )
}
