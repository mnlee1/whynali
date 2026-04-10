#!/usr/bin/env node
/**
 * scripts/check-api-failures.mjs
 * 
 * 실서버 API 사용 현황 조회
 * Claude와 Groq의 실패 건수 원인 파악
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

// 실서버 환경 변수 로드
config({ path: '.env.production.local' })

// 실서버 Supabase 설정
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('환경변수 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.')
    console.error('.env.production.local 파일에 값을 설정하세요.')
    process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
    },
})

async function checkApiUsage() {
    console.log('='.repeat(80))
    console.log('실서버 AI API 사용 현황 조회 (2026년 4월)')
    console.log('='.repeat(80))
    console.log()

    // 1. 일별 상세 데이터
    const { data: dailyData, error: dailyError } = await supabase
        .from('api_usage')
        .select('*')
        .in('api_name', ['claude', 'groq'])
        .gte('date', '2026-04-01')
        .order('date', { ascending: false })
        .order('api_name', { ascending: true })

    if (dailyError) {
        console.error('조회 실패:', dailyError)
        return
    }

    console.log('📊 일별 API 사용 현황')
    console.log('-'.repeat(80))
    console.log('날짜\t\tAPI\t호출\t성공\t실패\t실패율')
    console.log('-'.repeat(80))

    for (const row of dailyData) {
        const failRate = row.call_count > 0 
            ? ((row.fail_count / row.call_count) * 100).toFixed(1)
            : '0.0'
        
        console.log(
            `${row.date}\t${row.api_name}\t${row.call_count}\t${row.success_count}\t${row.fail_count}\t${failRate}%`
        )
    }

    console.log()
    console.log()

    // 2. 월별 집계
    const claudeData = dailyData.filter(r => r.api_name === 'claude')
    const groqData = dailyData.filter(r => r.api_name === 'groq')

    const claudeTotal = {
        calls: claudeData.reduce((sum, r) => sum + r.call_count, 0),
        successes: claudeData.reduce((sum, r) => sum + (r.success_count || 0), 0),
        failures: claudeData.reduce((sum, r) => sum + (r.fail_count || 0), 0),
    }

    const groqTotal = {
        calls: groqData.reduce((sum, r) => sum + r.call_count, 0),
        successes: groqData.reduce((sum, r) => sum + (r.success_count || 0), 0),
        failures: groqData.reduce((sum, r) => sum + (r.fail_count || 0), 0),
    }

    console.log('📈 4월 월간 집계')
    console.log('-'.repeat(80))
    console.log('API\t\t총 호출\t성공\t\t실패\t\t실패율')
    console.log('-'.repeat(80))

    const claudeFailRate = claudeTotal.calls > 0 
        ? ((claudeTotal.failures / claudeTotal.calls) * 100).toFixed(2)
        : '0.00'
    
    const groqFailRate = groqTotal.calls > 0 
        ? ((groqTotal.failures / groqTotal.calls) * 100).toFixed(2)
        : '0.00'

    console.log(`Claude\t\t${claudeTotal.calls}\t${claudeTotal.successes}\t\t${claudeTotal.failures}\t\t${claudeFailRate}%`)
    console.log(`Groq\t\t${groqTotal.calls}\t${groqTotal.successes}\t\t${groqTotal.failures}\t\t${groqFailRate}%`)

    console.log()
    console.log()

    // 3. 상태 판단 로직 재현
    console.log('🔍 대시보드 상태 판단 로직')
    console.log('-'.repeat(80))

    function getStatus(successes, failures) {
        const total = successes + failures
        const isNormal = total === 0 || failures === 0
        const rate = total > 0 ? successes / total : 1
        const isWarning = !isNormal && rate >= 0.9

        if (isNormal) return '정상'
        if (isWarning) return `일부 오류 (${failures}건)`
        return `오류 (${failures}건)`
    }

    const claudeStatus = getStatus(claudeTotal.successes, claudeTotal.failures)
    const groqStatus = getStatus(groqTotal.successes, groqTotal.failures)

    console.log(`Claude AI: ${claudeStatus}`)
    console.log(`  - 성공률: ${claudeTotal.calls > 0 ? ((claudeTotal.successes / claudeTotal.calls) * 100).toFixed(2) : 0}%`)
    console.log(`  - 판단: total=${claudeTotal.calls}, failures=${claudeTotal.failures}, rate=${claudeTotal.calls > 0 ? ((claudeTotal.successes / claudeTotal.calls)).toFixed(4) : 0}`)
    console.log()
    console.log(`Groq AI: ${groqStatus}`)
    console.log(`  - 성공률: ${groqTotal.calls > 0 ? ((groqTotal.successes / groqTotal.calls) * 100).toFixed(2) : 0}%`)
    console.log(`  - 판단: total=${groqTotal.calls}, failures=${groqTotal.failures}, rate=${groqTotal.calls > 0 ? ((groqTotal.successes / groqTotal.calls)).toFixed(4) : 0}`)

    console.log()
    console.log()

    // 4. 결론 및 권장사항
    console.log('💡 분석 결과')
    console.log('-'.repeat(80))
    
    if (claudeTotal.failures > 0) {
        const claudeSuccessRate = claudeTotal.calls > 0 ? (claudeTotal.successes / claudeTotal.calls) : 0
        if (claudeSuccessRate >= 0.9) {
            console.log(`✅ Claude: ${claudeTotal.failures}건의 실패가 있지만, 성공률 ${(claudeSuccessRate * 100).toFixed(1)}%로 정상 범위입니다.`)
        } else {
            console.log(`⚠️  Claude: ${claudeTotal.failures}건의 실패, 성공률 ${(claudeSuccessRate * 100).toFixed(1)}%로 주의가 필요합니다.`)
        }
    } else {
        console.log('✅ Claude: 실패 없음')
    }

    if (groqTotal.failures > 0) {
        const groqSuccessRate = groqTotal.calls > 0 ? (groqTotal.successes / groqTotal.calls) : 0
        if (groqSuccessRate >= 0.9) {
            console.log(`✅ Groq: ${groqTotal.failures}건의 실패가 있지만, 성공률 ${(groqSuccessRate * 100).toFixed(1)}%로 정상 범위입니다.`)
        } else {
            console.log(`⚠️  Groq: ${groqTotal.failures}건의 실패, 성공률 ${(groqSuccessRate * 100).toFixed(1)}%로 주의가 필요합니다.`)
        }
    } else {
        console.log('✅ Groq: 실패 없음')
    }

    console.log()
    console.log('📋 권장사항:')
    console.log('  1. 실패가 일시적인 네트워크 오류나 일일 한도 초과인지 확인')
    console.log('  2. 성공률이 90% 이상이면 정상 운영 범위로 판단')
    console.log('  3. 실패 건수를 매월 1일에 초기화하려면 api_usage 테이블 데이터 아카이빙 고려')
    console.log('  4. 대시보드에서 "당월 누적" 표시를 추가하여 사용자 혼란 방지')
    console.log()
    console.log('='.repeat(80))
}

checkApiUsage()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('실행 오류:', err)
        process.exit(1)
    })
