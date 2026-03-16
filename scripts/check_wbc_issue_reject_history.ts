/**
 * scripts/check_wbc_issue_reject_history.ts
 * 
 * WBC 대만 혐한 마케팅 이슈의 반려 처리 이력 확인
 * 
 * 확인 사항:
 * 1. 이슈 상세 정보 (approval_status, approval_type)
 * 2. admin_logs에서 해당 이슈에 대한 모든 액션 로그
 * 3. 자동 반려인지 수동 반려인지 판단
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabaseAdmin = createClient(supabaseUrl, supabaseKey)

async function main() {
    console.log('=== WBC 이슈 반려 처리 이력 확인 ===\n')

    const issueTitle = '"WBC 점수 조작 죄송"…대만에서 \'혐한\' 마케팅 펼친 한국 기업'

    // 1. 이슈 조회
    const { data: issue, error: issueError } = await supabaseAdmin
        .from('issues')
        .select('*')
        .eq('title', issueTitle)
        .single()

    if (issueError || !issue) {
        console.error('이슈 조회 실패:', issueError)
        return
    }

    console.log('[ 이슈 정보 ]')
    console.log(`제목: ${issue.title}`)
    console.log(`ID: ${issue.id}`)
    console.log(`approval_status: ${issue.approval_status}`)
    console.log(`approval_type: ${issue.approval_type}`)
    console.log(`heat_index: ${issue.heat_index}`)
    console.log(`source_track: ${issue.source_track}`)
    console.log(`created_at: ${issue.created_at}`)
    console.log(`updated_at: ${issue.updated_at}`)
    console.log(`approved_at: ${issue.approved_at}`)
    console.log()

    // 2. admin_logs 조회 (해당 이슈 관련)
    const { data: logs, error: logsError } = await supabaseAdmin
        .from('admin_logs')
        .select('*')
        .eq('target_id', issue.id)
        .order('created_at', { ascending: true })

    console.log('[ 관리자 액션 로그 ]')
    if (logsError) {
        console.error('로그 조회 에러:', logsError)
    } else if (!logs || logs.length === 0) {
        console.log('⚠️ 관리자 액션 로그가 없습니다.')
        console.log('   → 수동 반려 로그가 없음')
    } else {
        console.log(`총 ${logs.length}건의 로그 발견:\n`)
        logs.forEach((log, idx) => {
            console.log(`${idx + 1}. ${log.action}`)
            console.log(`   관리자: ${log.admin_id || '(기록 없음)'}`)
            console.log(`   시각: ${log.created_at}`)
            console.log(`   상세: ${log.details || '-'}`)
            console.log()
        })
    }

    // 3. 반려 처리 원인 분석
    console.log('[ 반려 처리 원인 분석 ]')
    
    if (issue.approval_status !== '반려') {
        console.log('✅ 현재 반려 상태가 아닙니다.')
        return
    }

    if (issue.approval_type === 'manual') {
        console.log('🔍 수동 반려 처리')
        if (!logs || logs.length === 0) {
            console.log('⚠️ 하지만 admin_logs에 기록이 없습니다.')
            console.log('   → 가능성:')
            console.log('      1. admin_logs 테이블이 나중에 생성되어 과거 로그 없음')
            console.log('      2. 반려 API가 로그 기록 없이 실행됨 (코드 버그)')
            console.log('      3. 직접 DB 수정으로 반려 처리')
        } else {
            const rejectLog = logs.find(log => log.action === 'reject_issue')
            if (rejectLog) {
                console.log(`✅ 반려 처리자: ${rejectLog.admin_id}`)
                console.log(`   처리 시각: ${rejectLog.created_at}`)
            } else {
                console.log('⚠️ reject_issue 액션 로그가 없습니다.')
            }
        }
    } else if (issue.approval_type === 'auto') {
        console.log('🤖 자동 반려 처리')
        console.log('   → 화력 부족 등 시스템 기준에 의한 자동 반려')
        console.log(`   현재 화력: ${issue.heat_index}점 (기준: 10점)`)
    } else {
        console.log(`⚠️ approval_type이 예상치 못한 값: ${issue.approval_type}`)
    }

    // 4. 타임라인 확인 (상태 변경 이력)
    console.log('\n[ updated_at 타임라인 ]')
    console.log(`생성: ${issue.created_at}`)
    console.log(`최종 수정: ${issue.updated_at}`)
    
    const createTime = new Date(issue.created_at).getTime()
    const updateTime = new Date(issue.updated_at).getTime()
    const diffMinutes = Math.floor((updateTime - createTime) / 1000 / 60)
    
    if (diffMinutes > 5) {
        console.log(`   → 생성 후 ${diffMinutes}분 뒤 수정됨 (상태 변경 있었음)`)
    } else {
        console.log(`   → 생성과 동시에 현재 상태로 설정됨`)
    }

    // 5. 최근 화력 재계산 스크립트 실행 이력 확인
    console.log('\n[ 최근 자동 처리 스크립트 확인 ]')
    const { data: recentAutoLogs } = await supabaseAdmin
        .from('admin_logs')
        .select('*')
        .eq('action', 'auto_reject')
        .order('created_at', { ascending: false })
        .limit(5)

    if (recentAutoLogs && recentAutoLogs.length > 0) {
        console.log('최근 자동 반려 로그:')
        recentAutoLogs.forEach(log => {
            console.log(`  - ${log.created_at}: ${log.details}`)
        })
    } else {
        console.log('자동 반려 로그 없음 (또는 로그 미기록)')
    }
}

main().catch(console.error)
