/**
 * scripts/check-kpi.ts
 * 
 * 실서버 KPI 현황 조회 스크립트
 * 
 * 실행: npx tsx scripts/check-kpi.ts
 */

import { createClient } from '@supabase/supabase-js'

// 실서버 (whynali-main) 정보
const PRODUCTION_URL = 'https://mdxshmfmcdcotteevwgi.supabase.co'
const PRODUCTION_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(PRODUCTION_URL, PRODUCTION_KEY)

async function checkKPI() {
    console.log('========================================')
    console.log('왜난리 실서버 KPI 현황')
    console.log('조회 시간:', new Date().toLocaleString('ko-KR'))
    console.log('========================================\n')

    try {
        // 1. 기본 현황
        console.log('[1] 기본 현황')
        console.log('----------------------------------------')
        
        const { count: totalUsers } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
        
        const { count: activeIssues } = await supabase
            .from('issues')
            .select('*', { count: 'exact', head: true })
            .eq('approval_status', 'approved')
            .eq('is_hidden', false)
            .in('status', ['점화', '논란중'])

        const { count: totalIssues } = await supabase
            .from('issues')
            .select('*', { count: 'exact', head: true })
            .eq('approval_status', 'approved')
            .eq('is_hidden', false)
        
        const { count: totalComments } = await supabase
            .from('comments')
            .select('*', { count: 'exact', head: true })
            .eq('is_hidden', false)
        
        const { count: totalReactions } = await supabase
            .from('reactions')
            .select('*', { count: 'exact', head: true })
        
        const { count: totalVotes } = await supabase
            .from('user_votes')
            .select('*', { count: 'exact', head: true })
        
        const { data: commentUsers } = await supabase
            .from('comments')
            .select('user_id')
            .eq('is_hidden', false)
        
        const { data: reactionUsers } = await supabase
            .from('reactions')
            .select('user_id')
        
        const uniqueCommentUsers = new Set(commentUsers?.map(u => u.user_id) || []).size
        const uniqueReactionUsers = new Set(reactionUsers?.map(u => u.user_id) || []).size
        
        const commentParticipationRate = totalUsers ? (uniqueCommentUsers / totalUsers * 100).toFixed(1) : '0.0'
        const reactionParticipationRate = totalUsers ? (uniqueReactionUsers / totalUsers * 100).toFixed(1) : '0.0'
        
        console.log(`가입자 수:        ${totalUsers || 0}명`)
        console.log(`진행중 이슈:      ${activeIssues || 0}개 (점화+논란중)`)
        console.log(`전체 이슈:        ${totalIssues || 0}개 (종결 포함)`)
        console.log(`누적 댓글:        ${totalComments || 0}개`)
        console.log(`누적 반응:        ${totalReactions || 0}개`)
        console.log(`누적 투표:        ${totalVotes || 0}회`)
        console.log(`댓글 작성자:      ${uniqueCommentUsers}명`)
        console.log(`반응 참여자:      ${uniqueReactionUsers}명`)
        console.log(`댓글 참여율:      ${commentParticipationRate}%`)
        console.log(`반응 참여율:      ${reactionParticipationRate}%`)
        console.log()
        
        // 2. 최근 7일 신규 가입자
        console.log('[2] 최근 7일 신규 가입자')
        console.log('----------------------------------------')
        
        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
        
        const { data: recentUsers } = await supabase
            .from('users')
            .select('created_at')
            .gte('created_at', sevenDaysAgo.toISOString())
            .order('created_at', { ascending: false })
        
        const usersByDate: Record<string, number> = {}
        recentUsers?.forEach(user => {
            const date = new Date(user.created_at).toISOString().split('T')[0]
            usersByDate[date] = (usersByDate[date] || 0) + 1
        })
        
        const sortedDates = Object.keys(usersByDate).sort().reverse()
        sortedDates.forEach(date => {
            console.log(`${date}: ${usersByDate[date]}명`)
        })
        
        const avgDailySignups = recentUsers ? (recentUsers.length / 7).toFixed(1) : '0.0'
        console.log(`일평균 신규 가입: ${avgDailySignups}명`)
        console.log()
        
        // 3. 최근 7일 활동량
        console.log('[3] 최근 7일 활동량')
        console.log('----------------------------------------')
        
        const { data: recentComments } = await supabase
            .from('comments')
            .select('created_at')
            .gte('created_at', sevenDaysAgo.toISOString())
        
        const { data: recentReactions } = await supabase
            .from('reactions')
            .select('created_at')
            .gte('created_at', sevenDaysAgo.toISOString())
        
        const avgDailyComments = recentComments ? (recentComments.length / 7).toFixed(1) : '0.0'
        const avgDailyReactions = recentReactions ? (recentReactions.length / 7).toFixed(1) : '0.0'
        
        console.log(`일평균 댓글:      ${avgDailyComments}개`)
        console.log(`일평균 반응:      ${avgDailyReactions}개`)
        console.log()
        
        // 4. 이슈당 평균 참여
        console.log('[4] 이슈당 평균 참여')
        console.log('----------------------------------------')
        
        const avgReactionsPerIssue = activeIssues && totalReactions 
            ? (totalReactions / activeIssues).toFixed(1) 
            : '0.0'
        const avgCommentsPerIssue = activeIssues && totalComments 
            ? (totalComments / activeIssues).toFixed(1) 
            : '0.0'
        
        console.log(`평균 반응 수:     ${avgReactionsPerIssue}개/이슈`)
        console.log(`평균 댓글 수:     ${avgCommentsPerIssue}개/이슈`)
        console.log()
        
        // 5. 주간 성장률 계산
        console.log('[5] 주간 성장률')
        console.log('----------------------------------------')
        
        const fourteenDaysAgo = new Date()
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)
        
        const { count: users7DaysAgo } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .lt('created_at', sevenDaysAgo.toISOString())
        
        const { count: users14DaysAgo } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .lt('created_at', fourteenDaysAgo.toISOString())
        
        const weeklyGrowth = users14DaysAgo && users7DaysAgo
            ? (((users7DaysAgo - users14DaysAgo) / users14DaysAgo) * 100).toFixed(1)
            : '0.0'
        
        console.log(`7-14일 전 가입자: ${users14DaysAgo || 0}명`)
        console.log(`0-7일 전 가입자:  ${users7DaysAgo || 0}명`)
        console.log(`현재 가입자:      ${totalUsers || 0}명`)
        console.log(`주간 성장률:      ${weeklyGrowth}%`)
        console.log()
        
        // 6. 서비스 단계 판단
        console.log('[6] 서비스 단계 판단')
        console.log('----------------------------------------')
        
        let stage = ''
        let recommendedGrowth = ''
        
        if (!totalUsers || totalUsers < 10) {
            stage = '런칭 전'
            recommendedGrowth = '지인 초대 집중'
        } else if (totalUsers < 100) {
            stage = '초기 단계 (Phase 1)'
            recommendedGrowth = '주 30-50% 성장'
        } else if (totalUsers < 1000) {
            stage = '성장 초기 (Phase 2)'
            recommendedGrowth = '주 10-20% 성장'
        } else {
            stage = '성장 단계 (Phase 3)'
            recommendedGrowth = '주 5-10% 성장'
        }
        
        console.log(`현재 단계:        ${stage}`)
        console.log(`권장 성장률:      ${recommendedGrowth}`)
        console.log()
        
        // 7. 6월 목표 시뮬레이션
        console.log('[7] 6월 말 목표 시뮬레이션 (8주 후)')
        console.log('----------------------------------------')
        
        const current = totalUsers || 0
        
        if (current < 100) {
            // 초기 단계
            const conservative = Math.round(current * Math.pow(1.20, 8))
            const moderate = Math.round(current * Math.pow(1.35, 8))
            const aggressive = Math.round(current * Math.pow(1.50, 8))
            
            console.log(`보수적 (주 20%):  ${conservative}명 (+${conservative - current}명)`)
            console.log(`적정 (주 35%):    ${moderate}명 (+${moderate - current}명)`)
            console.log(`도전적 (주 50%):  ${aggressive}명 (+${aggressive - current}명)`)
        } else if (current < 1000) {
            // 성장 초기
            const conservative = Math.round(current * Math.pow(1.08, 8))
            const moderate = Math.round(current * Math.pow(1.12, 8))
            const aggressive = Math.round(current * Math.pow(1.18, 8))
            
            console.log(`보수적 (주 8%):   ${conservative}명 (+${conservative - current}명)`)
            console.log(`적정 (주 12%):    ${moderate}명 (+${moderate - current}명)`)
            console.log(`도전적 (주 18%):  ${aggressive}명 (+${aggressive - current}명)`)
        } else {
            // 성장 단계
            const conservative = Math.round(current * Math.pow(1.04, 8))
            const moderate = Math.round(current * Math.pow(1.06, 8))
            const aggressive = Math.round(current * Math.pow(1.08, 8))
            
            console.log(`보수적 (주 4%):   ${conservative}명 (+${conservative - current}명)`)
            console.log(`적정 (주 6%):     ${moderate}명 (+${moderate - current}명)`)
            console.log(`도전적 (주 8%):   ${aggressive}명 (+${aggressive - current}명)`)
        }
        
        console.log()
        console.log('========================================')
        console.log('조회 완료')
        console.log('========================================')
        
    } catch (error: any) {
        console.error('오류 발생:', error.message)
    }
}

checkKPI()
