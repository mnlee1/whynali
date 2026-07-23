/**
 * lib/pipeline/backfill-brief-summary.ts
 *
 * 이슈의 timeline_points만으로 timeline_summaries + brief_summary(3줄 요약)를 생성한다.
 * 관리자 마이그레이션(app/api/admin/migrations/generate-timeline-summaries)과
 * 자동 백필 크론(app/api/cron/daily-generate-content)이 공유해서 사용한다.
 */

import { supabaseAdmin } from '@/lib/supabase-server'
import { callGroq } from '@/lib/ai/groq-client'
import { parseJsonObject } from '@/lib/ai/parse-json-response'
import { filterBannedBullets, containsBannedCommunityMention } from '@/lib/ai/timeline-content-guard'
import { formatKstDateHeader, formatKstTime } from '@/lib/utils/format-date'

const STAGE_ORDER: Record<string, number> = { '발단': 0, '전개': 1, '파생': 2, '진정': 3 }

export async function generateSummariesForIssue(
    issueId: string,
    issueTitle: string,
): Promise<number> {
    const { data: points } = await supabaseAdmin
        .from('timeline_points')
        .select('stage, title, occurred_at')
        .eq('issue_id', issueId)
        .order('occurred_at', { ascending: true })

    if (!points || points.length === 0) return 0

    // 진행 중인 투표 조회 — bullet과 주제가 겹치면 linkedVoteId로 연결
    const { data: activeVotes } = await supabaseAdmin
        .from('votes')
        .select('id, title, vote_choices(label)')
        .eq('issue_id', issueId)
        .eq('phase', '진행중')
        .eq('approval_status', '승인')
    const voteCandidates = (activeVotes ?? []).filter(v => v.title)
    const voteIdSet = new Set(voteCandidates.map(v => v.id))
    const voteLine = voteCandidates.length > 0
        ? `\n## 진행 중인 투표 (관련 있으면 bullet에 연결)\n아래는 이 이슈에서 진행 중인 투표입니다. bullet 중 이 투표와 같은 사건·조치를 다루는 게 있으면, 그 bullet에 "linkedVoteId"로 투표 id를 표시하세요. 관련 bullet이 없으면 생략하세요. 목록에 없는 id는 절대 만들어내지 마세요.\n${voteCandidates.map(v => `- id: "${v.id}", 제목: "${v.title}", 선택지: ${(v.vote_choices ?? []).map((c: { label: string }) => c.label).join(', ')}`).join('\n')}\n`
        : ''

    // timeline_points가 너무 많으면 최근 50개만 사용 (토큰 제한 방지)
    const limitedPoints = points.length > 50 ? points.slice(-50) : points

    const grouped = new Map<string, Array<{ title: string; occurred_at: string }>>()
    for (const p of limitedPoints) {
        if (!grouped.has(p.stage)) grouped.set(p.stage, [])
        grouped.get(p.stage)!.push({ title: p.title ?? '', occurred_at: p.occurred_at })
    }

    const stages = [...grouped.keys()].sort(
        (a, b) => (STAGE_ORDER[a] ?? 9) - (STAGE_ORDER[b] ?? 9)
    )

    const stagesText = stages.map(stage => {
        const items = grouped.get(stage)!
        const lines = items.map(i => {
            const dt = new Date(i.occurred_at)
            const dateStr = !isNaN(dt.getTime())
                ? `${formatKstDateHeader(i.occurred_at)} ${formatKstTime(i.occurred_at)}`
                : ''
            return dateStr ? `- [${dateStr}] ${i.title}` : `- ${i.title}`
        }).join('\n')
        return `[${stage}]\n${lines}`
    }).join('\n\n')

    const prompt = `이슈: "${issueTitle}"
${voteLine}
다음은 이 이슈와 관련된 뉴스 기사 제목들입니다.
각 단계는 [발단], [전개], [파생], [진정]으로 구분되어 있습니다.

${stagesText}

## 중요: 단계별 독립 요약 원칙
- **각 단계는 해당 단계의 뉴스만 사용**해서 요약하세요
- 예: [발단] 요약 시 [전개]나 [파생]의 뉴스는 절대 사용하지 마세요
- **중복된 내용의 뉴스는 하나만 선택**하세요 (예: "본격화" 제목이 3개면 1개만 사용)
- **bullets 개수는 해당 단계의 뉴스 개수를 초과하지 마세요**

## 법적 안전성 준수
- 위 기사 제목에 있는 내용만 사용하세요
- 기사 본문은 없으므로 제목에 없는 내용을 추측하지 마세요

## 요청사항
위 원칙을 엄격히 지켜 각 단계를 독립적으로 요약해주세요.

**출력 형식:**
1. 각 단계를 "발단/전개/파생/진정" 중 하나로 분류
2. 각 단계의 핵심 사건들을 bullet points로 (1~5개, 해당 단계 뉴스 개수 이하)
3. 각 bullet은 한 문장으로 간결하게
4. 제목에서 확인할 수 있는 사실만 작성
5. stageTitle에는 단계명을 붙이지 말고 내용만 작성 (예: "녹대 탈출" O, "[발단] 녹대 탈출" X)
6. 각 bullet의 date는 해당 뉴스의 [날짜 시:분]을 그대로 사용 (날짜 정보가 없으면 빈 문자열 "")
7. 각 bullet의 text에서 문장의 핵심 절(주어+행동 어간)을 마크다운 \`**\`로 볼드 표시하고, "했"/"하고 있" 같은 시제 표현과 "~어요"/"~습니다" 같은 종결어미는 반드시 볼드 밖에 일반체로 남기세요.
   - 좋은 예: "**타 제작사들이 자발적으로 안전점검을 실시**했어요." (볼드는 "실시"에서 끝나고, "했어요"는 전부 일반체)
   - 나쁜 예: "**타 제작사들이 자발적으로 안전점검을 실시했**어요." ("했"까지 볼드에 포함 — 시제 표현은 볼드 밖으로 빼야 함)
8. 모든 문장은 해요체(예: "~했어요", "~하고 있어요")로 작성하고, "~습니다" 같은 하십시오체는 쓰지 마세요
9. 같은 단계의 bullet들끼리 종결 표현이 반복되지 않게 다양하게 쓰세요 (예: "~했어요", "~됐어요", "~하고 있어요", "~라고 밝혔어요" 등을 섞어서 사용). 모든 bullet이 "~했어요"로만 끝나면 안 됩니다.${voteCandidates.length > 0 ? '\n10. 위 "진행 중인 투표" 목록과 같은 사건·조치를 다루는 bullet이 있으면 그 bullet에 "linkedVoteId"를 투표 id 그대로 표시하세요 (관련 없으면 생략)' : ''}

**브리핑:** (intro/bullets/conclusion/threeLine 전부 마크다운 볼드(**) 없이 일반 텍스트로만 작성 — 위 타임라인 bullet의 볼드 규칙은 여기 적용하지 마세요)
- intro: 이슈를 한 문장으로 (예: "~가 ~해서 논란이야")
- bullets: 핵심 팩트 3~5개
- conclusion: 한 줄 결론 (예: "👉 ~한 상황이야")
- threeLine: intro·bullets·conclusion 전체 내용을 종합해서 "상황 → 전개 → 현재 상태" 3줄로 다시 압축. 세 줄이 서로 겹치는 내용을 반복하지 않도록 각 줄에 다른 정보를 담을 것. 각 줄은 "~했어요", "~하고 있어요"처럼 친근한 해요체로 작성하고, "~습니다" 같은 하십시오체나 "~야", "~해" 같은 반말은 쓰지 말 것

JSON 응답:
{
  "summaries": [
    {"stage":"발단","stageTitle":"제목","bullets":[{"date":"4월 25일 09:00","text":"사건1"},{"date":"4월 26일 14:30","text":"사건2"}]},
    {"stage":"전개","stageTitle":"제목","bullets":[{"date":"4월 26일 18:00","text":"후속1"},{"date":"4월 27일 10:15","text":"후속2","linkedVoteId":"진행 중인 투표 목록의 id (관련될 때만)"}]}
  ],
  "brief": {"intro":"한 문장","bullets":["팩트1","팩트2"],"conclusion":"결론","threeLine":["상황 압축 1줄이에요","전개 압축 1줄이에요","현재상태 압축 1줄이에요"]}
}`

    const content = await callGroq(
        [{ role: 'user', content: prompt }],
        { model: 'openai/gpt-oss-120b', temperature: 0.1, max_tokens: 2000 },
    )

    const parsed = parseJsonObject<{
        summaries: Array<{ stage: string; stageTitle: string; bullets: Array<{ date: string; text: string; linkedVoteId?: string } | string> }>
        brief: { intro: string; bullets: string[]; conclusion: string; threeLine?: string[] }
    }>(content)

    if (!parsed?.summaries) return 0

    type BulletItem = { date: string; text: string; linkedVoteId?: string }
    const now = new Date().toISOString()
    const rows = stages.map(stage => {
        const items = grouped.get(stage)!
        const dates = items.map(i => i.occurred_at).sort()
        const ai = parsed.summaries.find(s => s.stage === stage)

        const rawBullets: Array<string | BulletItem> = ai?.bullets ?? []
        let bullets: BulletItem[] = rawBullets
            .map((b): BulletItem | null => {
                if (typeof b === 'string') {
                    const text = b.trim()
                    return text ? { date: '', text } : null
                }
                if (b && typeof b === 'object' && typeof b.text === 'string' && b.text.trim()) {
                    const linkedVoteId = typeof b.linkedVoteId === 'string' && voteIdSet.has(b.linkedVoteId) ? b.linkedVoteId : undefined
                    return { date: (b.date ?? '').trim(), text: b.text.trim(), ...(linkedVoteId ? { linkedVoteId } : {}) }
                }
                return null
            })
            .filter((b): b is BulletItem => b !== null)

        bullets = filterBannedBullets(bullets, `${issueTitle} - ${stage}`)

        if (bullets.length > items.length) {
            console.warn(`  ⚠️ [요약 품질 경고] ${issueTitle} - ${stage}: bullets(${bullets.length}개)가 뉴스(${items.length}개)보다 많음`)
        }

        const uniqueBullets: BulletItem[] = []
        for (const bullet of bullets) {
            const normalized = bullet.text.toLowerCase().trim()
            const isDuplicate = uniqueBullets.some(existing => {
                const existingNormalized = existing.text.toLowerCase().trim()
                if (normalized === existingNormalized) return true
                const shorter = normalized.length < existingNormalized.length ? normalized : existingNormalized
                const longer = normalized.length >= existingNormalized.length ? normalized : existingNormalized
                return longer.includes(shorter) && shorter.length / longer.length > 0.9
            })
            if (!isDuplicate) uniqueBullets.push(bullet)
        }

        if (uniqueBullets.length < bullets.length) {
            console.log(`  ✓ [중복 제거] ${issueTitle} - ${stage}: ${bullets.length}개 → ${uniqueBullets.length}개`)
        }

        return {
            issue_id: issueId,
            stage,
            stage_title: ai?.stageTitle ?? stage,
            bullets: uniqueBullets,
            summary: uniqueBullets.map(b => b.text).join(' '),
            date_start: dates[0],
            date_end: dates[dates.length - 1],
            generated_at: now,
        }
    })

    const { error } = await supabaseAdmin
        .from('timeline_summaries')
        .upsert(rows, { onConflict: 'issue_id,stage' })

    if (error) {
        console.warn(`  ⚠️ [요약 저장 실패] ${issueTitle}: ${error.message}`)
        return 0
    }

    // 브리핑 저장
    if (parsed.brief) {
        const safeBrief = {
            ...parsed.brief,
            bullets: (parsed.brief.bullets ?? []).filter(b => !containsBannedCommunityMention(b)),
            threeLine: (parsed.brief.threeLine ?? []).filter(l => !containsBannedCommunityMention(l)),
        }
        const { error: briefError } = await supabaseAdmin
            .from('issues')
            .update({ brief_summary: safeBrief })
            .eq('id', issueId)
        if (briefError) {
            console.warn(`  ⚠️ [브리핑 저장 실패] ${issueTitle}: ${briefError.message}`)
        }
    }

    return rows.length
}
