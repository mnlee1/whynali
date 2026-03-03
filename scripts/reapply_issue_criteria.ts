/**
 * scripts/reapply_issue_criteria.ts
 * 
 * 기존 이슈에 새로운 기준 재적용
 * - 화력 10점 미만: 자동 반려
 * - 화력 30점 이상 + 허용 카테고리: 자동 승인
 * - 화력 10~29점: 대기 유지 (기존 승인은 유지)
 */

import { supabaseAdmin } from '../lib/supabase/server'
import { calculateHeatIndex } from '../lib/analysis/heat'

const MIN_HEAT_TO_REGISTER = parseInt(process.env.CANDIDATE_MIN_HEAT_TO_REGISTER ?? '10')
const AUTO_APPROVE_THRESHOLD = parseInt(process.env.CANDIDATE_AUTO_APPROVE_THRESHOLD ?? '30')
const AUTO_APPROVE_CATEGORIES = (process.env.AUTO_APPROVE_CATEGORIES ?? '사회,기술,스포츠').split(',')

async function main() {
    console.log('=== 기존 이슈 재평가 시작 ===\n')
    console.log('적용 기준:')
    console.log(`  - 최소 화력: ${MIN_HEAT_TO_REGISTER}점`)
    console.log(`  - 자동 승인 화력: ${AUTO_APPROVE_THRESHOLD}점`)
    console.log(`  - 자동 승인 카테고리: ${AUTO_APPROVE_CATEGORIES.join(', ')}`)
    console.log()

    // 최근 7일 내 모든 이슈 조회
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: issues, error } = await supabaseAdmin
        .from('issues')
        .select('id, title, approval_status, approval_type, category, heat_index, created_at')
        .gte('created_at', since7d)
        .order('created_at', { ascending: false })

    if (error || !issues) {
        console.error('이슈 조회 실패:', error)
        return
    }

    console.log(`대상 이슈: ${issues.length}개\n`)

    const stats = {
        total: issues.length,
        autoRejected: 0,
        autoApproved: 0,
        keptPending: 0,
        keptApproved: 0,
        skipped: 0,
    }

    for (const issue of issues) {
        const heat = issue.heat_index ?? 0
        const wasManuallyApproved = issue.approval_status === '승인' && issue.approval_type === 'manual'
        const wasManuallyRejected = issue.approval_status === '반려' && issue.approval_type === 'manual'

        // 관리자가 직접 승인/반려한 이슈는 건드리지 않음
        if (wasManuallyApproved || wasManuallyRejected) {
            console.log(`[건너뜀] "${issue.title.substring(0, 40)}" - 관리자 ${issue.approval_status}`)
            stats.skipped++
            continue
        }

        let newStatus = issue.approval_status
        let newType = issue.approval_type

        // 화력 10점 미만 → 자동 반려
        if (heat < MIN_HEAT_TO_REGISTER) {
            newStatus = '반려'
            newType = 'auto'
            
            await supabaseAdmin
                .from('issues')
                .update({
                    approval_status: newStatus,
                    approval_type: newType,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', issue.id)

            console.log(`[자동 반려] "${issue.title.substring(0, 40)}" - 화력 ${heat}점`)
            stats.autoRejected++
        }
        // 화력 30점 이상 + 허용 카테고리 → 자동 승인
        else if (heat >= AUTO_APPROVE_THRESHOLD && AUTO_APPROVE_CATEGORIES.includes(issue.category)) {
            // 이미 승인된 경우는 건너뜀
            if (issue.approval_status === '승인') {
                console.log(`[유지] "${issue.title.substring(0, 40)}" - 이미 승인됨 (화력 ${heat}점)`)
                stats.keptApproved++
            } else {
                newStatus = '승인'
                newType = 'auto'
                
                await supabaseAdmin
                    .from('issues')
                    .update({
                        approval_status: newStatus,
                        approval_type: newType,
                        approved_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', issue.id)

                console.log(`[자동 승인] "${issue.title.substring(0, 40)}" - 화력 ${heat}점`)
                stats.autoApproved++
            }
        }
        // 화력 10~29점 → 대기 유지 (기존 승인은 유지)
        else {
            if (issue.approval_status === '승인') {
                console.log(`[유지] "${issue.title.substring(0, 40)}" - 기존 승인 유지 (화력 ${heat}점)`)
                stats.keptApproved++
            } else if (issue.approval_status === '반려') {
                // 화력이 올라간 경우 대기로 복구
                await supabaseAdmin
                    .from('issues')
                    .update({
                        approval_status: '대기',
                        approval_type: null,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', issue.id)

                console.log(`[대기 복구] "${issue.title.substring(0, 40)}" - 화력 ${heat}점 (반려→대기)`)
                stats.keptPending++
            } else {
                console.log(`[대기 유지] "${issue.title.substring(0, 40)}" - 화력 ${heat}점`)
                stats.keptPending++
            }
        }
    }

    console.log('\n=== 재평가 완료 ===')
    console.log(`총 ${stats.total}개 이슈 처리:`)
    console.log(`  - 자동 반려: ${stats.autoRejected}개`)
    console.log(`  - 자동 승인: ${stats.autoApproved}개`)
    console.log(`  - 대기 유지/복구: ${stats.keptPending}개`)
    console.log(`  - 승인 유지: ${stats.keptApproved}개`)
    console.log(`  - 건너뜀 (관리자 처리): ${stats.skipped}개`)
}

main().catch(console.error)
