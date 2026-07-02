/**
 * app/api/admin/shortform/rewrite/route.ts
 *
 * [관리자 - 숏폼 씬 텍스트 AI 재작성 API]
 *
 * 관리자가 씬에 배정한 원본 텍스트를 Groq(qwen/qwen3.6-27b)으로 재작성합니다.
 * 기승전결 맥락으로 씬별 자막을 생성하며, 중복 내용은 후처리로 제거합니다.
 * 하이라이트 추출은 Claude Sonnet 4.6이 담당하며 $CLAUDE_SHORTFORM_DAILY_BUDGET_USD 한도($0.02) 적용.
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireAdmin } from '@/lib/admin'
import { incrementApiUsage, getTodayUsage, calculateClaudeCost } from '@/lib/api-usage-tracker'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface RewriteScene {
    index: number
    text: string
    stage?: string  // 발단 | 전개 | 파생 | 진정 | 종결
}

/** 두 문자열이 지나치게 유사한지 확인 (공백·구두점 제거 후 비교) */
function isTooSimilar(a: string, b: string): boolean {
    const norm = (s: string) => s.replace(/[\s.,!?~""'']/g, '')
    const na = norm(a)
    const nb = norm(b)
    if (!na || !nb) return false
    if (na === nb) return true
    if (na.includes(nb) || nb.includes(na)) return true
    // 문자 집합 기준 Jaccard 유사도 > 0.58 이면 중복으로 판단 (더 타이트하게)
    const sa = new Set(na.split(''))
    const sb = new Set(nb.split(''))
    const intersection = [...sa].filter(c => sb.has(c)).length
    const union = new Set([...sa, ...sb]).size
    return intersection / union > 0.58
}

/** 명사/불완전 어미로 끝나는 자막인지 확인 */
function isIncompletePhrase(s: string): boolean {
    return /[가-힣](이|가|을|를|은|는|에|의|도|와|과|로|으로|만|에서|까지|부터|이며|하며|이고|하고|이나|이자|처럼)$/.test(s)
}


/** 반말 어미를 합쇼체로 변환 (AI가 반말로 생성했을 경우 보정) */
function fixFormalEndings(s: string): string {
    return s
        .replace(/때문이다\.?$/, '때문입니다')
        .replace(/라고 했다\.?$/, '라고 했습니다')
        .replace(/라고 한다\.?$/, '라고 합니다')
        .replace(/이었다\.?$/, '이었습니다')
        .replace(/였다\.?$/, '였습니다')
        .replace(/했다\.?$/, '했습니다')
        .replace(/됐다\.?$/, '됐습니다')
        .replace(/겠다\.?$/, '겠습니다')
        .replace(/됩니다\.?$/, '됩니다')   // 이미 합쇼체 — 유지
        .replace(/된다\.?$/, '됩니다')
        .replace(/한다\.?$/, '합니다')
        .replace(/하다\.?$/, '합니다')
        .replace(/았다\.?$/, '았습니다')
        .replace(/었다\.?$/, '었습니다')
        .replace(/이다\.?$/, '입니다')
        .replace(/있다\.?$/, '있습니다')
        .replace(/없다\.?$/, '없습니다')
        .replace(/\.$/, '')
        .trim()
}

/** 원문 마지막 단어 추출 (구두점 제거) */
function extractLastWord(text: string): string {
    return text.trim().split(/\s+/).slice(-1)[0]?.replace(/[.,!?~""''·。]/g, '') ?? ''
}

/**
 * 씬 수(2~5)에 따라 서사 역할 목록을 문자열로 반환 (최대 5씬)
 *
 * 2씬: 훅 → 마무리
 * 3씬: 훅 → 전개 → 마무리
 * 4씬: 훅 → 배경 → 전개 → 마무리
 * 5씬: 훅 → 배경 → 전개 → 반전 → 마무리
 */
function buildNarrativeStructure(count: number, isConcluded: boolean): string {
    const closing = isConcluded
        ? '결론을 단언하는 합쇼체 (~됐습니다/~입니다)'
        : '시청자 궁금증을 남기는 의문형 합쇼체 (~될까요?/~할까요?)'

    const HOOK  = `씬1 [훅]: 가장 충격적인 사실을 강렬하게. 접속사 없이 시작. 합쇼체 (~합니다/~됩니다/~입니다)`
    const BG    = `씬2 [배경]: 왜 이 일이 일어났는지, 맥락 제공. 합쇼체 현재형 (~합니다/~됩니다)`
    const DEV3  = `씬3 [전개]: 어떻게 번졌는지, 핵심 파급. 합쇼체 현재형 (~합니다/~됩니다)`
    const REV4  = `씬4 [반전]: 새롭게 드러난 사실이나 더 넓은 파급. 합쇼체 단언형 (~였습니다/~이었습니다)`

    const structures: Record<number, string[]> = {
        2: [HOOK, `씬2 [마무리]: ${closing}`],
        3: [HOOK, `씬2 [전개]: 왜 이 일이 일어났는지 맥락 + 어떻게 번졌는지. 합쇼체`, `씬3 [마무리]: ${closing}`],
        4: [HOOK, BG, DEV3, `씬4 [마무리]: ${closing}`],
        5: [HOOK, BG, DEV3, REV4, `씬5 [마무리]: ${closing}`],
    }

    return (structures[count] ?? structures[5]).join('\n')
}

