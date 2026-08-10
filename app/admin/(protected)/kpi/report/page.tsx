/**
 * app/admin/(protected)/kpi/report/page.tsx
 *
 * 주간/월간 KPI 리포트를 인쇄/PDF 친화적인 HTML로 보여주는 페이지.
 * 관리자 화면(app/admin/(protected)/kpi/page.tsx)과 같은 계산 결과(/api/admin/kpi)를 쓰고,
 * 유튜브·인스타 조회수·구독자수는 API로 자동 조회하고, 틱톡은 권한 부족으로 직접 입력해서 기록으로 남긴다.
 */

'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { CHANNEL_ORDER, CHANNEL_LABEL, type ChannelKey } from '@/lib/kpi/channels'
import { StatCard, DeltaBadge, formatDelta, type DeltaStat } from '../shared'

type ReportKind = 'weekly' | 'monthly'
type Platform = 'instagram' | 'youtube' | 'tiktok'

interface ChannelStat {
    visitors: number
    signups: number
    signupRate: number
    comments: number
    commentRate: number
    reactions: number
    reactionRate: number
    votes: number
    voteRate: number
    discussionComments: number
    discussionCommentRate: number
}

interface KPIMetrics {
    currentUsers: number
    internalUsersCount: number
    todayUniqueVisitors: number
    weeklyUniqueVisitors: number
    monthlyUniqueVisitors: number
    todayPageViews: number
    weeklyPageViews: number
    monthlyPageViews: number
    commentParticipation: number
    issueCommentParticipation: number
    discussionCommentParticipation: number
    reactionParticipation: number
    voteParticipation: number
    periodStats: Record<'d1' | 'd7' | 'd30', {
        newUsers: number; comments: number; issueComments: number; discussionComments: number
        reactions: number; votes: number; issues: number; shortforms: number; cardNews: number
    }>
    periodComparison: Record<'d1' | 'd7' | 'd30', {
        newUsers: DeltaStat; issueComments: DeltaStat; discussionComments: DeltaStat
        reactions: DeltaStat; votes: DeltaStat; issues: DeltaStat; shortforms: DeltaStat
        cardNews: DeltaStat; uniqueVisitors: DeltaStat
    }>
    channelInboundByPeriod: Record<'d1' | 'd7' | 'd30', Record<ChannelKey, ChannelStat>>
    previousChannelInboundByPeriod: Record<'d1' | 'd7' | 'd30', Record<ChannelKey, ChannelStat>>
    channelVisitorComparison: Record<'d1' | 'd7' | 'd30', Record<ChannelKey, DeltaStat>>
    weekOverWeek: {
        current: {
            newUsers: number; comments: number; issueComments: number; discussionComments: number
            reactions: number; votes: number; issues: number; shortforms: number; cardNews: number
        }
        uniqueVisitors: number
        pageViews: number
        comparison: {
            newUsers: DeltaStat; issueComments: DeltaStat; discussionComments: DeltaStat
            reactions: DeltaStat; votes: DeltaStat; issues: DeltaStat; shortforms: DeltaStat
            cardNews: DeltaStat; uniqueVisitors: DeltaStat
        }
        channelBreakdown: Record<ChannelKey, ChannelStat>
        previousChannelBreakdown: Record<ChannelKey, ChannelStat>
        channelVisitorComparison: Record<ChannelKey, DeltaStat>
        periodStart: string
        periodEnd: string
    }
    targets: {
        users: number; comments: number; reactions: number; votes: number; pageviews: number
        commentParticipation: number; reactionParticipation: number; voteParticipation: number
        dailyNewUsers: number; dailyComments: number; dailyReactions: number
        dailyIssues: number; dailyShortformsPerPlatform: number
    }
}

interface ChannelPromoStat {
    platform: Platform
    views: number | null
    new_subscribers: number | null
    total_subscribers: number | null
    total_views: number | null
    likes: number | null
    comments: number | null
}

const PLATFORM_LABEL: Record<Platform, string> = { instagram: '인스타그램', youtube: '유튜브', tiktok: '틱톡' }

