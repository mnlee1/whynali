/**
 * scripts/fix_fake_track_a_issues.ts
 * 
 * [가짜 트랙A 이슈 수정]
 * 
 * track_a로 표시되어 있지만 실제로는 트랙A 프로세스를 거치지 않은 이슈들을
 * manual로 재분류합니다.
 * 
 * 트랙A 판단 기준:
 * - 커뮤니티 글이 1개 이상 연결되어야 함
 * - 뉴스가 1개 이상 연결되어야 함
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

async function fixFakeTrackAIssues() {
    console.log('═'.repeat(80))
    console.log('가짜 트랙A 이슈 수정')
    console.log('═'.repeat(80))
    console.log('')

    // track_a로 표시된 이슈들 조회
    const { data: issues, error } = await supabase
        .from('issues')
        .select('*')
        .eq('source_track', 'track_a')
        .not('approval_status', 'is', null)
        .neq('approval_status', '병합됨')
        .order('created_at', { ascending: false })

    if (error || !issues || issues.length === 0) {
        console.log('track_a 이슈가 없습니다.')
        return
    }

    console.log(`총 ${issues.length}개의 track_a 이슈를 검증합니다.\n`)

    const fakeTrackA: string[] = []

    for (const issue of issues) {
        // 커뮤니티 연결 확인
        const { count: communityCount } = await supabase
            .from('community_data')
            .select('*', { count: 'exact', head: true })
            .eq('issue_id', issue.id)

        // 뉴스 연결 확인
        const { count: newsCount } = await supabase
            .from('news_data')
            .select('*', { count: 'exact', head: true })
            .eq('issue_id', issue.id)

        const hasCommunity = (communityCount ?? 0) > 0
        const hasNews = (newsCount ?? 0) > 0

        if (!hasCommunity || !hasNews) {
            fakeTrackA.push(issue.id)
            console.log(`❌ 가짜 track_a: ${issue.title.substring(0, 60)}`)
            console.log(`   커뮤니티: ${communityCount ?? 0}건, 뉴스: ${newsCount ?? 0}건`)
            console.log(`   → manual로 재분류`)
            console.log('')
        } else {
            console.log(`✅ 진짜 track_a: ${issue.title.substring(0, 60)}`)
            console.log(`   커뮤니티: ${communityCount ?? 0}건, 뉴스: ${newsCount ?? 0}건`)
            console.log('')
        }
    }

    if (fakeTrackA.length === 0) {
        console.log('═'.repeat(80))
        console.log('✅ 모든 track_a 이슈가 정상입니다.')
        console.log('═'.repeat(80))
        return
    }

    console.log('─'.repeat(80))
    console.log(`manual로 재분류할 이슈: ${fakeTrackA.length}개`)
    console.log('─'.repeat(80))
    console.log('')

    // manual로 업데이트
    const { error: updateError } = await supabase
        .from('issues')
        .update({ source_track: 'manual' })
        .in('id', fakeTrackA)

    if (updateError) {
        console.error('❌ 업데이트 실패:', updateError)
    } else {
        console.log(`✅ ${fakeTrackA.length}개 이슈를 manual로 재분류 완료`)
    }

    console.log('')
    console.log('═'.repeat(80))
    console.log('작업 완료')
    console.log('═'.repeat(80))
}

fixFakeTrackAIssues().catch(console.error)
