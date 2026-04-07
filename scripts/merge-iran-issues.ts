/**
 * scripts/merge-iran-issues.ts
 *
 * 이란 관련 이슈만 타겟 병합
 * 실행: npx tsx scripts/merge-iran-issues.ts --dry-run
 *       npx tsx scripts/merge-iran-issues.ts
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const DRY_RUN = process.argv.includes('--dry-run')
const CONFIDENCE_THRESHOLD = 80

interface Issue {
    id: string
    title: string
    status: string
    heat_index: number
    approval_status: string
    created_at: string
}

function findRoot(id: string, map: Map<string, string>): string {
    if (!map.has(id)) return id
    const root = findRoot(map.get(id)!, map)
    map.set(id, root)
    return root
}

function selectPrimary(a: Issue, b: Issue) {
    // 1순위: 승인 이슈 우선
    const aOk = a.approval_status === '승인'
    const bOk = b.approval_status === '승인'
    if (aOk !== bOk) return aOk ? { primary: a, secondary: b } : { primary: b, secondary: a }
    // 2순위: 화력 높은 쪽
    if (a.heat_index !== b.heat_index) return a.heat_index > b.heat_index ? { primary: a, secondary: b } : { primary: b, secondary: a }
    // 3순위: 오래된 쪽
    return new Date(a.created_at) <= new Date(b.created_at) ? { primary: a, secondary: b } : { primary: b, secondary: a }
}

async function isSameEvent(a: Issue, b: Issue): Promise<boolean> {
    const prompt = `두 이슈가 같은 사건/논란인지 판단하세요.

이슈 A: "${a.title}"
이슈 B: "${b.title}"

판단 기준:
- 같은 사건: 동일한 미-이란 위기의 연속 또는 직접 연관 (→ isSame: true)
- 다른 사건: 이름만 겹치거나 완전히 별개 맥락 (→ isSame: false)

신뢰도 ${CONFIDENCE_THRESHOLD}% 미만이면 반드시 isSame: false로 응답하세요.

응답 형식 (JSON만):
{"isSame": true, "confidence": 85, "reason": "한 줄 이유"}`

    try {
        const res = await anthropic.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 120,
            temperature: 0.1,
            messages: [{ role: 'user', content: prompt }],
        })
        const text = res.content[0].type === 'text' ? res.content[0].text : ''
        const match = text.match(/\{[\s\S]*\}/)
        if (!match) return false
        const result = JSON.parse(match[0])
        return result.isSame === true && result.confidence >= CONFIDENCE_THRESHOLD
    } catch {
        return false
    }
}

async function doMerge(primary: Issue, secondary: Issue) {
    // 주 이슈의 발단 포인트 시각 조회
    const { data: baldanPoints } = await supabase
        .from('timeline_points')
        .select('occurred_at')
        .eq('issue_id', primary.id)
        .eq('stage', '발단')
        .order('occurred_at', { ascending: true })
        .limit(1)

    const baldanAt = baldanPoints?.[0]?.occurred_at ?? primary.created_at

    // news_data: 발단 시각 이후 뉴스만 주 이슈에 연결, 이전 뉴스는 연결 해제
    await supabase.from('news_data')
        .update({ issue_id: primary.id })
        .eq('issue_id', secondary.id)
        .gte('published_at', baldanAt)

    await supabase.from('news_data')
        .update({ issue_id: null })
        .eq('issue_id', secondary.id)
        .lt('published_at', baldanAt)

    // community_data: 발단 시각 이후만 연결, 이전은 해제
    await supabase.from('community_data')
        .update({ issue_id: primary.id })
        .eq('issue_id', secondary.id)
        .gte('created_at', baldanAt)

    await supabase.from('community_data')
        .update({ issue_id: null })
        .eq('issue_id', secondary.id)
        .lt('created_at', baldanAt)

    // timeline_points: 발단 시각 이후만 파생으로 이전, 이전 것은 삭제
    await supabase.from('timeline_points')
        .update({ issue_id: primary.id, stage: '파생' })
        .eq('issue_id', secondary.id)
        .gte('occurred_at', baldanAt)

    await supabase.from('timeline_points')
        .delete()
        .eq('issue_id', secondary.id)
        .lt('occurred_at', baldanAt)

    // 부 이슈 숨김
    await supabase.from('issues').update({
        merged_into_id: primary.id,
        visibility_status: 'hidden',
        updated_at: new Date().toISOString(),
    }).eq('id', secondary.id)
}

async function main() {
    console.log(`\n${DRY_RUN ? '[DRY RUN] ' : ''}이란 관련 이슈 병합 시작\n`)

    const { data: issues, error } = await supabase
        .from('issues')
        .select('id, title, status, heat_index, approval_status, created_at')
        .in('approval_status', ['승인', '대기'])
        .is('merged_into_id', null)
        .or('title.ilike.%이란%,title.ilike.%호르무즈%,title.ilike.%이란전%')
        .order('created_at', { ascending: true })

    if (error) { console.error(error); process.exit(1) }

    console.log(`대상 이슈: ${issues.length}건`)
    issues.forEach((i: Issue) => console.log(`  [${i.approval_status}|${i.status}] 화력:${i.heat_index} "${i.title}"`))
    console.log()

    const issueById = new Map<string, Issue>(issues.map((i: Issue) => [i.id, i]))
    const mergeMap = new Map<string, string>()
    let pairCount = 0

    for (let i = 0; i < issues.length; i++) {
        for (let j = i + 1; j < issues.length; j++) {
            const a = issues[i] as Issue
            const b = issues[j] as Issue
            if (mergeMap.has(a.id) && mergeMap.has(b.id)) continue

            pairCount++
            process.stdout.write(`  비교 ${pairCount}: "${a.title.slice(0, 20)}" vs "${b.title.slice(0, 20)}" ... `)
            const same = await isSameEvent(a, b)

            if (same) {
                const { primary, secondary } = selectPrimary(a, b)
                const rootId = findRoot(primary.id, mergeMap)
                mergeMap.set(secondary.id, rootId)
                console.log(`✓ 병합`)
            } else {
                console.log(`✗ 별개`)
            }
            await new Promise(r => setTimeout(r, 500))
        }
    }

    // 체인 평탄화
    for (const id of mergeMap.keys()) mergeMap.set(id, findRoot(id, mergeMap))

    // 그룹 출력
    const groups = new Map<string, Issue[]>()
    for (const [secId, priId] of mergeMap) {
        if (!groups.has(priId)) groups.set(priId, [])
        groups.get(priId)!.push(issueById.get(secId)!)
    }

    console.log(`\n${'─'.repeat(60)}`)
    console.log(`\n탐지 결과: ${groups.size}개 그룹, 총 ${mergeMap.size}건 병합 대상\n`)

    for (const [priId, secs] of groups) {
        const pri = issueById.get(priId)!
        console.log(`▶ 주 이슈: "${pri.title}" [${pri.approval_status}|화력:${pri.heat_index}]`)
        for (const s of secs) console.log(`  ← "${s.title}" [${s.approval_status}|화력:${s.heat_index}]`)
        console.log()
    }

    if (DRY_RUN) { console.log('(--dry-run: 실제 DB 변경 없음)'); return }

    console.log('병합 실행 중...\n')
    for (const [secId, priId] of mergeMap) {
        const pri = issueById.get(priId)!
        const sec = issueById.get(secId)!
        await doMerge(pri, sec)
        console.log(`  ✅ "${sec.title}" → "${pri.title}"`)
    }
    console.log(`\n완료: ${mergeMap.size}건 병합`)
}

main().catch(console.error)
