/**
 * types/shortform.ts
 * 
 * 숏폼 자동 생성·배포 관련 타입 정의
 */

export type ShortformTriggerType = 'issue_created' | 'status_changed'
export type ShortformApprovalStatus = 'pending' | 'approved' | 'rejected'
export type HeatGrade = '높음' | '보통' | '낮음'

export interface ShortformSourceCount {
    news: number
    community: number
}

export interface ShortformUploadStatus {
    youtube?: 'done' | 'failed'
    instagram?: 'done' | 'failed'
    tiktok?: 'done' | 'failed'
}

export interface ShortformJob {
    id: string
    issue_id: string
    issue_title: string
    issue_status: string
    heat_grade: HeatGrade
    source_count: ShortformSourceCount
    issue_url: string
    video_path: string | null
    approval_status: ShortformApprovalStatus
    upload_status: ShortformUploadStatus | null
    trigger_type: ShortformTriggerType
    created_at: string
    updated_at: string
}
