/**
 * scripts/verify_new_logic.ts
 * 
 * 새로운 로직 검증 (환경변수 + 기존 이슈 분석)
 */

import { supabaseAdmin } from '../lib/supabase/server'

async function main() {
    console.log('=== 1. 환경변수 검증 ===\n')
    
    const config = {
        minNews: parseInt(process.env.CANDIDATE_ALERT_THRESHOLD || '5'),
        minHeatToRegister: parseInt(process.env.CANDIDATE_MIN_HEAT_TO_REGISTER || '10'),
        autoApproveHeat: parseInt(process.env.CANDIDATE_AUTO_APPROVE_THRESHOLD || '30'),
        igniteMinHeat: parseInt(process.env.STATUS_IGNITE_MIN_HEAT || '30'),
        igniteTimeout: parseInt(process.env.STATUS_IGNITE_TIMEOUT_HOURS || '24'),
        debateMinCommunity: parseInt(process.env.STATUS_DEBATE_MIN_COMMUNITY || '1'),
        closedMaxHeat: parseInt(process.env.STATUS_CLOSED_MAX_HEAT || '10'),
    }
    
    console.log('이슈 등록 기준:')
    console.log(`  - 최소 뉴스: ${config.minNews}건`)
    console.log(`  - 최소 화력: ${config.minHeatToRegister}점`)
    
    console.log('\n자동 승인 기준:')
    console.log(`  - 화력: ${config.autoApproveHeat}점 이상`)
    
    console.log('\n상태 전환 기준:')
    console.log(`  - 점화 → 논란중: 화력 ${config.igniteMinHeat}점 + 커뮤니티 ${config.debateMinCommunity}건 + 6시간`)
    console.log(`  - 점화 → 종결: 화력 ${config.closedMaxHeat}점 미만 (6시간 후)`)
    console.log(`  - 점화 타임아웃: ${config.igniteTimeout}시간 후 종결`)

    // 논리 검증
    console.log('\n=== 2. 논리 일관성 검증 ===\n')
    
    const checks = [
        {
            name: '등록 vs 종결 기준',
            valid: config.minHeatToRegister === config.closedMaxHeat,
            message: `등록 ${config.minHeatToRegister}점 vs 종결 <${config.closedMaxHeat}점`,
        },
        {
            name: '자동 승인 vs 논란중 기준',
            valid: config.autoApproveHeat === config.igniteMinHeat,
            message: `자동승인 ${config.autoApproveHeat}점 vs 논란중 ${config.igniteMinHeat}점`,
        },
        {
            name: '중간 구간 처리',
            valid: config.igniteTimeout > 0,
            message: `${config.minHeatToRegister}~${config.autoApproveHeat-1}점 이슈는 ${config.igniteTimeout}시간 후 종결`,
        },
    ]
    
    checks.forEach(check => {
        const icon = check.valid ? '✅' : '❌'
        console.log(`${icon} ${check.name}: ${check.message}`)
    })

    console.log('\n=== 3. 기존 이슈 분석 ===\n')
    
    const { data: recentIssues } = await supabaseAdmin
        .from('issues')
        .select('id, title, approval_status, status, heat_index, created_at')
        .gte('created_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(20)

    if (recentIssues && recentIssues.length > 0) {
        console.log(`최근 48시간 내 이슈 ${recentIssues.length}개 분석:\n`)
        
        const stats = {
            total: recentIssues.length,
            lowHeat: recentIssues.filter(i => (i.heat_index ?? 0) < config.minHeatToRegister).length,
            midHeat: recentIssues.filter(i => {
                const heat = i.heat_index ?? 0
                return heat >= config.minHeatToRegister && heat < config.autoApproveHeat
            }).length,
            highHeat: recentIssues.filter(i => (i.heat_index ?? 0) >= config.autoApproveHeat).length,
            approved: recentIssues.filter(i => i.approval_status === '승인').length,
            pending: recentIssues.filter(i => i.approval_status === '대기').length,
            rejected: recentIssues.filter(i => i.approval_status === '반려').length,
        }

        console.log('화력 분포:')
        console.log(`  - 10점 미만 (등록 불가): ${stats.lowHeat}개`)
        console.log(`  - 10~29점 (대기): ${stats.midHeat}개`)
        console.log(`  - 30점 이상 (자동 승인 대상): ${stats.highHeat}개`)
        
        console.log('\n승인 상태:')
        console.log(`  - 승인: ${stats.approved}개`)
        console.log(`  - 대기: ${stats.pending}개`)
        console.log(`  - 반려: ${stats.rejected}개`)

        // 문제 이슈 찾기
        const issues = []
        recentIssues.forEach(i => {
            const heat = i.heat_index ?? 0
            
            // 10점 미만인데 등록됨
            if (heat < config.minHeatToRegister) {
                issues.push(`❌ "${i.title.substring(0, 40)}" - 화력 ${heat}점인데 등록됨 (최소 ${config.minHeatToRegister}점 필요)`)
            }
            
            // 30점 이상인데 대기
            if (heat >= config.autoApproveHeat && i.approval_status === '대기') {
                issues.push(`⚠️  "${i.title.substring(0, 40)}" - 화력 ${heat}점인데 자동 승인 안됨 (${config.autoApproveHeat}점 이상)`)
            }
        })

        if (issues.length > 0) {
            console.log('\n문제 발견:')
            issues.forEach(issue => console.log(`  ${issue}`))
        } else {
            console.log('\n✅ 모든 이슈가 새로운 기준에 부합합니다.')
        }
    } else {
        console.log('최근 48시간 내 이슈 없음')
    }

    console.log('\n=== 검증 완료 ===')
}

main().catch(console.error)
