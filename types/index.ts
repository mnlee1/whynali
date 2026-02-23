// 이슈
export interface Issue {
    id: string
    title: string
    description?: string
    status: '점화' | '논란중' | '종결'
    category: '연예' | '스포츠' | '정치' | '사회' | '기술'
    heat_index?: number
    approval_status: '대기' | '승인' | '반려'
    approved_at?: string
    created_at: string
    updated_at: string
}

// 타임라인 포인트
export interface TimelinePoint {
    id: string
    issue_id: string
    occurred_at: string
    source_url?: string
    stage: '발단' | '전개' | '파생' | '진정'
    created_at: string
}

// 댓글
export interface Comment {
    id: string
    issue_id?: string
    discussion_topic_id?: string
    user_id: string
    body: string
    like_count: number
    dislike_count: number
    visibility: 'public' | 'pending_review' | 'deleted'
    parent_id?: string
    created_at: string
    updated_at: string
}

// 투표
export interface Vote {
    id: string
    issue_id: string
    title?: string
    phase?: string
    created_at: string
}

// 투표 선택지
export interface VoteChoice {
    id: string
    vote_id: string
    label: string
    count: number
}

// 토론 주제
export interface DiscussionTopic {
    id: string
    issue_id: string
    body: string
    is_ai_generated: boolean
    approval_status: '대기' | '승인' | '반려' | '종료'
    approved_at?: string
    created_at: string
}

// 감정 표현
export type ReactionType = '좋아요' | '싫어요' | '화나요' | '팝콘각' | '응원' | '애도' | '사이다'

export interface Reaction {
    id: string
    issue_id: string
    user_id: string
    type: ReactionType
    created_at: string
}
