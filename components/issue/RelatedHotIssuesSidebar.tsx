/**
 * components/issue/RelatedHotIssuesSidebar.tsx
 *
 * 순위형 이슈 리스트 카드(번호+제목+카테고리+썸네일). "지금 왜난리 TOP 5"(화력 상위)와
 * "댓글/반응 많은 이슈"(최근 참여도) 둘 다 이 컴포넌트를 재사용하며 title/issues만 다르게 전달.
 * 위치/노출 여부(xl+ 사이드바 vs xl 미만 댓글 하단)는 호출부(app/issue/[id]/page.tsx)에서 결정.
 */

import Link from 'next/link'
import type { IssueCategory } from '@/lib/config/categories'

interface SidebarIssue {
    id: string
    title: string
    category: IssueCategory
    thumbnail_urls?: string[] | null
    primary_thumbnail_index?: number | null
}

interface Props {
    title: string
    issues: SidebarIssue[]
}

export default function RelatedHotIssuesSidebar({ title, issues }: Props) {
    if (!issues || issues.length === 0) return null

    return (
        <div className="card overflow-hidden mb-6">
            <div className="px-4 py-3 border-b border-border-muted">
                <h2 className="text-sm font-bold text-content-primary">{title}</h2>
            </div>
            <div className="p-2">
                {issues.map((item, i) => {
                    const thumbnailUrl = item.thumbnail_urls && item.thumbnail_urls.length > 0
                        ? item.thumbnail_urls[item.primary_thumbnail_index ?? 0]
                        : undefined

                    return (
                        <Link
                            key={item.id}
                            href={`/issue/${item.id}`}
                            className="flex items-center gap-2.5 p-2 rounded-xl"
                        >
                            <span className="text-sm font-bold text-primary w-4 shrink-0 text-center">
                                {i + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-content-primary leading-snug line-clamp-1 mb-0.5">
                                    {item.title}
                                </p>
                                <span className="text-xs text-content-muted">{item.category}</span>
                            </div>
                            <div className="relative w-11 h-11 shrink-0 rounded-lg overflow-hidden bg-surface-muted border border-border-muted">
                                {thumbnailUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={thumbnailUrl} alt="" className="w-full h-full object-cover" />
                                ) : null}
                            </div>
                        </Link>
                    )
                })}
            </div>
        </div>
    )
}
