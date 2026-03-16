/**
 * scripts/test_approval_filter.ts
 * 
 * 승인 필터 API 테스트
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
    console.log('='.repeat(80))
    console.log('승인 필터 테스트')
    console.log('='.repeat(80))
    console.log()

    // 1. 승인 전체
    console.log('1. 승인 전체 (approval_status = "승인")')
    console.log('-'.repeat(80))
    const { data: allApproved, error: error1 } = await supabase
        .from('issues')
        .select('id, title, approval_status, approval_type')
        .eq('approval_status', '승인')

    if (error1) {
        console.error('❌ 조회 실패:', error1.message)
    } else {
        console.log(`결과: ${allApproved?.length || 0}개`)
        allApproved?.forEach(i => {
            console.log(`  - [${i.approval_type || 'null'}] ${i.title.substring(0, 50)}`)
        })
    }
    console.log()

    // 2. 자동 승인
    console.log('2. 자동 승인 (approval_status = "승인" AND approval_type = "auto")')
    console.log('-'.repeat(80))
    const { data: autoApproved, error: error2 } = await supabase
        .from('issues')
        .select('id, title, approval_status, approval_type')
        .eq('approval_status', '승인')
        .eq('approval_type', 'auto')

    if (error2) {
        console.error('❌ 조회 실패:', error2.message)
    } else {
        console.log(`결과: ${autoApproved?.length || 0}개`)
        if (autoApproved && autoApproved.length > 0) {
            autoApproved.forEach(i => {
                console.log(`  - [${i.approval_type}] ${i.title.substring(0, 50)}`)
            })
        } else {
            console.log('  (없음)')
        }
    }
    console.log()

    // 3. 관리자 승인
    console.log('3. 관리자 승인 (approval_status = "승인" AND approval_type = "manual")')
    console.log('-'.repeat(80))
    const { data: manualApproved, error: error3 } = await supabase
        .from('issues')
        .select('id, title, approval_status, approval_type')
        .eq('approval_status', '승인')
        .eq('approval_type', 'manual')

    if (error3) {
        console.error('❌ 조회 실패:', error3.message)
    } else {
        console.log(`결과: ${manualApproved?.length || 0}개`)
        manualApproved?.forEach(i => {
            console.log(`  - [${i.approval_type}] ${i.title.substring(0, 50)}`)
        })
    }
    console.log()

    // 4. 윤석준 이슈 직접 확인
    console.log('4. 윤석준 이슈 직접 확인')
    console.log('-'.repeat(80))
    const { data: yoonIssue, error: error4 } = await supabase
        .from('issues')
        .select('id, title, approval_status, approval_type, source_track')
        .ilike('title', '%윤석준%')
        .single()

    if (error4) {
        console.error('❌ 조회 실패:', error4.message)
    } else if (yoonIssue) {
        console.log(`제목: ${yoonIssue.title}`)
        console.log(`approval_status: ${yoonIssue.approval_status}`)
        console.log(`approval_type: ${yoonIssue.approval_type}`)
        console.log(`source_track: ${yoonIssue.source_track}`)
        console.log()
        console.log('필터 결과:')
        console.log(`  - 승인 전체: ${yoonIssue.approval_status === '승인' ? '✅ 포함' : '❌ 제외'}`)
        console.log(`  - 자동 승인: ${yoonIssue.approval_status === '승인' && yoonIssue.approval_type === 'auto' ? '✅ 포함' : '❌ 제외'}`)
        console.log(`  - 관리자 승인: ${yoonIssue.approval_status === '승인' && yoonIssue.approval_type === 'manual' ? '✅ 포함' : '❌ 제외'}`)
    }
    console.log()

    console.log('='.repeat(80))
    console.log('🎯 테스트 완료')
    console.log('='.repeat(80))
}

main().catch(console.error)
