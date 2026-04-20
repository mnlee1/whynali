/**
 * scripts/register-claude-credit.ts
 *
 * Claude API 크레딧 충전 정보를 DB에 등록하는 스크립트
 *
 * 실행:
 * npx tsx scripts/register-claude-credit.ts
 */

import { supabaseAdmin } from '../lib/supabase/server'

async function registerCredit() {
    const chargedAt = new Date().toISOString().split('T')[0] // 오늘 날짜
    const amountUsd = 30
    const memo = '2026-04 충전 ($30, 31일 사용 목표)'

    console.log('Claude 크레딧 충전 등록 중...')
    console.log(`- 충전일: ${chargedAt}`)
    console.log(`- 충전액: $${amountUsd}`)
    console.log(`- 메모: ${memo}`)

    // 기존 활성 충전건 비활성화
    const { error: deactivateError } = await supabaseAdmin
        .from('claude_credit_cycles')
        .update({ is_active: false })
        .eq('is_active', true)

    if (deactivateError) {
        console.error('기존 충전건 비활성화 실패:', deactivateError)
        process.exit(1)
    }

    // 새 충전건 등록
    const { data, error } = await supabaseAdmin
        .from('claude_credit_cycles')
        .insert({
            charged_at: chargedAt,
            amount_usd: amountUsd,
            memo,
            is_active: true,
        })
        .select()
        .single()

    if (error) {
        console.error('충전 등록 실패:', error)
        process.exit(1)
    }

    console.log('\n✅ 충전 등록 완료!')
    console.log(data)
    console.log('\n이제 /admin 페이지에서 사용량과 잔액을 확인할 수 있습니다.')
}

registerCredit()
