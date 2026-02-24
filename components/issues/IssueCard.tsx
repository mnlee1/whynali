/**
 * components/issues/IssueCard.tsx
 *
 * [이슈 목록 카드 컴포넌트]
 *
 * 이슈 목록 화면(홈, 연예, 스포츠 등)에서 한 줄씩 보여줄 카드입니다.
 * 제목, 카테고리, 상태(아이콘+텍스트), 화력(게이지+등급), 날짜를 표시합니다.
 *
 * 사용 예시:
 *   <IssueCard issue={issueData} />
 */

import Link from 'next/link'
import type { Issue } from '@/types/issue'

interface IssueCardProps {
    issue: Issue
}

// 화력 지수를 5단계 게이지로 변환 (인라인 스타일 없이 Tailwind 클래스 매핑)
function getHeatBarClass(heat: number): string {
    if (heat >= 80) return 'w-full'
    if (heat >= 60) return 'w-4/5'
    if (heat >= 40) return 'w-3/5'
    if (heat >= 20) return 'w-2/5'
    return 'w-1/5'
}

// 화력 등급 텍스트 + 색상 (02_AI기획_판단포인트: 70↑ 높음 / 30↑ 보통 / 30↓ 낮음)
function getHeatMeta(heat: number | null): { label: string; barColor: string; textColor: string } {
    if (!heat || heat < 30) return { label: '낮음', barColor: 'bg-neutral-300', textColor: 'text-neutral-400' }
    if (heat < 70) return { label: '보통', barColor: 'bg-amber-400', textColor: 'text-amber-600' }
    return { label: '높음', barColor: 'bg-red-500', textColor: 'text-red-600' }
}

// 상태별 스타일 + 아이콘 문자 (기획: 텍스트 + 아이콘 병기)
function getStatusMeta(status: string): { badgeClass: string; icon: string } {
    switch (status) {
        case '점화':
            return { badgeClass: 'text-red-600 bg-red-50 border-red-200', icon: '▲' }
        case '논란중':
            return { badgeClass: 'text-orange-600 bg-orange-50 border-orange-200', icon: '●' }
        case '종결':
            return { badgeClass: 'text-neutral-500 bg-neutral-50 border-neutral-200', icon: '■' }
        default:
            return { badgeClass: 'text-neutral-500 bg-neutral-50 border-neutral-200', icon: '○' }
    }
}

// 날짜 포맷 (예: 2시간 전, 3일 전)
function formatDate(dateString: string): string {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 60) return `${diffMins}분 전`
    if (diffHours < 24) return `${diffHours}시간 전`
    if (diffDays < 7) return `${diffDays}일 전`
    return date.toLocaleDateString('ko-KR')
}

export default function IssueCard({ issue }: IssueCardProps) {
    const heat = issue.heat_index ?? 0
    const heatMeta = getHeatMeta(issue.heat_index)
    const statusMeta = getStatusMeta(issue.status)
    const barWidthClass = getHeatBarClass(heat)

    return (
        <Link href={`/issue/${issue.id}`} className="block">
            <article className="p-5 bg-white border border-neutral-200 rounded-xl hover:border-neutral-300 hover:shadow-sm transition-all">
                {/* 상단: 카테고리 + 상태 배지 */}
                <div className="flex items-center gap-2 mb-2.5">
                    <span className="text-xs text-neutral-400">{issue.category}</span>
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border font-medium ${statusMeta.badgeClass}`}>
                        <span className="text-[10px]">{statusMeta.icon}</span>
                        {issue.status}
                    </span>
                </div>

                {/* 제목 */}
                <h3 className="text-base font-semibold text-neutral-900 mb-2 line-clamp-2">
                    {issue.title}
                </h3>

                {/* 설명 */}
                {issue.description && (
                    <p className="text-sm text-neutral-500 mb-3 line-clamp-1">
                        {issue.description}
                    </p>
                )}

                {/* 하단: 화력 게이지 + 날짜 */}
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className={`text-xs font-medium shrink-0 ${heatMeta.textColor}`}>
                            화력 {heat}
                        </span>
                        <div className="flex-1 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${heatMeta.barColor} ${barWidthClass}`} />
                        </div>
                        <span className={`text-xs shrink-0 ${heatMeta.textColor}`}>
                            {heatMeta.label}
                        </span>
                    </div>
                    <span className="text-xs text-neutral-400 shrink-0">
                        {formatDate(issue.created_at)}
                    </span>
                </div>
            </article>
        </Link>
    )
}
