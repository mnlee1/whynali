/**
 * scripts/check_issues_without_community.ts
 * 
 * 커뮤니티 글이 연결되지 않은 이슈 확인
 */

import { config } from 'dotenv'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: resolve(__dirname, '../.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function main() {
    console.log('커뮤니티 글이 연결되지 않은 이슈 확인 중...\n')

    // 모든 이슈 조회
    const { data: issues, error } = await supabase
        .from('issues')
        .select('id, title, category, status, approval_status, source_track, created_at, heat_index')
        .order('created_at', { ascending: false })

    if (error || !issues) {
        console.error('이슈 조회 실패:', error)
        return
    }

    console.log(`전체 이슈: ${issues.length}개\n`)

    // 각 이슈별 커뮤니티 글 개수 확인
    const issuesWithoutCommunity: any[] = []

    for (const issue of issues) {
        const { data: communityPosts, error: communityError } = await supabase
            .from('community_data')
            .select('id')
            .eq('issue_id', issue.id)

        if (communityError) {
            console.error(`이슈 ${issue.id} 커뮤니티 글 조회 실패:`, communityError)
            continue
        }

        const communityCount = communityPosts?.length ?? 0

        if (communityCount === 0) {
            issuesWithoutCommunity.push({
                ...issue,
                communityCount: 0
            })
        }
    }

    console.log(`\n커뮤니티 글 0건 이슈: ${issuesWithoutCommunity.length}개\n`)
    console.log('='.repeat(100))

    // source_track별 분류
    const bySourceTrack: Record<string, any[]> = {}

    for (const issue of issuesWithoutCommunity) {
        const track = issue.source_track ?? 'null'
        if (!bySourceTrack[track]) {
            bySourceTrack[track] = []
        }
        bySourceTrack[track].push(issue)
    }

    // source_track별 출력
    for (const [track, trackIssues] of Object.entries(bySourceTrack)) {
        console.log(`\n[${track}] ${trackIssues.length}개`)
        console.log('-'.repeat(100))

        for (const issue of trackIssues) {
            const createdDate = new Date(issue.created_at).toLocaleString('ko-KR', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            })

            console.log(`\nID: ${issue.id}`)
            console.log(`제목: ${issue.title}`)
            console.log(`카테고리: ${issue.category}`)
            console.log(`상태: ${issue.status}`)
            console.log(`승인: ${issue.approval_status}`)
            console.log(`화력: ${issue.heat_index ?? 'N/A'}`)
            console.log(`생성일: ${createdDate}`)
            console.log(`Source Track: ${issue.source_track ?? 'null'}`)

            // 뉴스 개수도 확인
            const { data: newsData } = await supabase
                .from('news_data')
                .select('id')
                .eq('issue_id', issue.id)

            const newsCount = newsData?.length ?? 0
            console.log(`연결된 뉴스: ${newsCount}건`)
            console.log(`연결된 커뮤니티: 0건`)
        }
    }

    // 트랙A만 별도 분석
    console.log('\n' + '='.repeat(100))
    console.log('\n[트랙A 상세 분석]')
    console.log('-'.repeat(100))

    const trackAIssues = issuesWithoutCommunity.filter(i => i.source_track === 'track_a')

    if (trackAIssues.length > 0) {
        console.log(`\n⚠️ 트랙A인데 커뮤니티 글이 0건인 이슈: ${trackAIssues.length}개`)
        console.log('\n이는 현재 코드 로직(839-844번 라인)과 모순됩니다.')
        console.log('가능한 원인:')
        console.log('1. 커뮤니티 필터링 로직이 추가되기 전에 생성된 이슈')
        console.log('2. 커뮤니티 글이 나중에 삭제됨')
        console.log('3. 코드 버그')

        // 가장 최근 생성된 트랙A 이슈 확인
        const latestTrackA = trackAIssues.sort((a, b) => 
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0]

        console.log(`\n가장 최근 트랙A 이슈 (커뮤니티 0건):`)
        console.log(`- 생성일: ${new Date(latestTrackA.created_at).toLocaleString('ko-KR')}`)
        console.log(`- 제목: ${latestTrackA.title}`)
    } else {
        console.log('\n✅ 트랙A 이슈는 모두 커뮤니티 글이 연결되어 있습니다.')
    }

    // 최근 7일 이내 생성된 이슈 중 커뮤니티 0건인 것들
    console.log('\n' + '='.repeat(100))
    console.log('\n[최근 7일 내 생성된 커뮤니티 0건 이슈]')
    console.log('-'.repeat(100))

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const recentIssuesWithoutCommunity = issuesWithoutCommunity.filter(i => 
        new Date(i.created_at) > sevenDaysAgo
    )

    if (recentIssuesWithoutCommunity.length > 0) {
        console.log(`\n최근 7일: ${recentIssuesWithoutCommunity.length}개`)
        for (const issue of recentIssuesWithoutCommunity) {
            console.log(`\n- ${issue.title}`)
            console.log(`  Track: ${issue.source_track ?? 'null'}, 생성: ${new Date(issue.created_at).toLocaleString('ko-KR')}`)
        }
    } else {
        console.log('\n✅ 최근 7일 이내에는 커뮤니티 0건 이슈가 없습니다.')
    }
}

main().catch(console.error)
