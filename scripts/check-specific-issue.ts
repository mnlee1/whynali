/**
 * scripts/check-specific-issue.ts
 * 
 * 특정 이슈를 제목으로 검색하여 상세 정보 확인
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false }
})

async function checkIssueByTitle(searchTitle: string) {
    console.log(`\n🔍 이슈 검색: "${searchTitle}"\n`)
    
    // 이슈 검색
    const { data: issues, error } = await supabase
        .from('issues')
        .select('*')
        .ilike('title', `%${searchTitle}%`)
        .order('created_at', { ascending: false })
    
    if (error) {
        console.error('❌ 이슈 조회 에러:', error)
        return
    }
    
    if (!issues || issues.length === 0) {
        console.log('❌ 해당 제목의 이슈를 찾을 수 없습니다.\n')
        return
    }
    
    for (const issue of issues) {
        console.log('━'.repeat(80))
        console.log(`\n📌 이슈: "${issue.title}"`)
        console.log(`   ID: ${issue.id}`)
        console.log(`   카테고리: ${issue.category}`)
        console.log(`   상태: ${issue.status} / ${issue.approval_status}`)
        console.log(`   출처: ${issue.source_track || 'N/A'}`)
        console.log(`   화력: ${issue.heat_index || 0}점`)
        console.log(`   생성: ${new Date(issue.created_at).toLocaleString('ko-KR')}\n`)
        
        // 연결된 뉴스 조회
        const { data: news, count: newsCount } = await supabase
            .from('news_data')
            .select('id, title, source, link, published_at', { count: 'exact' })
            .eq('issue_id', issue.id)
            .order('published_at', { ascending: false })
        
        console.log(`   📰 연결된 뉴스: ${newsCount || 0}건`)
        if (news && news.length > 0) {
            for (const n of news.slice(0, 5)) {
                const timeAgo = Math.floor((Date.now() - new Date(n.published_at).getTime()) / 60000)
                console.log(`      • [${n.source}] ${n.title.substring(0, 60)}... (${timeAgo}분 전)`)
            }
            if (news.length > 5) {
                console.log(`      ... 외 ${news.length - 5}건`)
            }
        }
        
        // 연결된 커뮤니티 조회
        const { data: community, count: communityCount } = await supabase
            .from('community_data')
            .select('id, title, source_site, created_at', { count: 'exact' })
            .eq('issue_id', issue.id)
            .order('created_at', { ascending: false })
        
        console.log(`\n   💬 연결된 커뮤니티: ${communityCount || 0}건`)
        if (community && community.length > 0) {
            for (const c of community.slice(0, 3)) {
                const timeAgo = Math.floor((Date.now() - new Date(c.created_at).getTime()) / 60000)
                console.log(`      • [${c.source_site}] ${c.title.substring(0, 60)}... (${timeAgo}분 전)`)
            }
            if (community.length > 3) {
                console.log(`      ... 외 ${community.length - 3}건`)
            }
        }
        
        // 타임라인 조회
        const { data: timeline, count: timelineCount } = await supabase
            .from('timeline_points')
            .select('id, stage, title, source_url, occurred_at', { count: 'exact' })
            .eq('issue_id', issue.id)
            .order('occurred_at', { ascending: false })
        
        console.log(`\n   📅 타임라인: ${timelineCount || 0}개`)
        if (timeline && timeline.length > 0) {
            for (const t of timeline) {
                const timeStr = new Date(t.occurred_at).toLocaleString('ko-KR')
                if (t.title) {
                    console.log(`      • [${t.stage}] ${timeStr}`)
                    console.log(`        ${t.title.substring(0, 60)}...`)
                } else {
                    console.log(`      • [${t.stage}] ${timeStr}`)
                }
            }
        } else {
            console.log(`      ❌ 타임라인이 없습니다!`)
        }
        
        console.log('\n')
    }
}

// 실행
const searchTitle = process.argv[2] || '잠실'
checkIssueByTitle(searchTitle).then(() => {
    console.log('✅ 검색 완료\n')
    process.exit(0)
})
