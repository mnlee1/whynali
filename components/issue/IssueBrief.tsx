interface BriefSummary {
    intro: string
    bullets: string[]
    conclusion: string
    threeLine?: string[]
}

interface IssueBriefProps {
    brief: BriefSummary
}

export default function IssueBrief({ brief }: IssueBriefProps) {
    const lines = brief.threeLine
    if (!lines || lines.length === 0) return null

    return (
        <div className="card overflow-hidden mb-6 p-4 space-y-2 bg-[#faf9fc]">
            <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#ece4fb] text-[#7b3aed] shrink-0 whitespace-nowrap">
                    AI 요약
                </span>
                <h3 className="text-sm font-bold text-content-primary">
                    핵심만 콕! <span className="text-base">✨</span>
                </h3>
            </div>
            <ul className="space-y-1.5">
                {lines.map((line, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-content-primary leading-relaxed">
                        <span className="w-1 h-1 rounded-full bg-content-muted shrink-0" />
                        {line}
                    </li>
                ))}
            </ul>
        </div>
    )
}
