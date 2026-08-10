/**
 * app/admin/(protected)/kpi/shared.tsx
 *
 * 관리자 화면(page.tsx)과 리포트 페이지(report/page.tsx)가 함께 쓰는 낱개 지표 카드·증감 표시.
 * 두 화면의 카드 디자인이 사실상 동일해서, 여기서 한 번만 고치면 양쪽에 다 반영되도록 분리해뒀다.
 */

'use client'

export type DeltaStat = {
    current: number
    previous: number
    delta: number
    deltaPercent: number | null
}

// 증감 텍스트("(▲12)"/"(▼12)"/"(–)")를 계산하는 순수 함수.
// DeltaBadge(React 컴포넌트)와 HTML 저장 파일을 만드는 문자열 생성기가 이 함수 하나만 같이 참조한다.
export function formatDelta(d?: DeltaStat): { text: string; tone: 'up' | 'down' | 'neutral' } | null {
    if (!d) return null
    if (d.delta === 0) return { text: '(–)', tone: 'neutral' }
    const up = d.delta > 0
    return { text: `(${up ? '▲' : '▼'}${Math.abs(d.delta).toLocaleString()})`, tone: up ? 'up' : 'down' }
}

export function DeltaBadge({ d }: { d?: DeltaStat }) {
    const f = formatDelta(d)
    if (!f) return null
    const cls = f.tone === 'up' ? 'text-emerald-600' : f.tone === 'down' ? 'text-red-500' : 'text-slate-400'
    return <span className={`ml-2 text-xs font-semibold ${cls}`}>{f.text}</span>
}

function InfoTooltip({ text }: { text: string }) {
    return (
        <span className="relative inline-flex items-center group align-middle ml-1">
            <svg width="13" height="13" viewBox="0 0 16 16" className="text-slate-400 cursor-help shrink-0">
                <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.3" />
                <circle cx="8" cy="4.6" r="0.9" fill="currentColor" />
                <rect x="7.15" y="7" width="1.7" height="5" rx="0.6" fill="currentColor" />
            </svg>
            <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 hidden group-hover:block w-56 rounded-lg bg-slate-800 px-2.5 py-1.5 text-[11px] leading-snug text-white shadow-lg z-10">
                {text}
            </span>
        </span>
    )
}

export function StatCard({ label, caption, current, unit, note, delta, rateLabel, rateValue, infoTooltip }: {
    label: string; caption?: string; current: number; unit: string; note?: string
    delta?: DeltaStat; rateLabel?: string; rateValue?: string; infoTooltip?: string
}) {
    return (
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 h-full flex flex-col break-inside-avoid">
            <div className="flex items-start justify-between gap-2 mb-2">
                <p className="text-sm font-medium text-slate-700">
                    {label}{infoTooltip && <InfoTooltip text={infoTooltip} />}{caption && <span className="text-slate-500 font-normal"> · {caption}</span>}
                </p>
                {rateLabel && <span className="text-xs font-semibold text-blue-700 whitespace-nowrap">{rateLabel} {rateValue}</span>}
            </div>
            <div className="mt-auto flex items-baseline justify-between gap-2">
                <span className="text-sm text-slate-600">{note}</span>
                <span className="text-xl font-bold text-slate-900 whitespace-nowrap">
                    {current.toLocaleString()}{unit}
                    <DeltaBadge d={delta} />
                </span>
            </div>
        </div>
    )
}
