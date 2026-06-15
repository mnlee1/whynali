/**
 * lib/validation/issue-creation.ts
 * 
 * 이슈 생성 시 필수 필드 검증
 * 
 * 수정 이력:
 * - 2026-03-16: 수동 생성 기능 제거, track_a만 허용
 */

export type SourceTrack = 'track_a' | 'manual'

export interface IssueCreationData {
    title: string
    category: string
    source_track: SourceTrack
    approval_status?: string
    approval_type?: string | null
    status?: string
    topic?: string | null
    topic_description?: string | null
}

const VALID_SOURCE_TRACKS: SourceTrack[] = ['track_a', 'manual']

export function validateIssueCreation(data: Partial<IssueCreationData>): {
    isValid: boolean
    error?: string
    validated?: IssueCreationData
} {
    // 1. 필수 필드 검증
    if (!data.title || typeof data.title !== 'string' || !data.title.trim()) {
        return { isValid: false, error: 'title은 필수 필드입니다' }
    }

    if (!data.category || typeof data.category !== 'string') {
        return { isValid: false, error: 'category는 필수 필드입니다' }
    }

    // 2. source_track 필수 검증 (null 방지)
    if (!data.source_track) {
        return {
            isValid: false,
            error: `source_track은 필수 필드입니다. 허용값: ${VALID_SOURCE_TRACKS.join(', ')}`
        }
    }

    // 3. source_track 값 검증
    if (!VALID_SOURCE_TRACKS.includes(data.source_track)) {
        return {
            isValid: false,
            error: `source_track 허용값: ${VALID_SOURCE_TRACKS.join(', ')}. 현재 값: ${data.source_track}`
        }
    }

    // 4. 검증된 데이터 반환
    return {
        isValid: true,
        validated: {
            title: data.title.trim(),
            category: data.category,
            source_track: data.source_track,
            approval_status: data.approval_status ?? '대기',
            approval_type: data.approval_type ?? null,
            status: data.status ?? '점화',
            topic: data.topic ?? null,
            topic_description: data.topic_description ?? null,
        }
    }
}

/**
 * 트랙A 이슈 생성 데이터 검증
 * 
 * 트랙A 이슈는 커뮤니티 글이 필수
 */
export function validateTrackAIssue(communityCount: number): {
    isValid: boolean
    error?: string
} {
    if (communityCount === 0) {
        return {
            isValid: false,
            error: '트랙A 이슈는 커뮤니티 글이 1개 이상 연결되어야 합니다'
        }
    }

    return { isValid: true }
}
