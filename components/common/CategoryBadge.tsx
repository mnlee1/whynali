/**
 * components/common/CategoryBadge.tsx
 * 
 * [카테고리 배지 컴포넌트]
 * 
 * 이슈의 카테고리를 색상이 있는 배지로 표시합니다.
 * 카테고리별로 다른 색상을 사용하여 한눈에 구분할 수 있습니다.
 * 
 * 예시:
 *   <CategoryBadge category="연예" />
 *   <CategoryBadge category="스포츠" size="sm" />
 */

import type { IssueCategory } from '@/types/issue'

interface CategoryBadgeProps {
    category: IssueCategory
    size?: 'sm' | 'md'
}

function getCategoryStyle(category: IssueCategory): string {
    switch (category) {
        case '연예':
            return 'bg-pink-100 text-pink-700 border-pink-200'
        case '스포츠':
            return 'bg-blue-100 text-blue-700 border-blue-200'
        case '정치':
            return 'bg-purple-100 text-purple-700 border-purple-200'
        case '사회':
            return 'bg-green-100 text-green-700 border-green-200'
        case '기술':
            return 'bg-indigo-100 text-indigo-700 border-indigo-200'
        default:
            return 'bg-gray-100 text-gray-700 border-gray-200'
    }
}

export default function CategoryBadge({ category, size = 'md' }: CategoryBadgeProps) {
    const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'
    const styleClass = getCategoryStyle(category)

    return (
        <span className={`inline-flex items-center font-medium border rounded-md ${sizeClass} ${styleClass}`}>
            {category}
        </span>
    )
}
