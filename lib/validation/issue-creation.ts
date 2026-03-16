/**
 * lib/validation/issue-creation.ts
 * 
 * 이슈 생성 시 필수 필드 검증
 */

export type SourceTrack = 'track_a' | 'manual'

export interface IssueCreationData {
    title: string
    category: string
    source_track: SourceTrack
    approval_status?: string
    status?: string
    description?: string | null
}

/**
 * 이슈 생성 데이터 검증
 * 
 * source_track이 null로 생성되는 것을 방지하기 위한 필수 검증
 */
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
            error: 'source_track은 필수 필드입니다. "track_a" 또는 "manual"을 지정해야 합니다' 
        }
    }

    // 3. source_track 값 검증
    const validSourceTracks: SourceTrack[] = ['track_a', 'manual']
    if (!validSourceTracks.includes(data.source_track)) {
        return { 
            isValid: false, 
            error: `source_track은 "track_a" 또는 "manual"만 가능합니다. 현재 값: ${data.source_track}` 
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
            status: data.status ?? '점화',
            description: data.description ?? null,
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
