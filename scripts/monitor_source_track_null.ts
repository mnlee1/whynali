/**
 * scripts/monitor_source_track_null.ts
 * 
 * source_track이 null인 이슈를 감지하고 알림
 * 
 * GitHub Actions 스케줄러에서 자동 실행
 */

import { config } from 'dotenv'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: resolve(__dirname, '../.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function main() {
    console.log('[모니터링] source_track null 이슈 확인 시작\n')

    // source_track이 null인 이슈 조회
    const { data: nullIssues, error, count } = await supabase
        .from('issues')
        .select('*', { count: 'exact' })
        .is('source_track', null)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('조회 실패:', error)
        process.exit(1)
    }

    const nullCount = count ?? 0

    if (nullCount === 0) {
        console.log('✅ source_track이 null인 이슈 없음')
        console.log('시스템 정상 작동 중\n')
        process.exit(0)
    }

    // 문제 발견
    console.error(`⚠️ source_track이 null인 이슈 ${nullCount}개 발견!\n`)
    console.error('='.repeat(80))

    for (const issue of nullIssues ?? []) {
        console.error(`\nID: ${issue.id}`)
        console.error(`제목: ${issue.title}`)
        console.error(`카테고리: ${issue.category}`)
        console.error(`승인 상태: ${issue.approval_status}`)
        console.error(`생성일: ${new Date(issue.created_at).toLocaleString('ko-KR')}`)
        console.error(`Source Track: ${issue.source_track ?? 'null'} ⚠️`)

        // 연결 데이터 확인
        const { count: newsCount } = await supabase
            .from('news_data')
            .select('id', { count: 'exact' })
            .eq('issue_id', issue.id)

        const { count: communityCount } = await supabase
            .from('community_data')
            .select('id', { count: 'exact' })
            .eq('issue_id', issue.id)

        console.error(`뉴스: ${newsCount}건, 커뮤니티: ${communityCount}건`)
    }

    console.error('\n' + '='.repeat(80))
    console.error('\n조치 필요:')
    console.error('1. 생성 경로 파악')
    console.error('2. 수동으로 source_track 수정 (manual 또는 track_a)')
    console.error('3. 코드 점검 (모든 이슈 생성 API에 source_track 필수 설정)')
    console.error('\n수정 스크립트:')
    console.error('  npx tsx scripts/fix_all_null_source_track.ts\n')

    // 에러 종료 (GitHub Actions에서 알림 받을 수 있도록)
    process.exit(1)
}

main().catch((error) => {
    console.error('모니터링 스크립트 에러:', error)
    process.exit(1)
})
