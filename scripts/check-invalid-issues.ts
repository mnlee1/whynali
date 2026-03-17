/**
 * scripts/check-invalid-issues.ts
 * 
 * 등록 조건을 충족하지 못한 이슈들을 검증
 * - 화력 15점 미만 이슈
 * - 기타 조건 미달 이슈
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MIN_HEAT_TO_REGISTER = parseInt(process.env.CANDIDATE_MIN_HEAT_TO_REGISTER || '15')

async function checkInvalidIssues() {
    console.log('='.repeat(60))
    console.log('이슈 등록 조건 검증')
    console.log('='.repeat(60))
    console.log()
    console.log(`등록 기준: 화력 ${MIN_HEAT_TO_REGISTER}점 이상`)
    console.log()

    // 1. 화력 15점 미만 이슈 조회
    const { data: lowHeatIssues, error } = await supabase
        .from('issues')
        .select('id, title, category, approval_status, status, heat_index, created_heat_index, created_at')
        .lt('heat_index', MIN_HEAT_TO_REGISTER)
        .order('heat_index', { ascending: true })

    if (error) {
        console.error('❌ 조회 실패:', error)
        return
    }

    if (!lowHeatIssues || lowHeatIssues.length === 0) {
        console.log('✅ 화력 15점 미만 이슈 없음 (모든 이슈가 조건 충족)')
        return
    }

    console.log(`⚠️ 화력 ${MIN_HEAT_TO_REGISTER}점 미만 이슈 ${lowHeatIssues.length}건 발견`)
    console.log()

    // 2. 승인 상태별 분류
    const byApprovalStatus: Record<string, typeof lowHeatIssues> = {
        '대기': [],
        '승인': [],
        '반려': [],
        '병합됨': []
    }

    lowHeatIssues.forEach(issue => {
        const status = issue.approval_status || 'null'
        if (!byApprovalStatus[status]) {
            byApprovalStatus[status] = []
        }
        byApprovalStatus[status].push(issue)
    })

    // 3. 승인 상태별 출력
    for (const [status, issues] of Object.entries(byApprovalStatus)) {
        if (issues.length === 0) continue

        console.log(`📊 [${status}] ${issues.length}건`)
        console.log('-'.repeat(60))

        issues.forEach((issue, idx) => {
            const currentHeat = issue.heat_index ?? 0
            const createdHeat = issue.created_heat_index ?? currentHeat
            const heatDiff = currentHeat - createdHeat

            console.log(`${idx + 1}. ${issue.title}`)
            console.log(`   카테고리: ${issue.category} | 이슈 상태: ${issue.status || 'null'}`)
            console.log(`   현재 화력: ${currentHeat.toFixed(1)}점 | 등록 시: ${createdHeat.toFixed(1)}점 | 변화: ${heatDiff > 0 ? '+' : ''}${heatDiff.toFixed(1)}점`)
            console.log(`   생성일: ${new Date(issue.created_at).toLocaleString('ko-KR')}`)
            console.log()
        })
    }

    // 4. 문제 분석
    console.log('🔍 분석 결과')
    console.log('-'.repeat(60))

    const approvedLowHeat = byApprovalStatus['승인'] || []
    const pendingLowHeat = byApprovalStatus['대기'] || []

    if (approvedLowHeat.length > 0) {
        console.log(`❌ 승인된 저화력 이슈: ${approvedLowHeat.length}건`)
        console.log(`   → 화력 ${MIN_HEAT_TO_REGISTER}점 미만인데 승인됨`)
        console.log(`   → 자동 승인 로직 또는 관리자 수동 승인 문제`)
    }

    if (pendingLowHeat.length > 0) {
        console.log(`⚠️ 대기 중인 저화력 이슈: ${pendingLowHeat.length}건`)
        console.log(`   → 화력이 떨어져서 기준 미달`)
        console.log(`   → 반려 처리 권장`)
    }

    const rejectedLowHeat = byApprovalStatus['반려'] || []
    if (rejectedLowHeat.length > 0) {
        console.log(`✅ 반려된 저화력 이슈: ${rejectedLowHeat.length}건`)
        console.log(`   → 정상 처리됨`)
    }

    console.log()

    // 5. 등록 시 화력 vs 현재 화력 비교
    console.log('📈 화력 변화 분석')
    console.log('-'.repeat(60))

    const decreasedIssues = lowHeatIssues.filter(issue => {
        const current = issue.heat_index ?? 0
        const created = issue.created_heat_index ?? current
        return current < created && issue.approval_status !== '반려'
    })

    if (decreasedIssues.length > 0) {
        console.log(`⚠️ 화력 하락 이슈: ${decreasedIssues.length}건`)
        decreasedIssues.forEach((issue, idx) => {
            const current = issue.heat_index ?? 0
            const created = issue.created_heat_index ?? current
            const diff = current - created
            console.log(`${idx + 1}. ${issue.title}`)
            console.log(`   ${created.toFixed(1)}점 → ${current.toFixed(1)}점 (${diff.toFixed(1)}점)`)
        })
        console.log()
        console.log('   → 등록 시에는 조건 충족했으나 이후 화력 하락')
        console.log('   → 종결 처리 또는 반려 권장')
    }

    const alwaysLowIssues = lowHeatIssues.filter(issue => {
        const current = issue.heat_index ?? 0
        const created = issue.created_heat_index ?? current
        return created < MIN_HEAT_TO_REGISTER && issue.approval_status !== '반려'
    })

    if (alwaysLowIssues.length > 0) {
        console.log()
        console.log(`❌ 등록 시부터 조건 미달: ${alwaysLowIssues.length}건`)
        alwaysLowIssues.forEach((issue, idx) => {
            const created = issue.created_heat_index ?? issue.heat_index ?? 0
            console.log(`${idx + 1}. ${issue.title}`)
            console.log(`   등록 시 화력: ${created.toFixed(1)}점 (기준 ${MIN_HEAT_TO_REGISTER}점 미만)`)
        })
        console.log()
        console.log('   → 등록 로직 버그 가능성')
        console.log('   → 화력 계산 전 이슈 생성 문제')
    }

    console.log()

    // 6. 권장 조치
    console.log('💡 권장 조치')
    console.log('-'.repeat(60))

    if (approvedLowHeat.length > 0) {
        console.log('1. 승인된 저화력 이슈 처리:')
        console.log('   - 화력 회복 가능성 낮으면 반려')
        console.log('   - 또는 종결 상태로 전환')
    }

    if (pendingLowHeat.length > 0) {
        console.log('2. 대기 중인 저화력 이슈 처리:')
        console.log('   - 일괄 반려 처리')
    }

    if (alwaysLowIssues.length > 0) {
        console.log('3. 등록 로직 점검:')
        console.log('   - lib/candidate/issue-candidate.ts')
        console.log('   - 화력 계산 후 필터링 확인')
        console.log('   - MIN_HEAT_TO_REGISTER 체크 로직 확인')
    }

    console.log()
    console.log('실행 스크립트:')
    console.log('  npx ts-node --esm scripts/check-invalid-issues.ts')
}

checkInvalidIssues()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('에러:', err)
        process.exit(1)
    })
