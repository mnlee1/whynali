/**
 * scripts/check-track-a-issues.ts
 * 
 * 트랙 A로 생성된 이슈들의 연결 상태 검토
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkTrackAIssues() {
    console.log('\n🔍 트랙 A 이슈 연결 상태 검토\n')
    
    // 1. 트랙 A 이슈 조회
    const { data: issues, error } = await supabase
        .from('issues')
        .select('id, title, category, status, approval_status, heat_index, created_at')
        .eq('source_track', 'track_a')
        .order('created_at', { ascending: false })
        .limit(10)
    
    if (error) {
        console.error('❌ 이슈 조회 실패:', error)
        return
    }
    
    if (!issues || issues.length === 0) {
        console.log('⚠️  트랙 A 이슈가 없습니다.')
        return
    }
    
    console.log(`📊 트랙 A 이슈: ${issues.length}개\n`)
    
    // 2. 각 이슈별 상세 정보
    for (const issue of issues) {
        console.log('━'.repeat(80))
        console.log(`\n📌 이슈: "${issue.title}"`)
        console.log(`   ID: ${issue.id}`)
        console.log(`   카테고리: ${issue.category}`)
        console.log(`   상태: ${issue.status} / ${issue.approval_status}`)
        console.log(`   화력: ${issue.heat_index ?? 0}점`)
        
        const createdAgo = Math.floor((Date.now() - new Date(issue.created_at).getTime()) / 60000)
        console.log(`   생성: ${createdAgo}분 전`)
        
        // 2-1. 연결된 뉴스
        const { data: news, count: newsCount } = await supabase
            .from('news_data')
            .select('id, title, source, published_at', { count: 'exact' })
            .eq('issue_id', issue.id)
            .order('published_at', { ascending: false })
            .limit(5)
        
        console.log(`\n   📰 연결된 뉴스: ${newsCount ?? 0}건`)
        if (news && news.length > 0) {
            for (const n of news.slice(0, 3)) {
                const newsAgo = Math.floor((Date.now() - new Date(n.published_at).getTime()) / 60000)
                console.log(`      • [${n.source}] ${n.title.substring(0, 50)}... (${newsAgo}분 전)`)
            }
            if ((newsCount ?? 0) > 3) {
                console.log(`      ... 외 ${(newsCount ?? 0) - 3}건`)
            }
        } else {
            console.log(`      ⚠️  연결된 뉴스가 없습니다!`)
        }
        
        // 2-2. 연결된 커뮤니티
        const { data: community, count: communityCount } = await supabase
            .from('community_data')
            .select('id, title, source_site, created_at', { count: 'exact' })
            .eq('issue_id', issue.id)
            .order('created_at', { ascending: false })
            .limit(5)
        
        console.log(`\n   💬 연결된 커뮤니티: ${communityCount ?? 0}건`)
        if (community && community.length > 0) {
            for (const c of community.slice(0, 3)) {
                const commAgo = Math.floor((Date.now() - new Date(c.created_at).getTime()) / 60000)
                console.log(`      • [${c.source_site}] ${c.title.substring(0, 50)}... (${commAgo}분 전)`)
            }
            if ((communityCount ?? 0) > 3) {
                console.log(`      ... 외 ${(communityCount ?? 0) - 3}건`)
            }
        } else {
            console.log(`      ⚠️  연결된 커뮤니티가 없습니다!`)
        }
        
        // 2-3. 타임라인
        const { data: timeline, count: timelineCount } = await supabase
            .from('timeline_points')
            .select('id, stage, occurred_at', { count: 'exact' })
            .eq('issue_id', issue.id)
            .order('occurred_at', { ascending: false })
        
        console.log(`\n   📅 타임라인: ${timelineCount ?? 0}개`)
        if (timeline && timeline.length > 0) {
            for (const t of timeline) {
                console.log(`      • [${t.stage}] ${new Date(t.occurred_at).toLocaleString('ko-KR')}`)
            }
        }
        
        // 2-4. 검토 결과
        console.log(`\n   ✅ 검토 결과:`)
        
        const hasNews = (newsCount ?? 0) > 0
        const hasCommunity = (communityCount ?? 0) > 0
        const hasHeat = (issue.heat_index ?? 0) >= 15
        
        if (!hasNews) {
            console.log(`      ⚠️  뉴스 연결 없음 - 트랙 A는 뉴스 검색 후 이슈를 만들어야 함`)
        }
        
        if (!hasCommunity) {
            console.log(`      ⚠️  커뮤니티 연결 없음 - 급증 감지한 커뮤니티 글이 연결되어야 함`)
        }
        
        if (!hasHeat) {
            console.log(`      ⚠️  화력 부족 (${issue.heat_index ?? 0}점 < 15점) - 삭제되었어야 함`)
        }
        
        if (hasNews && hasCommunity && hasHeat) {
            console.log(`      ✅ 모든 연결 정상!`)
        }
        
        console.log('')
    }
    
    console.log('━'.repeat(80))
    console.log('\n📋 요약\n')
    
    // 3. 전체 통계
    const totalNews = await Promise.all(
        issues.map(i => 
            supabase
                .from('news_data')
                .select('id', { count: 'exact', head: true })
                .eq('issue_id', i.id)
        )
    )
    
    const totalCommunity = await Promise.all(
        issues.map(i => 
            supabase
                .from('community_data')
                .select('id', { count: 'exact', head: true })
                .eq('issue_id', i.id)
        )
    )
    
    const newsCountSum = totalNews.reduce((sum, r) => sum + (r.count ?? 0), 0)
    const communityCountSum = totalCommunity.reduce((sum, r) => sum + (r.count ?? 0), 0)
    
    console.log(`전체 이슈: ${issues.length}개`)
    console.log(`평균 뉴스 연결: ${(newsCountSum / issues.length).toFixed(1)}건/이슈`)
    console.log(`평균 커뮤니티 연결: ${(communityCountSum / issues.length).toFixed(1)}건/이슈`)
    console.log(`평균 화력: ${(issues.reduce((sum, i) => sum + (i.heat_index ?? 0), 0) / issues.length).toFixed(1)}점`)
    
    const noNewsIssues = issues.filter((_, idx) => (totalNews[idx].count ?? 0) === 0).length
    const noCommunityIssues = issues.filter((_, idx) => (totalCommunity[idx].count ?? 0) === 0).length
    const lowHeatIssues = issues.filter(i => (i.heat_index ?? 0) < 15).length
    
    if (noNewsIssues > 0) {
        console.log(`\n⚠️  뉴스 없는 이슈: ${noNewsIssues}개`)
    }
    if (noCommunityIssues > 0) {
        console.log(`⚠️  커뮤니티 없는 이슈: ${noCommunityIssues}개`)
    }
    if (lowHeatIssues > 0) {
        console.log(`⚠️  화력 부족 이슈: ${lowHeatIssues}개`)
    }
    
    if (noNewsIssues === 0 && noCommunityIssues === 0 && lowHeatIssues === 0) {
        console.log(`\n✅ 모든 이슈가 정상적으로 연결되었습니다!`)
    }
    
    console.log('\n')
}

checkTrackAIssues().catch(console.error)
