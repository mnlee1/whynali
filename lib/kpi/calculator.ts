/**
 * lib/kpi/calculator.ts
 * 
 * [KPI 계산 및 분석 유틸리티]
 * 
 * 월별 KPI 목표 대비 현재 상태를 분석하고, 주차별 마일스톤 달성 여부를 계산합니다.
 * 목표는 데이터베이스에서 동적으로 불러옵니다.
 */

import { supabaseAdmin } from '@/lib/supabase/server'

const supabase = supabaseAdmin

interface KPIMetrics {
    // 현재 지표
    currentUsers: number
    currentActiveIssues: number
    currentComments: number
    currentIssueComments: number
    currentDiscussionOpinions: number
    currentReactions: number
    currentVotes: number
    
    // 방문자 지표 (재미나이 제안)
    weeklyPageViews: number              // 최근 7일 페이지뷰
    weeklyUniqueVisitors: number         // 최근 7일 순방문자
    monthlyPageViews: number             // 최근 30일 페이지뷰
    monthlyUniqueVisitors: number        // 최근 30일 순방문자
    
    // 유입 경로별 (재미나이 제안 1번)
    visitorsBySource: {
        threads: number
        instagram: number
        twitter: number
        direct: number
        organic: number
        other: number
    }
    
    // 전환율 (재미나이 제안 2번)
    conversionRates: {
        signupRate: number              // 방문 → 가입 (%)
        voteRate: number                // 방문 → 투표 (%)
        commentRate: number             // 방문 → 댓글 (%)
        reactionRate: number            // 방문 → 반응 (%)
    }
    
    // 이슈 품질 지표 (재미나이 제안 3번)
    issueQuality: {
        avgVotesPerIssue: number
        avgCommentsPerIssue: number
        avgReactionsPerIssue: number
        topCategory: string | null
    }
    
