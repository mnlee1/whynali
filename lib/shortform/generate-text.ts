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
}

export interface ShortformTextOutput {
    scene1Title: string  // 씬1 타이틀 (20자 이내)
    scene1Desc: string   // 씬1 설명 (35자 이내)
    scene2Title: string  // 씬2 타이틀 (20자 이내)
    scene2Desc: string   // 씬2 설명 (35자 이내)
    scene3Title: string  // 씬3 타이틀 (20자 이내)
    scene3Desc: string   // 씬3 설명 (35자 이내)
}

/**
 * 이슈 제목에서 Pexels 검색용 영문 키워드 3개 추출
 *
 * @param title - 한국어 이슈 제목
 * @returns 영문 검색 키워드 3개 배열 (실패 시 빈 배열)
 */
export async function extractUnsplashKeywords(title: string): Promise<string[]> {
    const apiKey = (process.env.GROQ_API_KEY ?? '').split(',')[0].trim()
    if (!apiKey) return []

    const groq = new Groq({ apiKey })

    // [테스트], [긴급] 같은 접두어 제거 후 전달
    const cleanTitle = title.replace(/^\[.*?\]\s*/, '').trim()

    try {
        const completion = await groq.chat.completions.create({
            model: 'llama-3.1-8b-instant',
            messages: [{
                role: 'user',
                content: `You are selecting Pexels stock photo search terms for a Korean news headline.
Return 3 search queries — each must be a DIFFERENT visual type for variety.

Headline: "${cleanTitle}"

RULES:
- query1: PLACE or OBJECT related to the headline (no people)
- query2: PEOPLE in a professional/contextual setting related to the headline
- query3: CLOSE-UP of an object, symbol, or detail related to the headline
- Each query: 2-4 English words, specific and visual
- AVOID: refugee, poverty, homeless, slum, war victim, protest violence
- AVOID generic: "news", "Korean", "kpop", "celebrity"

Examples:
- "방탄소년단 컴백 앨범 발매" → ["concert stage empty lights", "musician performing microphone", "vinyl record turntable closeup"]
- "드라마 촬영장 스태프 사망 사고 발생" → ["film production set equipment", "film crew working camera", "movie clapper board closeup"]
- "이재명 대선 출마 선언" → ["government building exterior", "politician giving speech", "voting ballot paper closeup"]
- "아파트 전세 사기 피해 급증" → ["apartment building aerial view", "couple signing contract", "house key door lock closeup"]
- "축구 국가대표 월드컵 본선 진출" → ["football stadium aerial", "soccer player celebrating", "football ball grass closeup"]

Respond with JSON only: {"keywords":["query1","query2","query3"]}`,
            }],
            temperature: 0.3,
            max_tokens: 150,
        })

        const text = completion.choices[0]?.message?.content?.trim() ?? ''
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
            console.warn('[Groq] 키워드 JSON 파싱 실패 - 응답:', text)
            return []
        }
        const parsed = JSON.parse(jsonMatch[0])
        const keywords: string[] = parsed.keywords ?? []
        const filtered = keywords.filter((k: unknown) => typeof k === 'string' && k.length > 0).slice(0, 3)

        // 씬 순서를 랜덤 셔플 (장소/인물/클로즈업 고정 배치 방지)
        for (let i = filtered.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [filtered[i], filtered[j]] = [filtered[j], filtered[i]]
        }

        console.log(`[Groq] 키워드 추출 성공 (title="${cleanTitle}"):`, filtered)
        return filtered
    } catch (e) {
        console.error('[Groq] 키워드 추출 실패:', e)
        return []
    }
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
    const scene1Title = input.title.replace(/^\[.*?\]\s*/, '').trim()
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

    const prompt = `당신은 숏폼 SNS 콘텐츠 기획자입니다.
아래 이슈 제목을 보고 Scene 2, 3에 들어갈 파생 텍스트를 생성하세요.

이슈 제목: "${input.title}"
카테고리: ${input.category}${isSensitiveCategory ? ' (민감 카테고리 — 표현 제한 적용)' : ''}

공통 규칙:
- 반드시 이슈 제목의 구체적인 내용을 반영할 것
- 짧고 강렬하게 (이모지 절대 사용 금지)
- 오직 한글과 기본 문장부호만 사용
- scene2Title, scene2Desc, scene3Title, scene3Desc 4개 모두 서로 다른 표현 사용 (중복 금지)
- scene2와 scene3은 이슈의 서로 다른 각도를 다룰 것 (scene2: 핵심 쟁점, scene3: 파급 효과·전망)
${isSensitiveCategory ? sensitiveRules : generalRules}

끝맺음 규칙 (매우 중요):
- Title: "~은?", "~할까", "~상황", "~결과" 처럼 명사나 의문형으로 완결
- Desc: "~확산", "~집중", "~주목", "~기대", "~논란" 처럼 명사로 완결하거나 "~됐다", "~높다" 처럼 서술형 종결
- 절대 금지: "~대한", "~위한", "~관한", "~인한", "~새로운", "~이나" 처럼 뒤에 명사가 와야 하는 수식어로 끝나는 것

좋은 예:
${isSensitiveCategory
    ? `이슈: "이재명 대표 1심 선고 결과 발표"
{"scene2Title":"1심 선고 결과 어떻게 됐나","scene2Desc":"재판부의 판단에 전국민의 이목이 집중됐다","scene3Title":"향후 정치 판도 어떻게 바뀔까","scene3Desc":"여야 모두 즉각 반응 정치권 파장 예상"}`
    : `이슈: "한국은행 기준금리 0.25%p 인하 결정"
{"scene2Title":"내 대출 이자 얼마나 줄어들까","scene2Desc":"0.25%p 인하로 이자 부담 크게 완화될 전망","scene3Title":"부동산 시장 반응은 어떨까","scene3Desc":"집값 반등 기대감 커지며 거래량 증가 주목"}`}

나쁜 예 (이렇게 하지 말 것):
{"scene2Title":"분노가 폭발해","scene2Desc":"국민 분노가 폭발해 감독에 대한","scene3Title":"새로운 감독과","scene3Desc":"사임 여부와 새로운 코치진"}
중복 나쁜 예 (scene2·scene3이 같은 표현 — 절대 금지):
{"scene2Title":"향후 영향은","scene2Desc":"파장이 예상된다","scene3Title":"향후 영향은","scene3Desc":"파장이 예상된다"}

scene2 (핵심 쟁점):
- scene2Title: 15자 이내, 완결된 명사구 또는 의문형 (2줄 가능)
- scene2Desc: 28자 이내, 완결된 명사구 또는 서술형 종결어미 (2줄 가능)

scene3 (마무리):
- scene3Title: 15자 이내, 완결된 명사구 또는 의문형 (2줄 가능)
- scene3Desc: 28자 이내, 완결된 명사구 또는 서술형 종결어미 (2줄 가능)

JSON으로만 응답 (다른 텍스트 없음):
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

    // 수식어·조사로 끝나는 미완성 문장 감지 후 앞 어절로 후퇴
    const INCOMPLETE_ENDINGS = [
        '대한', '위한', '관한', '인한', '따른', '통한', '향한', '대해',
        '이나', '이고', '이며', '이어', '새로운', '다양한', '중요한',
        '의', '에', '을', '를', '로', '와', '과', '도', '만', '은', '는',
    ]
    const fixIncomplete = (str: string): string => {
        const trimmed = str.trim()
        const lastSpaceIdx = trimmed.lastIndexOf(' ')
        if (lastSpaceIdx === -1) return trimmed
        const lastWord = trimmed.slice(lastSpaceIdx + 1)
        const isIncomplete = INCOMPLETE_ENDINGS.some(e => lastWord === e || lastWord.endsWith(e))
        if (isIncomplete) return trimmed.slice(0, lastSpaceIdx).trim()
        return trimmed
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
                scene2Desc:  safeText(parsed.scene2Desc,  fallback.scene2Desc,  28),
                scene3Title: safeText(parsed.scene3Title, fallback.scene3Title, 15),
                scene3Desc:  safeText(parsed.scene3Desc,  fallback.scene3Desc,  28),
            }
        } catch (error) {
            console.error(`[Groq 텍스트 실패] key=...${apiKey.slice(-6)}:`, error)
            // 다음 키로 계속
        }
    }

    console.error('[Groq] 모든 키 실패 — 폴백 사용')
    return fallback
}