// HTML로 저장했을 때 외부 스타일 없이도 항상 똑같이 보이도록, Tailwind에 기대지 않는 순수 CSS로 작성
const REPORT_CSS = `
* { box-sizing: border-box; }
body { margin:0; padding:24px; background:#fafafa; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Malgun Gothic",sans-serif; color:#18181b; }
.report { max-width:1180px; margin:0 auto; display:flex; flex-direction:column; gap:24px; }
.card { background:#fff; border:1px solid #e4e4e7; border-radius:12px; padding:20px; box-shadow:0 1px 3px 0 rgba(0,0,0,0.06), 0 1px 2px -1px rgba(0,0,0,0.04); }
.card.p4 { padding:16px; }
.title-card { background:#eff6ff; border:1px solid #bfdbfe; border-radius:12px; padding:20px; box-shadow:0 1px 3px 0 rgba(0,0,0,0.06), 0 1px 2px -1px rgba(0,0,0,0.04); }
.title-main { font-size:18px; font-weight:700; color:#1e3a8a; margin:0; }
.title-sub { font-size:14px; color:#1d4ed8; margin:4px 0 0; }
.section-title { font-size:16px; font-weight:600; margin:0 0 16px; color:#18181b; }
.section-desc { font-size:14px; color:#71717a; margin:0 0 16px; }
.muted { color:#64748b; }
.faint { color:#a1a1aa; }
.up { color:#059669; font-weight:600; }
.down { color:#ef4444; font-weight:600; }
.neutral { color:#94a3b8; }
.delta { font-size:12px; margin-left:8px; }
.info { color:#2563eb; }
.signup-row { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
.signup-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; flex:1; min-width:280px; }
.signup-box { padding:6px 12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; text-align:center; }
.signup-box.blue { background:#eff6ff; border-color:#bfdbfe; }
.signup-box p.muted { margin:0; font-size:12px; }
.signup-box.blue p.muted { color:#2563eb; }
.signup-value { font-size:20px; font-weight:700; margin:0; color:#0f172a; }
.signup-box.blue .signup-value { color:#1e3a8a; }
.signup-value.dim { color:#475569; }
.stat-grid { display:grid; gap:16px; }
.stat-grid.cols-3 { grid-template-columns:repeat(3,1fr); }
.stat-grid.cols-4 { grid-template-columns:repeat(4,1fr); }
.stat-card { padding:16px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; }
.stat-card-top { display:flex; align-items:flex-start; justify-content:space-between; gap:8px; margin-bottom:8px; }
.stat-label { font-size:14px; font-weight:500; color:#334155; margin:0; }
.rate-badge { font-size:12px; font-weight:600; color:#1d4ed8; white-space:nowrap; }
.stat-card-bottom { display:flex; align-items:baseline; justify-content:space-between; gap:8px; }
.stat-note { font-size:14px; color:#475569; }
.stat-value { font-size:20px; font-weight:700; color:#0f172a; white-space:nowrap; }
.channel-block { margin-top:20px; padding-top:20px; border-top:1px solid #f1f1f3; }
.channel-table { width:100%; border-collapse:collapse; font-size:14px; }
.channel-table th { text-align:right; font-size:12px; font-weight:500; color:#71717a; padding:8px; border-bottom:1px solid #e4e4e7; }
.channel-table th.left, .channel-table td.ch-name { text-align:left; }
.channel-table td { padding:8px; border-bottom:1px solid #f1f1f3; text-align:right; }
.channel-table td.ch-name { font-weight:500; color:#18181b; }
.channel-table tr.alt { background:#f8fafc; }
.table-footnote { font-size:12px; color:#a1a1aa; margin-top:8px; }
.promo-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; }
.promo-card { padding:16px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; }
.promo-title { font-size:14px; font-weight:600; color:#334155; margin:0 0 12px; }
.promo-row { font-size:13px; margin:6px 0; display:flex; justify-content:space-between; gap:8px; }
.footer-note { font-size:12px; color:#a1a1aa; text-align:center; }
@media (max-width:720px) {
  .stat-grid.cols-3, .stat-grid.cols-4, .signup-grid, .promo-grid { grid-template-columns:1fr; }
}
`

