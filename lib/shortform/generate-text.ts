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
 * 이슈 제목에서 Unsplash 검색용 영문 키워드 3개 추출
 *
 * @param title - 한국어 이슈 제목
 * @returns 영문 검색 키워드 3개 배열 (실패 시 빈 배열)
 */
export async function extractUnsplashKeywords(title: string): Promise<string[]> {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) return []

    const groq = new Groq({ apiKey })

    try {
        const completion = await groq.chat.completions.create({
            model: 'llama-3.1-8b-instant',
            messages: [{
                role: 'user',
                content: `You are selecting Unsplash stock photo search terms for a Korean news headline.

Headline: "${title}"

Rules:
- Return exactly 3 DISTINCT search queries (1-3 English words each)
- Focus on SPECIFIC VISUAL SCENES: events, objects, places, emotions visible in photos
- Each query must be DIFFERENT visually (no two similar scenes)
- AVOID generic labels: do NOT use "kpop", "celebrity", "entertainment", "news", "Korean"
- Prefer concrete visuals: "award ceremony stage", "golden trophy closeup", "concert crowd lights", "film premiere red carpet", "protest crowd street", "courtroom interior", etc.

Examples:
- "방탄소년단 컴백 앨범 발매" → ["concert stage spotlight", "music album cover design", "fans crowd cheering"]
- "케이팝 데몬 헌터스 오스카 2관왕" → ["oscar award ceremony", "animated film production art", "golden trophy statue"]
- "이재명 대선 출마 선언" → ["election campaign rally", "politician speech podium", "voting ballot box"]

Respond with JSON only: {"keywords":["query1","query2","query3"]}`,
            }],
            temperature: 0.3,
            max_tokens: 100,
        })

        const text = completion.choices[0]?.message?.content?.trim() ?? ''
        const clean = text.replace(/```json\n?|\n?```/g, '').trim()
        const parsed = JSON.parse(clean)
        const keywords: string[] = parsed.keywords ?? []
        return keywords.filter((k: unknown) => typeof k === 'string' && k.length > 0).slice(0, 3)
    } catch {
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
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) {
        throw new Error('GROQ_API_KEY가 설정되지 않았습니다')
    }

    const groq = new Groq({ apiKey })

    const prompt = `당신은 숏폼 SNS 콘텐츠 기획자입니다.
"왜난리" 플랫폼의 10초 숏폼 영상용 씬별 텍스트를 생성하세요.

이슈 정보:
- 제목: "${input.title}"
- 카테고리: ${input.category}
- 상태: ${input.status}
- 화력: ${input.heatGrade}

[목표: 스크롤을 멈추게 하는 관심집중 문구]
- 이슈 제목에서 파생된 내용만 사용
- 짧고 강렬하게, 이모지 자유롭게 활용 (화력 높을수록 강하게)
- 법적으로 안전한 표현 (추측·단정 표현 주의)
- 절대 금지: 뉴스 건수·커뮤니티 건수 같은 통계 수치, 서비스 홍보 문구

[씬 구성]

scene1 (0~3초) — 훅: 스크롤을 멈추게 하는 첫인상
- scene1Title (13자 이내): 충격·호기심을 자극하는 한 줄. 이슈 제목 그대로 쓰지 말 것
- scene1Desc (22자 이내): 더 알고 싶게 만드는 구체적 맥락 or 핵심 사실

scene2 (3~6초) — 핵심: 가장 논란되거나 놀라운 포인트
- scene2Title (13자 이내): 이슈의 핵심 쟁점 or 가장 충격적인 부분
- scene2Desc (22자 이내): 왜 이게 화제인지, 어떤 반응이 나왔는지

scene3 (6~10초) — 결론: 가장 기억에 남을 마무리
- scene3Title (13자 이내): 논란의 핵심 or 반전 포인트
- scene3Desc (22자 이내): 이 이슈가 던지는 물음 or 현재 여론

JSON으로만 응답:
{"scene1Title":"...","scene1Desc":"...","scene2Title":"...","scene2Desc":"...","scene3Title":"...","scene3Desc":"..."}`

    const heatEmoji = input.heatGrade === '높음' ? '🔥' : input.heatGrade === '보통' ? '👀' : ''

    const fallback: ShortformTextOutput = {
        scene1Title: `${heatEmoji} 지금 난리난 이슈`.trim(),
        scene1Desc: '아직도 모르면 뒤처진다',
        scene2Title: '왜 이게 터진 걸까',
        scene2Desc: '온라인이 완전히 달아올랐다',
        scene3Title: '당신의 생각은?',
        scene3Desc: '여론이 완전히 갈렸다',
    }

    try {
        const completion = await groq.chat.completions.create({
            model: 'llama-3.1-8b-instant',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 400,
        })

        const text = completion.choices[0]?.message?.content?.trim() ?? ''
        const cleanText = text.replace(/```json\n?|\n?```/g, '').trim()
        const parsed = JSON.parse(cleanText)

        return {
            scene1Title: String(parsed.scene1Title ?? fallback.scene1Title).slice(0, 13),
            scene1Desc:  String(parsed.scene1Desc  ?? fallback.scene1Desc).slice(0, 22),
            scene2Title: String(parsed.scene2Title ?? fallback.scene2Title).slice(0, 13),
            scene2Desc:  String(parsed.scene2Desc  ?? fallback.scene2Desc).slice(0, 22),
            scene3Title: String(parsed.scene3Title ?? fallback.scene3Title).slice(0, 13),
            scene3Desc:  String(parsed.scene3Desc  ?? fallback.scene3Desc).slice(0, 22),
        }
    } catch (error) {
        console.error('[Groq 텍스트 생성 실패]:', error)
        return fallback
    }
}
