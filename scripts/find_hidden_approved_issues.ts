/**
 * scripts/find_hidden_approved_issues.ts
 * 
 * 사이트에는 보이지만 관리자 페이지에는 안 보이는 이슈 찾기
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabaseAdmin = createClient(supabaseUrl, supabaseKey)

async function main() {
    console.log('=== 관리자 페이지에서 누락된 승인 이슈 찾기 ===\n')

    const MIN_HEAT = parseInt(process.env.CANDIDATE_MIN_HEAT_TO_REGISTER ?? '15')

    // 1. 사이트에 노출되는 이슈 (일반 사용자가 보는 것)
    const { data: publicIssues, error: publicError } = await supabaseAdmin
        .from('issues')
        .select('id, title, approval_status, visibility_status, source_track, heat_index, category, created_at')
        .eq('approval_status', '승인')
        .eq('visibility_status', 'visible')
        .is('merged_into_id', null)
        .gte('heat_index', MIN_HEAT)
        .order('created_at', { ascending: false })

    if (publicError) {
        console.error('공개 이슈 조회 에러:', publicError)
        return
    }

    console.log(`[ 1. 사이트 노출 이슈 (일반 사용자용) ]`)
    console.log(`총 ${publicIssues.length}개`)
    console.log()

    // 2. 관리자 페이지에서 보이는 이슈 (기본 필터: track_a)
    // 관리자 페이지는 source_track 필터가 적용됨
    const { data: adminIssuesTrackA, error: adminError } = await supabaseAdmin
        .from('issues')
        .select('id, title, approval_status, source_track, heat_index')
        .not('approval_status', 'is', null)
        .neq('approval_status', '병합됨')
        .or('source_track.eq.track_a,source_track.is.null')
        .order('heat_index', { ascending: false, nullsFirst: false })

    if (adminError) {
        console.error('관리자 이슈 조회 에러:', adminError)
        return
    }

    console.log(`[ 2. 관리자 페이지 이슈 (track_a 필터) ]`)
    console.log(`총 ${adminIssuesTrackA.length}개`)
    console.log()

    // 3. 차이 분석: 공개되었지만 관리자 페이지에 없는 이슈
    const adminIdsSet = new Set(adminIssuesTrackA.map(i => i.id))
    const missingIssues = publicIssues.filter(issue => !adminIdsSet.has(issue.id))

    console.log(`[ 3. 누락된 이슈 분석 ]`)
    console.log()

    if (missingIssues.length === 0) {
        console.log('✅ 누락된 이슈 없음')
        return
    }

    console.log(`⚠️ 사이트에는 보이지만 관리자 페이지에는 안 보이는 이슈: ${missingIssues.length}개`)
    console.log()

    // 4. 누락 이슈 상세 정보
    missingIssues.forEach((issue, idx) => {
        console.log(`${idx + 1}. ${issue.title}`)
        console.log(`   ID: ${issue.id}`)
        console.log(`   approval_status: ${issue.approval_status}`)
        console.log(`   visibility_status: ${issue.visibility_status}`)
        console.log(`   source_track: ${issue.source_track || 'null'}`)
        console.log(`   heat_index: ${issue.heat_index}`)
        console.log(`   category: ${issue.category}`)
        console.log(`   created_at: ${issue.created_at}`)
        console.log()
    })

    // 5. 누락 원인 분석
    console.log('[ 4. 누락 원인 분석 ]')
    console.log()

    const sourceTrackCounts = missingIssues.reduce((acc, issue) => {
        const track = issue.source_track || 'null'
        acc[track] = (acc[track] || 0) + 1
        return acc
    }, {} as Record<string, number>)

    console.log('source_track 별 분포:')
    Object.entries(sourceTrackCounts).forEach(([track, count]) => {
        console.log(`  ${track}: ${count}개`)
    })
    console.log()

    // 6. 해결 방안
    console.log('[ 5. 해결 방안 ]')
    console.log()

    if (sourceTrackCounts['manual'] > 0) {
        console.log('원인: source_track이 "manual"인 이슈가 관리자 필터에서 제외됨')
        console.log()
        console.log('해결 방법 A: 관리자 페이지에서 "전체" 필터 추가')
        console.log('  - source_track 필터를 제거하거나')
        console.log('  - manual 이슈도 포함하도록 수정')
        console.log()
        console.log('해결 방법 B: manual 이슈를 track_a로 재분류')
        console.log('  - 수동 생성 이슈를 별도 탭에 표시')
        console.log()
    }

    if (sourceTrackCounts['null'] > 0) {
        console.log('원인: source_track이 null인 레거시 이슈')
        console.log()
        console.log('해결: 이미 관리자 API에서 null 처리 중')
        console.log('  .or(`source_track.eq.track_a,source_track.is.null`)')
        console.log()
        console.log('⚠️ 하지만 프론트엔드에서 다른 필터를 적용하고 있을 수 있음')
    }

    // 7. 관리자 페이지 코드 확인
    console.log('[ 6. 확인 필요 사항 ]')
    console.log()
    console.log('1. app/admin/issues/page.tsx 에서 API 호출 시')
    console.log('   source_track 파라미터를 어떻게 전달하는지 확인')
    console.log()
    console.log('2. 기본 필터가 "track_a"로 고정되어 있는지 확인')
    console.log()
    console.log('3. "전체" 또는 "manual" 필터 옵션이 있는지 확인')
}

main().catch(console.error)
