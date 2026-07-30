/**
 * lib/pipeline/backfill-brief-summary.ts
 *
 * 이슈의 timeline_points만으로 timeline_summaries + brief_summary(3줄 요약)를 생성한다.
 * 관리자 마이그레이션(app/api/admin/migrations/generate-timeline-summaries)과
 * 자동 백필 크론(app/api/cron/daily-generate-content)이 공유해서 사용한다.
 */

import { supabaseAdmin } from '@/lib/supabase-server'
import { callGemini } from '@/lib/ai/gemini-client'
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
        ? `\n## 진행 중인 투표 (관련 있으면 bullet에 연결)\n아래는 이 이슈에서 진행 중인 투표입니다. bullet 중 이 투표와 같은 사건·조치를 다루는 게 있으면, 그 bullet에 "linkedVoteId"로 투표 id를 표시하세요. 관련 bullet이 없으면 생략하세요. 목록에 없는 id는 절대 만들어내지 마세요. 같은 투표를 여러 bullet에 동시에 연결하지 말고, 전체 타임라인에서 가장 관련성 높은 bullet 딱 1개에만 연결하세요.\n${voteCandidates.map(v => `- id: "${v.id}", 제목: "${v.title}", 선택지: ${(v.vote_choices ?? []).map((c: { label: string }) => c.label).join(', ')}`).join('\n')}\n`
        : ''

    // timeline_points가 너무 많으면 최근 15개만 사용
    // (Groq openai/gpt-oss-120b는 org당 8000 TPM 한도 + thinking 모델 강제 6000토큰 플로어 때문에,
    //  프롬프트가 조금만 커져도 요청 1건 자체가 한도를 넘어 재시도로도 해결 불가 — 실측으로 15개가 안전선)
    // 단, 시간순으로 그냥 "최근 N개"만 자르면 가장 오래된 발단(이슈의 시작) 포인트가 통째로
    // 잘려나가는 문제가 있어 — 발단은 무조건 전부 포함하고, 캡은 나머지 단계에만 적용한다
    const POINT_CAP = 15
    const baldanPoints = points.filter(p => p.stage === '발단')
    const otherPoints = points.filter(p => p.stage !== '발단')
    const remainingCap = Math.max(0, POINT_CAP - baldanPoints.length)
    // remainingCap이 0이면 slice(-0)이 배열 전체를 반환해버리는 JS 함정이 있어 별도 분기 처리
    const limitedOtherPoints = remainingCap === 0
        ? []
        : (otherPoints.length > remainingCap ? otherPoints.slice(otherPoints.length - remainingCap) : otherPoints)
    const limitedPoints = [...baldanPoints, ...limitedOtherPoints]

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
3. 각 bullet은 한 문장으로, 20자에서 35자 내외로 간결하게 작성하세요. 배경 설명이나 부연 설명은 빼고 핵심 사실 하나만 담으세요. "~하면서"/"~하며"/"~고"로 여러 사건을 길게 이어붙이지 말고, 꼭 필요한 경우가 아니면 한 가지 사실만 짧게 쓰세요.
4. 제목에서 확인할 수 있는 사실만 작성
5. stageTitle에는 단계명을 붙이지 말고 내용만 작성 (예: "녹대 탈출" O, "[발단] 녹대 탈출" X)
6. 각 bullet의 date는 해당 뉴스의 [날짜 시:분]을 그대로 사용 (날짜 정보가 없으면 빈 문자열 "")
7. 각 bullet의 text에서 문장 전체를 통틀어 가장 중요한 사실을 최대 2곳까지만 골라 마크다운 \`**\`로 짧게 볼드 표시하세요 — 절이 여러 개인 문장이라도 절마다 볼드하지 말고, 전체에서 딱 1개 또는 2개만 고르세요. 고를 때는 숫자나 명사만 단독으로 끊지 말고 수식어를 포함한 명사구나 핵심 동사로 짧게 고르세요. 조사(은/는/이/가/을/를 등), 시제 표현("했"/"하고 있"), 종결어미("어요"/"습니다")는 반드시 볼드 밖에 일반체로 남기고, 절 전체나 문장 전체를 통째로 볼드하지 마세요.
   - 좋은 예: "**레버리지 중심**의 증시 구조를 진단하고 생산적 금융으로의 **전환 필요성**이 제기됐어요." (전체에서 가장 중요한 2곳만 골라 수식어+명사 형태로 짧게 볼드)
   - 나쁜 예: "**레버리지 중심**의 증시 구조를 **진단**하고 생산적 금융으로의 **전환 필요성**이 **제기**됐어요." (절마다 다 볼드해서 4곳 — 너무 촘촘함)
   - 나쁜 예: "**레버리지 중심의 증시 구조를 진단하고 생산적 금융으로의 전환 필요성이 제기**됐어요." (문장 전체를 통째로 볼드 — 너무 넓음)
   - 나쁜 예: "레버리지 중심의 증시 구조를 진단하고 생산적 금융으로의 전환 필요성이 제기됐어요." (볼드가 하나도 없음)
8. 모든 문장은 해요체(예: "~했어요", "~하고 있어요", "~됐어요")로 작성하세요. "~했다", "~였다", "~한다"로 끝나는 신문체나 "~습니다", "~입니다", "~합니다"로 끝나는 하십시오체는 절대 쓰지 마세요 (threeLine 포함 브리핑 전체에도 동일하게 적용)
9. 같은 단계의 bullet들끼리 종결 표현이 반복되지 않게 다양하게 쓰세요 (예: "~했어요", "~됐어요", "~하고 있어요", "~라고 밝혔어요" 등을 섞어서 사용). 모든 bullet이 "~했어요"로만 끝나면 안 됩니다.${voteCandidates.length > 0 ? '\n10. 위 "진행 중인 투표" 목록과 같은 사건·조치를 다루는 bullet이 있으면 그 bullet에 "linkedVoteId"를 투표 id 그대로 표시하세요 (관련 없으면 생략). 투표 하나당 bullet 1개에만 연결하고, 여러 bullet에 중복 연결하지 마세요' : ''}

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

    const content = await callGemini(
        [{ role: 'user', content: prompt }],
        { model: 'gemini-3.5-flash-lite', temperature: 0.1, max_tokens: 2000, jsonMode: true },
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

    // 같은 투표가 여러 bullet에 중복 연결되지 않도록, 가장 나중(최신) bullet 하나만 남기고 나머지는 제거
    // (stages가 발단→진정 순으로 정렬돼 있고 각 stage 내부도 시간순이라, 순서대로 덮어쓰면 최신 것만 남음)
    const seenVoteBullets = new Map<string, BulletItem>()
    for (const row of rows) {
        for (const bullet of row.bullets) {
            if (!bullet.linkedVoteId) continue
            const prev = seenVoteBullets.get(bullet.linkedVoteId)
            if (prev) delete prev.linkedVoteId
            seenVoteBullets.set(bullet.linkedVoteId, bullet)
        }
    }

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
