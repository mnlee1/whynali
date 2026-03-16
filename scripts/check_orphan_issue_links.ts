/**
 * scripts/check_orphan_issue_links.ts
 * 
 * 이슈 연결 상태 확인
 */

import { config } from 'dotenv'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: resolve(__dirname, '../.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function main() {
    const issueId = '8a2e09a8-8fc1-41f5-99d7-3897931fb870'
    
    console.log('이슈 연결 상태 확인\n')
    
    // 이슈 정보
    const { data: issue } = await supabase
        .from('issues')
        .select('*')
        .eq('id', issueId)
        .single()
    
    console.log('=== 이슈 정보 ===')
    console.log(`ID: ${issue?.id}`)
    console.log(`제목: ${issue?.title}`)
    console.log(`Source Track: ${issue?.source_track ?? 'null'}`)
    
    // 연결된 뉴스 확인 (issue_id 필드로)
    const { data: linkedNews, count: linkedNewsCount } = await supabase
        .from('news_data')
        .select('id, title', { count: 'exact' })
        .eq('issue_id', issueId)
    
    console.log(`\n=== 연결된 뉴스 (issue_id로) ===`)
    console.log(`총 ${linkedNewsCount}건`)
    if (linkedNews && linkedNews.length > 0) {
        console.log(`\n첫 5건:`)
        for (const news of linkedNews.slice(0, 5)) {
            console.log(`- ${news.title.substring(0, 60)}...`)
        }
    }
    
    // 연결된 커뮤니티 확인
    const { data: linkedCommunity, count: linkedCommunityCount } = await supabase
        .from('community_data')
        .select('id, title', { count: 'exact' })
        .eq('issue_id', issueId)
    
    console.log(`\n=== 연결된 커뮤니티 (issue_id로) ===`)
    console.log(`총 ${linkedCommunityCount}건`)
    
    // 타임라인 확인
    const { data: timeline, count: timelineCount } = await supabase
        .from('timeline_points')
        .select('*', { count: 'exact' })
        .eq('issue_id', issueId)
        .order('occurred_at', { ascending: true })
    
    console.log(`\n=== 타임라인 ===`)
    console.log(`총 ${timelineCount}개 포인트`)
    if (timeline && timeline.length > 0) {
        for (const point of timeline) {
            console.log(`\n- ${point.title.substring(0, 60)}...`)
            console.log(`  발생: ${new Date(point.occurred_at).toLocaleString('ko-KR')}`)
            console.log(`  단계: ${point.stage}`)
            console.log(`  URL: ${point.source_url}`)
        }
    }
    
    console.log('\n\n=== 분석 결과 ===')
    console.log(`\n이 이슈는:`)
    console.log(`✓ 뉴스 ${linkedNewsCount}건 연결됨`)
    console.log(`✗ 커뮤니티 ${linkedCommunityCount}건 연결됨`)
    console.log(`✓ 타임라인 ${timelineCount}개 포인트 생성됨`)
    console.log(`⚠️ source_track이 null`)
    
    if (linkedNewsCount > 0 && linkedCommunityCount === 0 && timelineCount > 0) {
        console.log(`\n추론:`)
        console.log(`1. 뉴스와 타임라인이 있으므로 완전히 생성된 이슈임`)
        console.log(`2. 커뮤니티가 0건이므로 트랙A가 아님`)
        console.log(`3. source_track이 null이므로 수동 생성(manual)도 아님`)
        console.log(`4. 가능성: 과거 코드 버전에서 생성되었거나, 알 수 없는 경로로 생성됨`)
        console.log(`\n⚠️ 이런 케이스가 다시 발생하지 않도록 코드 수정 필요!`)
    }
}

main().catch(console.error)
