/**
 * lib/shortform/generate-text.ts
 *
 * 숏폼 텍스트 자동 생성 (Groq)
 *
 * 이슈 메타데이터를 기반으로 SNS 최적화된 텍스트를 생성합니다.
 * 본문은 사용하지 않으며 제목·카테고리·화력 등 메타데이터만 사용합니다.
 *
 * 생성 텍스트: 씬별 타이틀(20자) + 설명(35자) 쌍 × 3
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
    briefBullets?: string[]    // brief_summary.bullets — 씬2 desc 직접 반영
    briefConclusion?: string   // brief_summary.conclusion — 씬3 desc 직접 반영
}

export interface ShortformTextOutput {
    scene1Title: string  // 씬1 타이틀 (20자 이내)
    scene1Desc: string   // 씬1 설명
    scene2Title: string  // 씬2 타이틀 (20자 이내)
    scene2Desc: string   // 씬2 설명 (35자 이내)
    scene3Title: string  // 씬3 타이틀 (20자 이내)
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
 *
 * @param input - 이슈 메타데이터
 * @returns 씬별 타이틀+설명 6종
 */
export async function generateShortformText(input: ShortformTextInput): Promise<ShortformTextOutput> {
    const apiKeys = (process.env.GROQ_API_KEY ?? '').split(',').map(k => k.trim()).filter(Boolean)
    if (apiKeys.length === 0) {
        throw new Error('GROQ_API_KEY가 설정되지 않았습니다')
    }

    // Scene 1은 이슈 제목 전체 사용 (동영상 렌더러가 자동 줄바꿈 처리)
    const rawTitle = input.title.replace(/^\[.*?\]\s*/, '').trim()
    const scene1Title = `"${rawTitle}"`
    const scene1Desc = ''  // 씬1 설명 없음

    // 카테고리별 민감도 분류
    const isSensitiveCategory = ['정치', '연예'].includes(input.category)

    const sensitiveRules = `
금지 표현 (명예훼손·허위사실 위험):
- "~했다", "~이다" 같은 단정형 절대 금지
- "논란", "의혹", "혐의", "폭로", "비리" 단독 사용 금지
- 특정인을 주어로 한 부정적 서술 금지
허용 표현만 사용:
- "~로 알려져", "~전해져", "~에 따르면" 등 인용형
- "~가능성", "~기대", "~관심" 등 완화형
- 이슈 자체의 사실관계(날짜·장소·공식 발표)만 서술`

    const generalRules = `
- 추측·단정 표현 금지 ("~했다" 확정형 대신 "~기대", "~가능성" 사용)
- 특정인 비방·명예훼손 표현 금지`

    // brief_summary 직접 내용
    const bulletText = input.briefBullets?.filter(Boolean)[0] ?? ''
    const conclusionText = input.briefConclusion ?? ''
    const hasBriefContent = bulletText.length > 0 || conclusionText.length > 0

    const prompt = hasBriefContent
        ? `당신은 텍스트 편집자입니다. 아래 원문을 35자 이내 숏폼 자막으로 편집하세요.

이슈 제목: "${input.title}"

[scene2Desc 원문]
"${bulletText || conclusionText}"

[scene3Desc 원문]
"${conclusionText || bulletText}"

편집 규칙:
- 원문 내용 외 새로운 내용 창작 절대 금지
- 35자 이하면 원문 그대로 사용
- 35자 초과면 원문의 핵심 의미만 남겨 35자 이내로 줄일 것
- 마지막이 조사(~에 ~의 ~을 ~로 ~와 ~가)나 연결어미(~하며 ~해서 ~하면 ~이어)로 끝나지 않을 것
- 이모지 금지, 한글과 기본 문장부호만 사용
- scene2Desc와 scene3Desc는 서로 다른 내용이어야 함

scene2Title: 15자 이내, scene2Desc 내용 기반 완결형 타이틀
scene3Title: 15자 이내, scene3Desc 내용 기반 완결형 타이틀

JSON으로만 응답:
{"scene2Title":"...","scene2Desc":"...","scene3Title":"...","scene3Desc":"..."}`
        : `당신은 숏폼 SNS 콘텐츠 기획자입니다.
아래 이슈의 Scene 2, 3 텍스트를 생성하세요.

이슈 제목: "${input.title}"
이슈 설명: "${input.issueDescription ?? ''}"
카테고리: ${input.category}${isSensitiveCategory ? ' (민감 카테고리 — 표현 제한 적용)' : ''}

공통 규칙:
- 짧고 강렬하게 (이모지 절대 사용 금지)
- 오직 한글과 기본 문장부호만 사용
- scene2와 scene3은 이슈의 서로 다른 각도 (scene2: 핵심 쟁점, scene3: 파급 효과·전망)
${isSensitiveCategory ? sensitiveRules : generalRules}

끝맺음 규칙:
- Title: 명사나 의문형으로 완결
- Desc: 종결어미(-다/-주목/-관심 등)나 완결 명사로 끝낼 것
- 절대 금지: "~대한" "~위한" 같은 수식어, "~하며" "~해서" 같은 연결어미, "~에" "~의" "~을" "~로" 같은 조사로 끝나는 것

scene2: scene2Title 15자 이내 / scene2Desc 35자 이내
scene3: scene3Title 15자 이내 / scene3Desc 35자 이내

JSON으로만 응답:
{"scene2Title":"...","scene2Desc":"...","scene3Title":"...","scene3Desc":"..."}`

    const fallback: ShortformTextOutput = {
        scene1Title,
        scene1Desc,
        scene2Title: '왜 이게 터진 걸까',
        scene2Desc: '온라인이 완전히 달아올랐다',
        scene3Title: '지금 여론은',
        scene3Desc: '의견이 완전히 갈렸다',
    }

    // 이모지 및 특수문자 제거 함수
    const clean = (str: string) =>
        str.replace(/[\u{1F000}-\u{1FFFF}]/gu, '').replace(/[^\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F\u0020-\u007E]/g, '').trim()

    // 단어 경계 기준 최대 글자 수 truncation
    const truncate = (str: string, maxLen: number): string => {
        if (str.length <= maxLen) return str
        const cut = str.slice(0, maxLen)
        const lastSpace = cut.lastIndexOf(' ')
        return lastSpace > 2 ? cut.slice(0, lastSpace) : cut
    }

    // 수식어·조사·연결어미로 끝나는 미완성 문장 감지 후 앞 어절로 후퇴 (최대 5회 반복)
    const INCOMPLETE_ENDINGS = [
        '대한', '위한', '관한', '인한', '따른', '통한', '향한', '대해',
        '이나', '이고', '이며', '이어', '새로운', '다양한', '중요한',
        '의', '에', '을', '를', '로', '와', '과', '도', '만', '은', '는',
        '이', '가', '기', '어', '아', '며', '서', '고',
        '면', '거나', '도록',  // 조건·선택·목적 연결어미
    ]
    const fixIncomplete = (str: string): string => {
        let result = str.trim()
        for (let pass = 0; pass < 5; pass++) {
            const lastSpaceIdx = result.lastIndexOf(' ')
            if (lastSpaceIdx === -1) break
            const lastWord = result.slice(lastSpaceIdx + 1)
            if (!INCOMPLETE_ENDINGS.some(e => lastWord === e || lastWord.endsWith(e))) break
            result = result.slice(0, lastSpaceIdx).trim()
        }
        return result
    }

    // 키 순환: 앞 키가 실패하면 다음 키로 재시도
    for (const apiKey of apiKeys) {
        try {
            const groq = new Groq({ apiKey })
            const completion = await groq.chat.completions.create({
                model: 'llama-3.1-8b-instant',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3,
                max_tokens: 300,
            })

            const text = completion.choices[0]?.message?.content?.trim() ?? ''
            console.log(`[Groq 텍스트 응답] key=...${apiKey.slice(-6)}:`, text)

            const jsonMatch = text.match(/\{[\s\S]*\}/)
            if (!jsonMatch) {
                console.warn('[Groq] JSON 파싱 실패, 다음 키 시도')
                continue
            }

            const parsed = JSON.parse(jsonMatch[0])
            const safeText = (raw: unknown, fallbackVal: string, maxLen: number) =>
                fixIncomplete(truncate(clean(String(raw ?? fallbackVal)), maxLen))

            return {
                scene1Title: clean(scene1Title),
                scene1Desc:  scene1Desc,
                scene2Title: safeText(parsed.scene2Title, fallback.scene2Title, 15),
                scene2Desc:  safeText(parsed.scene2Desc,  fallback.scene2Desc,  35),
                scene3Title: safeText(parsed.scene3Title, fallback.scene3Title, 15),
                scene3Desc:  safeText(parsed.scene3Desc,  fallback.scene3Desc,  35),
            }
        } catch (error) {
            console.error(`[Groq 텍스트 실패] key=...${apiKey.slice(-6)}:`, error)
            // 다음 키로 계속
        }
    }

    console.error('[Groq] 모든 키 실패 — 폴백 사용')
    return fallback
}
