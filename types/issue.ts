export type IssueStatus = '점화' | '논란중' | '종결'
export type IssueCategory = '연예' | '스포츠' | '정치' | '사회' | '기술'
export type ApprovalStatus = '대기' | '승인' | '반려'
export type TimelineStage = '발단' | '전개' | '파생' | '진정'

export interface Issue {
    id: string
    title: string
    description: string | null
    status: IssueStatus
    category: IssueCategory
    heat_index: number | null
    approval_status: ApprovalStatus
    approved_at: string | null
    created_at: string
    updated_at: string
}

export interface TimelinePoint {
    id: string
    issue_id: string
    occurred_at: string
    source_url: string
    stage: TimelineStage
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
    written_at: string
    source_site: string
    issue_id: string | null
    created_at: string
}
