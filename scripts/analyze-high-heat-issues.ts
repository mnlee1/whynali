import { createClient } from '@supabase/supabase-js'

const PROD_URL = 'https://mdxshmfmcdcotteevwgi.supabase.co'
const PROD_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1keHNobWZtY2Rjb3R0ZWV2d2dpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTYyNzAyMCwiZXhwIjoyMDkxMjAzMDIwfQ.Eo354xCPQxr2XOdxwvQfu0X-E6d9cdm7lqSJP6DkcRM'

const supabase = createClient(PROD_URL, PROD_SERVICE_KEY, {
    auth: { persistSession: false }
})

async function analyzeIssue(issueId: string) {
    const { data: issue, error: issueError } = await supabase
        .from('issues')
        .select('*')
        .eq('id', issueId)
        .single()

    if (issueError || !issue) {
        console.log(`이슈 ${issueId} 조회 실패:`, issueError?.message)
        return
    }

    const { data: communityData } = await supabase
        .from('community_data')
        .select('view_count, comment_count, created_at')
        .eq('issue_id', issueId)

    const { data: newsData } = await supabase
        .from('news_data')
        .select('source, created_at')
        .eq('issue_id', issueId)

    const issueAge = Math.floor((Date.now() - new Date(issue.created_at).getTime()) / (1000 * 60 * 60 * 24))
    
    console.log('\n' + '='.repeat(80))
    console.log(`이슈: ${issue.title}`)
    console.log('='.repeat(80))
    console.log(`생성일: ${issue.created_at} (${issueAge}일 전)`)
    console.log(`카테고리: ${issue.category} | 상태: ${issue.status}`)
    console.log(`현재 DB 화력: ${issue.heat_index}점`)

    // 시간 가중치 함수 (14일 기준 - 수정됨)
    function getTimeWeight(createdAt: string): number {
        const age = Date.now() - new Date(createdAt).getTime()
        const daysSinceCreated = age / (1000 * 60 * 60 * 24)
        if (daysSinceCreated <= 3) return 1.0
        if (daysSinceCreated >= 14) return 0
        return 1.0 - (daysSinceCreated - 3) / 11
    }

    let newCommunityHeat = 0
    if (communityData && communityData.length > 0) {
        let weightedViews = 0
        let weightedComments = 0
        for (const item of communityData) {
            const weight = getTimeWeight(item.created_at)
            weightedViews += (item.view_count ?? 0) * weight
            weightedComments += (item.comment_count ?? 0) * weight
        }
        const avgWeightedViews = weightedViews / communityData.length
        const avgWeightedComments = weightedComments / communityData.length
        const viewScore = Math.min(100, (avgWeightedViews / 5000) * 100)
        const commentScore = Math.min(100, (avgWeightedComments / 500) * 100)
        newCommunityHeat = Math.min(100, Math.max(0, Math.round(viewScore * 0.35 + commentScore * 0.45)))
    }

    let newNewsCredibility = 0
    if (newsData && newsData.length > 0) {
        let weightedCount = 0
        const weightedSources = new Map<string, number>()
        for (const item of newsData) {
            const weight = getTimeWeight(item.created_at)
            weightedCount += weight
            const cur = weightedSources.get(item.source) || 0
            weightedSources.set(item.source, cur + weight)
        }
        const effectiveSources = Array.from(weightedSources.values()).reduce((sum, w) => sum + Math.min(1, w), 0)
        const sourceScore = (Math.min(20, effectiveSources) / 20) * 100
        const countScore = Math.min(100, weightedCount * 2)
        newNewsCredibility = Math.min(100, Math.max(0, Math.round(sourceScore * 0.6 + countScore * 0.4)))
    }

    const ampNew = newCommunityHeat <= 3
        ? 0
        : Math.min(1, Math.sqrt(Math.max(0, newCommunityHeat - 3) / 70))
    const newHeatIndex = Math.round(
        Math.min(100, Math.max(0, newNewsCredibility * (0.3 + 0.7 * ampNew)))
    )

    console.log(`\n재계산 화력 (14일 기준): ${newHeatIndex}점`)
    console.log(`변화: ${issue.heat_index}점 → ${newHeatIndex}점 (${newHeatIndex - issue.heat_index > 0 ? '+' : ''}${newHeatIndex - issue.heat_index}점)`)
    
    if (communityData && communityData.length > 0) {
        console.log(`\n커뮤니티 Heat: ${newCommunityHeat}점`)
    }
    if (newsData && newsData.length > 0) {
        console.log(`뉴스 신뢰도: ${newNewsCredibility}점`)
    }
}

async function main() {
    console.log('화력 추이 높은 이슈 분석 시작\n')
    
    const { data: topIssues, error } = await supabase
        .from('issues')
        .select('id, title, created_at, heat_index, approval_status, status')
        .order('heat_index', { ascending: false })
        .limit(10)
    
    if (error) {
        console.error('이슈 조회 실패:', error)
        return
    }
    
    console.log('조회된 이슈 개수:', topIssues?.length)
    
    console.log('실서버 화력 상위 10개 이슈:')
    topIssues?.forEach((issue, idx) => {
        const age = Math.floor((Date.now() - new Date(issue.created_at).getTime()) / (1000 * 60 * 60 * 24))
        console.log(`${idx + 1}. [${issue.heat_index}점] ${issue.title} (${age}일 전)`)
    })
    
    if (!topIssues || topIssues.length === 0) {
        console.log('분석할 이슈가 없습니다.')
        return
    }
    
    console.log('\n상위 5개 이슈 상세 분석:')
    for (let i = 0; i < Math.min(5, topIssues.length); i++) {
        await analyzeIssue(topIssues[i].id)
    }
}

main()
