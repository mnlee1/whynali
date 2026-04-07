/**
 * scripts/merge-related-issues.ts
 *
 * 같은 사건으로 세분화된 이슈들을 탐지하고 병합합니다.
 *
 * 실행:
 *   npx tsx scripts/merge-related-issues.ts --dry-run   # 결과 확인만
 *   npx tsx scripts/merge-related-issues.ts             # 실제 병합
 *
 * 병합 기준:
 * - 같은 카테고리
 * - 승인된 이슈 (approval_status = '승인')
 * - 점화/논란중/종결 모두 대상
 * - Groq AI 신뢰도 80% 이상 → 병합 대상으로 판정
 *
 * 병합 처리:
 * - 부 이슈의 news_data, community_data, timeline_points → 주 이슈로 이전
 * - 부 이슈: merged_into_id 설정, visibility_status = 'hidden' 처리
 * - 주 이슈: 화력이 더 높거나, 더 오래된 이슈 (발단 역할)
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

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
})

const DRY_RUN = process.argv.includes('--dry-run')
const CONFIDENCE_THRESHOLD = 80
const BATCH_DELAY_MS = 1000  // Claude는 Rate Limit 여유로움
const MAX_PAIRS_PER_CATEGORY = 200  // 카테고리당 최대 비교 쌍 (폭발 방지)

interface Issue {
    id: string
    title: string
    category: string
    status: string
    heat_index: number
    created_at: string
    updated_at: string
}

interface MergeCandidate {
    primary: Issue    // 주 이슈 (살아남는 쪽)
    secondary: Issue  // 부 이슈 (병합되는 쪽)
    confidence: number
    reason: string
}

async function compareIssuesByAI(issue1: Issue, issue2: Issue): Promise<{ isSame: boolean; confidence: number; reason: string }> {
    const prompt = `두 이슈가 같은 사건/논란인지 판단하세요.

이슈 A: "${issue1.title}"
이슈 B: "${issue2.title}"

판단 기준:
- 같은 사건: 동일 인물/조직의 같은 사건이나 직접적인 연속 (→ isSame: true)
- 다른 사건: 이름만 같거나, 다른 맥락의 별개 사건 (→ isSame: false)

예시:
- "트럼프 이란 최후통첩" + "트럼프 이란 공습 경고" → isSame: true (같은 이란 위기)
- "트럼프 관세 정책" + "트럼프 이란 위기" → isSame: false (별개 사건)
- "뉴진스 해체 위기" + "뉴진스 민희진 갈등" → isSame: true (같은 사건)

신뢰도 80% 미만이면 반드시 isSame: false로 응답하세요.

응답 형식 (JSON만):
{"isSame": true, "confidence": 85, "reason": "판단 이유 한 줄"}`

    try {
        const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 150,
            temperature: 0.1,
            messages: [{ role: 'user', content: prompt }],
        })

        const content = response.content[0].type === 'text' ? response.content[0].text : ''
        const jsonMatch = content.match(/\{[\s\S]*\}/)
        if (!jsonMatch) return { isSame: false, confidence: 0, reason: 'JSON 파싱 실패' }

        const result = JSON.parse(jsonMatch[0])
        return {
            isSame: result.isSame && result.confidence >= CONFIDENCE_THRESHOLD,
            confidence: result.confidence ?? 0,
            reason: result.reason ?? '',
        }
    } catch (e) {
        return { isSame: false, confidence: 0, reason: `에러: ${e}` }
    }
}

/**
 * findRoot - 체인 평탄화용 root 탐색 (경로 압축 포함)
 * A←B←C 에서 C의 root는 A
 */
function findRoot(id: string, mergeMap: Map<string, string>): string {
    if (!mergeMap.has(id)) return id
    const root = findRoot(mergeMap.get(id)!, mergeMap)
    mergeMap.set(id, root) // 경로 압축
    return root
}

