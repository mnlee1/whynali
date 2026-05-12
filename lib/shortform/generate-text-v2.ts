/**
 * lib/shortform/generate-text-v2.ts
 *
 * 숏폼 텍스트 자동 생성 v2 (generate-text.ts 개선판)
 *
 * v1 대비 변경점:
 * - temperature 0.3 → 0.6 (더 창의적인 표현)
 * - Scene 2/3 타이틀: 이슈 제목 반복 제거, 쟁점/여론 각도로 AI 생성
 * - few-shot 예시 추가로 의문형·감탄형 톤 유도
 * - Scene 3 desc: 시청자 반응 유도 문구 가이드 추가
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
    briefBullets?: string[]
    briefConclusion?: string
}

export interface ShortformTextOutput {
    scene1Title: string
    scene1Desc: string
    scene2Title: string
    scene2Desc: string
    scene3Title: string
    scene3Desc: string
}

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
        console.error('[Groq v2] YouTube 해시태그 추출 실패:', e)
        return []
    }
}

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

    const processDesc = (raw: string): string => fixIncomplete(truncate(clean(raw), 70))
    const safeT = (raw: unknown, fb: string) => fixIncomplete(truncate(clean(String(raw ?? fb)), 10))
    const safeD = (raw: unknown, fb: string) => fixIncomplete(truncate(clean(String(raw ?? fb)), 35))

    const fallback: ShortformTextOutput = {
        scene1Title,
        scene1Desc,
        scene2Title: '왜 터진 걸까?',
        scene2Desc: '온라인이 완전히 달아올랐다',
        scene3Title: '여론은?',
        scene3Desc: '의견이 완전히 갈렸다',
    }

    const rawDesc2 = (input.briefBullets?.filter(Boolean)[0] ?? '').trim()
    const rawDesc3 = (input.briefConclusion ?? '').trim()
    const hasBriefContent = rawDesc2.length > 0 || rawDesc3.length > 0

    // ── brief 내용 있는 경우 ──
    // v2 개선: scene2Title/scene3Title도 Groq로 생성 (v1은 이슈 제목 그대로 반복)
    if (hasBriefContent) {
        const d2Base = rawDesc2 || rawDesc3
        const d3Base = rawDesc3 && rawDesc3 !== rawDesc2 ? rawDesc3 : rawDesc2

        const d2Code = d2Base.length <= 70 ? processDesc(d2Base) : null
        const d3Code = d3Base.length <= 70 ? processDesc(d3Base) : null

        for (const apiKey of apiKeys) {
            try {
                const groq = new Groq({ apiKey })

                // scene2Title/scene3Title 생성 + desc 압축(필요 시) 한 번에 처리
                const s2Inst = d2Code
                    ? `씬2 설명 (확정): "${d2Code}"`
                    : `씬2 설명 (압축 필요): "${d2Base}" → 35자 이내, 원문 의미 보존, 새 내용 금지`
                const s3Inst = d3Code
                    ? `씬3 설명 (확정): "${d3Code}"`
                    : `씬3 설명 (압축 필요): "${d3Base}" → 35자 이내, 원문 의미 보존, 새 내용 금지`

                const sensitiveNote = isSensitiveCategory
                    ? '\n※ 민감 카테고리: 단정형 금지, 인용형·완화형 표현만 사용'
                    : ''

                const r = await groq.chat.completions.create({
                    model: 'llama-3.1-8b-instant',
                    messages: [{
                        role: 'user',
                        content: `숏폼 씬 텍스트를 생성하세요.

이슈 제목: "${rawTitle}"
카테고리: ${input.category}${sensitiveNote}

${s2Inst}
${s3Inst}

타이틀 규칙:
- scene2Title: "왜 이게 문제인가" 각도, 10자 이내, 의문형 권장
- scene3Title: "여론·전망은 어떤가" 각도, 10자 이내, 의문형 권장
- 이모지 금지, 한글과 기본 문장부호만
- 조사/연결어미로 끝나지 말 것

타이틀 예시:
- "왜 터진 걸까?" / "여론은?"
- "속사정은?" / "어떻게 될까"
- "핵심 쟁점" / "앞으로는?"
- "왜 논란?" / "결국엔?"

JSON으로만 응답:
{"scene2Title":"...","scene2Desc":"...","scene3Title":"...","scene3Desc":"..."}`,
                    }],
                    temperature: 0.6,
                    max_tokens: 200,
                })

                const parsed = JSON.parse((r.choices[0]?.message?.content?.match(/\{[\s\S]*\}/) ?? ['{}'])[0])

                const scene2Title = safeT(parsed.scene2Title, fallback.scene2Title)
                const scene3Title = safeT(parsed.scene3Title, fallback.scene3Title)
                const scene2Desc = d2Code ?? safeD(parsed.scene2Desc, fallback.scene2Desc)
                const scene3Desc = d3Code ?? safeD(parsed.scene3Desc, fallback.scene3Desc)

                console.log('[brief v2 Groq]', { scene2Title, scene3Title, scene2Desc, scene3Desc })
                return {
                    scene1Title: clean(scene1Title), scene1Desc,
                    scene2Title, scene2Desc,
                    scene3Title, scene3Desc,
                }
            } catch (error) {
                console.error(`[Groq v2 brief 실패] key=...${apiKey.slice(-6)}:`, error)
            }
        }

        // 모든 키 실패 → 코드 truncate 폴백
        return {
            scene1Title: clean(scene1Title), scene1Desc,
            scene2Title: fallback.scene2Title,
            scene2Desc: d2Code ?? processDesc(d2Base),
            scene3Title: fallback.scene3Title,
            scene3Desc: d3Code ?? processDesc(d3Base),
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
- scene2: "왜 이게 터졌나" 각도 — 핵심 쟁점, 이유, 속사정
- scene3: "여론·전망은" 각도 — 반응, 앞으로, 시청자 공감 유도
${isSensitiveCategory ? sensitiveRules : generalRules}
- Title: 10자 이내, 의문형("?") 또는 명사형 완결 — 호기심 자극
- Desc: 35자 이내, 종결어미(-다/-주목 등)나 완결 명사로 끝낼 것, 조사/연결어미 끝 금지

예시 (참고용, 그대로 쓰지 말 것):
- scene2Title: "왜 터진 걸까?" / scene2Desc: "내부 갈등이 수면 위로 올랐다"
- scene2Title: "속사정은?" / scene2Desc: "알고 보니 오래된 문제였다"
- scene3Title: "여론은?" / scene3Desc: "의견이 극명하게 갈리고 있다"
- scene3Title: "어떻게 될까" / scene3Desc: "다음 행보에 관심이 집중됐다"
- scene3Title: "앞으로는?" / scene3Desc: "팬들 사이 반응이 엇갈렸다"

scene2: scene2Title 10자 이내 / scene2Desc 35자 이내
scene3: scene3Title 10자 이내 / scene3Desc 35자 이내

JSON으로만 응답:
{"scene2Title":"...","scene2Desc":"...","scene3Title":"...","scene3Desc":"..."}`

    for (const apiKey of apiKeys) {
        try {
            const groq = new Groq({ apiKey })
            const completion = await groq.chat.completions.create({
                model: 'llama-3.1-8b-instant',
                messages: [{ role: 'user', content: freeGenPrompt }],
                temperature: 0.6,
                max_tokens: 300,
            })
            const text = completion.choices[0]?.message?.content?.trim() ?? ''
            console.log(`[Groq v2 프리 생성] key=...${apiKey.slice(-6)}:`, text)
            const jsonMatch = text.match(/\{[\s\S]*\}/)
            if (!jsonMatch) { console.warn('[Groq v2] JSON 파싱 실패'); continue }
            const parsed = JSON.parse(jsonMatch[0])
            return {
                scene1Title: clean(scene1Title), scene1Desc,
                scene2Title: safeT(parsed.scene2Title, fallback.scene2Title),
                scene2Desc:  safeD(parsed.scene2Desc,  fallback.scene2Desc),
                scene3Title: safeT(parsed.scene3Title, fallback.scene3Title),
                scene3Desc:  safeD(parsed.scene3Desc,  fallback.scene3Desc),
            }
        } catch (error) {
            console.error(`[Groq v2 프리 생성 실패] key=...${apiKey.slice(-6)}:`, error)
        }
    }

    console.error('[Groq v2] 모든 키 실패 — 폴백 사용')
    return fallback
}
