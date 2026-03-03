/**
 * components/common/StatusBadge.tsx
 * 
 * [이슈 상태 배지 컴포넌트]
 * 
 * 이슈의 상태(점화/논란중/종결)를 아이콘+텍스트 태그 형태로 표시합니다.
 * 01_AI기획.md §12 기준: 텍스트 우선, 아이콘 병기
 * 
 * 사용 예시:
 *   <StatusBadge status="점화" />
 *   <StatusBadge status="논란중" size="lg" />
 */

import type { IssueStatus } from '@/types/issue'

interface StatusBadgeProps {
    status: IssueStatus
    size?: 'sm' | 'md' | 'lg'
}

// 상태별 아이콘, 색상, 라벨
function getStatusMeta(status: IssueStatus): { 
    icon: string
    label: string
    baseClass: string
} {
    switch (status) {
        case '점화':
            return {
                icon: '🔥',
                label: '점화',
                baseClass: 'bg-red-50 text-red-600 border-red-200'
            }
        case '논란중':
            return {
                icon: '⚡',
                label: '논란중',
                baseClass: 'bg-orange-50 text-orange-600 border-orange-200'
            }
        case '종결':
            return {
                icon: '🏁',
                label: '종결',
                baseClass: 'bg-gray-50 text-gray-500 border-gray-200'
            }
        default:
            return {
                icon: '○',
                label: status,
                baseClass: 'bg-gray-50 text-gray-500 border-gray-200'
            }
    }
}

// 크기별 클래스
function getSizeClass(size: 'sm' | 'md' | 'lg'): { 
    containerClass: string
    iconClass: string
    textClass: string
} {
    switch (size) {
        case 'sm':
            return {
                containerClass: 'px-2 py-0.5 gap-1',
                iconClass: 'text-xs',
                textClass: 'text-xs'
            }
        case 'lg':
            return {
                containerClass: 'px-3 py-1.5 gap-1.5',
                iconClass: 'text-lg',
                textClass: 'text-base'
            }
        case 'md':
        default:
            return {
                containerClass: 'px-2.5 py-1 gap-1',
                iconClass: 'text-sm',
                textClass: 'text-sm'
            }
    }
}

export default function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
    const meta = getStatusMeta(status)
    const sizeClass = getSizeClass(size)

    return (
        <span className={`
            inline-flex items-center rounded border font-medium
            ${meta.baseClass}
            ${sizeClass.containerClass}
        `}>
            <span className={sizeClass.iconClass}>{meta.icon}</span>
            <span className={sizeClass.textClass}>{meta.label}</span>
        </span>
    )
}
