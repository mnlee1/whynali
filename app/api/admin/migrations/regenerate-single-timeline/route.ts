/**
 * app/api/admin/migrations/regenerate-single-timeline/route.ts
 *
 * 단일 이슈의 타임라인 요약을 재생성하는 API
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { callGroq } from '@/lib/ai/groq-client'
import { parseJsonObject } from '@/lib/ai/parse-json-response'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const STAGE_ORDER: Record<string, number> = { '발단': 0, '전개': 1, '파생': 2, '진정': 3 }

export async function POST(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const issueId = searchParams.get('issueId')

        if (!issueId) {
            return NextResponse.json({ error: 'issueId required' }, { status: 400 })
        }

        const { data: issue } = await supabaseAdmin
            .from('issues')
            .select('id, title')
            .eq('id', issueId)
            .single()

        if (!issue) {
            return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
        }

        const { data: points } = await supabaseAdmin
            .from('timeline_points')
            .select('stage, title, occurred_at')
            .eq('issue_id', issueId)
            .order('occurred_at', { ascending: true })

        if (!points || points.length === 0) {
            // 포인트가 전부 삭제된 경우 — 남아있는 summaries도 함께 정리
            await supabaseAdmin
                .from('timeline_summaries')
                .delete()
                .eq('issue_id', issueId)
            return NextResponse.json({ 
                success: true,
                title: issue.title,
                stages: 0,
                bullets: 0,
            })
        }

        const grouped = new Map<string, Array<{ title: string; occurred_at: string }>>()
        for (const p of points) {
            if (!grouped.has(p.stage)) grouped.set(p.stage, [])
            grouped.get(p.stage)!.push({ title: p.title ?? '', occurred_at: p.occurred_at })
        }

        const stages = [...grouped.keys()].sort(
            (a, b) => (STAGE_ORDER[a] ?? 9) - (STAGE_ORDER[b] ?? 9)
        )

        const stagesText = stages.map(stage => {
            const titles = grouped.get(stage)!.map(i => `- ${i.title}`).join('\n')
            return `[${stage}]\n${titles}`
        }).join('\n\n')

        const prompt = `이슈: "${issue.title}"

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

**브리핑:**
- intro: 이슈를 한 문장으로 (예: "~가 ~해서 논란이야")
- bullets: 핵심 팩트 3~5개
- conclusion: 한 줄 결론 (예: "👉 ~한 상황이야")

JSON 응답:
{
  "summaries": [
    {"stage":"발단","stageTitle":"제목","bullets":["사건1","사건2"]},
    {"stage":"전개","stageTitle":"제목","bullets":["후속1","후속2"]}
  ],
  "brief": {"intro":"한 문장","bullets":["팩트1","팩트2"],"conclusion":"결론"}
}`

        const content = await callGroq(
            [{ role: 'user', content: prompt }],
            { model: 'llama-3.1-8b-instant', temperature: 0.1, max_tokens: 2000 },
        )

        const parsed = parseJsonObject<{
            summaries: Array<{ stage: string; stageTitle: string; bullets: string[] }>
            brief: { intro: string; bullets: string[]; conclusion: string }
        }>(content)

        if (!parsed?.summaries) {
            return NextResponse.json({ 
                error: 'Failed to parse AI response',
                title: issue.title 
            }, { status: 500 })
        }

        const now = new Date().toISOString()
        const rows = stages.map(stage => {
            const items = grouped.get(stage)!
            const dates = items.map(i => i.occurred_at).sort()
            const ai = parsed.summaries.find(s => s.stage === stage)
            
            let bullets = ai?.bullets ?? []
            
            // 중복 제거
            const uniqueBullets: string[] = []
            for (const bullet of bullets) {
                const normalized = bullet.toLowerCase().trim()
                const isDuplicate = uniqueBullets.some(existing => {
                    const existingNormalized = existing.toLowerCase().trim()
                    if (normalized === existingNormalized) return true
                    const shorter = normalized.length < existingNormalized.length ? normalized : existingNormalized
                    const longer = normalized.length >= existingNormalized.length ? normalized : existingNormalized
                    return longer.includes(shorter) && shorter.length / longer.length > 0.9
                })
                
                if (!isDuplicate) {
                    uniqueBullets.push(bullet)
                }
            }
            
            return {
                issue_id: issueId,
                stage,
                stage_title: ai?.stageTitle ?? stage,
                bullets: uniqueBullets,
                summary: uniqueBullets.join(' '),
                date_start: dates[0],
                date_end: dates[dates.length - 1],
                generated_at: now,
            }
        })

        // 현재 active stage 이외의 orphan 행만 삭제 → 그 후 upsert
        // delete-then-insert 방식은 insert 실패 시 빈 타임라인이 될 수 있어 이 순서가 더 안전함
        const activeStages = rows.map(r => r.stage)
        await supabaseAdmin
            .from('timeline_summaries')
            .delete()
            .eq('issue_id', issueId)
            .not('stage', 'in', `(${activeStages.join(',')})`)

        const { error } = await supabaseAdmin
            .from('timeline_summaries')
            .upsert(rows, { onConflict: 'issue_id,stage' })

        if (error) {
            return NextResponse.json({ 
                error: 'Failed to save summaries',
                details: error.message,
                title: issue.title 
            }, { status: 500 })
        }

        // 브리핑 저장
        if (parsed.brief) {
            await supabaseAdmin
                .from('issues')
                .update({ brief_summary: parsed.brief })
                .eq('id', issueId)
        }

        return NextResponse.json({
            success: true,
            title: issue.title,
            stages: rows.length,
            bullets: rows.reduce((sum, r) => sum + r.bullets.length, 0)
        })

    } catch (error) {
        console.error('[regenerate-single-timeline] Error:', error)
        return NextResponse.json({ 
            error: 'Internal server error',
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 })
    }
}
