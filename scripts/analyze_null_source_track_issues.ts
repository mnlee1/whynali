/**
 * scripts/analyze_null_source_track_issues.ts
 * 
 * [null source_track 이슈 상세 분석]
 * 
 * null인 이슈들이 언제, 어떻게 생성되었는지 분석합니다.
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

async function analyzeNullSourceTrack() {
    console.log('═'.repeat(80))
    console.log('source_track null 이슈 상세 분석')
    console.log('═'.repeat(80))
    console.log('')

    // null인 이슈들 조회
    const { data: issues, error } = await supabase
        .from('issues')
        .select('*')
        .is('source_track', null)
        .not('approval_status', 'is', null)
        .neq('approval_status', '병합됨')
        .order('created_at', { ascending: false })

    if (error || !issues || issues.length === 0) {
        console.log('source_track null 이슈가 없습니다.')
        return
    }

    console.log(`총 ${issues.length}개의 null 이슈 발견\n`)

    for (const issue of issues) {
        console.log('─'.repeat(80))
        console.log(`제목: ${issue.title}`)
        console.log(`ID: ${issue.id}`)
        console.log(`생성일: ${issue.created_at}`)
        console.log(`승인 상태: ${issue.approval_status}`)
        console.log(`승인 타입: ${issue.approval_type ?? 'null'}`)
        console.log(`화력: ${issue.heat_index ?? 0}`)

        // 커뮤니티 연결 확인
        const { data: community, count: communityCount } = await supabase
            .from('community_data')
            .select('id, title, source_site', { count: 'exact' })
            .eq('issue_id', issue.id)
            .limit(3)

        console.log(`커뮤니티: ${communityCount ?? 0}건`)
        if (community && community.length > 0) {
            community.forEach(c => {
                console.log(`  - [${c.source_site}] ${c.title.substring(0, 50)}`)
            })
        }

        // 뉴스 연결 확인
        const { data: news, count: newsCount } = await supabase
            .from('news_data')
            .select('id, title, source', { count: 'exact' })
            .eq('issue_id', issue.id)
            .limit(3)

        console.log(`뉴스: ${newsCount ?? 0}건`)
        if (news && news.length > 0) {
            news.forEach(n => {
                console.log(`  - [${n.source}] ${n.title.substring(0, 50)}`)
            })
        }

        // 타임라인 확인
        const { count: timelineCount } = await supabase
            .from('timeline')
            .select('*', { count: 'exact', head: true })
            .eq('issue_id', issue.id)

        console.log(`타임라인: ${timelineCount ?? 0}건`)

        // 판단: 이게 트랙A인지 수동인지
        let likelySource = '알 수 없음'
        if ((communityCount ?? 0) > 0 && (newsCount ?? 0) > 0) {
            likelySource = '트랙A 가능성 높음 (커뮤니티+뉴스 연결)'
        } else if ((newsCount ?? 0) > 0 && (communityCount ?? 0) === 0) {
            likelySource = '수동 생성 가능성 높음 (뉴스만 연결)'
        } else if ((communityCount ?? 0) === 0 && (newsCount ?? 0) === 0) {
            likelySource = '데이터 누락 (연결 실패)'
        }

        console.log(`\n💡 추정: ${likelySource}`)
        console.log('')
    }

    console.log('═'.repeat(80))
    console.log('분석 완료')
    console.log('═'.repeat(80))
    console.log('')
    console.log('권장 조치:')
    console.log('1. 커뮤니티+뉴스가 연결된 이슈 → source_track을 "track_a"로 업데이트')
    console.log('2. 뉴스만 있는 이슈 → source_track을 "manual"로 업데이트')
    console.log('3. 아무것도 연결 안 된 이슈 → 삭제 고려')
}

analyzeNullSourceTrack().catch(console.error)
