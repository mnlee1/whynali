/**
 * scripts/fix_all_null_source_track.ts
 * 
 * [모든 null source_track 일괄 수정]
 * 
 * source_track이 null인 모든 승인된 이슈를 'track_a'로 업데이트합니다.
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

// .env.local 로드
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

async function fixAllNullSourceTrack() {
    console.log('=== 모든 null source_track 일괄 수정 ===\n')

    // 1. 먼저 수정 대상 이슈 목록 확인
    const { data: issues, error: fetchError } = await supabase
        .from('issues')
        .select('id, title, created_at')
        .eq('approval_status', '승인')
        .is('source_track', null)

    if (fetchError) {
        console.error('❌ 조회 실패:', fetchError)
        return
    }

    if (!issues || issues.length === 0) {
        console.log('✅ 수정할 이슈가 없습니다.')
        return
    }

    console.log(`수정 대상: ${issues.length}개 이슈\n`)
    issues.forEach((issue, idx) => {
        console.log(`${idx + 1}. ${issue.title} (${issue.created_at})`)
    })

    console.log('\n업데이트를 시작합니다...\n')

    // 2. 일괄 업데이트
    const { data, error: updateError } = await supabase
        .from('issues')
        .update({ source_track: 'track_a' })
        .eq('approval_status', '승인')
        .is('source_track', null)
        .select('id')

    if (updateError) {
        console.error('❌ 업데이트 실패:', updateError)
        return
    }

    console.log(`✅ ${data?.length ?? 0}개 이슈의 source_track을 'track_a'로 업데이트 완료`)
    console.log('\n이제 관리자 페이지(/admin/issues)에서 해당 이슈들을 확인할 수 있습니다.')
}

fixAllNullSourceTrack().catch(console.error)
