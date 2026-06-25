/**
 * lib/kpi/calculator.ts
 * 
 * [KPI 계산 및 분석 유틸리티]
 * 
 * 월별 KPI 목표 대비 현재 상태를 분석하고, 주차별 마일스톤 달성 여부를 계산합니다.
 * 목표는 데이터베이스에서 동적으로 불러옵니다.
 */

import { supabaseAdmin } from '@/lib/supabase-server'
import {
    getKSTDaysAgoStart,
    getKSTDayOffset,
    getKSTLastMonthStart,
    getKSTMonthStart,
    getKSTTodayStart,
    getKSTWeekStart,
    getKSTYearMonth,
} from '@/lib/kpi/kst-date'

const supabase = supabaseAdmin

type PeriodStat = {
    newUsers: number
    comments: number
    reactions: number
    votes: number
    issues: number
    shortforms: number
    cardNews: number
}

type ConversionRatePeriod = {
    signupRate: number
    voteRate: number
    commentRate: number
    reactionRate: number
    uniqueVisitors: number
    signups: number
    votes: number
    comments: number
    reactions: number
}

const emptyConversionRatePeriod = (): ConversionRatePeriod => ({
    signupRate: 0,
    voteRate: 0,
    commentRate: 0,
    reactionRate: 0,
    uniqueVisitors: 0,
    signups: 0,
    votes: 0,
    comments: 0,
    reactions: 0,
})

function buildConversionRatePeriod(
    uniqueVisitors: number,
    signups: number,
    votes: number,
    comments: number,
    reactions: number,
): ConversionRatePeriod {
    const rate = (count: number) => uniqueVisitors > 0 ? (count / uniqueVisitors) * 100 : 0
    return {
        uniqueVisitors,
        signups,
        votes,
        comments,
        reactions,
        signupRate: rate(signups),
        voteRate: rate(votes),
        commentRate: rate(comments),
        reactionRate: rate(reactions),
    }
}

type ChannelKey = 'threads' | 'instagram' | 'x' | 'youtube' | 'tiktok' | 'organic'

type VisitorCountsByChannel = Record<ChannelKey, number>

type ChannelInboundStat = {
    visitors: number
    signups: number
    signupRate: number
}

type ChannelInboundBreakdown = Record<ChannelKey, ChannelInboundStat>

const CHANNEL_KEYS: ChannelKey[] = ['instagram', 'threads', 'x', 'youtube', 'tiktok', 'organic']

function emptyVisitorCounts(): VisitorCountsByChannel {
    return { threads: 0, instagram: 0, x: 0, youtube: 0, tiktok: 0, organic: 0 }
}

function emptyChannelInboundBreakdown(): ChannelInboundBreakdown {
    const zero = (): ChannelInboundStat => ({ visitors: 0, signups: 0, signupRate: 0 })
    return {
        threads: zero(),
        instagram: zero(),
        x: zero(),
        youtube: zero(),
        tiktok: zero(),
        organic: zero(),
    }
}

function mapUtmToChannelKey(utm: string | null): ChannelKey | null {
    if (!utm) return null
    if (utm === 'threads') return 'threads'
    if (utm === 'instagram') return 'instagram'
    if (utm === 'twitter') return 'x'
    if (utm === 'youtube') return 'youtube'
    if (utm === 'tiktok') return 'tiktok'
    if (['google', 'naver', 'organic'].includes(utm)) return 'organic'
    return null
}

function buildVisitorCounts(data: { utm_source: string | null; session_id: string }[] | null): VisitorCountsByChannel {
    return {
        threads:   new Set(data?.filter(v => v.utm_source === 'threads').map(v => v.session_id) || []).size,
        instagram: new Set(data?.filter(v => v.utm_source === 'instagram').map(v => v.session_id) || []).size,
        x:         new Set(data?.filter(v => v.utm_source === 'twitter').map(v => v.session_id) || []).size,
        youtube:   new Set(data?.filter(v => v.utm_source === 'youtube').map(v => v.session_id) || []).size,
        tiktok:    new Set(data?.filter(v => v.utm_source === 'tiktok').map(v => v.session_id) || []).size,
        organic:   new Set(data?.filter(v => v.utm_source && ['google', 'naver', 'organic'].includes(v.utm_source)).map(v => v.session_id) || []).size,
    }
}

function buildChannelInboundBreakdown(
    visitorCounts: VisitorCountsByChannel,
    signupEvents: { first_utm_source: string | null }[] | null,
): ChannelInboundBreakdown {
    const signupCounts = emptyVisitorCounts()
    for (const event of signupEvents || []) {
        const channel = mapUtmToChannelKey(event.first_utm_source)
        if (channel) signupCounts[channel]++
    }

    const toRate = (visitors: number, signups: number) => visitors > 0 ? (signups / visitors) * 100 : 0
    const result = emptyChannelInboundBreakdown()
    for (const key of CHANNEL_KEYS) {
        result[key] = {
            visitors: visitorCounts[key],
            signups: signupCounts[key],
            signupRate: toRate(visitorCounts[key], signupCounts[key]),
        }
    }
    return result
}

async function fetchConversionCounts(sinceIso: string) {
    const [
        { count: signups },
        { count: votes },
        { count: comments },
        { count: reactions },
    ] = await Promise.all([
        supabase.from('conversion_events').select('*', { count: 'exact', head: true })
            .eq('event_type', 'signup').gte('created_at', sinceIso),
        supabase.from('conversion_events').select('*', { count: 'exact', head: true })
            .eq('event_type', 'vote').gte('created_at', sinceIso),
        supabase.from('conversion_events').select('*', { count: 'exact', head: true })
            .eq('event_type', 'comment').gte('created_at', sinceIso),
        supabase.from('conversion_events').select('*', { count: 'exact', head: true })
            .eq('event_type', 'reaction').gte('created_at', sinceIso),
    ])

    return {
        signups: signups || 0,
        votes: votes || 0,
        comments: comments || 0,
        reactions: reactions || 0,
    }
}

