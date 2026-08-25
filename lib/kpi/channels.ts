/**
 * lib/kpi/channels.ts
 *
 * 채널별 유입 표에서 쓰는 채널 목록·순서·이름표.
 * 관리자 화면(kpi/page.tsx), 리포트 페이지(kpi/report/page.tsx), 구글 시트 내보내기(google-sheets-export.ts)가
 * 전부 여기서 가져다 쓴다 — 채널을 추가/변경할 때 한 곳만 고치면 되도록.
 */

export type ChannelKey = 'threads' | 'instagram' | 'youtube' | 'tiktok' | 'naverBlog' | 'organic' | 'other'

export const CHANNEL_ORDER: ChannelKey[] = ['youtube', 'instagram', 'threads', 'tiktok', 'naverBlog', 'organic', 'other']

export const CHANNEL_LABEL: Record<ChannelKey, string> = {
    youtube: '유튜브', instagram: '인스타', threads: '스레드', tiktok: '틱톡',
    naverBlog: '네이버블로그', organic: '검색', other: '기타(다이렉트 등)',
}
