/**
 * app/api/admin/migrations/regenerate-single-timeline/route.ts
 *
 * 단일 이슈의 타임라인을 재분류 + 재생성하는 API
 *
 * 동작:
 *  1. timeline_points 전체 조회 (id, stage, title, occurred_at)
 *  2. AI(70b)에게 각 포인트 stage 재분류 + 단계별 요약 + 브리핑 한 번에 요청
 *  3. stage별 그룹 UPDATE로 timeline_points.stage 일괄 갱신
 *  4. timeline_summaries upsert
 *  5. issues.brief_summary 업데이트
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { callGroq } from '@/lib/ai/groq-client'
import { parseJsonObject } from '@/lib/ai/parse-json-response'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const VALID_STAGES = new Set(['발단', '전개', '파생', '진정'])
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
            .select('id, title, topic_description')
            .eq('id', issueId)
            .single()

        if (!issue) {
            return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
        }

        const { data: points } = await supabaseAdmin
            .from('timeline_points')
            .select('id, stage, title, occurred_at')
            .eq('issue_id', issueId)
            .order('occurred_at', { ascending: true })

        if (!points || points.length === 0) {
            await supabaseAdmin.from('timeline_summaries').delete().eq('issue_id', issueId)
            return NextResponse.json({ success: true, title: issue.title, stages: 0, bullets: 0 })
        }

        // 인덱스 기반 포인트 목록
        const pointsList = points
            .map((p, i) => `[${i}] ${p.occurred_at?.slice(0, 10)} | ${p.title ?? '(제목 없음)'}`)
            .join('\n')

        // 커뮤니티 게시글 — 발단 원인 추론용
        const { data: communityPosts } = await supabaseAdmin
            .from('community_data')
            .select('title, source_site')
            .eq('issue_id', issueId)
            .order('written_at', { ascending: true })
            .limit(15)

        const backgroundLine = issue.topic_description
            ? `이슈 배경: "${issue.topic_description}"\n`
            : ''

        const communitySection = communityPosts && communityPosts.length > 0
            ? `\n## 커뮤니티 게시글 (발단 원인 추론 참고용)\n더쿠·네이트판 등 커뮤니티 반응입니다. 미확인 정보가 포함될 수 있으므로 사실로 단정하지 말고 맥락 파악에만 활용하세요:\n${communityPosts.map(p => `- [${p.source_site}] ${p.title}`).join('\n')}`
            : ''

        const prompt = `이슈: "${issue.title}"
${backgroundLine}
아래 타임라인 포인트들은 여러 이슈가 병합되어 stage 분류가 뒤섞여 있습니다.
날짜 순서와 사건의 인과 흐름을 고려해 각 포인트를 올바르게 재분류하고, 단계별 상세 요약을 작성해주세요.
${communitySection}

## 포인트 목록 (인덱스 | 날짜 | 제목)
${pointsList}

## stage 정의
- 발단: 논란의 원인이 된 최초 사건·발언 (타임라인 초반, 소수만 해당)
- 전개: 논란이 확산·심화되는 후속 보도·반응 (대부분의 포인트)
- 파생: 메인 논란과 연관되지만 별도로 파생된 사건
- 진정: 논란이 수습·해소되거나 당사자가 공식 입장을 표명하는 국면

## 단계별 요약 원칙
- 각 단계는 해당 단계에 배정된 포인트만 사용해 요약하세요
- 포인트 제목을 그대로 복사하지 말고 내용을 재구성해서 서술하세요
- 비슷한 내용의 포인트는 하나로 통합하세요
- bullets 개수: 해당 단계 포인트 수 이하, 최대 5개
- stageTitle: 단계명 없이 이 단계의 핵심을 담은 짧은 제목 (예: "결자해지 압박" O, "[발단] 결자해지 압박" X)
- 각 bullet은 완결된 한 문장으로, 주어·서술어를 갖춰 구체적으로 작성하세요
- 각 bullet의 date는 해당 포인트의 날짜(YYYY-MM-DD 앞 부분 기준 "N월 N일" 형식)를 사용하세요 (날짜 정보가 없으면 빈 문자열 "")

## [발단] 작성 특별 지침
- 발단 포인트와 커뮤니티 게시글을 함께 참고해 논란의 실제 원인을 추론하세요
- 사과문·해명·활동중단 같은 결과/후속 내용은 발단 bullets에서 제외하세요
- 누가, 어디서(플랫폼/장소), 어떤 발언이나 행동이 문제가 됐는지 구체적으로 서술하세요
- 커뮤니티 게시글은 미확인 정보일 수 있으므로 "~했다는 의혹이 제기됐다", "~한 것으로 알려졌다" 같이 헤징 표현을 사용하세요
- 좋은 예: "강원 현장에서 김진태가 장동혁에게 결자해지를 요구하며 쓴소리를 했다"
- 나쁜 예: "논란이 시작됐다" (너무 모호)

## 브리핑
- intro: "~가 ~해서 논란이야" 형식으로 논란의 핵심을 한 문장에 담아 서술
- bullets: 전체 타임라인을 이해하는 데 필수적인 팩트 3~5개 (포인트 제목 그대로 복사 금지)
- conclusion: 현재 상황이나 최종 결과를 담은 한 줄 결론

JSON 응답 (reclassify 키에 모든 인덱스→stage 매핑 필수):
{
  "reclassify": {"0":"발단","1":"전개"},
  "summaries": [
    {"stage":"발단","stageTitle":"핵심 사건 제목","bullets":[{"date":"4월 25일","text":"누가 어디서 무엇을 해서 논란이 됐는지 구체적 서술"}]},
    {"stage":"전개","stageTitle":"핵심 전개 제목","bullets":[{"date":"4월 26일","text":"후속 사건 상세 서술1"},{"date":"4월 27일","text":"후속 사건 상세 서술2"}]}
  ],
  "brief": {"intro":"~가 ~해서 논란이야","bullets":["팩트1","팩트2","팩트3"],"conclusion":"결론"}
}`

        const content = await callGroq(
            [{ role: 'user', content: prompt }],
            { model: 'llama-3.3-70b-versatile', temperature: 0.15, max_tokens: 4000 },
        )

        const parsed = parseJsonObject<{
            reclassify: Record<string, string>
            summaries: Array<{ stage: string; stageTitle: string; bullets: Array<{ date: string; text: string } | string> }>
            brief: { intro: string; bullets: string[]; conclusion: string }
        }>(content)

        if (!parsed?.summaries) {
            return NextResponse.json({
                error: 'Failed to parse AI response',
                title: issue.title,
            }, { status: 500 })
        }

        // ── 1. timeline_points stage 재분류 ──────────────────────────
        if (parsed.reclassify && Object.keys(parsed.reclassify).length > 0) {
            // stage별로 그룹핑 → 최대 4번의 UPDATE로 처리
            const stageGroups: Record<string, string[]> = {}
            for (const [idxStr, stage] of Object.entries(parsed.reclassify)) {
                const idx = parseInt(idxStr, 10)
                const point = points[idx]
                if (!point || !VALID_STAGES.has(stage)) continue
                if (!stageGroups[stage]) stageGroups[stage] = []
                stageGroups[stage].push(point.id)
            }
            for (const [stage, ids] of Object.entries(stageGroups)) {
                await supabaseAdmin
                    .from('timeline_points')
                    .update({ stage })
                    .in('id', ids)
            }

            // 재분류 후 points 배열 갱신 (summaries 생성에 반영)
            for (const [idxStr, stage] of Object.entries(parsed.reclassify)) {
                const idx = parseInt(idxStr, 10)
                if (points[idx] && VALID_STAGES.has(stage)) {
                    points[idx] = { ...points[idx], stage }
                }
            }
        }

        // ── 2. 재분류된 stage 기준으로 그룹핑 ───────────────────────
        const grouped = new Map<string, Array<{ title: string; occurred_at: string }>>()
        for (const p of points) {
            if (!grouped.has(p.stage)) grouped.set(p.stage, [])
            grouped.get(p.stage)!.push({ title: p.title ?? '', occurred_at: p.occurred_at })
        }
        const stages = [...grouped.keys()].sort(
            (a, b) => (STAGE_ORDER[a] ?? 9) - (STAGE_ORDER[b] ?? 9)
        )

        // ── 3. timeline_summaries 행 구성 ────────────────────────────
        const now = new Date().toISOString()
        type BulletItem = { date: string; text: string }
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
                        return { date: (b.date ?? '').trim(), text: b.text.trim() }
                    }
                    return null
                })
                .filter((b): b is BulletItem => b !== null)

            bullets = bullets.filter((b) => b.text.trim().length > 0)

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

        // ── 4. timeline_summaries upsert ──────────────────────────────
        const activeStages = rows.map(r => r.stage)
        await supabaseAdmin
            .from('timeline_summaries')
            .delete()
            .eq('issue_id', issueId)
            .not('stage', 'in', `(${activeStages.join(',')})`)

        const { error: upsertError } = await supabaseAdmin
            .from('timeline_summaries')
            .upsert(rows, { onConflict: 'issue_id,stage' })

        if (upsertError) {
            return NextResponse.json({
                error: 'Failed to save summaries',
                details: upsertError.message,
                title: issue.title,
            }, { status: 500 })
        }

        // ── 5. 브리핑 저장 ────────────────────────────────────────────
        if (parsed.brief) {
            await supabaseAdmin
                .from('issues')
                .update({ brief_summary: parsed.brief })
                .eq('id', issueId)
        }

        const reclassifiedCount = parsed.reclassify ? Object.keys(parsed.reclassify).length : 0

        return NextResponse.json({
            success: true,
            title: issue.title,
            stages: rows.length,
            bullets: rows.reduce((sum, r) => sum + r.bullets.length, 0),
            reclassified: reclassifiedCount,
        })

    } catch (error) {
        console.error('[regenerate-single-timeline] Error:', error)
        return NextResponse.json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : String(error),
        }, { status: 500 })
    }
}
