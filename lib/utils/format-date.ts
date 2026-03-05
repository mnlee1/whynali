/**
 * lib/utils/format-date.ts
 * 
 * [날짜 포맷 유틸리티]
 * 
 * 상대적 시간 표기 (3일 이내) 또는 절대적 날짜 표기 (3일 초과)
 * 
 * 사용 예시:
 *   formatDate(issue.created_at) // "2시간 전" 또는 "2026년 3월 4일"
 *   formatDateWithTime(issue.created_at) // "2026년 3월 4일 14:30"
 *   formatFullDate(issue.created_at) // "2026년 3월 4일"
 */

export function formatDate(dateString: string): string {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    // 3일 이내: 상대 시간 표기
    if (diffMins < 1) return '방금 전'
    if (diffMins < 60) return `${diffMins}분 전`
    if (diffHours < 24) return `${diffHours}시간 전`
    if (diffDays <= 3) return `${diffDays}일 전`
    
    // 3일 초과: 날짜 표기 (년월일 형식)
    return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
}

/**
 * 날짜와 시간을 함께 표기 (타임라인용 - 실시간성 강조)
 * 최근: "2시간 전 (14:30)" 형식
 * 오래된 것: "2026년 3월 4일 14:30" 형식
 */
export function formatDateWithTime(dateString: string): string {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    const timeStr = date.toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    })

    // 24시간 이내: 상대 시간 + 정확한 시각
    if (diffMins < 1) return `방금 전 (${timeStr})`
    if (diffMins < 60) return `${diffMins}분 전 (${timeStr})`
    if (diffHours < 24) return `${diffHours}시간 전 (${timeStr})`
    
    // 3일 이내: 상대 날짜 + 시각
    if (diffDays <= 3) {
        const dateStr = date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
        return `${dateStr} ${timeStr}`
    }

    // 3일 초과: 전체 날짜 + 시각
    return date.toLocaleString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })
}

/**
 * 날짜만 표기 (상대 시간 없이)
 * 예: "2026년 3월 4일"
 */
export function formatFullDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    })
}
