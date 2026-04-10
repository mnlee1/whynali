/**
 * scripts/debug-page-data.ts
 * 
 * 메인 페이지와 카테고리 페이지에서 실제로 보이는 데이터 디버그
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabaseAdmin = createClient(supabaseUrl, supabaseKey)

const MIN_HEAT = parseInt(process.env.CANDIDATE_MIN_HEAT_TO_REGISTER ?? '8')

async function main() {
    console.log('=== 페이지 데이터 디버깅 ===\n')
    console.log(`MIN_HEAT: ${MIN_HEAT}\n`)

    // 1. 메인 페이지 - HotIssueHighlight용 (heat 상위 30개)
    console.log('[ 1. 메인 페이지 - 히어로 캐러셀 (heat 상위 30개) ]')
    const { data: hotIssues, error: hotError } = await supabaseAdmin
        .from('issues')
        .select('*')
        .eq('approval_status', '승인')
        .eq('visibility_status', 'visible')
        .is('merged_into_id', null)
        .order('heat_index', { ascending: false, nullsFirst: false })
        .limit(30)

    if (hotError) {
        console.error('에러:', hotError)
    } else {
        console.log(`조회된 이슈: ${hotIssues?.length ?? 0}개`)
        if (hotIssues && hotIssues.length > 0) {
            console.log('상위 5개:')
            hotIssues.slice(0, 5).forEach((issue, idx) => {
                console.log(`  ${idx + 1}. ${issue.title} (heat: ${issue.heat_index})`)
            })
        }
    }

    // 2. 메인 페이지 - 최신순 10개
    console.log('\n[ 2. 메인 페이지 - 전체 이슈 목록 (최신순 10개) ]')
    const { data: latestIssues, count: latestCount, error: latestError } = await supabaseAdmin
        .from('issues')
        .select('*', { count: 'exact' })
        .eq('approval_status', '승인')
        .eq('visibility_status', 'visible')
        .is('merged_into_id', null)
        .order('created_at', { ascending: false })
        .range(0, 9)

    if (latestError) {
        console.error('에러:', latestError)
    } else {
        console.log(`조회된 이슈: ${latestIssues?.length ?? 0}개 (전체: ${latestCount}개)`)
        if (latestIssues && latestIssues.length > 0) {
            console.log('목록:')
            latestIssues.forEach((issue, idx) => {
                console.log(`  ${idx + 1}. ${issue.title} (heat: ${issue.heat_index})`)
            })
        }
    }

    // 3. 스포츠 카테고리 페이지
    console.log('\n[ 3. 스포츠 카테고리 페이지 (MIN_HEAT 필터 적용) ]')
    const { data: sportsIssues, count: sportsCount, error: sportsError } = await supabaseAdmin
        .from('issues')
        .select('*', { count: 'exact' })
        .eq('approval_status', '승인')
        .eq('visibility_status', 'visible')
        .is('merged_into_id', null)
        .gte('heat_index', MIN_HEAT)
        .eq('category', '스포츠')
        .order('created_at', { ascending: false })
        .range(0, 19)

    if (sportsError) {
        console.error('에러:', sportsError)
    } else {
        console.log(`조회된 이슈: ${sportsIssues?.length ?? 0}개 (전체: ${sportsCount}개)`)
        if (sportsIssues && sportsIssues.length > 0) {
            console.log('목록:')
            sportsIssues.forEach((issue, idx) => {
                console.log(`  ${idx + 1}. ${issue.title} (heat: ${issue.heat_index})`)
            })
        }
    }

    // 4. API route 시뮬레이션 (MIN_HEAT 필터 없음)
    console.log('\n[ 4. API Route 시뮬레이션 - /api/issues?category=스포츠 ]')
    const { data: apiIssues, count: apiCount, error: apiError } = await supabaseAdmin
        .from('issues')
        .select('*', { count: 'exact' })
        .eq('approval_status', '승인')
        .eq('visibility_status', 'visible')
        .is('merged_into_id', null)
        .eq('category', '스포츠')
        .order('created_at', { ascending: false })
        .range(0, 19)

    if (apiError) {
        console.error('에러:', apiError)
    } else {
        console.log(`조회된 이슈: ${apiIssues?.length ?? 0}개 (전체: ${apiCount}개)`)
        if (apiIssues && apiIssues.length > 0) {
            console.log('목록:')
            apiIssues.forEach((issue, idx) => {
                console.log(`  ${idx + 1}. ${issue.title} (heat: ${issue.heat_index})`)
            })
        }
    }

    // 5. 환경변수 확인
    console.log('\n[ 5. 환경변수 확인 ]')
    console.log(`NEXT_PUBLIC_SUPABASE_URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL ? '설정됨' : '미설정'}`)
    console.log(`SUPABASE_SERVICE_ROLE_KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? '설정됨' : '미설정'}`)
    console.log(`CANDIDATE_MIN_HEAT_TO_REGISTER: ${process.env.CANDIDATE_MIN_HEAT_TO_REGISTER ?? '기본값(8)'}`)
}

main().catch(console.error)
