interface BriefSummary {
    intro: string
    bullets: string[]
    conclusion: string
    threeLine?: string[]
}

interface IssueBriefProps {
    brief: BriefSummary
    userId?: string | null
}

export default function IssueBrief({ brief, userId }: IssueBriefProps) {
    const lines = brief.threeLine
    if (!lines || lines.length === 0) return null

    return (
        <div className="card overflow-hidden mb-6 p-4 space-y-2 bg-[#faf9fc]">
            <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-primary-light text-primary shrink-0 whitespace-nowrap">
                    AI 요약
                </span>
                <h3 className="text-sm font-bold text-content-primary">
                    핵심만 콕! <span className="text-base">✨</span>
                </h3>
            </div>
            <ul className="space-y-1.5">
                {lines.map((line, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-content-primary leading-relaxed">
                        <span className="w-1 h-1 rounded-full bg-content-muted shrink-0 mt-[9px]" />
                        {line}
                    </li>
                ))}
            </ul>
            {!userId && (
                <a href="/login" className="block pt-3 mt-1 border-t border-border-muted text-xs font-semibold text-primary hover:underline text-right">
                    로그인하고 전체 타임라인 보기 →
                </a>
            )}
        </div>
    )
}
