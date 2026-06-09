/**
 * app/api/admin/kpi/suggest-next-month/route.ts
 *
 * 이번 달 KPI 목표 기준으로 다음달 목표를 ×1.2 계산해 제안합니다.
 * INSERT SQL도 함께 반환하므로 Supabase SQL Editor에 바로 붙여넣을 수 있습니다.
 */

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

export async function GET() {
    const supabase = supabaseAdmin
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1

    // 이번 달 KPI 목표 조회
    const { data: goal } = await supabase
        .from('kpi_goals')
        .select('*')
        .eq('period_year', year)
        .eq('period_month', month)
        .single()

    // 이번 달 누적 실적 조회
    const thisMonthStart = new Date(year, now.getMonth(), 1)
    const [
        { count: actualUsers },
        { count: actualComments },
        { count: actualReactions },
        { count: actualVotes },
    ] = await Promise.all([
        supabase.from('users').select('*', { count: 'exact', head: true })
            .gte('created_at', thisMonthStart.toISOString()),
        supabase.from('comments').select('*', { count: 'exact', head: true })
            .gte('created_at', thisMonthStart.toISOString()).eq('is_hidden', false),
        supabase.from('reactions').select('*', { count: 'exact', head: true })
            .gte('created_at', thisMonthStart.toISOString()),
        supabase.from('user_votes').select('*', { count: 'exact', head: true })
            .gte('created_at', thisMonthStart.toISOString()),
    ])

    // 다음달 날짜 계산
    const nextMonth = month === 12 ? 1 : month + 1
    const nextYear = month === 12 ? year + 1 : year
    const daysInNextMonth = new Date(nextYear, nextMonth, 0).getDate()

    // 목표 기준값: max(실적, 목표) × 1.2 — 실적이 목표를 초과한 경우도 반영
    const baseUsers     = Math.max(actualUsers ?? 0,     goal?.target_users ?? 0)
    const baseComments  = Math.max(actualComments ?? 0,  goal?.target_comments ?? 0)
    const baseReactions = Math.max(actualReactions ?? 0, goal?.target_reactions ?? 0)
    const baseVotes     = Math.max(actualVotes ?? 0,     goal?.target_votes ?? 0)

    const nextUsers     = Math.ceil(baseUsers * 1.2)
    const nextComments  = Math.ceil(baseComments * 1.2)
    const nextReactions = Math.ceil(baseReactions * 1.2)
    const nextVotes     = Math.ceil(baseVotes * 1.2)
    const nextDailyIssues       = goal?.target_daily_issues ?? 3
    const nextDailyShortforms   = goal?.target_daily_shortforms_per_platform ?? 3

    const suggested = {
        target_users:                           nextUsers,
        target_active_issues:                   20,
        target_comments:                        nextComments,
        target_reactions:                       nextReactions,
        target_votes:                           nextVotes,
        target_daily_new_users:                 parseFloat((nextUsers / daysInNextMonth).toFixed(1)),
        target_daily_comments:                  parseFloat((nextComments / daysInNextMonth).toFixed(1)),
        target_daily_reactions:                 parseFloat((nextReactions / daysInNextMonth).toFixed(1)),
        target_daily_issues:                    nextDailyIssues,
        target_daily_shortforms_per_platform:   nextDailyShortforms,
        target_pageviews:                       nextUsers * 10,
    }

    // INSERT SQL 생성
    const pad = (n: number) => String(n).padStart(2, '0')
    const periodStart = `${nextYear}-${pad(nextMonth)}-01`
    const periodEnd   = `${nextYear}-${pad(nextMonth)}-${daysInNextMonth}`

    const sql =
`INSERT INTO kpi_goals (
    period_year, period_month, period_start, period_end,
    target_users, target_active_issues, target_comments, target_reactions, target_votes,
    target_comment_participation, target_reaction_participation, target_vote_participation,
    target_daily_new_users, target_daily_comments, target_daily_reactions,
    target_daily_issues, target_daily_shortforms_per_platform,
    notes, is_active
) VALUES (
    ${nextYear}, ${nextMonth}, '${periodStart}', '${periodEnd}',
    ${suggested.target_users}, ${suggested.target_active_issues}, ${suggested.target_comments}, ${suggested.target_reactions}, ${suggested.target_votes},
    30.0, 50.0, 30.0,
    ${suggested.target_daily_new_users}, ${suggested.target_daily_comments}, ${suggested.target_daily_reactions},
    ${suggested.target_daily_issues}, ${suggested.target_daily_shortforms_per_platform},
    '${nextMonth}월 목표: ${month}월 대비 20% 성장', true
) ON CONFLICT (period_year, period_month) DO UPDATE SET
    target_users = EXCLUDED.target_users,
    target_active_issues = EXCLUDED.target_active_issues,
    target_comments = EXCLUDED.target_comments,
    target_reactions = EXCLUDED.target_reactions,
    target_votes = EXCLUDED.target_votes,
    target_daily_new_users = EXCLUDED.target_daily_new_users,
    target_daily_comments = EXCLUDED.target_daily_comments,
    target_daily_reactions = EXCLUDED.target_daily_reactions,
    target_daily_issues = EXCLUDED.target_daily_issues,
    target_daily_shortforms_per_platform = EXCLUDED.target_daily_shortforms_per_platform,
    notes = EXCLUDED.notes,
    updated_at = NOW();`

    return NextResponse.json({
        currentMonth: { year, month },
        nextMonth: { year: nextYear, month: nextMonth },
        currentActuals: {
            users:     actualUsers ?? 0,
            comments:  actualComments ?? 0,
            reactions: actualReactions ?? 0,
            votes:     actualVotes ?? 0,
        },
        suggested,
        sql,
    })
}