function selectPrimary(a: Issue, b: Issue): { primary: Issue; secondary: Issue } {
    // 1순위: 승인된 이슈 우선 (대기 이슈가 주 이슈가 되면 안 됨)
    const aApproved = (a as any).approval_status === '승인'
    const bApproved = (b as any).approval_status === '승인'
    if (aApproved !== bApproved) {
        return aApproved
            ? { primary: a, secondary: b }
            : { primary: b, secondary: a }
    }

    // 2순위: 화력이 높은 이슈 (대표성)
    if (a.heat_index !== b.heat_index) {
        return a.heat_index > b.heat_index
            ? { primary: a, secondary: b }
            : { primary: b, secondary: a }
    }

    // 3순위: 더 오래된 이슈 (발단 역할)
    const aTime = new Date(a.created_at).getTime()
    const bTime = new Date(b.created_at).getTime()
    return aTime <= bTime
        ? { primary: a, secondary: b }
        : { primary: b, secondary: a }
}

async function doMerge(primary: Issue, secondary: Issue): Promise<void> {
    // 1. news_data 이전
    await supabase
        .from('news_data')
        .update({ issue_id: primary.id })
        .eq('issue_id', secondary.id)

    // 2. community_data 이전
    await supabase
        .from('community_data')
        .update({ issue_id: primary.id })
        .eq('issue_id', secondary.id)

    // 3. timeline_points 이전
    // 주 이슈의 가장 이른 '발단' 시각을 기준으로:
    // - 기준 시각 이전 포인트 → 삭제 (발단보다 앞선 파생은 이 이슈 타임라인에 불필요)
    // - 기준 시각 이후 포인트 → '파생'으로 주 이슈에 이전
    const { data: primaryBaldan } = await supabase
        .from('timeline_points')
        .select('occurred_at')
        .eq('issue_id', primary.id)
        .eq('stage', '발단')
        .order('occurred_at', { ascending: true })
        .limit(1)

    const baldanAt = primaryBaldan?.[0]?.occurred_at ?? primary.created_at

    // 기준 시각 이전: 삭제
    await supabase
        .from('timeline_points')
        .delete()
        .eq('issue_id', secondary.id)
        .lt('occurred_at', baldanAt)

    // 기준 시각 이후: '파생'으로 주 이슈에 이전
    await supabase
        .from('timeline_points')
        .update({ issue_id: primary.id, stage: '파생' })
        .eq('issue_id', secondary.id)
        .gte('occurred_at', baldanAt)

    // 4. 부 이슈 숨김 처리 + merged_into_id 설정
    await supabase
        .from('issues')
        .update({
            merged_into_id: primary.id,
            visibility_status: 'hidden',
            updated_at: new Date().toISOString(),
        })
        .eq('id', secondary.id)
}

