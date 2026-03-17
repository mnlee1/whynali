/**
 * scripts/check-ok-taecyeon-issue.ts
 * 
 * 옥택연 이슈 상태 확인
 */

import dotenv from 'dotenv'
import { resolve } from 'path'
dotenv.config({ path: resolve(__dirname, '../.env.local') })

import { supabaseAdmin } from '../lib/supabase/server'

async function checkOkTaecyeon() {
    console.log('=== 옥택연 이슈 확인 ===\n')

    // 1. 옥택연 관련 이슈 찾기
    const { data: issues, error } = await supabaseAdmin
        .from('issues')
        .select('*')
        .or('title.ilike.%옥택연%,title.ilike.%택연%')
        .order('created_at', { ascending: false })

    if (error || !issues || issues.length === 0) {
        console.log('옥택연 관련 이슈 없음')
        return
    }

    console.log(`총 ${issues.length}개 이슈 발견\n`)

    for (const issue of issues) {
        console.log(`\n제목: "${issue.title}"`)
        console.log(`  ID: ${issue.id}`)
        console.log(`  상태: ${issue.approval_status}`)
        console.log(`  타입: ${issue.approval_type}`)
        console.log(`  카테고리: ${issue.category}`)
        console.log(`  화력: ${issue.heat_index}`)
        console.log(`  생성: ${new Date(issue.created_at).toLocaleString('ko-KR')}`)
        console.log(`  업데이트: ${new Date(issue.updated_at).toLocaleString('ko-KR')}`)

        // 뉴스 데이터 확인
        const { data: newsData } = await supabaseAdmin
            .from('news_data')
            .select('id, title, created_at')
            .eq('issue_id', issue.id)
            .order('created_at', { ascending: false })

        console.log(`  뉴스: ${newsData?.length || 0}건`)
        if (newsData && newsData.length > 0) {
            console.log(`    최근 뉴스:`)
            newsData.slice(0, 3).forEach(news => {
                console.log(`      - ${news.title}`)
                console.log(`        (${new Date(news.created_at).toLocaleString('ko-KR')})`)
            })
        }

        // 커뮤니티 데이터 확인
        const { data: communityData } = await supabaseAdmin
            .from('community_data')
            .select('id, title, created_at')
            .eq('issue_id', issue.id)
            .order('created_at', { ascending: false })

        console.log(`  커뮤니티: ${communityData?.length || 0}건`)
        if (communityData && communityData.length > 0) {
            console.log(`    최근 커뮤니티:`)
            communityData.slice(0, 3).forEach(comm => {
                console.log(`      - ${comm.title}`)
                console.log(`        (${new Date(comm.created_at).toLocaleString('ko-KR')})`)
            })
        }

        // 점화 상태인 경우 ignite_conditions 확인
        if (issue.approval_status === '점화') {
            const { data: igniteData } = await supabaseAdmin
                .from('ignite_conditions')
                .select('*')
                .eq('issue_id', issue.id)
                .maybeSingle()

            console.log(`\n  [점화 조건 확인]`)
            if (igniteData) {
                console.log(`    급증 감지: ${igniteData.burst_detected ? '✅' : '❌'}`)
                console.log(`    급증 점수: ${igniteData.burst_score}`)
                console.log(`    급증 이유: ${igniteData.burst_reason}`)
                console.log(`    뉴스 증가율: ${igniteData.news_growth_rate}%`)
                console.log(`    커뮤니티 증가율: ${igniteData.community_growth_rate}%`)
                console.log(`    점화 시각: ${new Date(igniteData.ignited_at).toLocaleString('ko-KR')}`)
            } else {
                console.log(`    ignite_conditions 데이터 없음 ❌`)
            }
        }

        // 최근 3시간 뉴스 확인
        const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
        const { data: recentNews } = await supabaseAdmin
            .from('news_data')
            .select('id')
            .eq('issue_id', issue.id)
            .gte('created_at', threeHoursAgo)

        console.log(`\n  [최근 3시간 활동]`)
        console.log(`    뉴스: ${recentNews?.length || 0}건`)

        const { data: recentCommunity } = await supabaseAdmin
            .from('community_data')
            .select('id')
            .eq('issue_id', issue.id)
            .gte('created_at', threeHoursAgo)

        console.log(`    커뮤니티: ${recentCommunity?.length || 0}건`)

        // 점화 해제 조건 체크
        console.log(`\n  [점화 해제 조건 체크]`)
        const recentTotal = (recentNews?.length || 0) + (recentCommunity?.length || 0)
        console.log(`    최근 3시간 총 건수: ${recentTotal}건`)
        console.log(`    점화 해제 임계값: < 5건`)
        
        if (recentTotal < 5) {
            console.log(`    ⚠️  점화 해제 조건 충족! (${recentTotal} < 5)`)
        } else {
            console.log(`    ✅ 점화 유지 (${recentTotal} >= 5)`)
        }
    }
}

checkOkTaecyeon().catch(console.error)
