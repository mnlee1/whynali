/**
 * lib/kpi/kst-date.ts
 *
 * KPI 집계용 KST(Asia/Seoul) 날짜 경계 유틸
 *
 * Vercel 등 UTC 서버에서도 "오늘/이번 주/이번 달"을 한국 시간 기준으로 계산한다.
 */

const KST = 'Asia/Seoul'
const KST_OFFSET_MS = 9 * 60 * 60 * 1000

const WEEKDAY: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
}

type KSTParts = {
    year: number
    month: number
    day: number
    dayOfWeek: number
}

/** KST 기준 연·월·일·요일 */
export function getKSTParts(date = new Date()): KSTParts {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: KST,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        weekday: 'short',
    }).formatToParts(date)

    const map = Object.fromEntries(
        parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value])
    )

    return {
        year: Number(map.year),
        month: Number(map.month),
        day: Number(map.day),
        dayOfWeek: WEEKDAY[map.weekday] ?? 0,
    }
}

/** KST Y-M-D 00:00:00에 해당하는 UTC Date */
export function kstMidnightUtc(year: number, month: number, day: number): Date {
    return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) - KST_OFFSET_MS)
}

/** KST 오늘 00:00 */
export function getKSTTodayStart(now = new Date()): Date {
    const { year, month, day } = getKSTParts(now)
    return kstMidnightUtc(year, month, day)
}

/** KST 이번 달 1일 00:00 */
export function getKSTMonthStart(now = new Date()): Date {
    const { year, month } = getKSTParts(now)
    return kstMidnightUtc(year, month, 1)
}

/** KST 지난달 1일 00:00 */
export function getKSTLastMonthStart(now = new Date()): Date {
    const { year, month } = getKSTParts(now)
    if (month === 1) return kstMidnightUtc(year - 1, 12, 1)
    return kstMidnightUtc(year, month - 1, 1)
}

/** KST 이번 주 일요일 00:00 */
export function getKSTWeekStart(now = new Date()): Date {
    const todayStart = getKSTTodayStart(now)
    const { dayOfWeek } = getKSTParts(now)
    return new Date(todayStart.getTime() - dayOfWeek * 86400000)
}

/** KST 기준 N일 전 00:00 */
export function getKSTDaysAgoStart(days: number, now = new Date()): Date {
    const todayStart = getKSTTodayStart(now)
    return new Date(todayStart.getTime() - days * 86400000)
}

/** KST 기준 두 시각 사이 일(day) 차이 (start 기준 0 = 같은 날) */
export function getKSTDayOffset(from: Date, now = new Date()): number {
    const diffMs = getKSTTodayStart(now).getTime() - getKSTTodayStart(from).getTime()
    return Math.round(diffMs / 86400000)
}

/** KST 기준 현재 연·월 (목표 조회 기본값용) */
export function getKSTYearMonth(now = new Date()): { year: number; month: number } {
    const { year, month } = getKSTParts(now)
    return { year, month }
}