async function main() {
    console.log(`\n${DRY_RUN ? '[DRY RUN] ' : ''}관련 이슈 병합 탐지 시작\n`)

    // 승인된 이슈 전체 조회 (최근 30일)
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const { data: issues, error } = await supabase
        .from('issues')
        .select('id, title, category, status, heat_index, approval_status, created_at, updated_at')
        .in('approval_status', ['승인', '대기'])
        .is('merged_into_id', null)
        .gte('created_at', since)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('이슈 조회 실패:', error)
        process.exit(1)
    }

    console.log(`대상 이슈: ${issues.length}건 (최근 30일 승인)\n`)

    // 카테고리별로 그룹화
    const byCategory = new Map<string, Issue[]>()
    for (const issue of issues) {
        if (!byCategory.has(issue.category)) byCategory.set(issue.category, [])
        byCategory.get(issue.category)!.push(issue)
    }

    // secondary_id → primary_id 맵 (체인 평탄화용)
    const mergeMap = new Map<string, string>()
    // 이슈 ID → Issue 객체 (체인 평탄화 후 Issue 정보 조회용)
    const issueById = new Map<string, Issue>(issues.map((i: Issue) => [i.id, i]))

    for (const [category, categoryIssues] of byCategory) {
        if (categoryIssues.length < 2) continue

        const totalPairs = (categoryIssues.length * (categoryIssues.length - 1)) / 2
        console.log(`\n[${category}] ${categoryIssues.length}건 (비교 쌍: ${totalPairs}개)`)

        let pairCount = 0
        let limitReached = false
        for (let i = 0; i < categoryIssues.length && !limitReached; i++) {
            for (let j = i + 1; j < categoryIssues.length; j++) {
                if (pairCount >= MAX_PAIRS_PER_CATEGORY) {
                    console.log(`  ⚠️  최대 비교 쌍(${MAX_PAIRS_PER_CATEGORY}) 도달 — 나머지 건너뜀`)
                    limitReached = true
                    break
                }
                pairCount++
                const a = categoryIssues[i]
                const b = categoryIssues[j]

                // 둘 다 이미 secondary인 경우 건너뜀 (이미 다른 이슈에 귀속)
                if (mergeMap.has(a.id) && mergeMap.has(b.id)) continue

                const result = await compareIssuesByAI(a, b)

                if (result.isSame) {
                    const { primary, secondary } = selectPrimary(a, b)

                    // secondary가 이미 다른 primary에 귀속된 경우 → primary의 root를 따라감
                    const rootPrimaryId = findRoot(primary.id, mergeMap)
                    mergeMap.set(secondary.id, rootPrimaryId)

                    console.log(`  ✓ [병합 대상] 신뢰도 ${result.confidence}%`)
                    console.log(`    주: "${issueById.get(rootPrimaryId)?.title ?? primary.title}"`)
                    console.log(`    부: "${secondary.title}" (화력 ${secondary.heat_index}, ${secondary.status})`)
                    console.log(`    이유: ${result.reason}`)
                }

                await new Promise(r => setTimeout(r, BATCH_DELAY_MS))
            }
        }
    }

    // 체인 평탄화: 모든 secondary가 최종 root를 가리키도록
    for (const secondaryId of mergeMap.keys()) {
        mergeMap.set(secondaryId, findRoot(secondaryId, mergeMap))
    }

    // 최종 병합 목록 구성
    const mergeCandidates: MergeCandidate[] = []
    for (const [secondaryId, primaryId] of mergeMap) {
        const primary = issueById.get(primaryId)
        const secondary = issueById.get(secondaryId)
        if (!primary || !secondary) continue
        mergeCandidates.push({
            primary,
            secondary,
            confidence: CONFIDENCE_THRESHOLD,
            reason: '',
        })
    }

    // root별로 그룹화해서 출력
    const groups = new Map<string, Issue[]>()
    for (const [secondaryId, primaryId] of mergeMap) {
        if (!groups.has(primaryId)) groups.set(primaryId, [])
        groups.get(primaryId)!.push(issueById.get(secondaryId)!)
    }

    console.log(`\n${'─'.repeat(60)}`)
    console.log(`\n탐지 결과: ${groups.size}개 그룹, 총 ${mergeCandidates.length}건 병합 대상\n`)

    if (mergeCandidates.length === 0) {
        console.log('병합할 이슈가 없습니다.')
        return
    }

    // 그룹별 요약 출력
    for (const [primaryId, secondaries] of groups) {
        const primary = issueById.get(primaryId)!
        console.log(`▶ 주 이슈: "${primary.title}" (화력 ${primary.heat_index}, ${primary.status})`)
        for (const s of secondaries) {
            console.log(`  ← "${s.title}" (화력 ${s.heat_index}, ${s.status})`)
        }
        console.log()
    }

    if (DRY_RUN) {
        console.log('(--dry-run: 실제 DB 변경 없음)')
        return
    }

    // 실제 병합 실행
    console.log('\n병합 실행 중...\n')
    let done = 0
    for (const c of mergeCandidates) {
        await doMerge(c.primary, c.secondary)
        console.log(`  ✅ "${c.secondary.title}" → "${c.primary.title}"`)
        done++
    }

    console.log(`\n완료: ${done}건 병합`)
}

main().catch(console.error)