async function fetchSignupEventsBySource(sinceIso: string) {
    const { data } = await supabase
        .from('conversion_events')
        .select('first_utm_source')
        .eq('event_type', 'signup')
        .gte('created_at', sinceIso)

    return data || []
}

interface KPIMetrics {
    // 현재 지표
    currentUsers: number
    currentActiveIssues: number   // 진행중 이슈 (점화 + 논란중)
    currentTotalIssues: number    // 전체 승인 이슈 (종결 포함)
    currentComments: number
    currentIssueComments: number
    currentDiscussionOpinions: number
    currentReactions: number
    currentVotes: number
    
    // 방문자 지표 (재미나이 제안)
    todayPageViews: number               // 오늘 페이지뷰
    todayUniqueVisitors: number          // 오늘 순방문자
    weeklyPageViews: number              // 최근 7일 페이지뷰
    weeklyUniqueVisitors: number         // 최근 7일 순방문자
    monthlyPageViews: number             // 최근 30일 페이지뷰
    monthlyUniqueVisitors: number        // 최근 30일 순방문자
    
    // 유입 경로별 (기간별)
    visitorsBySource: {
        d1:  { threads: number; instagram: number; x: number; youtube: number; tiktok: number; organic: number }
        d7:  { threads: number; instagram: number; x: number; youtube: number; tiktok: number; organic: number }
        d30: { threads: number; instagram: number; x: number; youtube: number; tiktok: number; organic: number }
    }
    // 채널별 방문자 + 가입 + 가입 전환율 (기간별)
    channelInboundByPeriod: {
        d1: ChannelInboundBreakdown
        d7: ChannelInboundBreakdown
        d30: ChannelInboundBreakdown
    }
    
    // 전환율 (재미나이 제안 2번)
    conversionRates: {
        signupRate: number              // 방문 → 가입 (%), 최근 7일 기준 (하위 호환)
        voteRate: number
        commentRate: number
        reactionRate: number
    }
    conversionRatesByPeriod: {
        d1: ConversionRatePeriod
        d7: ConversionRatePeriod
        d30: ConversionRatePeriod
    }
    
    // 이슈 품질 지표 (재미나이 제안 3번)
    issueQuality: {
        avgVotesPerIssue: number
        avgCommentsPerIssue: number
        avgReactionsPerIssue: number
        topCategory: string | null
    }
    
    // 이달 활성 참여자 (중복 제거된 유저 수)
    monthlyActiveCommenters: number
    monthlyActiveReactors: number
    monthlyActiveVoters: number

    // 이달 참여율 (활성 유저 / 전체 가입자)
    commentParticipation: number
    reactionParticipation: number
    voteParticipation: number
    
    // 일평균
    dailyNewUsers: number
    dailyComments: number
    dailyReactions: number
    
    // 최근 성장
    weeklyGrowthRate: number
    usersLastWeek: number
    
    // 목표 대비
    userProgress: number // %
    commentProgress: number
    reactionProgress: number
    voteProgress: number

    // 현재 가입자 기준 환산 목표
    stageTargets: {
        comments: number
        reactions: number
        votes: number
        commentProgress: number
        reactionProgress: number
        voteProgress: number
    }

    // 추이 비교
    weekOverWeek: {
        newUsers:  { current: number; previous: number; delta: number; deltaPercent: number | null }
        comments:  { current: number; previous: number; delta: number; deltaPercent: number | null }
        reactions: { current: number; previous: number; delta: number; deltaPercent: number | null }
        votes:     { current: number; previous: number; delta: number; deltaPercent: number | null }
    }
    monthOverMonth: {
        newUsers:  { current: number; previous: number; delta: number; deltaPercent: number | null }
        comments:  { current: number; previous: number; delta: number; deltaPercent: number | null }
        reactions: { current: number; previous: number; delta: number; deltaPercent: number | null }
        votes:     { current: number; previous: number; delta: number; deltaPercent: number | null }
    }

    // 스파크라인 (최근 14일 일별)
    sparklines: {
        newUsers:  number[]
        comments:  number[]
        reactions: number[]
        votes:     number[]
    }

    // 운영 KPI (오늘 / 이번달)
    todayIssues: number
    monthlyIssues: number
    todayShortforms: number
    monthlyShortforms: number
    todayCardNews: number
    monthlyCardNews: number
    todayNewUsers: number
    todayComments: number
    todayReactions: number

    periodStats: { d1: PeriodStat; d7: PeriodStat; d30: PeriodStat }

    // 목표값
    targets: {
        users: number
        activeIssues: number
        comments: number
        reactions: number
        votes: number
        commentParticipation: number
        reactionParticipation: number
        voteParticipation: number
        dailyNewUsers: number
        dailyComments: number
        dailyReactions: number
        dailyIssues: number
        dailyShortformsPerPlatform: number
        pageviews: number
    }
}

interface WeeklyProgress {
    week: number
    startDate: string
    endDate: string
    targetUsers: number
    targetComments: number
    currentUsers: number
    currentComments: number
    userAchieved: boolean
    commentAchieved: boolean
    isCurrent: boolean
    isPast: boolean
}

interface KPIGoal {
    id: string
    period_year: number
    period_month: number
    period_start: string
    period_end: string
    target_users: number
    target_active_issues: number
    target_comments: number
    target_reactions: number
    target_votes: number
    target_comment_participation: number
    target_reaction_participation: number
    target_vote_participation: number
    target_daily_new_users: number
    target_daily_comments: number
    target_daily_reactions: number
    target_daily_issues: number
    target_daily_shortforms_per_platform: number
    notes: string | null
}

interface KPIMilestone {
    week_number: number
    start_date: string
    end_date: string
    target_users: number
    target_comments: number
}

