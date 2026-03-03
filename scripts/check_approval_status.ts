/**
 * scripts/check_approval_status.ts
 * 
 * 승인 상태 확인
 */

import { supabaseAdmin } from '../lib/supabase/server'

async function main() {
    console.log('=== 승인 상태 통계 ===\n')

    const { data: issues } = await supabaseAdmin
        .from('issues')
        .select('id, title, approval_status, approval_type, heat_index')
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })

    if (!issues) {
        console.log('이슈 없음')
        return
    }

    const stats = {
        pending: issues.filter(i => i.approval_status === '대기').length,
        autoApproved: issues.filter(i => i.approval_status === '승인' && i.approval_type === 'auto').length,
        manualApproved: issues.filter(i => i.approval_status === '승인' && i.approval_type === 'manual').length,
        approvedNoType: issues.filter(i => i.approval_status === '승인' && !i.approval_type).length,
        autoRejected: issues.filter(i => i.approval_status === '반려' && i.approval_type === 'auto').length,
        manualRejected: issues.filter(i => i.approval_status === '반려' && i.approval_type === 'manual').length,
        rejectedNoType: issues.filter(i => i.approval_status === '반려' && !i.approval_type).length,
    }

    console.log(`총 ${issues.length}개 이슈 (최근 7일):\n`)
    console.log(`대기: ${stats.pending}개`)
    console.log(`자동 승인: ${stats.autoApproved}개`)
    console.log(`관리자 승인: ${stats.manualApproved}개`)
    console.log(`승인 (타입 없음): ${stats.approvedNoType}개`)
    console.log(`자동 반려: ${stats.autoRejected}개`)
    console.log(`관리자 반려: ${stats.manualRejected}개`)
    console.log(`반려 (타입 없음): ${stats.rejectedNoType}개`)

    console.log('\n=== 샘플 (각 상태별 5개) ===\n')

    const samples = [
        { status: '대기', type: null },
        { status: '승인', type: 'auto' },
        { status: '승인', type: 'manual' },
        { status: '반려', type: 'auto' },
        { status: '반려', type: 'manual' },
    ]

    for (const sample of samples) {
        const filtered = issues.filter(i => 
            i.approval_status === sample.status && 
            (sample.type ? i.approval_type === sample.type : true)
        ).slice(0, 5)

        const label = sample.type 
            ? `${sample.status} (${sample.type === 'auto' ? '자동' : '관리자'})`
            : sample.status

        console.log(`[${label}] ${filtered.length}개`)
        filtered.forEach(i => {
            console.log(`  - 화력 ${i.heat_index ?? 0}점 | ${i.title.substring(0, 50)}`)
        })
        console.log()
    }
}

main().catch(console.error)