/** 중복 텍스트를 원본으로 대체 */
function deduplicateTexts(texts: string[], originals: string[]): string[] {
    const seen: string[] = []
    return texts.map((text, i) => {
        const trimmed = text.trim()
        const original = originals[i]?.trim() ?? ''

        // 너무 짧거나 불완전한 문장 → 원본으로 보완
        const isTooShort = trimmed.length < 12
        const isIncomplete = isIncompletePhrase(trimmed)

        if (isTooShort || isIncomplete) {
            const expanded = original.length >= 12
                ? original.slice(0, 24)
                : original.length > 0
                    ? `${original} 사태가 주목받고 있다`
                    : `${trimmed} 상황이 주목받고 있다`
            seen.push(expanded)
            return expanded
        }
        const isDuplicate = seen.some(prev => isTooSimilar(prev, trimmed))
        if (isDuplicate) {
            return original.slice(0, 24) || trimmed
        }
        seen.push(trimmed)
        return trimmed
    })
}


export async function POST(request: NextRequest) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    let body: {
        issueTitle?: string
        scenes?: RewriteScene[]
        issueStatus?: string
        totalScenes?: number  // 단일 씬 재생성 시 실제 전체 씬 수
        variation?: boolean   // 단일 씬 재생성 시 다른 표현 요청
        contextBullets?: string[]  // 이슈 전체 맥락 bullets
    }
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 })
    }

    const issueTitle = body.issueTitle ?? ''
    const issueStatus = body.issueStatus ?? ''
    const scenes: RewriteScene[] = body.scenes ?? []
    const contextBullets: string[] = body.contextBullets ?? []

    if (scenes.length === 0) {
        return NextResponse.json({ texts: [] })
    }

    const isConcluded = issueStatus === '종결'
    const variation = body.variation ?? false
    const sceneCount = scenes.length
    const maxTokens = Math.max(600, sceneCount * 100)

    // 주 입력: allBullets 우선, 없으면 선택된 씬 원문 사용
    const contentLines = contextBullets.length > 0
        ? contextBullets.map((b, i) => `${i + 1}. ${b}`).join('\n')
        : scenes.map((s, i) => `${i + 1}. ${s.text}`).join('\n')

    const closingInstruction = isConcluded
        ? '마지막 씬: 결론을 단언하는 합쇼체로 끝낼 것 (~됐습니다/~입니다)'
        : '마지막 씬: 시청자 궁금증을 남기는 의문형 합쇼체로 끝낼 것 (~될까요?/~할까요?)'

    const prompt = `당신은 숏폼 SNS 자막 작가입니다.

이슈: ${issueTitle}

이슈 내용:
${contentLines}

위 내용으로 SNS 숏폼 자막 ${sceneCount}개를 작성하세요.
가장 이슈화될 사실을 중심으로, 시청자가 다음 씬이 궁금해지도록 스토리를 전개하세요.

구성:
- 씬1: 가장 충격적·핵심적인 사실. 접속사 없이 시작
- 중간 씬: 배경 → 전개 → 반전 흐름으로 한 단계씩 진전
- ${closingInstruction}

규칙:
- 모든 문장 합쇼체 (~합니다/~됩니다/~입니다/~됐습니다/~될까요?)
- 한 씬 24자 이내, 핵심 수치·인명·기관명은 그대로 사용
- "그런데"/"한편"/"문제는" 등 접속사로 씬 시작 금지
- 각 씬은 서로 다른 사실을 담을 것${variation ? '\n- 이전과 다른 각도·표현으로 새롭게 작성' : ''}

${sceneCount}줄만 응답 (번호·설명 없이):
`

    let raw = ''

    // ── Groq 리라이트 ──
    const groqKey = (process.env.GROQ_API_KEY ?? '').split(',')[0].trim()
    if (!groqKey) {
        return NextResponse.json({ texts: scenes.map(s => s.text) })
    }

    const groqBody = JSON.stringify({
        model: 'qwen/qwen3.6-27b',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: variation ? 0.6 : 0.3,
    })

    const callGroq = async (): Promise<Response> => {
        for (let attempt = 0; attempt < 3; attempt++) {
            const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
                body: groqBody,
            })
            if (res.status !== 429) return res
            const retryAfter = parseInt(res.headers.get('retry-after') ?? '5')
            const wait = Math.min(retryAfter, 10) * 1000
            console.warn(`[rewrite] Groq 429 — ${wait / 1000}초 후 재시도 (${attempt + 1}/3)`)
            await new Promise(r => setTimeout(r, wait))
        }
        return fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
            body: groqBody,
        })
    }

    try {
        const groqRes = await callGroq()
        if (!groqRes.ok) {
            const errBody = await groqRes.text().catch(() => '')
            console.error('[rewrite] Groq API 오류:', groqRes.status, errBody.slice(0, 200))
            return NextResponse.json(
                { error: 'GROQ_ERROR', message: `Groq API 오류 (${groqRes.status})` },
                { status: 503 }
            )
        }
        const data = await groqRes.json()
        raw = data.choices?.[0]?.message?.content?.trim() ?? ''
        console.log('[rewrite] Groq 응답:', raw.slice(0, 100))
    } catch (error) {
        console.error('[rewrite] Groq 예외:', error)
        return NextResponse.json({ error: 'INTERNAL_ERROR', message: '서버 오류' }, { status: 500 })
    }

    try {

        // AI 응답 prefix 제거:
        //   "씬3: ..."  /  "Scene 3: ..."  /  "1. ..."  /  "1) ..."  /  "[전개]: ..."  /  "**씬1:** ..."
        const stripPrefix = (l: string) =>
            l
                .replace(/^\*+/, '').replace(/\*+$/, '')   // bold markdown
                .replace(/^씬\s*\d+\s*[:.]\s*/, '')        // 씬1: 씬1.
                .replace(/^Scene\s*\d+\s*[:.]\s*/i, '')    // Scene 1:
                .replace(/^\[.*?\][\s:.]+/, '')             // [훅] text / [전개]: / [훅].
                .replace(/^\d+[\.\)]\s*/, '')               // 1. 1)
                .trim()

        const lines = raw
            .split('\n')
            .map(stripPrefix)
            .filter(l => l.length > 0)

        if (lines.length === 0) {
            console.warn('[rewrite] 응답 파싱 실패:', raw.slice(0, 100))
            return NextResponse.json(
                { error: 'PARSE_ERROR', message: 'AI 응답 파싱 실패' },
                { status: 503 }
            )
        }

        // 씬 수 부족 시 원본으로 채움
        while (lines.length < sceneCount) {
            lines.push(scenes[lines.length]?.text ?? '')
        }

        const trimmed = lines.slice(0, sceneCount).map(fixFormalEndings)

        // 중복 후처리
        const texts = deduplicateTexts(trimmed, scenes.map(s => s.text))
            .map(t => t.replace(/\.$/, ''))

        // ── 씬별 하이라이트 병렬 추출 (Claude Sonnet — $0.02/day 한도) ──
        const hlAnthropicKey = process.env.ANTHROPIC_API_KEY?.trim()
        const hlDailyBudget = parseFloat(process.env.CLAUDE_SHORTFORM_DAILY_BUDGET_USD ?? '0.02')
        const hlTodayUsage = await getTodayUsage('claude_shortform')
        const hlTodayCost = calculateClaudeCost(hlTodayUsage?.input_tokens ?? 0, hlTodayUsage?.output_tokens ?? 0)
        const hlBudgetOk = !!hlAnthropicKey && hlTodayCost < hlDailyBudget

        console.log(`[rewrite] 하이라이트 예산 — 오늘 $${hlTodayCost.toFixed(4)} / 한도 $${hlDailyBudget}`)

        const highlights: string[][] = await Promise.all(texts.map(async (text) => {
            if (!hlBudgetOk) return []
            try {
                const hlClient = new Anthropic({ apiKey: hlAnthropicKey! })
                const hlRes = await hlClient.messages.create({
                    model: 'claude-sonnet-4-6',
                    max_tokens: 100,
                    temperature: 0,
                    messages: [{ role: 'user', content: `"${text}" 텍스트에서 강조할 핵심 단어 1~3개를 문장에 등장하는 순서대로 JSON 배열로만 응답하세요. 예: ["단어1","단어2"]` }],
                })
                await incrementApiUsage('claude_shortform', {
                    calls: 1, successes: 1, failures: 0,
                    inputTokens: hlRes.usage.input_tokens,
                    outputTokens: hlRes.usage.output_tokens,
                })
                const hlRaw = hlRes.content[0]?.type === 'text' ? hlRes.content[0].text.trim() : ''
                const hlMatches = [...hlRaw.matchAll(/\[[\s\S]*?\]/g)]
                for (let mi = hlMatches.length - 1; mi >= 0; mi--) {
                    try {
                        const parsed = JSON.parse(hlMatches[mi][0])
                        if (Array.isArray(parsed)) return (parsed as unknown[]).map(String)
                    } catch { /* 다음 매칭 시도 */ }
                }
                return []
            } catch (err) {
                console.warn('[rewrite] 하이라이트 추출 실패', { text: text.slice(0, 30), err })
                await incrementApiUsage('claude_shortform', { calls: 1, successes: 0, failures: 1 })
                return []
            }
        }))

        return NextResponse.json({ texts, highlights })
    } catch (error) {
        console.error('[rewrite] 예외:', error)
        return NextResponse.json(
            { error: 'INTERNAL_ERROR', message: '서버 오류' },
            { status: 500 }
        )
    }
}
