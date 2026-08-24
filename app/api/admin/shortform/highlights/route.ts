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

// 씬 개수만큼 Anthropic 호출을 한 번에 동시 발사하면 레이트리밋(429)에 걸려
// 일부 씬만 조용히 실패하는 문제가 있었음 — 동시 실행 개수를 제한해서 완화
const CONCURRENCY = 2
const MAX_ATTEMPTS = 2

async function extractOne(client: Anthropic, text: string): Promise<{ words: string[]; failed: boolean }> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
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
            const allMatches = [...raw.matchAll(/\[[\s\S]*?\]/g)]
            for (let mi = allMatches.length - 1; mi >= 0; mi--) {
                try {
                    const parsed = JSON.parse(allMatches[mi][0])
                    if (Array.isArray(parsed)) return { words: (parsed as unknown[]).map(String), failed: false }
                } catch { /* 다음 매칭 시도 */ }
            }
            // 응답은 받았지만 JSON 배열 형식을 못 찾음 — 재시도
            console.warn('[highlights] 응답 형식 불일치, 재시도', { attempt, text: text.slice(0, 30) })
        } catch (err) {
            console.warn('[highlights] 추출 실패, 재시도', { attempt, text: text.slice(0, 30), err })
            await incrementApiUsage('claude_shortform', { calls: 1, successes: 0, failures: 1 })
        }
    }
    return { words: [], failed: true }
}

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

    const client = new Anthropic({ apiKey: hlAnthropicKey! })
    const results: { words: string[]; failed: boolean }[] = []
    for (let i = 0; i < texts.length; i += CONCURRENCY) {
        const batch = texts.slice(i, i + CONCURRENCY)
        const batchResults = await Promise.all(batch.map(text => extractOne(client, text)))
        results.push(...batchResults)
    }

    const highlights = results.map(r => r.words)
    // 재시도까지 다 실패해서 진짜로 추출 못한 씬의 인덱스 — 클라이언트가
    // "하이라이트 없음"과 "추출 실패"를 구분해서 재시도 안내를 띄울 수 있도록 별도 전달
    const failedIndices = results.reduce<number[]>((acc, r, idx) => {
        if (r.failed) acc.push(idx)
        return acc
    }, [])

    return NextResponse.json({ highlights, failedIndices })
}
