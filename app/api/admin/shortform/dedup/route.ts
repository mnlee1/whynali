/**
 * app/api/admin/shortform/dedup/route.ts
 *
 * [관리자 - 숏폼 AI 의미 중복 제거 API]
 *
 * 요약된 씬 목록에서 표현은 달라도 같은 사실을 가리키는 중복 항목을 AI로 판단해 제거합니다.
 * 파싱 실패나 과도한 제거(2개 미만) 시 원본 목록을 그대로 반환합니다.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// 최대 1개만 제거 허용 (5개 → 최소 4개 유지)
const MIN_SCENES = 4

interface DedupScene {
    index: number
    text: string
}

export async function POST(request: NextRequest) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    let body: { issueTitle?: string; scenes?: DedupScene[] }
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 })
    }

    const issueTitle = body.issueTitle ?? ''
    const scenes: DedupScene[] = body.scenes ?? []

    // MIN_SCENES 이하면 제거할 게 없음
    if (scenes.length <= MIN_SCENES) {
        return NextResponse.json({ keepIndices: scenes.map((_, i) => i) })
    }

    const apiKey = (process.env.GROQ_API_KEY ?? '').split(',')[0].trim()
    if (!apiKey) {
        return NextResponse.json({ keepIndices: scenes.map((_, i) => i) })
    }

    const sceneLines = scenes.map((s, i) => `${i + 1}. ${s.text}`).join('\n')

    const prompt = `아래 씬 목록에서 내용이 거의 동일한 항목만 제거하세요.

이슈: ${issueTitle}

씬 목록:
${sceneLines}

판단 기준:
- 같은 인물·사건·수치가 등장하고 전달하는 사실이 90% 이상 겹치는 경우만 중복으로 판단
- 비슷한 주제라도 전달하는 사실이 다르면 모두 유지
- 확실히 중복인 경우가 없으면 전체 유지
- 최소 ${MIN_SCENES}개는 반드시 남길 것

JSON으로만 응답 (유지할 씬 번호 배열, 1부터 시작):
{"keep":[1,2,3,4]}`

    try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'openai/gpt-oss-120b',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 80,
                temperature: 0.1,
            }),
        })

        if (!res.ok) {
            console.error('[dedup] Groq API 오류:', res.status)
            return NextResponse.json({ keepIndices: scenes.map((_, i) => i) })
        }

        const data = await res.json()
        const raw: string = data.choices?.[0]?.message?.content?.trim() ?? ''

        const jsonMatch = raw.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
            console.warn('[dedup] JSON 파싱 실패, 원본 반환:', raw.slice(0, 80))
            return NextResponse.json({ keepIndices: scenes.map((_, i) => i) })
        }

        const parsed = JSON.parse(jsonMatch[0])
        const keepOnes: number[] = Array.isArray(parsed.keep) ? parsed.keep : []

        // 1-based → 0-based 변환 및 범위 검증
        const keepIndices = keepOnes
            .map((n: number) => n - 1)
            .filter((i: number) => i >= 0 && i < scenes.length)
            .sort((a: number, b: number) => a - b)

        // 과도한 제거 방지: MIN_SCENES 미만이면 원본 반환
        if (keepIndices.length < MIN_SCENES) {
            console.warn('[dedup] 과도한 제거 감지, 원본 반환:', keepIndices)
            return NextResponse.json({ keepIndices: scenes.map((_, i) => i) })
        }

        console.log('[dedup] 완료:', { total: scenes.length, kept: keepIndices.length, keepIndices })
        return NextResponse.json({ keepIndices })
    } catch (error) {
        console.error('[dedup] 예외:', error)
        return NextResponse.json({ keepIndices: scenes.map((_, i) => i) })
    }
}