export async function calculateKPI(year?: number, month?: number): Promise<{
    metrics: KPIMetrics
    weeklyProgress: WeeklyProgress[]
    goalInfo: {
        year: number
        month: number
        periodStart: string
        periodEnd: string
        notes: string | null
    } | null
}> {
    // 기본값: KST 기준 현재 연월
    const kstNow = getKSTYearMonth()
    const targetYear = year || kstNow.year
    const targetMonth = month || kstNow.month

    // 1. 해당 월의 KPI 목표 가져오기
    const { data: goal, error: goalError } = await supabase
        .from('kpi_goals')
        .select('*')
        .eq('period_year', targetYear)
        .eq('period_month', targetMonth)
        .eq('is_active', true)
        .single<KPIGoal>()

    if (goalError || !goal) {
        console.error('[calculateKPI] 목표를 찾을 수 없습니다:', targetYear, targetMonth, goalError)
        // 목표가 없으면 기본값 반환
        return {
            metrics: await getDefaultMetrics(),
            weeklyProgress: [],
            goalInfo: null
        }
    }

    // 2. 주차별 마일스톤 가져오기
    const { data: milestones, error: milestonesError } = await supabase
        .from('kpi_milestones')
        .select('*')
        .eq('goal_id', goal.id)
        .order('week_number', { ascending: true })

    if (milestonesError) {
        console.error('[calculateKPI] 마일스톤 조회 실패:', milestonesError)
    }
    // 3. 내부 계정 ID 목록 (KPI 집계에서 제외)
    const { data: internalUserRows } = await supabase
        .from('users')
        .select('id')
        .eq('is_internal', true)
    const internalIds = internalUserRows?.map(r => r.id) || []
    const internalIdSet = new Set(internalIds)
    // 내부 계정 활동 제외 헬퍼: comments/reactions/user_votes 쿼리에 NOT IN 추가
    const fi = (q: any): any =>
        internalIds.length > 0 ? q.not('user_id', 'in', `(${internalIds.join(',')})`) : q

    // 3. 기본 집계 (내부 계정 제외)
    const { count: totalUsers } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('is_internal', false)

    // 진행중 이슈 (점화 + 논란중) — KPI 목표 기준
    const { count: activeIssues } = await supabase
        .from('issues')
        .select('*', { count: 'exact', head: true })
        .eq('approval_status', 'approved')
        .eq('is_hidden', false)
        .in('status', ['점화', '논란중'])

    // 전체 승인 이슈 (종결 포함) — 참고 지표
    const { count: totalApprovedIssues } = await supabase
        .from('issues')
        .select('*', { count: 'exact', head: true })
        .eq('approval_status', 'approved')
        .eq('is_hidden', false)

    // 이슈 댓글 (issue_id가 있는 것)
    const { count: issueComments } = await fi(supabase
        .from('comments')
        .select('*', { count: 'exact', head: true })
        .not('issue_id', 'is', null)
        .eq('is_hidden', false))

    // 토론 의견 (discussion_topic_id가 있는 것)
    const { count: discussionOpinions } = await fi(supabase
        .from('comments')
        .select('*', { count: 'exact', head: true })
        .not('discussion_topic_id', 'is', null)
        .eq('is_hidden', false))

    const totalComments = (issueComments || 0) + (discussionOpinions || 0)

    const { count: totalReactions } = await fi(supabase
        .from('reactions')
        .select('*', { count: 'exact', head: true }))

    const { count: totalVotes } = await fi(supabase
        .from('user_votes')
        .select('*', { count: 'exact', head: true }))

    // 4. 이달 활성 참여자 수 (중복 제거, KST 기준)
    const thisMonthForParticipation = getKSTMonthStart()

    const [
        { data: monthlyCommentUsers },
        { data: monthlyReactionUsers },
        { data: monthlyVoteUsers },
    ] = await Promise.all([
        fi(supabase.from('comments').select('user_id')
            .gte('created_at', thisMonthForParticipation.toISOString())
            .eq('is_hidden', false)
            .not('user_id', 'is', null)),
        fi(supabase.from('reactions').select('user_id')
            .gte('created_at', thisMonthForParticipation.toISOString())
            .not('user_id', 'is', null)),
        fi(supabase.from('user_votes').select('user_id')
            .gte('created_at', thisMonthForParticipation.toISOString())
            .not('user_id', 'is', null)),
    ])

    const monthlyActiveCommenters  = new Set(monthlyCommentUsers?.filter((r: { user_id: string }) => !internalIdSet.has(r.user_id)).map((r: { user_id: string }) => r.user_id)  || []).size
    const monthlyActiveReactors    = new Set(monthlyReactionUsers?.filter((r: { user_id: string }) => !internalIdSet.has(r.user_id)).map((r: { user_id: string }) => r.user_id) || []).size
    const monthlyActiveVoters      = new Set(monthlyVoteUsers?.filter((r: { user_id: string }) => !internalIdSet.has(r.user_id)).map((r: { user_id: string }) => r.user_id)     || []).size

    const commentParticipation  = (totalUsers || 0) > 0 ? (monthlyActiveCommenters  / (totalUsers || 0)) * 100 : 0
    const reactionParticipation = (totalUsers || 0) > 0 ? (monthlyActiveReactors    / (totalUsers || 0)) * 100 : 0
    const voteParticipation     = (totalUsers || 0) > 0 ? (monthlyActiveVoters      / (totalUsers || 0)) * 100 : 0

    // 4-1. 오늘 운영 KPI (이슈 / 숏폼, KST 기준)
    const todayStart = getKSTTodayStart()
    const thisMonthStart2 = getKSTMonthStart()

    const [
        { count: todayIssuesCount },
        { count: monthlyIssuesCount },
        { count: todayShortformsCount },
        { count: monthlyShortformsCount },
        { count: todayCardNewsCount },
        { count: monthlyCardNewsCount },
        { count: todayNewUsersCount },
        { count: todayCommentsCount },
        { count: todayReactionsCount },
        { count: todayVotesCount },
    ] = await Promise.all([
        supabase.from('issues').select('*', { count: 'exact', head: true })
            .eq('approval_status', '승인')
            .gte('approved_at', todayStart.toISOString()),
        supabase.from('issues').select('*', { count: 'exact', head: true })
            .eq('approval_status', '승인')
            .gte('approved_at', thisMonthStart2.toISOString()),
        supabase.from('shortform_jobs').select('*', { count: 'exact', head: true })
            .not('youtube_uploaded_at', 'is', null)
            .gte('youtube_uploaded_at', todayStart.toISOString()),
        supabase.from('shortform_jobs').select('*', { count: 'exact', head: true })
            .not('youtube_uploaded_at', 'is', null)
            .gte('youtube_uploaded_at', thisMonthStart2.toISOString()),
        supabase.from('card_news_logs').select('*', { count: 'exact', head: true })
            .gte('published_at', todayStart.toISOString()),
        supabase.from('card_news_logs').select('*', { count: 'exact', head: true })
            .gte('published_at', thisMonthStart2.toISOString()),
        supabase.from('users').select('*', { count: 'exact', head: true })
            .eq('is_internal', false).gte('created_at', todayStart.toISOString()),
        fi(supabase.from('comments').select('*', { count: 'exact', head: true })
            .gte('created_at', todayStart.toISOString()).eq('is_hidden', false)),
        fi(supabase.from('reactions').select('*', { count: 'exact', head: true })
            .gte('created_at', todayStart.toISOString())),
        fi(supabase.from('user_votes').select('*', { count: 'exact', head: true })
            .gte('created_at', todayStart.toISOString())),
    ])

    const todayShortforms = todayShortformsCount ?? 0
    const monthlyShortforms = monthlyShortformsCount ?? 0

    // 5. 최근 7일 데이터 (KST 기준)
    const sevenDaysAgo = getKSTDaysAgoStart(7)

    const { count: newUsers7d } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('is_internal', false)
        .gte('created_at', sevenDaysAgo.toISOString())

    const { count: newComments7d } = await fi(supabase
        .from('comments')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', sevenDaysAgo.toISOString())
        .eq('is_hidden', false))

    const { count: newReactions7d } = await fi(supabase
        .from('reactions')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', sevenDaysAgo.toISOString()))

    const { count: newVotes7d } = await fi(supabase
        .from('user_votes')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', sevenDaysAgo.toISOString()))

    // 6. 일평균 계산
    const dailyNewUsers = (newUsers7d || 0) / 7
    const dailyComments = (newComments7d || 0) / 7
    const dailyReactions = (newReactions7d || 0) / 7

    // 6-b. 기간 선택용: 이번주(일~토) · 이번달(1일~말일) 집계 (KST 기준)
    const thisWeekStart = getKSTWeekStart()

    const [
        { count: newIssuesThisWeek },
        { count: newIssuesThisMonth },
        { count: shortformsThisWeek },
        { count: shortformsThisMonth },
        { count: cardNewsThisWeek },
        { count: cardNewsThisMonth },
        { count: newUsersThisWeek },
        { count: newUsersThisMonth },
        { count: newCommentsThisWeek },
        { count: newCommentsThisMonth },
        { count: newReactionsThisWeek },
        { count: newReactionsThisMonth },
        { count: newVotesThisWeek },
        { count: newVotesThisMonth },
    ] = await Promise.all([
        supabase.from('issues').select('*', { count: 'exact', head: true })
            .eq('approval_status', '승인').gte('approved_at', thisWeekStart.toISOString()),
        supabase.from('issues').select('*', { count: 'exact', head: true })
            .eq('approval_status', '승인').gte('approved_at', thisMonthStart2.toISOString()),
        supabase.from('shortform_jobs').select('*', { count: 'exact', head: true })
            .not('youtube_uploaded_at', 'is', null).gte('youtube_uploaded_at', thisWeekStart.toISOString()),
        supabase.from('shortform_jobs').select('*', { count: 'exact', head: true })
            .not('youtube_uploaded_at', 'is', null).gte('youtube_uploaded_at', thisMonthStart2.toISOString()),
        supabase.from('card_news_logs').select('*', { count: 'exact', head: true })
            .gte('published_at', thisWeekStart.toISOString()),
        supabase.from('card_news_logs').select('*', { count: 'exact', head: true })
            .gte('published_at', thisMonthStart2.toISOString()),
        supabase.from('users').select('*', { count: 'exact', head: true })
            .eq('is_internal', false).gte('created_at', thisWeekStart.toISOString()),
        supabase.from('users').select('*', { count: 'exact', head: true })
            .eq('is_internal', false).gte('created_at', thisMonthStart2.toISOString()),
        fi(supabase.from('comments').select('*', { count: 'exact', head: true })
            .gte('created_at', thisWeekStart.toISOString()).eq('is_hidden', false)),
        fi(supabase.from('comments').select('*', { count: 'exact', head: true })
            .gte('created_at', thisMonthStart2.toISOString()).eq('is_hidden', false)),
        fi(supabase.from('reactions').select('*', { count: 'exact', head: true })
            .gte('created_at', thisWeekStart.toISOString())),
        fi(supabase.from('reactions').select('*', { count: 'exact', head: true })
            .gte('created_at', thisMonthStart2.toISOString())),
        fi(supabase.from('user_votes').select('*', { count: 'exact', head: true })
            .gte('created_at', thisWeekStart.toISOString())),
        fi(supabase.from('user_votes').select('*', { count: 'exact', head: true })
            .gte('created_at', thisMonthStart2.toISOString())),
    ])

    const periodStats = {
        d1:  { newUsers: todayNewUsersCount ?? 0, comments: todayCommentsCount ?? 0, reactions: todayReactionsCount ?? 0, votes: todayVotesCount ?? 0, issues: todayIssuesCount ?? 0, shortforms: todayShortforms, cardNews: todayCardNewsCount ?? 0 },
        d7:  { newUsers: newUsersThisWeek ?? 0, comments: newCommentsThisWeek ?? 0, reactions: newReactionsThisWeek ?? 0, votes: newVotesThisWeek ?? 0, issues: newIssuesThisWeek ?? 0, shortforms: shortformsThisWeek ?? 0, cardNews: cardNewsThisWeek ?? 0 },
        d30: { newUsers: newUsersThisMonth ?? 0, comments: newCommentsThisMonth ?? 0, reactions: newReactionsThisMonth ?? 0, votes: newVotesThisMonth ?? 0, issues: newIssuesThisMonth ?? 0, shortforms: shortformsThisMonth ?? 0, cardNews: cardNewsThisMonth ?? 0 },
    }

    // 7. 방문자 데이터 (재미나이 제안)
    // 오늘 방문자
    const [
        { count: todayPageViewsCount },
        { data: todayVisitorsData },
    ] = await Promise.all([
        supabase.from('page_views').select('*', { count: 'exact', head: true })
            .gte('created_at', todayStart.toISOString()),
        supabase.from('page_views').select('session_id')
            .gte('created_at', todayStart.toISOString()),
    ])
    const todayPageViews = todayPageViewsCount ?? 0
    const todayUniqueVisitors = new Set(todayVisitorsData?.map(v => v.session_id) || []).size

    // 최근 7일 방문자
    const { count: weeklyPageViews } = await supabase
        .from('page_views')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', sevenDaysAgo.toISOString())

    const { data: weeklyVisitors } = await supabase
        .from('page_views')
        .select('session_id')
        .gte('created_at', sevenDaysAgo.toISOString())
    
    const weeklyUniqueVisitors = new Set(weeklyVisitors?.map(v => v.session_id) || []).size

    // 이번달 방문자
    const { count: monthlyPageViews } = await supabase
        .from('page_views')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', thisMonthStart2.toISOString())

    const { data: monthlyVisitors } = await supabase
        .from('page_views')
        .select('session_id')
        .gte('created_at', thisMonthStart2.toISOString())
    
    const monthlyUniqueVisitors = new Set(monthlyVisitors?.map(v => v.session_id) || []).size

    // 유입 경로별 방문자 + 채널별 가입 (오늘/7일/30일)
    const [
        { data: sourceDataD1 },
        { data: sourceDataD7 },
        { data: sourceDataD30 },
        signupEventsD1,
        signupEventsD7,
        signupEventsD30,
    ] = await Promise.all([
        supabase.from('page_views').select('utm_source, session_id').gte('created_at', todayStart.toISOString()),
        supabase.from('page_views').select('utm_source, session_id').gte('created_at', sevenDaysAgo.toISOString()),
        supabase.from('page_views').select('utm_source, session_id').gte('created_at', thisMonthStart2.toISOString()),
        fetchSignupEventsBySource(todayStart.toISOString()),
        fetchSignupEventsBySource(sevenDaysAgo.toISOString()),
        fetchSignupEventsBySource(thisMonthStart2.toISOString()),
    ])

    const visitorsD1 = buildVisitorCounts(sourceDataD1)
    const visitorsD7 = buildVisitorCounts(sourceDataD7)
    const visitorsD30 = buildVisitorCounts(sourceDataD30)

    const visitorsBySource = {
        d1:  visitorsD1,
        d7:  visitorsD7,
        d30: visitorsD30,
    }

    const channelInboundByPeriod = {
        d1:  buildChannelInboundBreakdown(visitorsD1, signupEventsD1),
        d7:  buildChannelInboundBreakdown(visitorsD7, signupEventsD7),
        d30: buildChannelInboundBreakdown(visitorsD30, signupEventsD30),
    }

    // 전환율 계산 (기간별: 오늘 / 7일 / 30일)
    const [convD1, convD7, convD30] = await Promise.all([
        fetchConversionCounts(todayStart.toISOString()),
        fetchConversionCounts(sevenDaysAgo.toISOString()),
        fetchConversionCounts(thisMonthStart2.toISOString()),
    ])

    const conversionRatesByPeriod = {
        d1: buildConversionRatePeriod(todayUniqueVisitors, convD1.signups, convD1.votes, convD1.comments, convD1.reactions),
        d7: buildConversionRatePeriod(weeklyUniqueVisitors, convD7.signups, convD7.votes, convD7.comments, convD7.reactions),
        d30: buildConversionRatePeriod(monthlyUniqueVisitors, convD30.signups, convD30.votes, convD30.comments, convD30.reactions),
    }

    const conversionRates = {
        signupRate: conversionRatesByPeriod.d7.signupRate,
        voteRate: conversionRatesByPeriod.d7.voteRate,
        commentRate: conversionRatesByPeriod.d7.commentRate,
        reactionRate: conversionRatesByPeriod.d7.reactionRate,
    }

    // 이슈 품질 지표 (재미나이 제안 3번)
    const { data: issues } = await supabase
        .from('issues')
        .select('id, category')
        .eq('approval_status', 'approved')
        .eq('is_hidden', false)

    const issueCount = issues?.length || 0
    
    // issueQuality 변수 초기화
    let issueQuality = {
        avgVotesPerIssue: 0,
        avgCommentsPerIssue: 0,
        avgReactionsPerIssue: 0,
        topCategory: null as string | null,
    }

    if (issueCount > 0) {
        // 이슈별 투표/댓글/반응 수 가져오기
        const issueIds = issues!.map(i => i.id)
        
        const { data: votes } = await fi(supabase
            .from('user_votes')
            .select('issue_id')
            .in('issue_id', issueIds))

        const { data: comments } = await fi(supabase
            .from('comments')
            .select('issue_id')
            .in('issue_id', issueIds)
            .eq('is_hidden', false))

        const { data: reactions } = await fi(supabase
            .from('reactions')
            .select('issue_id')
            .in('issue_id', issueIds))

        // 이슈별 집계
        const issueStatsMap: Record<string, { votes: number, comments: number, reactions: number, category: string }> = {}
        issues!.forEach(issue => {
            issueStatsMap[issue.id] = {
                votes: votes?.filter((v: { issue_id: string }) => v.issue_id === issue.id).length || 0,
                comments: comments?.filter((c: { issue_id: string }) => c.issue_id === issue.id).length || 0,
                reactions: reactions?.filter((r: { issue_id: string }) => r.issue_id === issue.id).length || 0,
                category: issue.category || '기타',
            }
        })

        const totalVotesOnIssues = Object.values(issueStatsMap).reduce((sum, stat) => sum + stat.votes, 0)
        const totalCommentsOnIssues = Object.values(issueStatsMap).reduce((sum, stat) => sum + stat.comments, 0)
        const totalReactionsOnIssues = Object.values(issueStatsMap).reduce((sum, stat) => sum + stat.reactions, 0)

        // 카테고리별 인기도
        const categoryStats: Record<string, number> = {}
        Object.values(issueStatsMap).forEach(stat => {
            const cat = stat.category
            categoryStats[cat] = (categoryStats[cat] || 0) + stat.votes + stat.comments + stat.reactions
        })
        const topCategory = Object.keys(categoryStats).length > 0
            ? Object.entries(categoryStats).sort((a, b) => b[1] - a[1])[0][0]
            : null

        issueQuality = {
            avgVotesPerIssue: issueCount > 0 ? totalVotesOnIssues / issueCount : 0,
            avgCommentsPerIssue: issueCount > 0 ? totalCommentsOnIssues / issueCount : 0,
            avgReactionsPerIssue: issueCount > 0 ? totalReactionsOnIssues / issueCount : 0,
            topCategory,
        }
    }

    // 8. 주간 성장률 계산
    const usersLastWeek = (totalUsers || 0) - (newUsers7d || 0)
    const weeklyGrowthRate = usersLastWeek > 0
        ? ((newUsers7d || 0) / usersLastWeek) * 100
        : 0

    // 8. 목표 대비 진척도
    const userProgress = ((totalUsers || 0) / goal.target_users) * 100
    const commentProgress = ((totalComments || 0) / goal.target_comments) * 100
    const reactionProgress = ((totalReactions || 0) / goal.target_reactions) * 100
    const voteProgress = ((totalVotes || 0) / goal.target_votes) * 100

    // 현재 가입자 기준 환산 목표 (이사님 목표는 가입자 100명 달성 시 기대치)
    const userRatio = Math.min((totalUsers || 0) / goal.target_users, 1)
    const stageTargetComments  = Math.max(1, Math.round(goal.target_comments  * userRatio))
    const stageTargetReactions = Math.max(1, Math.round(goal.target_reactions * userRatio))
    const stageTargetVotes     = Math.max(1, Math.round(goal.target_votes     * userRatio))
    const stageTargets = {
        comments:        stageTargetComments,
        reactions:       stageTargetReactions,
        votes:           stageTargetVotes,
        commentProgress:  ((totalComments  || 0) / stageTargetComments)  * 100,
        reactionProgress: ((totalReactions || 0) / stageTargetReactions) * 100,
        voteProgress:     ((totalVotes     || 0) / stageTargetVotes)     * 100,
    }

    // 9. 추이 비교 (지난주 대비 / 지난달 대비)
    const delta = (current: number, previous: number) => ({
        current,
        previous,
        delta: current - previous,
        deltaPercent: previous > 0 ? ((current - previous) / previous) * 100 : null,
    })

    // 지난주 (7-14일 전, KST 기준)
    const fourteenDaysAgo = getKSTDaysAgoStart(14)

    const [
        { count: prevUsers7d },
        { count: prevComments7d },
        { count: prevReactions7d },
        { count: prevVotes7d },
    ] = await Promise.all([
        supabase.from('users').select('*', { count: 'exact', head: true })
            .eq('is_internal', false)
            .gte('created_at', fourteenDaysAgo.toISOString())
            .lt('created_at', sevenDaysAgo.toISOString()),
        fi(supabase.from('comments').select('*', { count: 'exact', head: true })
            .gte('created_at', fourteenDaysAgo.toISOString())
            .lt('created_at', sevenDaysAgo.toISOString())
            .eq('is_hidden', false)),
        fi(supabase.from('reactions').select('*', { count: 'exact', head: true })
            .gte('created_at', fourteenDaysAgo.toISOString())
            .lt('created_at', sevenDaysAgo.toISOString())),
        fi(supabase.from('user_votes').select('*', { count: 'exact', head: true })
            .gte('created_at', fourteenDaysAgo.toISOString())
            .lt('created_at', sevenDaysAgo.toISOString())),
    ])

    // 이번 달 / 지난달 (KST 기준)
    const thisMonthStart = getKSTMonthStart()
    const lastMonthStart = getKSTLastMonthStart()

    const [
        { count: thisMonthUsers },
        { count: thisMonthComments },
        { count: thisMonthReactions },
        { count: thisMonthVotes },
        { count: lastMonthUsers },
        { count: lastMonthComments },
        { count: lastMonthReactions },
        { count: lastMonthVotes },
    ] = await Promise.all([
        supabase.from('users').select('*', { count: 'exact', head: true })
            .eq('is_internal', false).gte('created_at', thisMonthStart.toISOString()),
        fi(supabase.from('comments').select('*', { count: 'exact', head: true })
            .gte('created_at', thisMonthStart.toISOString()).eq('is_hidden', false)),
        fi(supabase.from('reactions').select('*', { count: 'exact', head: true })
            .gte('created_at', thisMonthStart.toISOString())),
        fi(supabase.from('user_votes').select('*', { count: 'exact', head: true })
            .gte('created_at', thisMonthStart.toISOString())),
        supabase.from('users').select('*', { count: 'exact', head: true })
            .eq('is_internal', false)
            .gte('created_at', lastMonthStart.toISOString())
            .lt('created_at', thisMonthStart.toISOString()),
        fi(supabase.from('comments').select('*', { count: 'exact', head: true })
            .gte('created_at', lastMonthStart.toISOString())
            .lt('created_at', thisMonthStart.toISOString()).eq('is_hidden', false)),
        fi(supabase.from('reactions').select('*', { count: 'exact', head: true })
            .gte('created_at', lastMonthStart.toISOString())
            .lt('created_at', thisMonthStart.toISOString())),
        fi(supabase.from('user_votes').select('*', { count: 'exact', head: true })
            .gte('created_at', lastMonthStart.toISOString())
            .lt('created_at', thisMonthStart.toISOString())),
    ])

    const weekOverWeek = {
        newUsers:  delta(newUsers7d  || 0, prevUsers7d  || 0),
        comments:  delta(newComments7d  || 0, prevComments7d  || 0),
        reactions: delta(newReactions7d || 0, prevReactions7d || 0),
        votes:     delta(newVotes7d  || 0, prevVotes7d  || 0),
    }
    const monthOverMonth = {
        newUsers:  delta(thisMonthUsers  || 0, lastMonthUsers  || 0),
        comments:  delta(thisMonthComments  || 0, lastMonthComments  || 0),
        reactions: delta(thisMonthReactions || 0, lastMonthReactions || 0),
        votes:     delta(thisMonthVotes  || 0, lastMonthVotes  || 0),
    }

    // 10. 스파크라인 (최근 14일 일별 집계)
    const [
        { data: sparkUserRows },
        { data: sparkCommentRows },
        { data: sparkReactionRows },
        { data: sparkVoteRows },
    ] = await Promise.all([
        supabase.from('users').select('created_at').eq('is_internal', false).gte('created_at', fourteenDaysAgo.toISOString()),
        fi(supabase.from('comments').select('created_at').gte('created_at', fourteenDaysAgo.toISOString()).eq('is_hidden', false)),
        fi(supabase.from('reactions').select('created_at').gte('created_at', fourteenDaysAgo.toISOString())),
        fi(supabase.from('user_votes').select('created_at').gte('created_at', fourteenDaysAgo.toISOString())),
    ])

    const toDaily = (rows: { created_at: string }[] | null, days = 14): number[] => {
        const buckets = new Array(days).fill(0)
        rows?.forEach(r => {
            const daysAgo = getKSTDayOffset(new Date(r.created_at))
            if (daysAgo >= 0 && daysAgo < days) buckets[days - 1 - daysAgo]++
        })
        return buckets
    }

    const sparklines = {
        newUsers:  toDaily(sparkUserRows),
        comments:  toDaily(sparkCommentRows),
        reactions: toDaily(sparkReactionRows),
        votes:     toDaily(sparkVoteRows),
    }

    // 11. 주차별 진행 상황
    const today = new Date()
    const weeklyProgress: WeeklyProgress[] = (milestones || []).map(milestone => {
        const endDate = new Date(milestone.end_date)
        const startDate = new Date(milestone.start_date)
        const isCurrent = today >= startDate && today <= endDate
        const isPast = today > endDate

        return {
            week: milestone.week_number,
            startDate: milestone.start_date,
            endDate: milestone.end_date,
            targetUsers: milestone.target_users,
            targetComments: milestone.target_comments,
            currentUsers: totalUsers || 0,
            currentComments: totalComments || 0,
            userAchieved: (totalUsers || 0) >= milestone.target_users,
            commentAchieved: (totalComments || 0) >= milestone.target_comments,
            isCurrent,
            isPast,
        }
    })

    return {
        metrics: {
            currentUsers: totalUsers || 0,
            currentActiveIssues: activeIssues || 0,
            currentTotalIssues: totalApprovedIssues || 0,
            currentComments: totalComments,
            currentIssueComments: issueComments || 0,
            currentDiscussionOpinions: discussionOpinions || 0,
            currentReactions: totalReactions || 0,
            currentVotes: totalVotes || 0,

            // 방문자 지표
            todayPageViews,
            todayUniqueVisitors,
            weeklyPageViews: weeklyPageViews || 0,
            weeklyUniqueVisitors,
            monthlyPageViews: monthlyPageViews || 0,
            monthlyUniqueVisitors,
            visitorsBySource,
            channelInboundByPeriod,
            conversionRates,
            conversionRatesByPeriod,
            issueQuality,
            
            monthlyActiveCommenters,
            monthlyActiveReactors,
            monthlyActiveVoters,
            commentParticipation,
            reactionParticipation,
            voteParticipation,
            dailyNewUsers,
            dailyComments,
            dailyReactions,
            weeklyGrowthRate,
            usersLastWeek,
            userProgress,
            commentProgress,
            reactionProgress,
            voteProgress,
            stageTargets,
            weekOverWeek,
            monthOverMonth,
            sparklines,
            todayIssues: todayIssuesCount ?? 0,
            monthlyIssues: monthlyIssuesCount ?? 0,
            todayShortforms,
            monthlyShortforms,
            todayCardNews: todayCardNewsCount ?? 0,
            monthlyCardNews: monthlyCardNewsCount ?? 0,
            todayNewUsers: todayNewUsersCount ?? 0,
            todayComments: todayCommentsCount ?? 0,
            todayReactions: todayReactionsCount ?? 0,
            periodStats,
            targets: {
                users: goal.target_users,
                activeIssues: goal.target_active_issues,
                comments: goal.target_comments,
                reactions: goal.target_reactions,
                votes: goal.target_votes,
                commentParticipation: goal.target_comment_participation,
                reactionParticipation: goal.target_reaction_participation,
                voteParticipation: goal.target_vote_participation,
                dailyNewUsers: goal.target_daily_new_users,
                dailyComments: goal.target_daily_comments,
                dailyReactions: goal.target_daily_reactions,
                dailyIssues: goal.target_daily_issues ?? 3,
                dailyShortformsPerPlatform: goal.target_daily_shortforms_per_platform ?? 3,
                pageviews: goal.target_users * 10,
            },
        },
        weeklyProgress,
        goalInfo: {
            year: goal.period_year,
            month: goal.period_month,
            periodStart: goal.period_start,
            periodEnd: goal.period_end,
            notes: goal.notes,
        }
    }
}

// 기본 메트릭 (목표가 없을 때)
async function getDefaultMetrics(): Promise<KPIMetrics> {
    const zd = { current: 0, previous: 0, delta: 0, deltaPercent: null }
    const { count: totalUsers } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('is_internal', false)

    // 진행중 이슈 (점화 + 논란중) — KPI 목표 기준
    const { count: activeIssues } = await supabase
        .from('issues')
        .select('*', { count: 'exact', head: true })
        .eq('approval_status', 'approved')
        .eq('is_hidden', false)
        .in('status', ['점화', '논란중'])

    // 전체 승인 이슈 (종결 포함) — 참고 지표
    const { count: totalApprovedIssues } = await supabase
        .from('issues')
        .select('*', { count: 'exact', head: true })
        .eq('approval_status', 'approved')
        .eq('is_hidden', false)

    const { count: issueComments } = await supabase
        .from('comments')
        .select('*', { count: 'exact', head: true })
        .not('issue_id', 'is', null)
        .eq('is_hidden', false)

    const { count: discussionOpinions } = await supabase
        .from('comments')
        .select('*', { count: 'exact', head: true })
        .not('discussion_topic_id', 'is', null)
        .eq('is_hidden', false)

    const totalComments = (issueComments || 0) + (discussionOpinions || 0)

    const { count: totalReactions } = await supabase
        .from('reactions')
        .select('*', { count: 'exact', head: true })

    const { count: totalVotes } = await supabase
        .from('user_votes')
        .select('*', { count: 'exact', head: true })

    return {
        currentUsers: totalUsers || 0,
        currentActiveIssues: activeIssues || 0,
        currentTotalIssues: totalApprovedIssues || 0,
        currentComments: totalComments,
        currentIssueComments: issueComments || 0,
        currentDiscussionOpinions: discussionOpinions || 0,
        currentReactions: totalReactions || 0,
        currentVotes: totalVotes || 0,

        // 방문자 지표 (기본값)
        todayPageViews: 0,
        todayUniqueVisitors: 0,
        weeklyPageViews: 0,
        weeklyUniqueVisitors: 0,
        monthlyPageViews: 0,
        monthlyUniqueVisitors: 0,
        visitorsBySource: {
            d1:  { threads: 0, instagram: 0, x: 0, youtube: 0, tiktok: 0, organic: 0 },
            d7:  { threads: 0, instagram: 0, x: 0, youtube: 0, tiktok: 0, organic: 0 },
            d30: { threads: 0, instagram: 0, x: 0, youtube: 0, tiktok: 0, organic: 0 },
        },
        channelInboundByPeriod: {
            d1:  emptyChannelInboundBreakdown(),
            d7:  emptyChannelInboundBreakdown(),
            d30: emptyChannelInboundBreakdown(),
        },
        conversionRates: {
            signupRate: 0,
            voteRate: 0,
            commentRate: 0,
            reactionRate: 0,
        },
        conversionRatesByPeriod: {
            d1: emptyConversionRatePeriod(),
            d7: emptyConversionRatePeriod(),
            d30: emptyConversionRatePeriod(),
        },
        issueQuality: {
            avgVotesPerIssue: 0,
            avgCommentsPerIssue: 0,
            avgReactionsPerIssue: 0,
            topCategory: null,
        },
        
        monthlyActiveCommenters: 0,
        monthlyActiveReactors: 0,
        monthlyActiveVoters: 0,
        commentParticipation: 0,
        reactionParticipation: 0,
        voteParticipation: 0,
        dailyNewUsers: 0,
        dailyComments: 0,
        dailyReactions: 0,
        weeklyGrowthRate: 0,
        usersLastWeek: 0,
        userProgress: 0,
        commentProgress: 0,
        reactionProgress: 0,
        voteProgress: 0,
        stageTargets: { comments: 1, reactions: 1, votes: 1, commentProgress: 0, reactionProgress: 0, voteProgress: 0 },
        weekOverWeek:   { newUsers: zd, comments: zd, reactions: zd, votes: zd },
        monthOverMonth: { newUsers: zd, comments: zd, reactions: zd, votes: zd },
        sparklines: { newUsers: new Array(14).fill(0), comments: new Array(14).fill(0), reactions: new Array(14).fill(0), votes: new Array(14).fill(0) },
        todayIssues: 0,
        monthlyIssues: 0,
        todayShortforms: 0,
        monthlyShortforms: 0,
        todayCardNews: 0,
        monthlyCardNews: 0,
        todayNewUsers: 0,
        todayComments: 0,
        todayReactions: 0,
        periodStats: {
            d1:  { newUsers: 0, comments: 0, reactions: 0, votes: 0, issues: 0, shortforms: 0, cardNews: 0 },
            d7:  { newUsers: 0, comments: 0, reactions: 0, votes: 0, issues: 0, shortforms: 0, cardNews: 0 },
            d30: { newUsers: 0, comments: 0, reactions: 0, votes: 0, issues: 0, shortforms: 0, cardNews: 0 },
        },
        targets: {
            users: 0,
            activeIssues: 0,
            comments: 0,
            reactions: 0,
            votes: 0,
            commentParticipation: 0,
            reactionParticipation: 0,
            voteParticipation: 0,
            dailyNewUsers: 0,
            dailyComments: 0,
            dailyReactions: 0,
            dailyIssues: 3,
            dailyShortformsPerPlatform: 3,
            pageviews: 0,
        }
    }
}
