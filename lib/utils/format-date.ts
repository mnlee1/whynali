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

/**
 * 타임라인 항목의 날짜 그룹 헤더 (KST 기준, 예: "7월 19일")
 * 서버가 UTC로 도는 환경에서도 한국 시간 기준으로 정확히 표기하기 위해 timeZone을 명시한다.
 */
export function formatKstDateHeader(dateString: string): string {
    return new Date(dateString).toLocaleDateString('ko-KR', {
        timeZone: 'Asia/Seoul',
        month: 'long',
        day: 'numeric',
    })
}

/**
 * 타임라인 항목의 시각 표기 (KST 기준, 예: "14:00")
 */
export function formatKstTime(dateString: string): string {
    return new Date(dateString).toLocaleTimeString('ko-KR', {
        timeZone: 'Asia/Seoul',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    })
}

/**
 * 같은 날인지 그룹핑할 때 쓰는 KST 기준 날짜 키 (예: "2026-07-19")
 */
export function formatKstDateKey(dateString: string): string {
    return new Date(dateString).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
}

/**
 * AI가 생성한 "7월 19일 14:00" 형식 문자열을 실제 Date로 복원한다.
 * bullet에는 연도가 없으므로, 그 단계(stage)의 dateStart 등 신뢰할 수 있는
 * ISO 날짜에서 연도를 빌려온다. 파싱 실패 시 null.
 */
export function parseKoreanMonthDayTime(text: string, fallbackYearFrom: string): Date | null {
    const match = text.match(/(\d{1,2})월\s*(\d{1,2})일(?:\s+(\d{1,2}):(\d{2}))?/)
    if (!match) return null

    const fallback = new Date(fallbackYearFrom)
    const year = !isNaN(fallback.getTime())
        ? Number(fallback.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric' }))
        : new Date().getFullYear()

    const month = Number(match[1])
    const day = Number(match[2])
    const hour = match[3] ? Number(match[3]) : 0
    const minute = match[4] ? Number(match[4]) : 0

    // KST 자정 기준 시각을 UTC ISO로 구성 (Asia/Seoul = UTC+9, 서머타임 없음)
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+09:00`
    const parsed = new Date(iso)
    return isNaN(parsed.getTime()) ? null : parsed
}

/**
 * 타임라인 전용 날짜 포맷 (괄호 없이)
 * 3일 이내: "2시간 전", "1일 전"
 * 3일 초과: "2026년 3월 25일 오전 09:20"
 */
export function formatTimelineDate(dateString: string): string {
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
    
    // 3일 초과: 날짜 + 시간 표기
    return date.toLocaleString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    })
}
