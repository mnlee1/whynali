/**
 * scripts/fix_all_source_track_automatic.ts
 * 
 * [source_track 자동 수정]
 * 
 * 연결된 데이터를 기반으로 source_track을 자동으로 올바르게 설정합니다:
 * - 커뮤니티 + 뉴스 연결 → track_a
 * - 뉴스만 연결 → manual
 * - 아무것도 없음 → 삭제 예정으로 표시
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

async function fixAllSourceTrack() {
    console.log('═'.repeat(80))
    console.log('source_track 자동 수정')
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
        console.log('✅ source_track null 이슈가 없습니다.')
        return
    }

    console.log(`총 ${issues.length}개의 null 이슈를 처리합니다.\n`)

    const toTrackA: string[] = []
    const toManual: string[] = []
    const toDelete: string[] = []

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

        if ((communityCount ?? 0) > 0 && (newsCount ?? 0) > 0) {
            // 커뮤니티 + 뉴스 → track_a
            toTrackA.push(issue.id)
            console.log(`✓ track_a: ${issue.title.substring(0, 60)} (커뮤:${communityCount}, 뉴스:${newsCount})`)
        } else if ((newsCount ?? 0) > 0 && (communityCount ?? 0) === 0) {
            // 뉴스만 → manual
            toManual.push(issue.id)
            console.log(`✓ manual:  ${issue.title.substring(0, 60)} (뉴스:${newsCount})`)
        } else {
            // 아무것도 없음 → 삭제 예정
            toDelete.push(issue.id)
            console.log(`✗ 삭제:    ${issue.title.substring(0, 60)} (데이터 없음)`)
        }
    }

    console.log('')
    console.log('─'.repeat(80))
    console.log(`track_a로 업데이트: ${toTrackA.length}개`)
    console.log(`manual로 업데이트: ${toManual.length}개`)
    console.log(`삭제 예정: ${toDelete.length}개`)
    console.log('─'.repeat(80))
    console.log('')

    // track_a 업데이트
    if (toTrackA.length > 0) {
        const { error: updateError } = await supabase
            .from('issues')
            .update({ source_track: 'track_a' })
            .in('id', toTrackA)

        if (updateError) {
            console.error('❌ track_a 업데이트 실패:', updateError)
        } else {
            console.log(`✅ ${toTrackA.length}개 이슈를 track_a로 업데이트 완료`)
        }
    }

    // manual 업데이트
    if (toManual.length > 0) {
        const { error: updateError } = await supabase
            .from('issues')
            .update({ source_track: 'manual' })
            .in('id', toManual)

        if (updateError) {
            console.error('❌ manual 업데이트 실패:', updateError)
        } else {
            console.log(`✅ ${toManual.length}개 이슈를 manual로 업데이트 완료`)
        }
    }

    // 삭제 예정 이슈는 우선 visibility_status를 hidden으로 변경
    if (toDelete.length > 0) {
        console.log('')
        console.log('⚠️  데이터 없는 이슈들은 삭제하지 않고 숨김 처리합니다.')
        console.log('   (필요시 수동으로 삭제하세요)')
        
        const { error: updateError } = await supabase
            .from('issues')
            .update({ 
                visibility_status: 'hidden',
                source_track: 'manual'  // 일단 manual로 표시
            })
            .in('id', toDelete)

        if (updateError) {
            console.error('❌ 숨김 처리 실패:', updateError)
        } else {
            console.log(`✅ ${toDelete.length}개 이슈를 숨김 처리 완료`)
        }
    }

    console.log('')
    console.log('═'.repeat(80))
    console.log('작업 완료')
    console.log('═'.repeat(80))
}

fixAllSourceTrack().catch(console.error)
