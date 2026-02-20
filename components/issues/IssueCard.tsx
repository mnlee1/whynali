/**
 * components/issues/IssueCard.tsx
 * 
 * [이슈 목록 카드 컴포넌트]
 * 
 * 이슈 목록 화면(홈, 연예, 스포츠 등)에서 한 줄씩 보여줄 카드입니다.
 * 제목, 카테고리, 상태, 화력, 날짜를 표시하고, 클릭하면 이슈 상세 페이지로 이동합니다.
 * 
 * 사용 예시:
 *   <IssueCard issue={issueData} />
 */

import Link from 'next/link'
import type { Issue } from '@/types/issue'

interface IssueCardProps {
    issue: Issue    // 이슈 데이터 (id, title, status, category, heat_index 등)
}

export default function IssueCard({ issue }: IssueCardProps) {
    // 화력 등급 계산 (02_AI기획_판단포인트 기준: 70 이상 높음, 30 이상 보통, 30 미만 낮음)
    const getHeatLevel = (heat: number | null): string => {
        if (!heat) return '낮음'
        if (heat >= 70) return '높음'
        if (heat >= 30) return '보통'
        return '낮음'
    }

    // 상태별 색상 (점화/논란중/종결)
    const getStatusColor = (status: string): string => {
        switch (status) {
            case '점화':
                return 'text-red-600 bg-red-50'
            case '논란중':
                return 'text-orange-600 bg-orange-50'
            case '종결':
                return 'text-gray-600 bg-gray-50'
            default:
                return 'text-gray-600 bg-gray-50'
        }
    }

    // 날짜 포맷 (예: 2시간 전, 3일 전)
    const formatDate = (dateString: string): string => {
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

    const heatLevel = getHeatLevel(issue.heat_index)
    const statusColor = getStatusColor(issue.status)

    return (
        <Link href={`/issue/${issue.id}`}>
            <div className="block p-4 border rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors">
                {/* 상단: 카테고리, 상태 */}
                <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-gray-500">{issue.category}</span>
                    <span className={`text-xs px-2 py-1 rounded ${statusColor}`}>
                        {issue.status}
                    </span>
                </div>

                {/* 제목 */}
                <h3 className="text-base md:text-lg font-semibold mb-2 line-clamp-2">
                    {issue.title}
                </h3>

                {/* 설명 (있으면) */}
                {issue.description && (
                    <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                        {issue.description}
                    </p>
                )}

                {/* 하단: 화력, 날짜 */}
                <div className="flex items-center justify-between text-xs text-gray-500">
                    <div className="flex items-center gap-2">
                        <span>
                            화력: {issue.heat_index ?? 0} ({heatLevel})
                        </span>
                    </div>
                    <span>{formatDate(issue.created_at)}</span>
                </div>
            </div>
        </Link>
    )
}
