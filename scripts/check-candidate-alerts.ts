/**
 * scripts/check-candidate-alerts.ts
 * 
 * 이슈 후보 알림 데이터 확인 스크립트
 * 
 * 실행:
 * npx tsx scripts/check-candidate-alerts.ts
 */

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '../.env.local') })

import { evaluateCandidates } from '@/lib/candidate/issue-candidate'

async function main() {
    console.log('='.repeat(60))
    console.log('이슈 후보 알림 데이터 확인')
    console.log('='.repeat(60))
    console.log()

    try {
        const result = await evaluateCandidates()
        
        console.log(`📊 평가 결과:`)
        console.log(`  - 평가된 그룹: ${result.evaluated}개`)
        console.log(`  - 자동 승인: ${result.created}개`)
        console.log(`  - 대기 등록 (알림): ${result.alerts.length}개`)
        console.log()
        
        if (result.alerts.length > 0) {
            console.log('🔔 이슈 후보 알림 목록:')
            console.log()
            
            for (const [index, alert] of result.alerts.entries()) {
                console.log(`[${index + 1}] ${alert.title}`)
                console.log(`    총 건수: ${alert.count}건`)
                console.log(`    뉴스: ${alert.newsCount}건`)
                console.log(`    커뮤니티: ${alert.communityCount}건`)
                console.log(`    합계: ${alert.newsCount + alert.communityCount}건`)
                
                // 기준 체크
                const threshold = parseInt(process.env.CANDIDATE_ALERT_THRESHOLD ?? '5')
                const isValid = alert.count >= threshold
                console.log(`    기준 충족: ${isValid ? '✅' : '❌'} (최소 ${threshold}건 필요)`)
                
                if (!isValid) {
                    console.log(`    ⚠️ 경고: 기준 미달인데 알림에 포함됨!`)
                }
                console.log()
            }
        } else {
            console.log('✅ 현재 이슈 후보 알림 없음')
        }
        
    } catch (error) {
        console.error('❌ 에러:', error)
        process.exit(1)
    }
}

main()
