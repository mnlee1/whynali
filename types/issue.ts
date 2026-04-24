import type { IssueCategory } from '@/lib/config/categories'

export type IssueStatus = '점화' | '논란중' | '종결'
export type { IssueCategory }
export type ApprovalStatus = '대기' | '승인' | '반려' | '병합됨'
export type ApprovalType = 'auto' | 'manual'
export type TimelineStage = '발단' | '전개' | '파생' | '진정'

export interface Issue {
    id: string
    title: string
    status: IssueStatus
    category: IssueCategory
    heat_index: number | null
    heat_index_1h_ago?: number | null
    heat_updated_at?: string | null
    created_heat_index: number | null
    approval_status: ApprovalStatus
    approval_type: ApprovalType | null
    approval_heat_index: number | null
    approved_at: string | null
    merged_into_id: string | null
    visibility_status?: 'visible' | 'hidden'
    created_at: string
    updated_at: string
    is_urgent?: boolean
    burst_level?: number
    source_track?: 'track_a' // 트랙 A 프로세스로만 생성 (2026-03-16: manual 제거)
    thumbnail_urls?: string[] | null // Pixabay 이미지 URL 배열 최대 3개 (없으면 그라디언트 배경 사용)
    primary_thumbnail_index?: number | null // 대표 이미지 인덱스 (thumbnail_urls 배열 내 위치, 기본값 0)
    topic?: string | null // 이슈 주제 (메인 목록용)
    topic_description?: string | null // 이슈 주제 설명 2~3줄 (메인 목록용)
    brief_summary?: { intro: string; bullets: string[]; conclusion: string } | null
}

export interface TimelinePoint {
    id: string
    issue_id: string
    occurred_at: string
    source_url: string | null // null 허용 (컴포넌트에서 null 체크 필요)
    stage: TimelineStage
    title?: string | null  // 이벤트 한 줄 요약
    ai_summary?: string | null  // AI가 생성한 유저 노출용 요약 (bullet 소스)
    created_at: string
}

export interface NewsData {
    id: string
    title: string
    link: string
    source: string
    published_at: string
    issue_id: string | null
    created_at: string
}

export interface CommunityData {
    id: string
    title: string
    url: string
    view_count: number
    comment_count: number
    written_at: string | null
    source_site: string
    issue_id: string | null
    created_at: string
}
