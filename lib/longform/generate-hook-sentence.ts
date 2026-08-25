/**
 * lib/longform/generate-hook-sentence.ts
 *
 * 관리자가 직접 입력한 롱폼 오프닝 훅 문장 A에서 강조 단어만 추출.
 * app/api/admin/shortform/highlights/route.ts와 동일한 방식 — Claude Sonnet 단건 호출.
 * Claude 호출은 $CLAUDE_LONGFORM_DAILY_BUDGET_USD 한도(기본 $0.02, 숏폼과 별도 집계) 적용.
 *
 * app/api/admin/longform/hook/route.ts에서 호출한다.
 */

import Anthropic from '@anthropic-ai/sdk'
import { incrementApiUsage, getTodayUsage, calculateClaudeCost } from '@/lib/api-usage-tracker'

const USAGE_KEY = 'claude_longform'
const MAX_ATTEMPTS = 2

export interface HookHighlightResult {
    ok: boolean
    highlightsA?: string[]
    budgetExceeded?: boolean
    error?: string
    message?: string
}

export async function extractHookHighlight(text: string): Promise<HookHighlightResult> {
    const cleanText = text.trim()
    if (!cleanText) {
        return { ok: false, error: 'INVALID_INPUT', message: '훅 문장 A를 먼저 입력해 주세요' }
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim()
    const dailyBudget = parseFloat(process.env.CLAUDE_LONGFORM_DAILY_BUDGET_USD ?? '0.02')
    const todayUsage = await getTodayUsage(USAGE_KEY)
    const todayCost = calculateClaudeCost(todayUsage?.input_tokens ?? 0, todayUsage?.output_tokens ?? 0)
    const budgetOk = !!anthropicKey && todayCost < dailyBudget

    console.log(`[longform/hook] 예산 — 오늘 $${todayCost.toFixed(4)} / 한도 $${dailyBudget}`)

    if (!budgetOk) {
        return { ok: true, highlightsA: [], budgetExceeded: true }
    }

    // 줄바꿈 = 이슈 1개 기준(폼 안내 문구와 동일한 전제) — 이슈당 1개씩 배분되도록 최대 개수를 줄 수에 비례해서 계산
    // (짧은 줄에 2개씩 넣으면 노란색이 절반 이상을 덮어서 오히려 강조 효과가 떨어짐)
    const lineCount = Math.max(1, cleanText.split('\n').map(l => l.trim()).filter(Boolean).length)
    const maxWords = lineCount

    const client = new Anthropic({ apiKey: anthropicKey! })
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            const res = await client.messages.create({
                model: 'claude-sonnet-4-6',
                max_tokens: 100,
                temperature: 0,
                messages: [{
                    role: 'user',
                    content: `"${cleanText.replace(/\n/g, ' / ')}" 텍스트에서 강조할 핵심 단어를 등장 순서대로 JSON 배열로만 응답하세요 (최대 ${maxWords}개, 줄바꿈으로 구분된 이슈 1개당 가장 중요한 단어 1개씩만).\n\n규칙:\n- 명사, 숫자+단위, 고유명사 위주로 추출\n- 한국어 조사/어미는 제거하고 어근만 반환\n\n예: ["단어1","단어2"]`,
                }],
            })
            await incrementApiUsage(USAGE_KEY, {
                calls: 1, successes: 1, failures: 0,
                inputTokens: res.usage.input_tokens,
                outputTokens: res.usage.output_tokens,
            })
            const raw = res.content[0]?.type === 'text' ? res.content[0].text.trim() : ''
            const matches = [...raw.matchAll(/\[[\s\S]*?\]/g)]
            for (let mi = matches.length - 1; mi >= 0; mi--) {
                try {
                    const parsed = JSON.parse(matches[mi][0])
                    if (Array.isArray(parsed)) return { ok: true, highlightsA: (parsed as unknown[]).map(String) }
                } catch { /* 다음 매칭 시도 */ }
            }
            console.warn('[longform/hook] 응답 형식 불일치, 재시도', { attempt })
        } catch (err) {
            console.warn('[longform/hook] 하이라이트 추출 실패, 재시도', { attempt, err })
            await incrementApiUsage(USAGE_KEY, { calls: 1, successes: 0, failures: 1 })
        }
    }

    return { ok: false, error: 'EXTRACT_ERROR', message: '하이라이트 추출 실패' }
}
