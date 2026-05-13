/**
 * app/api/admin/shortform/rewrite/route.ts
 *
 * [관리자 - 숏폼 씬 텍스트 AI 재작성 API]
 *
 * 관리자가 씬에 배정한 원본 텍스트를 Groq(무료)로 재작성합니다.
 * 기승전결 맥락으로 씬별 자막을 생성하며, 중복 내용은 후처리로 제거합니다.
 * Groq API 키가 없으면 원본 텍스트를 그대로 반환합니다.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

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
        .replace(/\.$/, '')
        .trim()
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
                ? original.slice(0, 45)
                : original.length > 0
                    ? `${original} 사태가 주목받고 있다`
                    : `${trimmed} 상황이 주목받고 있다`
            seen.push(expanded)
            return expanded
        }
        const isDuplicate = seen.some(prev => isTooSimilar(prev, trimmed))
        if (isDuplicate) {
            return original.slice(0, 45) || trimmed
        }
        seen.push(trimmed)
        return trimmed
    })
}

/** stage + 씬 위치 기반으로 서사 역할 문자열 반환 (B+A 조합) */
function getNarrativeRole(
    sceneIdx: number,    // 전체 영상에서의 실제 인덱스 (0-based)
    total: number,       // 전체 씬 수
    stage: string | undefined,
    isConcluded: boolean,
): string {
    const STAGE_HINT: Record<string, string> = {
        '발단': '사건 시작·원인',
        '전개': '파급·반응·확산',
        '파생': '새로운 국면·반전',
        '진정': '갈등 수그러짐',
        '종결': '최종 결과',
    }
    const hint = stage ? ` (소스: ${STAGE_HINT[stage] ?? stage})` : ''

    if (sceneIdx === 0) {
        return `훅 — 가장 충격적이거나 흥미로운 사실 한 줄. 명사형(~한다/~떠난다) 또는 짧은 단언(~였다/~이다)으로 끝낼 것. 마침표 없이.${hint}`
    }
    if (sceneIdx === total - 1) {
        return isConcluded
            ? `마무리 — 결론을 단언하는 사실 문장. ~됐다/~이다 로 끝낼 것.${hint}`
            : `마무리 — 시청자 궁금증을 남기는 의문형. ~될까? 또는 ~할까? 로 끝낼 것.${hint}`
    }

    // 중간 씬: stage 우선, 없으면 상대 위치로 판단
    if (stage === '파생') return `반전 — 새롭게 드러난 사실이나 숨겨진 이면. ~였다/~이었다 로 끝낼 것.${hint}`
    if (stage === '진정') return `전환 — 갈등이 수그러드는 신호. 현재형(~한다/~된다)으로 끝낼 것.${hint}`

    const ratio = sceneIdx / (total - 1) // 0.0 ~ 1.0
    if (ratio <= 0.4) return `배경 — 왜 이 일이 일어났는지 맥락 제공. 현재형(~한다/~됐다)으로 끝낼 것.${hint}`
    return `전개 — 어떻게 번졌는지, 핵심 파급 사실. 현재형(~한다/~된다)으로 끝낼 것.${hint}`
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
    }
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 })
    }

    const issueTitle = body.issueTitle ?? ''
    const issueStatus = body.issueStatus ?? ''
    const scenes: RewriteScene[] = body.scenes ?? []

    if (scenes.length === 0) {
        return NextResponse.json({ texts: [] })
    }

    const apiKey = (process.env.GROQ_API_KEY ?? '').split(',')[0].trim()
    if (!apiKey) {
        return NextResponse.json({ texts: scenes.map(s => s.text) })
    }

    const isConcluded = issueStatus === '종결'
    const variation = body.variation ?? false
    // totalScenes: 단일 씬 재생성 시 실제 전체 수를 받아 역할 계산에 사용
    const total = body.totalScenes ?? scenes.length

    const sceneLines = scenes.map((s) => {
        const role = getNarrativeRole(s.index, total, s.stage, isConcluded)
        return `씬${s.index + 1} [${role}]: ${s.text}`
    }).join('\n')

    const sceneCount = scenes.length

    const prompt = `당신은 숏폼 자막 편집자입니다.
각 씬에는 서사 역할이 지정되어 있습니다. 역할에 맞는 문장을 원본에서 뽑아 자연스럽게 작성해 주세요.
원본이 이미 자연스러운 문장이면 최대한 그대로 유지하고, 길 경우에만 핵심만 남겨 압축하세요.

이슈: ${issueTitle}

씬별 원본 내용 (역할 포함):
${sceneLines}

서사 역할 및 말끝 스타일:
- 훅: 가장 충격적인 사실. 접속사 없이 강렬하게 시작. → 명사형(~한다/~떠난다) 또는 단언(~였다/~이다)
- 배경: 왜 이 일이 일어났는지 맥락. → 현재형(~한다/~됐다)
- 전개: 어떻게 번졌는지, 핵심 파급 사실. → 현재형(~한다/~된다)
- 반전: 새롭게 드러난 이면이나 예상치 못한 국면. → 단언(~였다/~이었다)
- 전환: 갈등이 수그러들거나 상황이 바뀌는 신호. → 현재형(~한다/~된다)
- 마무리: ${isConcluded ? '결론을 단언. → ~됐다/~이다' : '시청자 궁금증을 남기는 의문형. → ~될까?/~할까?'}

규칙:
- 원본의 핵심 키워드와 사실은 최대한 유지 (불필요한 생략 금지)
- "-됩니다/-했습니다/-입니다" 같은 공식체 어미 사용 금지
- 각 씬의 말끝은 위 역할별 스타일을 반드시 따를 것
- 각 문장 45자 이내 — 자연스러운 완성이 우선, 인위적 생략 금지
- "그런데", "문제는", "알고 보니", "한편", "그 결과" 등 접속사로 문장 시작 금지
- 각 씬은 앞 씬과 다른 사실을 담아 이야기를 한 단계씩 진전시킬 것

${variation ? '이전 표현과 다른 각도로, 같은 사실을 새롭게 표현해 주세요.\n\n' : ''}${sceneCount}줄로만 응답 (번호·설명 없이, 한 줄에 씬 하나):
`



    const groqBody = JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: Math.max(600, sceneCount * 80),
        temperature: variation ? 0.6 : 0.3,
    })

    const callGroq = async (): Promise<Response> => {
        for (let attempt = 0; attempt < 3; attempt++) {
            const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
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
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: groqBody,
        })
    }

    try {
        const res = await callGroq()

        if (!res.ok) {
            const errBody = await res.text().catch(() => '')
            console.error('[rewrite] Groq API 오류:', res.status, errBody.slice(0, 200))
            return NextResponse.json(
                { error: 'GROQ_ERROR', message: `Groq API 오류 (${res.status})` },
                { status: 503 }
            )
        }

        const data = await res.json()
        const raw: string = data.choices?.[0]?.message?.content?.trim() ?? ''

        // AI 응답 prefix 제거:
        //   "씬3: ..."  /  "Scene 3: ..."  /  "1. ..."  /  "1) ..."  /  "[전개]: ..."  /  "**씬1:** ..."
        const stripPrefix = (l: string) =>
            l
                .replace(/^\*+/, '').replace(/\*+$/, '')   // bold markdown
                .replace(/^씬\s*\d+\s*[:.]\s*/, '')        // 씬1: 씬1.
                .replace(/^Scene\s*\d+\s*[:.]\s*/i, '')    // Scene 1:
                .replace(/^\[.*?\]\s*[:.]\s*/, '')          // [전개]: [훅]:
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

        return NextResponse.json({ texts })
    } catch (error) {
        console.error('[rewrite] 예외:', error)
        return NextResponse.json(
            { error: 'INTERNAL_ERROR', message: '서버 오류' },
            { status: 500 }
        )
    }
}
