/**
 * lib/shortform/generate-text.ts
 *
 * 숏폼 텍스트 자동 생성 (Groq)
 *
 * brief_summary가 있으면 desc를 코드에서 직접 처리 (원문 그대로 사용, Groq 미경유)
 * title은 항상 Groq로 생성.
 * brief_summary가 없으면 Groq 프리 생성.
 */

import Groq from 'groq-sdk'

export interface ShortformTextInput {
    title: string
    category: string
    status: string
    heatGrade: string
    newsCount: number
    communityCount: number
    issueDescription?: string
    briefBullets?: string[]    // brief_summary 첫 번째 내용 — 씬2 desc 직접 사용
    briefConclusion?: string   // brief_summary 마지막 내용 — 씬3 desc 직접 사용
}

export interface ShortformTextOutput {
    scene1Title: string  // 씬1 타이틀 (20자 이내)
    scene1Desc: string   // 씬1 설명
    scene2Title: string  // 씬2 타이틀 (15자 이내)
    scene2Desc: string   // 씬2 설명 (35자 이내)
    scene3Title: string  // 씬3 타이틀 (15자 이내)
    scene3Desc: string   // 씬3 설명 (35자 이내)
}

/**
 * 이슈 제목에서 YouTube 해시태그용 한국어 키워드 2~3개 추출
 */
export async function extractYoutubeHashtags(title: string): Promise<string[]> {
    const apiKey = (process.env.GROQ_API_KEY ?? '').split(',')[0].trim()
    if (!apiKey) return []

    const groq = new Groq({ apiKey })
    const cleanTitle = title.replace(/^\[.*?\]\s*/, '').trim()

    try {
        const completion = await groq.chat.completions.create({
            model: 'llama-3.1-8b-instant',
            messages: [{
                role: 'user',
                content: `한국어 뉴스 이슈 제목에서 YouTube 해시태그에 쓸 핵심 키워드 2~3개를 추출하세요.

제목: "${cleanTitle}"

규칙:
- 제목에서 가장 핵심이 되는 명사 위주로 추출
- 인물명, 브랜드명, 사건명 등 구체적인 단어 우선
- 너무 일반적인 단어(뉴스, 이슈, 한국 등) 제외
- 해시태그 기호(#) 없이 단어만 반환

예시:
- "삼성 갤럭시 신제품 출시 예고" → ["삼성", "갤럭시", "신제품"]
- "아이유 콘서트 매진 사태" → ["아이유", "콘서트", "매진"]
- "여자 배구 국가대표 감독 선임 논란" → ["배구", "국가대표", "감독논란"]

JSON만 반환: {"keywords":["키워드1","키워드2","키워드3"]}`,
            }],
            temperature: 0.2,
            max_tokens: 100,
        })

        const text = completion.choices[0]?.message?.content?.trim() ?? ''
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (!jsonMatch) return []

        const parsed = JSON.parse(jsonMatch[0])
        const keywords: string[] = parsed.keywords ?? []
        return keywords.filter((k: unknown) => typeof k === 'string' && k.length > 0).slice(0, 3)
    } catch (e) {
        console.error('[Groq] YouTube 해시태그 추출 실패:', e)
        return []
    }
}

/**
 * 숏폼 텍스트 자동 생성
 */
