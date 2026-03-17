/**
 * scripts/check_admin_display_issues.ts
 * 
 * 관리자 페이지 표시 문제 확인
 * 1. 관리자 반려가 아닌데 "관리자 반려"로 표시
 * 2. 화력 15점 미만인데 등록된 이슈
 * 3. 카테고리 오분류 이슈
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabaseAdmin = createClient(supabaseUrl, supabaseKey)

async function main() {
    console.log('=== 관리자 페이지 표시 문제 분석 ===\n')

    const MIN_HEAT = parseInt(process.env.CANDIDATE_MIN_HEAT_TO_REGISTER ?? '15')

    // 1. "관리자 반려"로 표시되는 이슈 확인
    console.log('[ 1. 반려 상태 이슈 분석 ]')
    console.log()

    const { data: rejectedIssues } = await supabaseAdmin
        .from('issues')
        .select('id, title, approval_status, approval_type, heat_index, category, created_at')
        .eq('approval_status', '반려')
        .order('created_at', { ascending: false })
        .limit(20)

    console.log(`반려 이슈 총 ${rejectedIssues?.length || 0}개\n`)

    if (rejectedIssues) {
        const autoRejected = rejectedIssues.filter(i => i.approval_type === 'auto')
        const manualRejected = rejectedIssues.filter(i => i.approval_type === 'manual')
        const unknownRejected = rejectedIssues.filter(i => !i.approval_type)

        console.log(`자동 반려 (approval_type='auto'): ${autoRejected.length}개`)
        console.log(`관리자 반려 (approval_type='manual'): ${manualRejected.length}개`)
        console.log(`타입 없음 (approval_type=null): ${unknownRejected.length}개`)
        console.log()

        if (unknownRejected.length > 0) {
            console.log('⚠️ approval_type이 null인 반려 이슈:')
            unknownRejected.forEach(issue => {
                console.log(`  - ${issue.title} (화력: ${issue.heat_index}점, ${issue.created_at})`)
            })
            console.log()
        }
    }

    // 2. admin_logs에서 실제 관리자 반려 기록 확인
    const { data: rejectLogs } = await supabaseAdmin
        .from('admin_logs')
        .select('*')
        .eq('action', 'reject_issue')
        .order('created_at', { ascending: false })
        .limit(10)

    console.log(`[ 2. 실제 관리자 반려 로그 ]`)
    console.log()
    console.log(`admin_logs에 기록된 반려 액션: ${rejectLogs?.length || 0}개`)
    if (rejectLogs && rejectLogs.length > 0) {
        rejectLogs.forEach(log => {
            console.log(`  - ${log.created_at}: ${log.admin_id} → ${log.target_id}`)
        })
    } else {
        console.log('  → 관리자가 직접 반려한 기록 없음')
    }
    console.log()

    // 3. 화력 15점 미만 이슈 확인
    console.log('[ 3. 화력 미달 이슈 분석 ]')
    console.log()
    console.log(`최소 화력 기준: ${MIN_HEAT}점\n`)

    const { data: lowHeatIssues } = await supabaseAdmin
        .from('issues')
        .select('id, title, approval_status, heat_index, category, source_track, created_at')
        .lt('heat_index', MIN_HEAT)
        .neq('approval_status', '반려')
        .order('created_at', { ascending: false })
        .limit(10)

    console.log(`화력 ${MIN_HEAT}점 미만인데 반려되지 않은 이슈: ${lowHeatIssues?.length || 0}개`)
    console.log()

    if (lowHeatIssues && lowHeatIssues.length > 0) {
        lowHeatIssues.forEach((issue, idx) => {
            console.log(`${idx + 1}. ${issue.title}`)
            console.log(`   화력: ${issue.heat_index}점 (기준: ${MIN_HEAT}점)`)
            console.log(`   상태: ${issue.approval_status}`)
            console.log(`   source_track: ${issue.source_track}`)
            console.log(`   카테고리: ${issue.category}`)
            console.log(`   생성: ${issue.created_at}`)
            console.log()
        })

        console.log('⚠️ 원인 추정:')
        console.log('  1. 수동 생성 이슈 (source_track=manual) → 화력 체크 안 함')
        console.log('  2. 생성 후 10분 이내 → 유예 기간 (방금 수정한 로직)')
        console.log('  3. 관리자가 직접 승인')
        console.log()
    }

    // 4. 카테고리 오분류 분석
    console.log('[ 4. 카테고리 분류 정확도 분석 ]')
    console.log()

    // 최근 이슈들의 카테고리와 제목 분석
    const { data: recentIssues } = await supabaseAdmin
        .from('issues')
        .select('id, title, category, source_track, created_at')
        .order('created_at', { ascending: false })
        .limit(20)

    if (recentIssues) {
        console.log('최근 이슈 20개 카테고리 분포:\n')
        
        const categoryCount = recentIssues.reduce((acc, issue) => {
            acc[issue.category] = (acc[issue.category] || 0) + 1
            return acc
        }, {} as Record<string, number>)

        Object.entries(categoryCount).forEach(([cat, count]) => {
            console.log(`  ${cat}: ${count}개`)
        })
        console.log()

        // 명확한 오분류 케이스 찾기
        console.log('의심되는 카테고리 오분류:\n')
        
        const suspiciousCases: Array<{issue: any, reason: string}> = []

        recentIssues.forEach(issue => {
            const title = issue.title.toLowerCase()
            
            // 정치 키워드인데 정치가 아닌 경우
            if ((title.includes('대통령') || title.includes('국회') || title.includes('선거') || 
                 title.includes('정부') || title.includes('여당') || title.includes('야당')) &&
                issue.category !== '정치') {
                suspiciousCases.push({issue, reason: '정치 키워드 → 정치 아님'})
            }
            
            // 연예 키워드인데 연예가 아닌 경우
            if ((title.includes('배우') || title.includes('가수') || title.includes('아이돌') || 
                 title.includes('드라마') || title.includes('영화')) &&
                issue.category !== '연예') {
                suspiciousCases.push({issue, reason: '연예 키워드 → 연예 아님'})
            }
            
            // 스포츠 키워드인데 스포츠가 아닌 경우
            if ((title.includes('야구') || title.includes('축구') || title.includes('농구') || 
                 title.includes('선수') || title.includes('경기') || title.includes('wbc')) &&
                issue.category !== '스포츠') {
                suspiciousCases.push({issue, reason: '스포츠 키워드 → 스포츠 아님'})
            }
        })

        if (suspiciousCases.length > 0) {
            suspiciousCases.forEach(({issue, reason}) => {
                console.log(`⚠️ ${issue.title}`)
                console.log(`   현재 카테고리: ${issue.category}`)
                console.log(`   문제: ${reason}`)
                console.log()
            })
        } else {
            console.log('✅ 명확한 오분류 케이스 없음 (최근 20개 기준)')
            console.log()
        }
    }

    // 5. 종합 진단
    console.log('[ 5. 종합 진단 및 해결 방안 ]')
    console.log()
    
    console.log('문제 1: 관리자 반려 표시 오류')
    console.log('  → approval_type이 null인 반려 이슈를 "관리자 반려"로 표시')
    console.log('  → 해결: 프론트엔드 표시 로직 수정 필요')
    console.log()
    
    console.log('문제 2: 화력 미달 이슈 등록')
    console.log('  → 수동 생성 이슈는 화력 체크 안 함 (의도된 동작)')
    console.log('  → 해결: 수동 이슈도 화력 계산 후 표시')
    console.log()
    
    console.log('문제 3: 카테고리 오분류')
    console.log('  → AI로 개선 가능')
    console.log('  → 해결: 이슈 생성 시 AI로 카테고리 재분류')
    console.log()
}

main().catch(console.error)
