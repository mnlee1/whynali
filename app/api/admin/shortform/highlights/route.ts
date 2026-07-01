/**
 * app/api/admin/shortform/highlights/route.ts
 *
 * [관리자 - 씬 텍스트 하이라이트 추출 전용 API]
 *
 * 수동 입력된 씬 텍스트 배열을 받아 강조 단어만 추출합니다.
 * Claude Sonnet 4.6 사용, $CLAUDE_SHORTFORM_DAILY_BUDGET_USD 한도($0.02) 적용.
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireAdmin } from '@/lib/admin'
import { incrementApiUsage, getTodayUsage, calculateClaudeCost } from '@/lib/api-usage-tracker'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(request: NextRequest) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    let body: { texts?: string[] }
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 })
    }

    const texts = (body.texts ?? []).filter(t => typeof t === 'string' && t.trim().length > 0)
    if (texts.length === 0) {
        return NextResponse.json({ highlights: [] })
    }

    const hlAnthropicKey = process.env.ANTHROPIC_API_KEY?.trim()
    const hlDailyBudget = parseFloat(process.env.CLAUDE_SHORTFORM_DAILY_BUDGET_USD ?? '0.02')
    const hlTodayUsage = await getTodayUsage('claude_shortform')
    const hlTodayCost = calculateClaudeCost(hlTodayUsage?.input_tokens ?? 0, hlTodayUsage?.output_tokens ?? 0)
    const hlBudgetOk = !!hlAnthropicKey && hlTodayCost < hlDailyBudget

    console.log(`[highlights] 예산 — 오늘 $${hlTodayCost.toFixed(4)} / 한도 $${hlDailyBudget}`)

    if (!hlBudgetOk) {
        console.warn('[highlights] 예산 초과 또는 API 키 없음 — 빈 배열 반환')
        return NextResponse.json({ highlights: texts.map(() => []), budgetExceeded: true })
    }

    const highlights: string[][] = await Promise.all(texts.map(async (text) => {
        try {
            const client = new Anthropic({ apiKey: hlAnthropicKey! })
            const res = await client.messages.create({
                model: 'claude-sonnet-4-6',
                max_tokens: 100,
                temperature: 0,
                messages: [{ role: 'user', content: `"${text}" 텍스트에서 강조할 핵심 단어 1~3개를 추출하세요.\n\n규칙:\n- 명사, 숫자+단위(380만원, 100억 등), 고유명사 위주로 추출\n- 한국어 조사/어미(까지, 에서, 으로, 이/가, 을/를, 은/는, 와/과, 도, 만, 로, 에 등)는 제거하고 어근만 반환\n- 예: "380만원까지" → "380만원", "서울에서" → "서울"\n- 문장에 등장하는 순서대로 JSON 배열로만 응답\n\n예: ["단어1","단어2"]` }],
            })
            await incrementApiUsage('claude_shortform', {
                calls: 1, successes: 1, failures: 0,
                inputTokens: res.usage.input_tokens,
                outputTokens: res.usage.output_tokens,
            })
            const raw = res.content[0]?.type === 'text' ? res.content[0].text.trim() : ''
            const match = raw.match(/\[[\s\S]*?\]/)
            return match ? (JSON.parse(match[0]) as unknown[]).map(String) : []
        } catch (err) {
            console.warn('[highlights] 추출 실패', { text: text.slice(0, 30), err })
            await incrementApiUsage('claude_shortform', { calls: 1, successes: 0, failures: 1 })
            return []
        }
    }))

    return NextResponse.json({ highlights })
}
