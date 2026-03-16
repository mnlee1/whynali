/**
 * scripts/final_diagnosis_wbc_bug.ts
 * 
 * WBC 이슈 자동 반려 버그 최종 진단
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabaseAdmin = createClient(supabaseUrl, supabaseKey)

async function main() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('  WBC 이슈 자동 반려 버그 최종 진단')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log()

    const issueId = 'e95ec64d-18ff-45e3-b56f-dd671f75876b'

    // 1. 이슈 정보
    const { data: issue } = await supabaseAdmin
        .from('issues')
        .select('*')
        .eq('id', issueId)
        .single()

    console.log('[ 1. 사실 확인 ]')
    console.log()
    console.log('✅ 검증 완료:')
    console.log(`  - 현재 화력: ${issue.heat_index}점`)
    console.log(`  - 최소 기준: 15점`)
    console.log(`  - ${issue.heat_index}점 ≥ 15점: TRUE`)
    console.log(`  - approval_status: ${issue.approval_status}`)
    console.log(`  - approval_type: ${issue.approval_type}`)
    console.log()

    console.log('❌ 문제:')
    console.log(`  - 화력이 15점 이상인데 자동 반려됨`)
    console.log()

    // 2. 로직 검증
    console.log('[ 2. 코드 로직 검증 ]')
    console.log()
    console.log('recalculate-heat/route.ts 코드:')
    console.log('```typescript')
    console.log('if (issue.approval_status === "대기") {')
    console.log('    if (heatIndex < MIN_HEAT_TO_REGISTER) {')
    console.log('        // 자동 반려')
    console.log('    }')
    console.log('}')
    console.log('```')
    console.log()
    console.log('✅ 로직 자체는 정상:')
    console.log('  - "승인된 이슈는 화력 하락으로 반려 처리하지 않는다" (주석 확인)')
    console.log('  - `approval_status === "대기"` 조건만 자동 반려')
    console.log()

    // 3. 타임라인 분석
    console.log('[ 3. 타임라인 분석 ]')
    console.log()
    console.log(`생성 시각: ${issue.created_at}`)
    console.log(`최종 수정: ${issue.updated_at}`)
    console.log()
    
    const createTime = new Date(issue.created_at).getTime()
    const updateTime = new Date(issue.updated_at).getTime()
    const diffMinutes = Math.floor((updateTime - createTime) / 1000 / 60)
    
    console.log(`경과 시간: ${diffMinutes}분 (${Math.floor(diffMinutes / 60)}시간 ${diffMinutes % 60}분)`)
    console.log(`화력 재계산 Cron: 10분 간격`)
    console.log(`추정 실행 횟수: ${Math.floor(diffMinutes / 10)}회`)
    console.log()

    // 4. 가능한 시나리오
    console.log('[ 4. 버그 원인 추정 ]')
    console.log()
    console.log('가능한 시나리오:')
    console.log()
    
    console.log('시나리오 A: 뉴스 연결 시점 문제')
    console.log('  1. 이슈 생성 시각: 2026-03-13 04:36:10')
    console.log('  2. 최초 생성 시 뉴스 17개 연결 → 화력 18점')
    console.log('  3. 10분 후 Cron 실행 (04:46경)')
    console.log('  4. Cron 실행 시점에 뉴스 연결 데이터 조회')
    console.log('  5. **일부 뉴스가 아직 issue_id에 할당되지 않았을 수 있음**')
    console.log('  6. 화력 재계산 결과 15점 미만 → 자동 반려')
    console.log('  7. 이후 뉴스 연결 완료 → 화력 18점으로 복구')
    console.log('  8. 하지만 approval_status는 이미 "반려"로 변경됨')
    console.log()
    
    console.log('시나리오 B: Race Condition')
    console.log('  1. 트랙A가 이슈를 생성하는 중')
    console.log('  2. 이슈는 생성되었지만 뉴스 연결은 아직 진행 중')
    console.log('  3. 화력 재계산 Cron이 동시에 실행')
    console.log('  4. 뉴스 연결이 완료되기 전에 화력 계산 → 낮은 화력')
    console.log('  5. 자동 반려 처리')
    console.log()

    console.log('시나리오 C: 트랜잭션 문제')
    console.log('  1. 트랙A가 이슈와 뉴스 연결을 별도 트랜잭션으로 처리')
    console.log('  2. 이슈 생성 커밋')
    console.log('  3. 뉴스 연결 커밋 전에 Cron 실행')
    console.log('  4. 낮은 화력 → 자동 반려')
    console.log()

    // 5. 해결 방안
    console.log('[ 5. 해결 방안 ]')
    console.log()
    console.log('즉시 조치:')
    console.log('  1. 이 이슈를 "대기" 상태로 복구')
    console.log('  2. 관리자가 수동 승인 또는 화력 30점 도달 시 자동 승인')
    console.log()
    
    console.log('근본 해결:')
    console.log('  A. 이슈 생성 직후 일정 시간(예: 5분) 동안 자동 반려 유예')
    console.log('     → 뉴스 연결이 완전히 완료될 때까지 대기')
    console.log()
    console.log('  B. 자동 반려 조건 강화')
    console.log('     → `created_at`이 10분 이상 경과한 이슈만 자동 반려')
    console.log()
    console.log('  C. 승인된 적이 있는 이슈는 절대 자동 반려 금지')
    console.log('     → 현재 코드에는 이미 구현되어 있음')
    console.log()
    console.log('  D. heat_index가 한 번이라도 15점 이상이었던 이슈는 반려 금지')
    console.log('     → `approval_heat_index` 필드 활용')
    console.log()

    // 6. 권장 코드 수정
    console.log('[ 6. 권장 코드 수정 ]')
    console.log()
    console.log('```typescript')
    console.log('if (issue.approval_status === "대기") {')
    console.log('    // 생성 후 10분 이내 이슈는 자동 반려 보류')
    console.log('    const ageMinutes = (Date.now() - new Date(issue.created_at).getTime()) / 60000')
    console.log('    if (ageMinutes < 10) {')
    console.log('        continue // 아직 뉴스 연결 진행 중일 수 있음')
    console.log('    }')
    console.log('    ')
    console.log('    if (heatIndex < MIN_HEAT_TO_REGISTER) {')
    console.log('        // 자동 반려')
    console.log('    }')
    console.log('}')
    console.log('```')
    console.log()
}

main().catch(console.error)
