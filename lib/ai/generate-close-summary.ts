/**
 * lib/ai/generate-close-summary.ts
 *
 * 이슈 종결 요약 생성
 * 타임라인 포인트를 기반으로 "이 이슈가 어떻게 끝났는지"를 AI가 요약
 * recalculate-heat 크론에서 종결 전환 시 호출 + update-timeline에서 백필
 */

import { supabaseAdmin } from '@/lib/supabase-server'
import { callGemini } from '@/lib/ai/gemini-client'
import { parseJsonObject } from '@/lib/ai/parse-json-response'
import { formatKstDateHeader, formatKstTime } from '@/lib/utils/format-date'

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
                    ? `${formatKstDateHeader(item.occurred_at ?? '')} ${formatKstTime(item.occurred_at ?? '')}`
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
- 각 bullet은 20자에서 35자 내외로 간결하게 작성하세요. 배경 설명이나 부연 설명은 빼고 핵심 사실 하나만 담고, "~하면서"/"~하며"/"~고"로 여러 사건을 길게 이어붙이지 마세요.
- 각 bullet의 date는 해당 뉴스의 [날짜 시:분]을 그대로 사용 (날짜 정보가 없으면 빈 문자열 "")
- 기사가 적거나 결론이 불분명하면 솔직하게 "관심이 자연스럽게 줄었어요"처럼 이슈 자체에 대한 문장으로 표현하세요
- 절대로 "기사 제목만 사용했다", "추측하지 않았다", "명확하지 않습니다" 같이 이 지침 자체나 AI의 판단 과정을 설명하는 문장을 bullet에 쓰지 마세요. bullet은 항상 이슈 내용에 대한 서술이어야 하고, AI의 작업 방식에 대한 메타 발언이면 안 됩니다
- 각 bullet의 text에서 문장 전체를 통틀어 가장 중요한 사실을 최대 2곳까지만 골라 마크다운 \`**\`로 짧게 볼드 표시하세요 — 절이 여러 개인 문장이라도 절마다 볼드하지 말고, 전체에서 딱 1개 또는 2개만 고르세요. 고를 때는 숫자나 명사만 단독으로 끊지 말고 수식어를 포함한 명사구나 핵심 동사로 짧게 고르세요. 조사(은/는/이/가/을/를 등), 시제 표현("했"/"하고 있"), 종결어미("어요"/"습니다")는 반드시 볼드 밖에 일반체로 남기고, 절 전체나 문장 전체를 통째로 볼드하지 마세요. 좋은 예: "**레버리지 중심**의 증시 구조를 진단하고 생산적 금융으로의 **전환 필요성**이 제기됐어요." (전체에서 가장 중요한 2곳만 골라 수식어+명사 형태로 짧게 볼드). 나쁜 예: "**레버리지 중심**의 증시 구조를 **진단**하고 생산적 금융으로의 **전환 필요성**이 **제기**됐어요." (절마다 다 볼드해서 4곳 — 너무 촘촘함)
- 모든 문장은 해요체(예: "~했어요", "~하고 있어요", "~됐어요")로 작성하세요. "~했다", "~였다", "~한다"로 끝나는 신문체나 "~습니다", "~입니다", "~합니다"로 끝나는 하십시오체는 절대 쓰지 마세요
- bullet들끼리 종결 표현이 반복되지 않게 다양하게 쓰세요 (예: "~했어요", "~됐어요", "~하고 있어요", "~라고 밝혔어요" 등을 섞어서 사용)

JSON 응답:
{"stageTitle":"마무리 제목","bullets":[{"date":"4월 26일 09:00","text":"**주어1**이 ~했어요"},{"date":"4월 27일 15:30","text":"**주어2**가 ~했어요"}]}`

    try {
        const content = await callGemini(
            [{ role: 'user', content: prompt }],
            { model: 'gemini-3.5-flash-lite', temperature: 0.1, max_tokens: 400, jsonMode: true },
        )

        const parsed = parseJsonObject<{ stageTitle: string; bullets: Array<{ date: string; text: string } | string> }>(content)
        if (!parsed?.stageTitle || !parsed?.bullets?.length) return

        type BulletItem = { date: string; text: string }
        const lastDate = allDates.length > 0 ? (() => {
            const last = allDates[allDates.length - 1]
            const dt = new Date(last as string)
            return !isNaN(dt.getTime()) ? `${formatKstDateHeader(last as string)} ${formatKstTime(last as string)}` : ''
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
