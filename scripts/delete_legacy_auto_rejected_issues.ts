/**
 * scripts/delete_legacy_auto_rejected_issues.ts
 *
 * 레거시 "자동 반려" 이슈 삭제
 *
 * approval_status = '반려' 이면서 approval_type = 'auto' 인 이슈는
 * 예전 화력 재계산 로직(화력 15점 미만 시 자동 반려)으로 처리된 데이터입니다.
 * 해당 로직은 2026-03-16 제거되었으며, 삭제해도 동작에는 영향 없습니다.
 *
 * 실행: npx tsx scripts/delete_legacy_auto_rejected_issues.ts
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import * as readline from 'readline'

config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('환경변수 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

function askQuestion(query: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    })
    return new Promise(resolve => rl.question(query, ans => {
        rl.close()
        resolve(ans)
    }))
}

async function main() {
    console.log('레거시 자동 반려 이슈 정리\n')

    const { data: issues, error } = await supabase
        .from('issues')
        .select('id, title, approval_status, approval_type, heat_index, created_heat_index, created_at')
        .eq('approval_status', '반려')
        .eq('approval_type', 'auto')
        .order('created_at', { ascending: false })

    if (error) {
        console.error('이슈 조회 실패:', error.message)
        process.exit(1)
    }

    if (!issues || issues.length === 0) {
        console.log('자동 반려(approval_status=반려, approval_type=auto) 이슈가 없습니다.')
        return
    }

    console.log(`자동 반려 이슈 ${issues.length}건:\n`)
    issues.forEach((issue, i) => {
        console.log(`${i + 1}. ${issue.title}`)
        console.log(`   ID: ${issue.id}`)
        console.log(`   화력: 등록시 ${issue.created_heat_index ?? '—'}점 / 현재 ${issue.heat_index ?? 0}점`)
        console.log(`   생성: ${new Date(issue.created_at).toLocaleString('ko-KR')}`)
        console.log()
    })

    const answer = await askQuestion('위 이슈를 모두 삭제할까요? (yes 입력 시 삭제): ')

    if (answer.trim().toLowerCase() !== 'yes') {
        console.log('취소되었습니다.')
        return
    }

    let success = 0
    let fail = 0

    for (const issue of issues) {
        const { error: delErr } = await supabase
            .from('issues')
            .delete()
            .eq('id', issue.id)

        if (delErr) {
            console.error(`  삭제 실패 "${issue.title}":`, delErr.message)
            fail++
        } else {
            console.log(`  삭제 완료: ${issue.title}`)
            success++
        }
    }

    console.log(`\n결과: 성공 ${success}건, 실패 ${fail}건`)
}

main().catch(e => {
    console.error(e)
    process.exit(1)
})