export async function generateShortformText(input: ShortformTextInput): Promise<ShortformTextOutput> {
    const apiKeys = (process.env.GROQ_API_KEY ?? '').split(',').map(k => k.trim()).filter(Boolean)
    if (apiKeys.length === 0) {
        throw new Error('GROQ_API_KEY가 설정되지 않았습니다')
    }

    const rawTitle = input.title.replace(/^\[.*?\]\s*/, '').trim()
    const scene1Title = `"${rawTitle}"`
    const scene1Desc = ''

    const isSensitiveCategory = ['정치', '연예'].includes(input.category)

    const sensitiveRules = `
금지 표현 (명예훼손·허위사실 위험):
- "~했다", "~이다" 같은 단정형 절대 금지
- "논란", "의혹", "혐의", "폭로", "비리" 단독 사용 금지
- 특정인을 주어로 한 부정적 서술 금지
허용 표현만 사용:
- "~로 알려져", "~전해져", "~에 따르면" 등 인용형
- "~가능성", "~기대", "~관심" 등 완화형`

    const generalRules = `
- 추측·단정 표현 금지 ("~했다" 확정형 대신 "~기대", "~가능성" 사용)
- 특정인 비방·명예훼손 표현 금지`

    // ── 공통 텍스트 처리 유틸 ──
    const clean = (str: string) =>
        str.replace(/[\u{1F000}-\u{1FFFF}]/gu, '').replace(/[^가-힣ᄀ-ᇿ㄰-㆏ -~]/g, '').trim()

    const truncate = (str: string, maxLen: number): string => {
        if (str.length <= maxLen) return str
        const cut = str.slice(0, maxLen)
        const lastSpace = cut.lastIndexOf(' ')
        return lastSpace > 2 ? cut.slice(0, lastSpace) : cut
    }

    const INCOMPLETE_ENDINGS = [
        '대한', '위한', '관한', '인한', '따른', '통한', '향한', '대해',
        '이나', '이고', '이며', '이어', '새로운', '다양한', '중요한',
        '의', '에', '을', '를', '로', '와', '과', '도', '만', '은', '는',
        '이', '가', '기', '어', '아', '며', '서', '고',
        '면', '거나', '도록',
    ]
    const fixIncomplete = (str: string): string => {
        let result = str.trim()
        if (result.endsWith('.') || result.endsWith('。')) result = result.slice(0, -1).trim()
        for (let pass = 0; pass < 5; pass++) {
            const lastSpaceIdx = result.lastIndexOf(' ')
            if (lastSpaceIdx === -1) break
            const lastWord = result.slice(lastSpaceIdx + 1)
            if (!INCOMPLETE_ENDINGS.some(e => lastWord === e || lastWord.endsWith(e))) break
            result = result.slice(0, lastSpaceIdx).trim()
        }
        return result
    }

    // brief_summary 원문을 코드에서 직접 70자 이내로 처리 (Groq 미경유)
    const processDesc = (raw: string): string => fixIncomplete(truncate(clean(raw), 70))

    const safeT = (raw: unknown, fb: string) => fixIncomplete(truncate(clean(String(raw ?? fb)), 15))
    const safeD = (raw: unknown, fb: string) => fixIncomplete(truncate(clean(String(raw ?? fb)), 35))

    const fallback: ShortformTextOutput = {
        scene1Title,
        scene1Desc,
        scene2Title: '왜 이게 터진 걸까',
        scene2Desc: '온라인이 완전히 달아올랐다',
        scene3Title: '지금 여론은',
        scene3Desc: '의견이 완전히 갈렸다',
    }

    // brief_summary 직접 내용 추출
    const rawDesc2 = (input.briefBullets?.filter(Boolean)[0] ?? '').trim()
    const rawDesc3 = (input.briefConclusion ?? '').trim()
    const hasBriefContent = rawDesc2.length > 0 || rawDesc3.length > 0

    // ── brief 내용 있는 경우 ──
    // 타이틀: 이슈 제목 그대로 (Groq 불필요)
    // desc ≤35자: 코드 직접 처리
    // desc >35자: Groq 압축 전용 콜 (새 창작 없이 줄이기만)
    if (hasBriefContent) {
        const d2Base = rawDesc2 || rawDesc3
        const d3Base = rawDesc3 && rawDesc3 !== rawDesc2 ? rawDesc3 : rawDesc2  // scene3 항상 존재

        const sceneTitle = clean(rawTitle)

        const d2Code = d2Base.length <= 70 ? processDesc(d2Base) : null
        const d3Code = d3Base.length <= 70 ? processDesc(d3Base) : null

        // 둘 다 35자 이하 → Groq 불필요
        if (d2Code !== null && d3Code !== null) {
            console.log('[brief 코드 처리]', { scene2Desc: d2Code, scene3Desc: d3Code })
            return {
                scene1Title: clean(scene1Title), scene1Desc,
                scene2Title: sceneTitle, scene2Desc: d2Code,
                scene3Title: sceneTitle, scene3Desc: d3Code,
            }
        }

        // 35자 초과 항목 → Groq 압축 전용 콜
        for (const apiKey of apiKeys) {
            try {
                const groq = new Groq({ apiKey })

                const s2Inst = d2Code
                    ? `씬2 (확정): "${d2Code}"`
                    : `씬2 (압축 필요): "${d2Base}" → 35자 이내, 원문 의미 보존, 새 내용 금지`
                const s3Inst = d3Code
                    ? `씬3 (확정): "${d3Code}"`
                    : `씬3 (압축 필요): "${d3Base}" → 35자 이내, 원문 의미 보존, 새 내용 금지`

                const r = await groq.chat.completions.create({
                    model: 'llama-3.1-8b-instant',
                    messages: [{ role: 'user', content:
                        `숏폼 씬 설명 텍스트를 처리하세요.\n\n${s2Inst}\n${s3Inst}\n\n규칙: 이모지 금지, 한글과 기본 문장부호만, 조사/연결어미로 끝나지 말 것\n\nJSON으로만 응답: {"scene2Desc":"...","scene3Desc":"..."}` }],
                    temperature: 0.2, max_tokens: 150,
                })
                const parsed = JSON.parse((r.choices[0]?.message?.content?.match(/\{[\s\S]*\}/) ?? ['{}'])[0])

                const scene2Desc = d2Code ?? safeD(parsed.scene2Desc, fallback.scene2Desc)
                const scene3Desc = d3Code ?? safeD(parsed.scene3Desc, fallback.scene3Desc)

                console.log('[brief Groq 압축]', { d2Base, d3Base, scene2Desc, scene3Desc })
                return {
                    scene1Title: clean(scene1Title), scene1Desc,
                    scene2Title: sceneTitle, scene2Desc,
                    scene3Title: sceneTitle, scene3Desc,
                }
            } catch (error) {
                console.error(`[Groq 압축 실패] key=...${apiKey.slice(-6)}:`, error)
            }
        }
        // 모든 키 실패 → 코드 truncate 폴백
        return {
            scene1Title: clean(scene1Title), scene1Desc,
            scene2Title: sceneTitle, scene2Desc: d2Code ?? processDesc(d2Base),
            scene3Title: sceneTitle, scene3Desc: d3Code ?? processDesc(d3Base),
        }
    }

    // ── brief 내용 없는 경우: Groq 프리 생성 ──
    const freeGenPrompt = `당신은 숏폼 SNS 콘텐츠 기획자입니다.
아래 이슈의 Scene 2, 3 텍스트를 생성하세요.

이슈 제목: "${input.title}"
이슈 설명: "${input.issueDescription ?? ''}"
카테고리: ${input.category}${isSensitiveCategory ? ' (민감 카테고리 — 표현 제한 적용)' : ''}

규칙:
- 짧고 강렬하게, 이모지 금지, 한글과 기본 문장부호만
- scene2와 scene3은 서로 다른 각도 (scene2: 핵심 쟁점, scene3: 파급 효과·전망)
${isSensitiveCategory ? sensitiveRules : generalRules}
- Title: 명사나 의문형으로 완결
- Desc: 종결어미(-다/-주목 등)나 완결 명사로 끝낼 것, 조사/연결어미 끝 금지

scene2: scene2Title 15자 이내 / scene2Desc 35자 이내
scene3: scene3Title 15자 이내 / scene3Desc 35자 이내

JSON으로만 응답:
{"scene2Title":"...","scene2Desc":"...","scene3Title":"...","scene3Desc":"..."}`

    for (const apiKey of apiKeys) {
        try {
            const groq = new Groq({ apiKey })
            const completion = await groq.chat.completions.create({
                model: 'llama-3.1-8b-instant',
                messages: [{ role: 'user', content: freeGenPrompt }],
                temperature: 0.3, max_tokens: 300,
            })
            const text = completion.choices[0]?.message?.content?.trim() ?? ''
            console.log(`[Groq 프리 생성] key=...${apiKey.slice(-6)}:`, text)
            const jsonMatch = text.match(/\{[\s\S]*\}/)
            if (!jsonMatch) { console.warn('[Groq] JSON 파싱 실패'); continue }
            const parsed = JSON.parse(jsonMatch[0])
            return {
                scene1Title: clean(scene1Title), scene1Desc,
                scene2Title: safeT(parsed.scene2Title, fallback.scene2Title),
                scene2Desc:  safeD(parsed.scene2Desc,  fallback.scene2Desc),
                scene3Title: safeT(parsed.scene3Title, fallback.scene3Title),
                scene3Desc:  safeD(parsed.scene3Desc,  fallback.scene3Desc),
            }
        } catch (error) {
            console.error(`[Groq 프리 생성 실패] key=...${apiKey.slice(-6)}:`, error)
        }
    }

    console.error('[Groq] 모든 키 실패 — 폴백 사용')
    return fallback
}
