/**
 * app/api/admin/shortform/summarize/route.ts
 *
 * [관리자 - 숏폼 자막 사전 요약 API]
 *
 * 원문이 30자를 초과하는 씬만 AI로 요약합니다.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

interface SummarizeScene {
    index: number
    text: string
}

const MAX_LEN = 30

/** "-습니다" 계열 공식체 어미를 내레이션체("-다")로 변환 */
function fixFormalEndings(s: string): string {
    return s
        .replace(/때문입니다\.?$/, '때문이다')
        .replace(/라고 했습니다\.?$/, '라고 했다')
        .replace(/라고 합니다\.?$/, '라고 한다')
        .replace(/했습니다\.?$/, '했다')
        .replace(/됐습니다\.?$/, '됐다')
        .replace(/됩니다\.?$/, '된다')
        .replace(/입니다\.?$/, '이다')
        .replace(/있습니다\.?$/, '있다')
        .replace(/없습니다\.?$/, '없다')
        .replace(/습니다\.?$/, '다')
        .trim()
}

export async function POST(request: NextRequest) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    let body: { issueTitle?: string; scenes?: SummarizeScene[] }
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 })
    }

    const issueTitle = body.issueTitle ?? ''
    const scenes: SummarizeScene[] = body.scenes ?? []

    if (scenes.length === 0) {
        return NextResponse.json({ texts: [] })
    }

    // 30자 이하는 그대로, 초과 항목만 AI 요약 대상
    const result: string[] = scenes.map(s => s.text)
    const longIndices: number[] = scenes
        .map((s, i) => (s.text.length > MAX_LEN ? i : -1))
        .filter(i => i >= 0)

    if (longIndices.length === 0) {
        return NextResponse.json({ texts: result })
    }

    const apiKey = (process.env.GROQ_API_KEY ?? '').split(',')[0].trim()
    if (!apiKey) {
        return NextResponse.json({ texts: result })
    }

    const longScenes = longIndices.map(i => scenes[i])
    const itemLines = longScenes.map((s, i) => `항목${i + 1}: ${s.text}`).join('\n')

    const prompt = `자막용 텍스트를 30자 이내로 요약하세요.

이슈: ${issueTitle}

${itemLines}

규칙:
- 각 항목을 30자 이내로 줄일 것
- 주어+핵심 서술어를 포함한 완전한 문장으로 끝낼 것
- 조사(은/는/이/가/을/를/에/의)나 연결어미(이고/이며/하고/하며/이어/하여)로 끝나면 절대 안 됨
- 원문의 핵심 사실만 유지, 새로운 내용 추가 금지
- "-됩니다/-했습니다/-입니다" → "-다/-했다/-이다"로 변환

${longScenes.length}줄로만 응답 (번호·설명 없이, 한 줄에 항목 하나):
`

    try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: Math.max(150, longScenes.length * 50),
                temperature: 0.2,
            }),
        })

        if (!res.ok) {
            console.error('[summarize] Groq API 오류:', res.status)
            return NextResponse.json({ texts: result })
        }

        const data = await res.json()
        const raw: string = data.choices?.[0]?.message?.content?.trim() ?? ''

        const summarized = raw
            .split('\n')
            .map(l => l.replace(/^\d+[\.\)]\s*/, '').trim())
            .filter(l => l.length > 0)
            .slice(0, longScenes.length)
            .map(fixFormalEndings)

        longIndices.forEach((origIdx, i) => {
            const s = summarized[i]
            if (s && s.length > 0) {
                result[origIdx] = s
            }
        })

        console.log('[summarize] 요약 완료:', { longCount: longIndices.length, summarized })
        return NextResponse.json({ texts: result })
    } catch (error) {
        console.error('[summarize] 예외:', error)
        return NextResponse.json({ texts: result })
    }
}
