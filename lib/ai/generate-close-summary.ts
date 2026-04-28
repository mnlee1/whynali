/**
 * lib/ai/generate-close-summary.ts
 *
 * 이슈 종결 요약 생성
 * 타임라인 포인트를 기반으로 "이 이슈가 어떻게 끝났는지"를 AI가 요약
 * recalculate-heat 크론에서 종결 전환 시 호출 + update-timeline에서 백필
 */

import { supabaseAdmin } from '@/lib/supabase/server'
import { callGroq } from '@/lib/ai/groq-client'
import { parseJsonObject } from '@/lib/ai/parse-json-response'

export async function generateCloseSummary(issueId: string, issueTitle: string, force = false): Promise<void> {
    // force=false일 때만 기존 요약 스킵 (force=true이면 날짜 없는 요약도 재생성)
    if (!force) {
        const { data: existing } = await supabaseAdmin
            .from('timeline_summaries')
            .select('id')
            .eq('issue_id', issueId)
            .eq('stage', '종결')
            .maybeSingle()

        if (existing) return
    }

    // 타임라인 포인트 조회
    const { data: points } = await supabaseAdmin
        .from('timeline_points')
        .select('stage, title, occurred_at')
        .eq('issue_id', issueId)
        .order('occurred_at', { ascending: true })

    if (!points || points.length === 0) return

    const STAGE_ORDER: Record<string, number> = { '발단': 0, '전개': 1, '파생': 2, '진정': 3 }
    const grouped = new Map<string, Array<{ title: string; occurred_at: string | null }>>()
    for (const p of points) {
        if (!grouped.has(p.stage)) grouped.set(p.stage, [])
        grouped.get(p.stage)!.push({ title: p.title ?? '', occurred_at: p.occurred_at })
    }

    const stagesText = [...grouped.keys()]
        .sort((a, b) => (STAGE_ORDER[a] ?? 9) - (STAGE_ORDER[b] ?? 9))
        .map(stage => {
            const items = grouped.get(stage)!
            const lines = items.map(item => {
                const dt = new Date(item.occurred_at ?? '')
                const dateStr = !isNaN(dt.getTime())
                    ? `${dt.getMonth() + 1}월 ${dt.getDate()}일`
                    : ''
                return dateStr ? `- [${dateStr}] ${item.title}` : `- ${item.title}`
            }).join('\n')
            return `[${stage}]\n${lines}`
        }).join('\n\n')

    const allDates = points.map(p => p.occurred_at).filter(Boolean).sort()
    const closedAt = new Date().toISOString()

    const prompt = `이슈: "${issueTitle}"

아래는 이 이슈의 전체 타임라인 기사 제목입니다.

${stagesText}

## 작업: 이 이슈가 어떻게 마무리됐는지 요약해주세요.

두 가지 패턴 중 하나로 정리하세요:
1. **해결/결론 있음**: 사과, 처벌, 합의, 판결, 발표 등 명확한 결론이 있는 경우
2. **자연 소멸**: 결론 없이 여론의 관심에서 멀어진 경우

## 지침:
- 기사 제목에 나온 사실만 사용하세요 (추측 금지)
- stageTitle: 이 이슈의 마무리를 한 구절로 (예: "공식 사과로 일단락", "결론 없이 자연 소멸")
- bullets: 마무리 과정의 핵심 포인트 2~3개 (한 문장씩)
- 각 bullet의 date는 해당 뉴스의 [날짜]를 그대로 사용 (날짜 정보가 없으면 빈 문자열 "")
- 기사가 적거나 결론이 불분명하면 솔직하게 "관심 감소로 자연 소멸" 등으로 표현

JSON 응답:
{"stageTitle":"마무리 제목","bullets":[{"date":"4월 26일","text":"포인트1"},{"date":"4월 27일","text":"포인트2"}]}`

    try {
        const content = await callGroq(
            [{ role: 'user', content: prompt }],
            { model: 'llama-3.1-8b-instant', temperature: 0.1, max_tokens: 400 },
        )

        const parsed = parseJsonObject<{ stageTitle: string; bullets: Array<{ date: string; text: string } | string> }>(content)
        if (!parsed?.stageTitle || !parsed?.bullets?.length) return

        type BulletItem = { date: string; text: string }
        const lastDate = allDates.length > 0 ? (() => {
            const dt = new Date(allDates[allDates.length - 1])
            return !isNaN(dt.getTime()) ? `${dt.getMonth() + 1}월 ${dt.getDate()}일` : ''
        })() : ''

        const bullets: BulletItem[] = (parsed.bullets ?? [])
            .map((b): BulletItem | null => {
                if (typeof b === 'string') return b.trim() ? { date: lastDate, text: b.trim() } : null
                if (b && typeof b === 'object' && typeof b.text === 'string' && b.text.trim()) {
                    return { date: (b.date ?? '').trim() || lastDate, text: b.text.trim() }
                }
                return null
            })
            .filter((b): b is BulletItem => b !== null)

        const { error } = await supabaseAdmin
            .from('timeline_summaries')
            .upsert({
                issue_id: issueId,
                stage: '종결',
                stage_title: parsed.stageTitle,
                bullets,
                summary: bullets.map(b => b.text).join(' '),
                date_start: allDates[allDates.length - 1] ?? closedAt,
                date_end: closedAt,
                generated_at: closedAt,
            }, { onConflict: 'issue_id,stage' })

        if (error) {
            console.warn(`  ⚠️ [종결 요약 저장 실패] ${issueTitle}: ${error.message}`)
        } else {
            console.log(`  ✓ [종결 요약 저장] ${issueTitle}: "${parsed.stageTitle}"`)
        }
    } catch (err) {
        console.warn(`  ⚠️ [종결 요약 생성 실패] ${issueTitle}:`, err)
    }
}
