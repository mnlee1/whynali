/**
 * scripts/check_null_source_track_issues.ts
 * 
 * [source_track이 null인 승인된 이슈 조회]
 * 
 * 승인 상태이지만 source_track이 null인 이슈들을 찾아서
 * 관리자 페이지에 표시되지 않는 이슈를 확인합니다.
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

// .env.local 로드
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkNullSourceTrackIssues() {
    console.log('=== source_track이 null인 승인된 이슈 검색 ===\n')

    const { data: issues, error, count } = await supabase
        .from('issues')
        .select('*', { count: 'exact' })
        .eq('approval_status', '승인')
        .is('source_track', null)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error:', error)
        return
    }

    if (!issues || issues.length === 0) {
        console.log('✅ source_track이 null인 승인된 이슈가 없습니다.')
        return
    }

    console.log(`총 ${count}개의 이슈를 찾았습니다.\n`)

    for (const issue of issues) {
        console.log('─'.repeat(80))
        console.log(`ID: ${issue.id}`)
        console.log(`제목: ${issue.title}`)
        console.log(`카테고리: ${issue.category}`)
        console.log(`승인 타입: ${issue.approval_type}`)
        console.log(`화력: ${issue.heat_index}`)
        console.log(`생성일: ${issue.created_at}`)
        console.log('')
    }

    console.log('─'.repeat(80))
    console.log('\n[해결 방법]')
    console.log('이 이슈들은 관리자 페이지에 표시되지 않습니다.')
    console.log('source_track을 "track_a"로 업데이트하려면:')
    console.log('  npx tsx scripts/fix_all_null_source_track.ts')
}

checkNullSourceTrackIssues().catch(console.error)