const isWeekday = (d: Date) => d.getDay() !== 0 && d.getDay() !== 6
function countWeekdaysInMonth(year: number, month: number): number {
    const daysInMonth = new Date(year, month, 0).getDate()
    let count = 0
    for (let day = 1; day <= daysInMonth; day++) {
        if (isWeekday(new Date(year, month - 1, day))) count++
    }
    return count
}
function fmtDate(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const DOW_LABEL = ['일', '월', '화', '수', '목', '금', '토']
function fmtDateWithDow(d: Date) {
    return `${fmtDate(d)}(${DOW_LABEL[d.getDay()]})`
}
function weekOfMonth(d: Date) {
    const firstDayWeekday = new Date(d.getFullYear(), d.getMonth(), 1).getDay()
    return Math.ceil((d.getDate() + firstDayWeekday) / 7)
}
function reportFileLabel(kind: ReportKind, periodStart: Date) {
    const yy = String(periodStart.getFullYear()).slice(2)
    const mm = periodStart.getMonth() + 1
    if (kind === 'weekly') return `${yy}년${mm}월${weekOfMonth(periodStart)}주차`
    return `${yy}년${mm}월`
}
function reportSubtitle(kind: ReportKind, periodStart: Date, periodEnd: Date, previousPeriodStart: Date) {
    if (kind === 'weekly') {
        const curWeek = weekOfMonth(periodStart)
        const prevWeek = curWeek - 1
        const prevLabel = prevWeek >= 1 ? `${prevWeek}주차` : `${previousPeriodStart.getMonth() + 1}월 ${weekOfMonth(previousPeriodStart)}주차`
        return `${periodStart.getMonth() + 1}월 ${curWeek}주차(${fmtDateWithDow(periodStart)} ~ ${fmtDateWithDow(periodEnd)})와 전주(${prevLabel})와 지표 비교 리포트`
    }
    return `${periodStart.getFullYear()}년 ${periodStart.getMonth() + 1}월(${fmtDate(periodStart)} ~ ${fmtDate(periodEnd)}) 전월과 지표 비교 리포트`
}


const emptyPromo = { views: '', totalSubscribers: '', totalViewsRaw: null as number | null, likes: '', comments: '' }
type PromoEntry = typeof emptyPromo

export default function KPIReportPage() {
    const [kind, setKind] = useState<ReportKind>('weekly')
    const [metrics, setMetrics] = useState<KPIMetrics | null>(null)
    const [loading, setLoading] = useState(true)
    const [promoStats, setPromoStats] = useState<Record<Platform, PromoEntry>>({
        instagram: { ...emptyPromo }, youtube: { ...emptyPromo }, tiktok: { ...emptyPromo },
    })
    const [previousTotals, setPreviousTotals] = useState<Record<Platform, { subscribers: number | null; views: number | null }>>({
        instagram: { subscribers: null, views: null }, youtube: { subscribers: null, views: null }, tiktok: { subscribers: null, views: null },
    })
    const [promoLoading, setPromoLoading] = useState(true)
    const [liveError, setLiveError] = useState<{ youtube: string | null; instagram: string | null }>({ youtube: null, instagram: null })
    const [saving, setSaving] = useState(false)
    const [savedAt, setSavedAt] = useState<string | null>(null)

    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1

    // 주간 리포트는 "완전히 끝난 지난 한 주(일~토)"를 기준으로 삼는다.
    // (매주 월요일에 열어봤을 때 "이번 주"는 하루치 데이터만 있어 의미가 없기 때문)
    // periodStart/periodEnd/previousPeriodStart는 useMemo로 감싸서 kind/year/month가 그대로면
    // 매 렌더마다 새 Date 객체를 만들지 않게 함 — 아래 refreshPromoSection의 useCallback 의존성으로
    // 쓰이는데, 매번 새 객체가 들어가면 콜백이 계속 새로 만들어지고 useEffect가 무한 재실행됨.
    const { periodStart, periodEnd, previousPeriodStart } = useMemo(() => {
        const periodStart = kind === 'weekly'
            ? (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay() - 7); return d })()
            : new Date(year, month - 1, 1)
        const periodEnd = kind === 'weekly'
            ? (() => { const d = new Date(periodStart); d.setDate(periodStart.getDate() + 6); return d })()
            : new Date(year, month, 0)
        const previousPeriodStart = kind === 'weekly'
            ? (() => { const d = new Date(periodStart); d.setDate(periodStart.getDate() - 7); return d })()
            : new Date(year, month - 2, 1)
        return { periodStart, periodEnd, previousPeriodStart }
    }, [kind, year, month])
    const cmpLabel = kind === 'weekly' ? '전주대비' : '전월대비'
    const weekdayCount = kind === 'weekly' ? 5 : countWeekdaysInMonth(year, month)
    const periodDaysForTarget = kind === 'weekly' ? 7 : 30

    const loadKPI = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/admin/kpi?year=${year}&month=${month}`)
            const json = await res.json()
            setMetrics(json.metrics)
        } finally {
            setLoading(false)
        }
    }, [year, month])

    const periodStartStr = fmtDate(periodStart)
    const previousPeriodStartStr = fmtDate(previousPeriodStart)

    // 저장된 값(이번 기간 + 저번 기간)을 불러오고, 유튜브·인스타는 아직 저장 안 된 경우(또는 강제 새로고침 시)
    // 실시간 API 값으로 입력칸을 채워준다. 틱톡은 권한 부족으로 계속 수동 입력.
    const refreshPromoSection = useCallback(async (overwrite: boolean) => {
        setPromoLoading(true)
        try {
            const untilDate = new Date(periodEnd)
            untilDate.setDate(untilDate.getDate() + 1)

            // 저장값 조회(현재·이전 기간)와 실시간 API 조회는 서로 기다릴 필요가 없어 한 번에 시작한다
            const [curJson, prevJson, liveJson] = await Promise.all([
                fetch(`/api/admin/channel-promo-stats?periodType=${kind}&periodStart=${periodStartStr}`).then(r => r.json()),
                fetch(`/api/admin/channel-promo-stats?periodType=${kind}&periodStart=${previousPeriodStartStr}`).then(r => r.json()),
                fetch(`/api/admin/channel-promo-stats/fetch?since=${periodStart.toISOString()}&until=${untilDate.toISOString()}`).then(r => r.json()),
            ])

            const cur: Record<Platform, PromoEntry> = {
                instagram: { ...emptyPromo }, youtube: { ...emptyPromo }, tiktok: { ...emptyPromo },
            }
            if (curJson.success) {
                for (const row of (curJson.data as ChannelPromoStat[])) {
                    cur[row.platform] = {
                        views: row.views?.toString() ?? '',
                        totalSubscribers: row.total_subscribers?.toString() ?? '',
                        totalViewsRaw: row.total_views ?? null,
                        likes: row.likes?.toString() ?? '',
                        comments: row.comments?.toString() ?? '',
                    }
                }
            }

            const prev: Record<Platform, { subscribers: number | null; views: number | null }> = {
                instagram: { subscribers: null, views: null }, youtube: { subscribers: null, views: null }, tiktok: { subscribers: null, views: null },
            }
            if (prevJson.success) {
                for (const row of (prevJson.data as ChannelPromoStat[])) {
                    prev[row.platform] = { subscribers: row.total_subscribers, views: row.total_views }
                }
            }
            setPreviousTotals(prev)

            if (liveJson.youtube && (overwrite || cur.youtube.totalSubscribers === '')) {
                const prevViews = prev.youtube.views
                const periodViews = prevViews !== null ? liveJson.youtube.totalViews - prevViews : null
                cur.youtube = {
                    views: periodViews !== null ? String(periodViews) : cur.youtube.views,
                    totalSubscribers: String(liveJson.youtube.subscribers),
                    totalViewsRaw: liveJson.youtube.totalViews,
                    likes: liveJson.youtube.periodLikes !== null ? String(liveJson.youtube.periodLikes) : cur.youtube.likes,
                    comments: liveJson.youtube.periodComments !== null ? String(liveJson.youtube.periodComments) : cur.youtube.comments,
                }
            }
            if (liveJson.instagram && (overwrite || cur.instagram.totalSubscribers === '')) {
                cur.instagram = {
                    views: liveJson.instagram.periodViews !== null ? String(liveJson.instagram.periodViews) : cur.instagram.views,
                    totalSubscribers: String(liveJson.instagram.followers),
                    totalViewsRaw: null,
                    likes: liveJson.instagram.periodLikes !== null ? String(liveJson.instagram.periodLikes) : cur.instagram.likes,
                    comments: liveJson.instagram.periodComments !== null ? String(liveJson.instagram.periodComments) : cur.instagram.comments,
                }
            }
            setLiveError({
                youtube: liveJson.youtube ? null : (liveJson.youtubeError || '실시간 조회 실패'),
                instagram: liveJson.instagram ? null : (liveJson.instagramError || '실시간 조회 실패'),
            })

            setPromoStats(cur)
        } finally {
            setPromoLoading(false)
        }
    }, [kind, periodStartStr, previousPeriodStartStr, periodStart, periodEnd])

    useEffect(() => { loadKPI() }, [loadKPI])
    useEffect(() => { refreshPromoSection(false) }, [refreshPromoSection])

    const postPromoStat = async (platform: Platform) => {
        const v = promoStats[platform]
        const prevTotal = previousTotals[platform].subscribers
        const curTotal = v.totalSubscribers === '' ? null : Number(v.totalSubscribers)
        const newSubscribers = (curTotal !== null && prevTotal !== null) ? curTotal - prevTotal : null
        const res = await fetch('/api/admin/channel-promo-stats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                periodType: kind,
                periodStart: periodStartStr,
                periodEnd: fmtDate(periodEnd),
                platform,
                views: v.views,
                newSubscribers,
                totalSubscribers: v.totalSubscribers,
                totalViews: v.totalViewsRaw,
                likes: v.likes,
                comments: v.comments,
            }),
        })
        const json = await res.json()
        if (!json.success) throw new Error(json.error || '저장 실패')
    }

    const saveAllPromoStats = async () => {
        setSaving(true)
        setSavedAt(null)
        try {
            await Promise.all((['instagram', 'youtube', 'tiktok'] as Platform[]).map(postPromoStat))
            setSavedAt(new Date().toLocaleTimeString('ko-KR'))
        } catch (e) {
            alert(`저장 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}`)
        } finally {
            setSaving(false)
        }
    }

    if (loading || !metrics) {
        return <div className="p-8 text-center text-content-muted">불러오는 중...</div>
    }

    // 주간 리포트는 "지난주 전체 vs 그 전주 전체"(weekOverWeek), 월간 리포트는 "이번 달 vs 저번 달"(d30)를 씀
    const ps = kind === 'weekly' ? metrics.weekOverWeek.current : metrics.periodStats.d30
    const cmp = kind === 'weekly' ? metrics.weekOverWeek.comparison : metrics.periodComparison.d30
    const t = metrics.targets
    const uniqueVisitors = kind === 'weekly' ? metrics.weekOverWeek.uniqueVisitors : metrics.monthlyUniqueVisitors
    const pageViews = kind === 'weekly' ? metrics.weekOverWeek.pageViews : metrics.monthlyPageViews

    const issueTarget = t.dailyIssues * periodDaysForTarget
    const shortformTarget = t.dailyShortformsPerPlatform * weekdayCount
    const cardNewsTarget = weekdayCount
    const userTarget = t.dailyNewUsers * periodDaysForTarget
    const commentTarget = t.dailyComments * periodDaysForTarget
    const reactionTarget = t.dailyReactions * periodDaysForTarget
    const voteTarget = Math.round(t.votes / 30 * periodDaysForTarget)
    const pvTarget = Math.round(t.pageviews / 30 * periodDaysForTarget)

    const cb = kind === 'weekly' ? metrics.weekOverWeek.channelBreakdown : metrics.channelInboundByPeriod.d30
    const prevCb = kind === 'weekly' ? metrics.weekOverWeek.previousChannelBreakdown : metrics.previousChannelInboundByPeriod.d30
    const cvc = kind === 'weekly' ? metrics.weekOverWeek.channelVisitorComparison : metrics.channelVisitorComparison.d30
    const totalVisitorsThisPeriod = CHANNEL_ORDER.reduce((s, k) => s + cb[k].visitors, 0)

    const RateWithDelta = ({ current, previous, hasCur, hasPrev }: {
        current: number; previous: number; hasCur: boolean; hasPrev: boolean
    }) => {
        if (!hasCur) return <span className="text-content-muted">-</span>
        if (!hasPrev) return <span>{current.toFixed(1)}%</span>
        const diff = current - previous
        if (Math.abs(diff) < 0.05) return <span>{current.toFixed(1)}% <span className="text-slate-400">(–)</span></span>
        const up = diff > 0
        return (
            <span>
                {current.toFixed(1)}%{' '}
                <span className={up ? 'text-emerald-600' : 'text-red-500'}>
                    ({up ? '▲' : '▼'}{Math.abs(diff).toFixed(1)}%p)
                </span>
            </span>
        )
    }

    const deltaHtml = (d?: DeltaStat) => {
        const f = formatDelta(d)
        if (!f) return ''
        return ` <span class="delta ${f.tone}">${f.text}</span>`
    }

    const rateHtml = (current: number, previous: number, hasCur: boolean, hasPrev: boolean) => {
        if (!hasCur) return `<span class="faint">-</span>`
        if (!hasPrev) return `${current.toFixed(1)}%`
        const diff = current - previous
        if (Math.abs(diff) < 0.05) return `${current.toFixed(1)}% <span class="neutral">(–)</span>`
        const up = diff > 0
        return `${current.toFixed(1)}% <span class="${up ? 'up' : 'down'}">(${up ? '▲' : '▼'}${Math.abs(diff).toFixed(1)}%p)</span>`
    }

    const cardHtml = (opts: {
        label: string; caption?: string; current: number; unit: string; note?: string
        delta?: DeltaStat; rateLabel?: string; rateValue?: string
    }) => `
        <div class="stat-card">
            <div class="stat-card-top">
                <p class="stat-label">${opts.label}${opts.caption ? ` <span class="muted">· ${opts.caption}</span>` : ''}</p>
                ${opts.rateLabel ? `<span class="rate-badge">${opts.rateLabel} ${opts.rateValue}</span>` : ''}
            </div>
            <div class="stat-card-bottom">
                <span class="stat-note">${opts.note ?? ''}</span>
                <span class="stat-value">${opts.current.toLocaleString()}${opts.unit}${deltaHtml(opts.delta)}</span>
            </div>
        </div>`

    const downloadReportHtml = () => {
        const periodStartStr2 = fmtDate(periodStart)
        const periodEndStr2 = fmtDate(periodEnd)

        const channelRows = CHANNEL_ORDER.map((key, i) => {
            const stat = cb[key]
            const prevStat = prevCb[key]
            const hasCur = stat.visitors > 0
            const hasPrev = prevStat.visitors > 0
            return `
            <tr class="${i % 2 === 1 ? 'alt' : ''}">
                <td class="ch-name">${CHANNEL_LABEL[key]}</td>
                <td>${stat.visitors.toLocaleString()}${deltaHtml(cvc[key])}</td>
                <td>${rateHtml(stat.signupRate, prevStat.signupRate, hasCur, hasPrev)}</td>
                <td>${rateHtml(stat.commentRate, prevStat.commentRate, hasCur, hasPrev)}</td>
                <td>${rateHtml(stat.discussionCommentRate, prevStat.discussionCommentRate, hasCur, hasPrev)}</td>
                <td>${rateHtml(stat.reactionRate, prevStat.reactionRate, hasCur, hasPrev)}</td>
                <td>${rateHtml(stat.voteRate, prevStat.voteRate, hasCur, hasPrev)}</td>
            </tr>`
        }).join('')

        const promoBlocks = (['instagram', 'youtube', 'tiktok'] as Platform[]).map(platform => {
            const prevLabel = kind === 'weekly' ? '주' : '달'
            const prev = previousTotals[platform].subscribers
            const curStr = promoStats[platform].totalSubscribers
            const cur = curStr === '' ? null : Number(curStr)
            const viewsStr = promoStats[platform].views
            let subNote = `<span class="muted">전체 구독자 수 미입력</span>`
            if (cur !== null) {
                if (prev === null) {
                    subNote = `<span class="info">첫 기록 (기준점 ${cur.toLocaleString()}명) — 다음 ${prevLabel}부터 증감 표시</span>`
                } else {
                    const diff = cur - prev
                    subNote = `<span class="${diff > 0 ? 'up' : diff < 0 ? 'down' : 'neutral'}">${diff > 0 ? '+' : ''}${diff.toLocaleString()}명 (저번 ${prevLabel} ${prev.toLocaleString()}명 대비)</span>`
                }
            }
            const likesStr = promoStats[platform].likes
            const commentsStr = promoStats[platform].comments
            const engagementRows = platform !== 'tiktok' ? `
                <p class="promo-row"><span class="muted">좋아요 수</span> <strong>${likesStr === '' ? '-' : `${Number(likesStr).toLocaleString()}개`}</strong></p>
                <p class="promo-row"><span class="muted">댓글 수</span> <strong>${commentsStr === '' ? '-' : `${Number(commentsStr).toLocaleString()}개`}</strong></p>` : ''
            return `
            <div class="promo-card">
                <p class="promo-title">${PLATFORM_LABEL[platform]}</p>
                <p class="promo-row"><span class="muted">${kind === 'weekly' ? '지난주' : '이번 달'} 발생 조회수</span> <strong>${viewsStr === '' ? '-' : `${Number(viewsStr).toLocaleString()}회`}</strong></p>
                <p class="promo-row"><span class="muted">전체 구독자 수</span> <strong>${cur === null ? '-' : `${cur.toLocaleString()}명`}</strong></p>
                <p class="promo-row">신규 구독자: ${subNote}</p>
                ${engagementRows}
            </div>`
        }).join('')

        const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>왜난리 ${kind === 'weekly' ? '주간' : '월간'} KPI 리포트 (${periodStartStr2} ~ ${periodEndStr2})</title>
<style>${REPORT_CSS}</style>
</head>
<body>
<div class="report">
    <div class="title-card">
        <p class="title-main">왜난리 ${kind === 'weekly' ? '주간' : '월간'} KPI 리포트</p>
        <p class="title-sub">${reportSubtitle(kind, periodStart, periodEnd, previousPeriodStart)}</p>
    </div>

    <div class="card p4">
        <div class="signup-row">
            <h2 class="section-title" style="white-space:nowrap;margin:0;">가입자 현황 (누적)</h2>
            <div class="signup-grid">
                <div class="signup-box"><p class="muted">전체</p><p class="signup-value">${(metrics.currentUsers + metrics.internalUsersCount).toLocaleString()}명</p></div>
                <div class="signup-box blue"><p class="muted">일반 유저</p><p class="signup-value">${metrics.currentUsers.toLocaleString()}명</p></div>
                <div class="signup-box"><p class="muted">내부 계정</p><p class="signup-value dim">${metrics.internalUsersCount.toLocaleString()}명</p></div>
            </div>
        </div>
    </div>

    <div class="card">
        <h2 class="section-title">① 콘텐츠 제작 (${cmpLabel})</h2>
        <div class="stat-grid cols-3">
            ${cardHtml({ label: '이슈 승인', current: ps.issues, unit: '개', delta: cmp.issues, note: `목표 ${issueTarget.toLocaleString()}개` })}
            ${cardHtml({ label: '숏폼 등록', current: ps.shortforms, unit: '개', delta: cmp.shortforms, note: `목표 ${shortformTarget.toLocaleString()}개` })}
            ${cardHtml({ label: '카드뉴스 등록', current: ps.cardNews, unit: '개', delta: cmp.cardNews, note: `목표 ${cardNewsTarget.toLocaleString()}개` })}
        </div>
    </div>

    <div class="card">
        <h2 class="section-title">② 유입 · 성장 (${cmpLabel})</h2>
        <div class="stat-grid cols-3">
            ${cardHtml({ label: '신규 가입자', current: ps.newUsers, unit: '명', delta: cmp.newUsers, note: `목표 ${userTarget.toLocaleString()}명` })}
            ${cardHtml({ label: '순방문자', current: uniqueVisitors, unit: '명', delta: cmp.uniqueVisitors, note: '같은 사람 중복 제외' })}
            ${cardHtml({ label: '페이지뷰', current: pageViews, unit: '회', note: `목표 ${pvTarget.toLocaleString()}회` })}
        </div>

        <div class="channel-block">
            <h3 class="section-title" style="margin-bottom:2px;font-size:14px;">채널별 유입 · 참여 전환율</h3>
            <p class="section-desc">방문자·전환율 모두 ${kind === 'weekly' ? '지난주' : '이번 달'} 기준, ${cmpLabel}</p>
            <table class="channel-table">
                <thead>
                    <tr>
                        <th class="left">채널</th>
                        <th>방문자</th>
                        <th>가입전환율</th>
                        <th>이슈댓글전환율</th>
                        <th>토론의견전환율</th>
                        <th>반응전환율</th>
                        <th>투표전환율</th>
                    </tr>
                </thead>
                <tbody>
                    ${channelRows}
                </tbody>
            </table>
            <p class="table-footnote">
                채널 합계 ${totalVisitorsThisPeriod.toLocaleString()}명 · 전체 순방문자 ${uniqueVisitors.toLocaleString()}명
                ${totalVisitorsThisPeriod === uniqueVisitors ? ' · ✓ 일치' : ' · ⚠ 불일치'}
            </p>
        </div>
    </div>

    <div class="card">
        <h2 class="section-title">③ 참여 · 반응 (${cmpLabel}, 봇 제외)</h2>
        <div class="stat-grid cols-4">
            ${cardHtml({ label: '이슈 댓글', current: ps.issueComments, unit: '개', delta: cmp.issueComments, note: `목표 ${commentTarget.toLocaleString()}개`, rateLabel: kind === 'monthly' ? '참여율' : undefined, rateValue: kind === 'monthly' ? `${metrics.issueCommentParticipation.toFixed(1)}%` : undefined })}
            ${cardHtml({ label: '토론 의견', current: ps.discussionComments, unit: '개', delta: cmp.discussionComments, note: `목표 ${commentTarget.toLocaleString()}개`, rateLabel: kind === 'monthly' ? '참여율' : undefined, rateValue: kind === 'monthly' ? `${metrics.discussionCommentParticipation.toFixed(1)}%` : undefined })}
            ${cardHtml({ label: '반응', current: ps.reactions, unit: '개', delta: cmp.reactions, note: `목표 ${reactionTarget.toLocaleString()}개`, rateLabel: kind === 'monthly' ? '참여율' : undefined, rateValue: kind === 'monthly' ? `${metrics.reactionParticipation.toFixed(1)}%` : undefined })}
            ${cardHtml({ label: '투표', current: ps.votes, unit: '회', delta: cmp.votes, note: `목표 ${voteTarget.toLocaleString()}회`, rateLabel: kind === 'monthly' ? '참여율' : undefined, rateValue: kind === 'monthly' ? `${metrics.voteParticipation.toFixed(1)}%` : undefined })}
        </div>
    </div>

    <div class="card">
        <h2 class="section-title" style="margin-bottom:2px;">홍보 채널 현황</h2>
        <p class="section-desc">유튜브·인스타는 API로 자동 조회, 틱톡은 직접 확인해서 입력함 (해당 기간: ${periodStartStr2} ~ ${periodEndStr2})</p>
        <div class="promo-grid">
            ${promoBlocks}
        </div>
    </div>

    <p class="footer-note">이 리포트는 왜난리 관리자 시스템에서 생성되었습니다. (${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })})</p>
</div>
</body>
</html>`

        const blob = new Blob([html], { type: 'text/html' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `whynali-kpi-${reportFileLabel(kind, periodStart)}.html`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }

    return (
        <div className="max-w-7xl mx-auto space-y-6 pb-16">
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    body { background: white; }
                }
            `}</style>

            {/* 헤더 + 컨트롤 (인쇄 시 숨김) */}
            <div className="no-print space-y-2">
                <Link
                    href="/admin/kpi"
                    className="inline-flex items-center gap-1 text-sm font-medium text-content-secondary hover:text-content-primary transition-colors"
                    title="KPI 대시보드로 돌아가기"
                >
                    <ArrowLeft className="w-4 h-4" />
                    KPI 대시보드
                </Link>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <h1 className="text-2xl font-bold text-content-primary">HTML 리포트</h1>
                    <div className="flex items-center gap-2">
                        <div className="flex p-1 bg-surface-muted rounded-xl">
                            {(['weekly', 'monthly'] as const).map(k => (
                                <button key={k} onClick={() => setKind(k)}
                                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                                        kind === k ? 'bg-white shadow text-content-primary' : 'text-content-muted hover:text-content-primary'
                                    }`}>
                                    {k === 'weekly' ? '주간 리포트' : '월간 리포트'}
                                </button>
                            ))}
                        </div>
                        <button onClick={downloadReportHtml}
                            className="px-4 py-2 text-sm font-medium bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors">
                            HTML로 저장
                        </button>
                    </div>
                </div>
            </div>

            {/* 리포트 제목 */}
            <div className="card p-5 bg-blue-50 border border-blue-200">
                <p className="text-lg font-bold text-blue-900">
                    왜난리 {kind === 'weekly' ? '주간' : '월간'} KPI 리포트
                </p>
                <p className="text-sm text-blue-700 mt-1">
                    {reportSubtitle(kind, periodStart, periodEnd, previousPeriodStart)}
                </p>
            </div>

            {/* 가입자 현황 */}
            <div className="card p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <h2 className="text-base font-semibold text-content-primary whitespace-nowrap">가입자 현황 (누적)</h2>
                    <div className="grid grid-cols-3 gap-3 flex-1 min-w-[280px]">
                        <div className="px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-200 text-center">
                            <p className="text-xs text-slate-500">전체</p>
                            <p className="text-xl font-bold text-slate-900">{(metrics.currentUsers + metrics.internalUsersCount).toLocaleString()}명</p>
                        </div>
                        <div className="px-3 py-1.5 bg-blue-50 rounded-lg border border-blue-200 text-center">
                            <p className="text-xs text-blue-600">일반 유저</p>
                            <p className="text-xl font-bold text-blue-900">{metrics.currentUsers.toLocaleString()}명</p>
                        </div>
                        <div className="px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-200 text-center">
                            <p className="text-xs text-slate-500">내부 계정</p>
                            <p className="text-xl font-bold text-slate-600">{metrics.internalUsersCount.toLocaleString()}명</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* ① 콘텐츠 제작 */}
            <div className="card p-5">
                <h2 className="text-base font-semibold text-content-primary mb-4">① 콘텐츠 제작 ({cmpLabel})</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <StatCard label="이슈 승인" current={ps.issues} unit="개" delta={cmp.issues} note={`목표 ${issueTarget.toLocaleString()}개`} />
                    <StatCard label="숏폼 등록" current={ps.shortforms} unit="개" delta={cmp.shortforms} note={`목표 ${shortformTarget.toLocaleString()}개`} />
                    <StatCard label="카드뉴스 등록" current={ps.cardNews} unit="개" delta={cmp.cardNews} note={`목표 ${cardNewsTarget.toLocaleString()}개`} />
                </div>
            </div>

            {/* ② 유입·성장 */}
            <div className="card p-5">
                <h2 className="text-base font-semibold text-content-primary mb-4">② 유입 · 성장 ({cmpLabel})</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <StatCard label="신규 가입자" current={ps.newUsers} unit="명" delta={cmp.newUsers} note={`목표 ${userTarget.toLocaleString()}명`} />
                    <StatCard label="순방문자" current={uniqueVisitors} unit="명" delta={cmp.uniqueVisitors} note="같은 사람 중복 제외" />
                    <StatCard label="페이지뷰" current={pageViews} unit="회" note={`목표 ${pvTarget.toLocaleString()}회`} />
                </div>

                <div className="mt-5 pt-5 border-t border-border-muted">
                    <h3 className="text-sm font-semibold text-content-primary mb-1">채널별 유입 · 참여 전환율</h3>
                    <p className="text-sm text-content-secondary mb-4">
                        방문자·전환율 모두 {kind === 'weekly' ? '지난주' : '이번 달'} 기준, {cmpLabel}
                    </p>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-xs text-content-secondary border-b border-border">
                                    <th className="text-left py-2 pr-4 font-medium">채널</th>
                                    <th className="text-right py-2 px-2 font-medium">방문자</th>
                                    <th className="text-right py-2 px-2 font-medium">가입전환율</th>
                                    <th className="text-right py-2 px-2 font-medium">이슈댓글전환율</th>
                                    <th className="text-right py-2 px-2 font-medium">토론의견전환율</th>
                                    <th className="text-right py-2 px-2 font-medium">반응전환율</th>
                                    <th className="text-right py-2 pl-2 font-medium">투표전환율</th>
                                </tr>
                            </thead>
                            <tbody>
                                {CHANNEL_ORDER.map((key, i) => {
                                    const stat = cb[key]
                                    const prevStat = prevCb[key]
                                    const hasCur = stat.visitors > 0
                                    const hasPrev = prevStat.visitors > 0
                                    const bg = i % 2 === 0 ? '' : 'bg-slate-50'
                                    return (
                                        <tr key={key} className={`border-b border-border-muted last:border-0 ${bg}`}>
                                            <td className="py-2 pr-4 font-medium text-content-primary">{CHANNEL_LABEL[key]}</td>
                                            <td className="py-2 px-2 text-right">{stat.visitors.toLocaleString()}<DeltaBadge d={cvc[key]} /></td>
                                            <td className="py-2 px-2 text-right"><RateWithDelta current={stat.signupRate} previous={prevStat.signupRate} hasCur={hasCur} hasPrev={hasPrev} /></td>
                                            <td className="py-2 px-2 text-right"><RateWithDelta current={stat.commentRate} previous={prevStat.commentRate} hasCur={hasCur} hasPrev={hasPrev} /></td>
                                            <td className="py-2 px-2 text-right"><RateWithDelta current={stat.discussionCommentRate} previous={prevStat.discussionCommentRate} hasCur={hasCur} hasPrev={hasPrev} /></td>
                                            <td className="py-2 px-2 text-right"><RateWithDelta current={stat.reactionRate} previous={prevStat.reactionRate} hasCur={hasCur} hasPrev={hasPrev} /></td>
                                            <td className="py-2 pl-2 text-right"><RateWithDelta current={stat.voteRate} previous={prevStat.voteRate} hasCur={hasCur} hasPrev={hasPrev} /></td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                        <p className="text-xs text-content-muted mt-2">
                            채널 합계 {totalVisitorsThisPeriod.toLocaleString()}명 · 전체 순방문자 {uniqueVisitors.toLocaleString()}명
                            {totalVisitorsThisPeriod === uniqueVisitors ? ' · ✓ 일치' : ' · ⚠ 불일치'}
                        </p>
                    </div>
                </div>
            </div>

            {/* ③ 참여·반응 */}
            <div className="card p-5">
                <h2 className="text-base font-semibold text-content-primary mb-4">③ 참여 · 반응 ({cmpLabel}, 봇 제외)</h2>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <StatCard label="이슈 댓글" current={ps.issueComments} unit="개" delta={cmp.issueComments}
                        note={`목표 ${commentTarget.toLocaleString()}개`}
                        rateLabel={kind === 'monthly' ? '참여율' : undefined}
                        rateValue={kind === 'monthly' ? `${metrics.issueCommentParticipation.toFixed(1)}%` : undefined} />
                    <StatCard label="토론 의견" current={ps.discussionComments} unit="개" delta={cmp.discussionComments}
                        note={`목표 ${commentTarget.toLocaleString()}개`}
                        rateLabel={kind === 'monthly' ? '참여율' : undefined}
                        rateValue={kind === 'monthly' ? `${metrics.discussionCommentParticipation.toFixed(1)}%` : undefined} />
                    <StatCard label="반응" current={ps.reactions} unit="개" delta={cmp.reactions}
                        note={`목표 ${reactionTarget.toLocaleString()}개`}
                        rateLabel={kind === 'monthly' ? '참여율' : undefined}
                        rateValue={kind === 'monthly' ? `${metrics.reactionParticipation.toFixed(1)}%` : undefined} />
                    <StatCard label="투표" current={ps.votes} unit="회" delta={cmp.votes}
                        note={`목표 ${voteTarget.toLocaleString()}회`}
                        rateLabel={kind === 'monthly' ? '참여율' : undefined}
                        rateValue={kind === 'monthly' ? `${metrics.voteParticipation.toFixed(1)}%` : undefined} />
                </div>
            </div>

            {/* 홍보 채널 현황 */}
            <div className="card p-5">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
                    <h2 className="text-base font-semibold text-content-primary">홍보 채널 현황</h2>
                    <button
                        onClick={() => refreshPromoSection(true)}
                        disabled={promoLoading}
                        className="no-print px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors disabled:opacity-50"
                    >
                        {promoLoading ? '불러오는 중...' : '실시간 값 다시 불러오기'}
                    </button>
                </div>
                <p className="text-sm text-content-secondary mb-4">
                    유튜브·인스타는 API로 자동 조회, 틱톡은 권한 문제로 직접 확인해서 입력함 (해당 기간: {fmtDate(periodStart)} ~ {fmtDate(periodEnd)}) — 값은 필요하면 직접 고칠 수 있음
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {(['instagram', 'youtube', 'tiktok'] as Platform[]).map(platform => (
                        <div key={platform} className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                            <p className="text-sm font-semibold text-slate-700 mb-3">
                                {PLATFORM_LABEL[platform]}
                                {platform !== 'tiktok' && <span className="ml-1.5 text-[11px] font-normal text-emerald-600">자동 조회</span>}
                                {platform === 'tiktok' && <span className="ml-1.5 text-[11px] font-normal text-slate-400">수동 입력</span>}
                            </p>
                            {platform !== 'tiktok' && liveError[platform] && (
                                <p className="text-[11px] text-red-500 mb-2">자동 조회 실패 — 직접 입력해주세요 ({liveError[platform]})</p>
                            )}
                            <div className="space-y-2">
                                <label className="block">
                                    <span className="text-xs text-slate-500">{kind === 'weekly' ? '지난주' : '이번 달'} 발생 조회수</span>
                                    <input
                                        type="number"
                                        className="mt-1 w-full px-2 py-1.5 text-sm border border-slate-300 rounded-lg no-print-border"
                                        value={promoStats[platform].views}
                                        onChange={e => setPromoStats(p => ({ ...p, [platform]: { ...p[platform], views: e.target.value } }))}
                                        placeholder="예: 12400"
                                    />
                                </label>
                                <label className="block">
                                    <span className="text-xs text-slate-500">전체 구독자 수 (프로필에서 바로 확인)</span>
                                    <input
                                        type="number"
                                        className="mt-1 w-full px-2 py-1.5 text-sm border border-slate-300 rounded-lg"
                                        value={promoStats[platform].totalSubscribers}
                                        onChange={e => setPromoStats(p => ({ ...p, [platform]: { ...p[platform], totalSubscribers: e.target.value } }))}
                                        placeholder="예: 1850"
                                    />
                                </label>
                                <div className="px-2 py-1.5 text-xs text-slate-500">
                                    신규 구독자: {(() => {
                                        const prevLabel = kind === 'weekly' ? '주' : '달'
                                        const prev = previousTotals[platform].subscribers
                                        const cur = promoStats[platform].totalSubscribers === '' ? null : Number(promoStats[platform].totalSubscribers)
                                        if (cur === null) return <span className="text-slate-400">전체 구독자 수를 입력하면 표시됨</span>
                                        if (prev === null) return <span className="text-blue-600">첫 기록 (기준점 {cur.toLocaleString()}명) — 다음 {prevLabel}부터 증감이 표시됨</span>
                                        const diff = cur - prev
                                        return <span className={`font-semibold ${diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-red-500' : 'text-slate-500'}`}>
                                            {diff > 0 ? '+' : ''}{diff.toLocaleString()}명 (저번 {prevLabel} {prev.toLocaleString()}명 대비)
                                        </span>
                                    })()}
                                </div>
                                {platform !== 'tiktok' && (
                                    <div className="grid grid-cols-2 gap-2">
                                        <label className="block">
                                            <span className="text-xs text-slate-500">좋아요 수</span>
                                            <input
                                                type="number"
                                                className="mt-1 w-full px-2 py-1.5 text-sm border border-slate-300 rounded-lg"
                                                value={promoStats[platform].likes}
                                                onChange={e => setPromoStats(p => ({ ...p, [platform]: { ...p[platform], likes: e.target.value } }))}
                                                placeholder="예: 38"
                                            />
                                        </label>
                                        <label className="block">
                                            <span className="text-xs text-slate-500">댓글 수</span>
                                            <input
                                                type="number"
                                                className="mt-1 w-full px-2 py-1.5 text-sm border border-slate-300 rounded-lg"
                                                value={promoStats[platform].comments}
                                                onChange={e => setPromoStats(p => ({ ...p, [platform]: { ...p[platform], comments: e.target.value } }))}
                                                placeholder="예: 12"
                                            />
                                        </label>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
                <div className="no-print flex items-center gap-3 mt-4">
                    <button
                        onClick={saveAllPromoStats}
                        disabled={saving}
                        className="px-4 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                        {saving ? '저장 중...' : '저장'}
                    </button>
                    {savedAt && <p className="text-xs text-emerald-700">✅ {savedAt}에 저장됨</p>}
                </div>
            </div>

            <p className="text-xs text-content-muted text-center">
                이 리포트는 왜난리 관리자 시스템에서 생성되었습니다. ({new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })})
            </p>
        </div>
    )
}