    // 참여율
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
    // 기본값: 현재 연월
    const now = new Date()
    const targetYear = year || now.getFullYear()
    const targetMonth = month || now.getMonth() + 1

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
    // 3. 기본 집계
    const { count: totalUsers } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })

    const { count: activeIssues } = await supabase
        .from('issues')
        .select('*', { count: 'exact', head: true })
        .eq('approval_status', 'approved')
        .eq('is_hidden', false)

    // 이슈 댓글 (issue_id가 있는 것)
    const { count: issueComments } = await supabase
        .from('comments')
        .select('*', { count: 'exact', head: true })
        .not('issue_id', 'is', null)
        .eq('is_hidden', false)

    // 토론 의견 (discussion_topic_id가 있는 것)
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

    // 4. 참여율 계산
    const commentParticipation = totalUsers > 0
        ? ((totalComments || 0) / totalUsers) * 100
        : 0

    const reactionParticipation = totalUsers > 0
        ? ((totalReactions || 0) / totalUsers) * 100
        : 0

    const voteParticipation = totalUsers > 0
        ? ((totalVotes || 0) / totalUsers) * 100
        : 0

    // 5. 최근 7일 데이터
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const { count: newUsers7d } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', sevenDaysAgo.toISOString())

    const { count: newComments7d } = await supabase
        .from('comments')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', sevenDaysAgo.toISOString())
        .eq('is_hidden', false)

    const { count: newReactions7d } = await supabase
        .from('reactions')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', sevenDaysAgo.toISOString())

    // 6. 일평균 계산
    const dailyNewUsers = (newUsers7d || 0) / 7
    const dailyComments = (newComments7d || 0) / 7
    const dailyReactions = (newReactions7d || 0) / 7

    // 7. 방문자 데이터 (재미나이 제안)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

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

    // 최근 30일 방문자
    const { count: monthlyPageViews } = await supabase
        .from('page_views')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', thirtyDaysAgo.toISOString())

    const { data: monthlyVisitors } = await supabase
        .from('page_views')
        .select('session_id')
        .gte('created_at', thirtyDaysAgo.toISOString())
    
    const monthlyUniqueVisitors = new Set(monthlyVisitors?.map(v => v.session_id) || []).size

    // 유입 경로별 방문자 (최근 7일)
    const { data: visitorsBySourceData } = await supabase
        .from('page_views')
        .select('utm_source, session_id')
        .gte('created_at', sevenDaysAgo.toISOString())

    const visitorsBySource = {
        threads: new Set(visitorsBySourceData?.filter(v => v.utm_source === 'threads').map(v => v.session_id) || []).size,
        instagram: new Set(visitorsBySourceData?.filter(v => v.utm_source === 'instagram').map(v => v.session_id) || []).size,
        twitter: new Set(visitorsBySourceData?.filter(v => v.utm_source === 'twitter').map(v => v.session_id) || []).size,
        direct: new Set(visitorsBySourceData?.filter(v => v.utm_source === 'direct' || !v.utm_source).map(v => v.session_id) || []).size,
        organic: new Set(visitorsBySourceData?.filter(v => v.utm_source && ['google', 'naver', 'organic'].includes(v.utm_source)).map(v => v.session_id) || []).size,
        other: new Set(visitorsBySourceData?.filter(v => v.utm_source && !['threads', 'instagram', 'twitter', 'direct', 'google', 'naver', 'organic'].includes(v.utm_source)).map(v => v.session_id) || []).size,
    }

    // 전환율 계산 (최근 7일)
    const { count: signups7d } = await supabase
        .from('conversion_events')
        .select('*', { count: 'exact', head: true })
        .eq('event_type', 'signup')
        .gte('created_at', sevenDaysAgo.toISOString())

    const { count: votes7d } = await supabase
        .from('conversion_events')
        .select('*', { count: 'exact', head: true })
        .eq('event_type', 'vote')
        .gte('created_at', sevenDaysAgo.toISOString())

    const { count: comments7dConv } = await supabase
        .from('conversion_events')
        .select('*', { count: 'exact', head: true })
        .eq('event_type', 'comment')
        .gte('created_at', sevenDaysAgo.toISOString())

    const { count: reactions7dConv } = await supabase
        .from('conversion_events')
        .select('*', { count: 'exact', head: true })
        .eq('event_type', 'reaction')
        .gte('created_at', sevenDaysAgo.toISOString())

    const conversionRates = {
        signupRate: weeklyUniqueVisitors > 0 ? ((signups7d || 0) / weeklyUniqueVisitors) * 100 : 0,
        voteRate: weeklyUniqueVisitors > 0 ? ((votes7d || 0) / weeklyUniqueVisitors) * 100 : 0,
        commentRate: weeklyUniqueVisitors > 0 ? ((comments7dConv || 0) / weeklyUniqueVisitors) * 100 : 0,
        reactionRate: weeklyUniqueVisitors > 0 ? ((reactions7dConv || 0) / weeklyUniqueVisitors) * 100 : 0,
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
        
        const { data: votes } = await supabase
            .from('user_votes')
            .select('issue_id')
            .in('issue_id', issueIds)

        const { data: comments } = await supabase
            .from('comments')
            .select('issue_id')
            .in('issue_id', issueIds)
            .eq('is_hidden', false)

        const { data: reactions } = await supabase
            .from('reactions')
            .select('issue_id')
            .in('issue_id', issueIds)

        // 이슈별 집계
        const issueStatsMap: Record<string, { votes: number, comments: number, reactions: number, category: string }> = {}
        issues!.forEach(issue => {
            issueStatsMap[issue.id] = {
                votes: votes?.filter(v => v.issue_id === issue.id).length || 0,
                comments: comments?.filter(c => c.issue_id === issue.id).length || 0,
                reactions: reactions?.filter(r => r.issue_id === issue.id).length || 0,
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

    // 9. 주차별 진행 상황
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
            currentComments: totalComments,
            currentIssueComments: issueComments || 0,
            currentDiscussionOpinions: discussionOpinions || 0,
            currentReactions: totalReactions || 0,
            currentVotes: totalVotes || 0,
            
            // 방문자 지표
            weeklyPageViews: weeklyPageViews || 0,
            weeklyUniqueVisitors,
            monthlyPageViews: monthlyPageViews || 0,
            monthlyUniqueVisitors,
            visitorsBySource,
            conversionRates,
            issueQuality,
            
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
    const { count: totalUsers } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })

    const { count: activeIssues } = await supabase
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
        currentComments: totalComments,
        currentIssueComments: issueComments || 0,
        currentDiscussionOpinions: discussionOpinions || 0,
        currentReactions: totalReactions || 0,
        currentVotes: totalVotes || 0,
        
        // 방문자 지표 (기본값)
        weeklyPageViews: 0,
        weeklyUniqueVisitors: 0,
        monthlyPageViews: 0,
        monthlyUniqueVisitors: 0,
        visitorsBySource: {
            threads: 0,
            instagram: 0,
            twitter: 0,
            direct: 0,
            organic: 0,
            other: 0,
        },
        conversionRates: {
            signupRate: 0,
            voteRate: 0,
            commentRate: 0,
            reactionRate: 0,
        },
        issueQuality: {
            avgVotesPerIssue: 0,
            avgCommentsPerIssue: 0,
            avgReactionsPerIssue: 0,
            topCategory: null,
        },
        
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
        }
    }
}
