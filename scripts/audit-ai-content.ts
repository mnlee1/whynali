/**
 * scripts/audit-ai-content.ts
 *
 * 실서버 DB의 투표 주제·선택지·토론 주제를 감사한다.
 * 검사 기준:
 *   - 투표 제목: 40자 이하, 완전한 문장, 구어체 금지
 *   - 선택지: 20자 이하, 완전한 어절
 *   - 토론 주제: 60자 이하, 완전한 문장
 *
 * 사용법:
 *   npx tsx scripts/audit-ai-content.ts
 */

import { createClient } from '@supabase/supabase-js'

const PROD_URL = 'https://mdxshmfmcdcotteevwgi.supabase.co'
const PROD_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1keHNobWZtY2Rjb3R0ZWV2d2dpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTYyNzAyMCwiZXhwIjoyMDkxMjAzMDIwfQ.Eo354xCPQxr2XOdxwvQfu0X-E6d9cdm7lqSJP6DkcRM'

const supabase = createClient(PROD_URL, PROD_KEY)

// 구어체 패턴
const COLLOQUIAL_PATTERNS = [
    /이냐\?*$/,
    /냐\?*$/,
    /어때\?*$/,
    /됩니까\?*$/,
    /하나요\?*$/,  // 허용하지 않는 경우는 아님 - 일단 모니터링
]

// 끊긴 문장 패턴 (명사/형용사/조사로 끝나지 않고 이상하게 끝남)
const TRUNCATED_PATTERNS = [
    /[을를이가은는의]$/,   // 조사로 끝남
    /[한된된된인]$/,       // 관형형으로 끝남
    /[하고되고이고]$/,     // 연결어미로 끝남
    /위해$/,
    /통해$/,
    /대해$/,
    /따른$/,
    /있는$/,
    /없는$/,
    /보인$/,
    /열어준$/,
    /대한$/,
]

function checkTruncated(text: string): boolean {
    return TRUNCATED_PATTERNS.some((p) => p.test(text.trim()))
}

function checkColloquial(text: string): boolean {
    return COLLOQUIAL_PATTERNS.some((p) => p.test(text.trim()))
}

type Issue = { title: string }
type VoteRow = {
    id: string
    title: string
    phase: string
    created_at: string
    issues: Issue | null
    vote_choices: { label: string }[]
}
type DiscussionRow = {
    id: string
    body: string
    approval_status: string
    created_at: string
    issues: Issue | null
}

async function auditVotes() {
    console.log('\n' + '='.repeat(70))
    console.log('📊 [투표] 전체 감사')
    console.log('='.repeat(70))

    const { data, error } = await supabase
        .from('votes')
        .select('id, title, phase, created_at, issues(title), vote_choices(label)')
        .order('created_at', { ascending: false })
        .limit(100)

    if (error) {
        console.error('DB 조회 오류:', error.message)
        return
    }

    const rows = (data ?? []) as unknown as VoteRow[]
    let okCount = 0
    let warnCount = 0

    for (const row of rows) {
        const problems: string[] = []
        const choices = (row.vote_choices ?? []).map((c) => c.label)

        // 제목 검사
        const titleLen = row.title?.trim().length ?? 0
        if (titleLen > 40) problems.push(`제목 ${titleLen}자 초과`)
        if (checkColloquial(row.title ?? '')) problems.push('구어체 말투')
        if (checkTruncated(row.title ?? '')) problems.push('제목 끊김 의심')

        // 선택지 검사
        for (const c of choices) {
            if (c.trim().length > 20) problems.push(`선택지 "${c}" 20자 초과(${c.length}자)`)
            if (c.trim().length < 2) problems.push(`선택지 "${c}" 너무 짧음`)
            if (checkTruncated(c)) problems.push(`선택지 "${c}" 끊김 의심`)
        }

        if (problems.length > 0) {
            warnCount++
            const issueTitle = row.issues?.title ?? '-'
            console.log(`\n⚠️  [${row.phase}] ${row.title}`)
            console.log(`   이슈: ${issueTitle}`)
            console.log(`   선택지: ${JSON.stringify(choices)}`)
            console.log(`   문제: ${problems.join(' | ')}`)
            console.log(`   ID: ${row.id} | ${row.created_at.slice(0, 10)}`)
        } else {
            okCount++
        }
    }

    console.log(`\n✅ 정상: ${okCount}개 | ⚠️  문제: ${warnCount}개 | 전체: ${rows.length}개`)
}

async function auditDiscussions() {
    console.log('\n' + '='.repeat(70))
    console.log('💬 [토론 주제] 전체 감사')
    console.log('='.repeat(70))

    const { data, error } = await supabase
        .from('discussion_topics')
        .select('id, body, approval_status, created_at, issues(title)')
        .order('created_at', { ascending: false })
        .limit(200)

    if (error) {
        console.error('DB 조회 오류:', error.message)
        return
    }

    const rows = (data ?? []) as unknown as DiscussionRow[]
    let okCount = 0
    let warnCount = 0

    for (const row of rows) {
        const problems: string[] = []
        const body = row.body?.trim() ?? ''
        const len = body.length

        if (len > 60) problems.push(`${len}자 초과`)
        if (checkTruncated(body)) problems.push('끊김 의심')
        if (/것에 대해/.test(body)) problems.push('"것에 대해" 긴 서두')
        if (/선정된 것/.test(body)) problems.push('"선정된 것" 패턴')
        if (/어떻게 생각/.test(body) && len > 50) problems.push('"어떻게 생각" + 긴 문장')

        if (problems.length > 0) {
            warnCount++
            const issueTitle = row.issues?.title ?? '-'
            console.log(`\n⚠️  [${row.approval_status}] "${body}" (${len}자)`)
            console.log(`   이슈: ${issueTitle}`)
            console.log(`   문제: ${problems.join(' | ')}`)
            console.log(`   ID: ${row.id} | ${row.created_at.slice(0, 10)}`)
        } else {
            okCount++
        }
    }

    console.log(`\n✅ 정상: ${okCount}개 | ⚠️  문제: ${warnCount}개 | 전체: ${rows.length}개`)
}

async function main() {
    console.log('🔍 실서버 DB AI 생성 콘텐츠 감사 시작')
    console.log('대상: whynali-main (실서버)')

    await auditVotes()
    await auditDiscussions()

    console.log('\n' + '='.repeat(70))
    console.log('감사 완료')
}

main()
