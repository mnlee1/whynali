/**
 * lib/utils/reading-time.ts
 *
 * 한글 평균 독서 속도(약 500자/분) 기준 예상 읽기 시간 계산
 */

const CHARS_PER_MINUTE = 500

export function estimateReadingMinutes(charCount: number): number {
    if (charCount <= 0) return 1
    return Math.max(1, Math.round(charCount / CHARS_PER_MINUTE))
}
