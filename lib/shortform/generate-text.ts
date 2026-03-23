/**
 * lib/shortform/generate-text.ts
 * 
 * 숏폼 텍스트 자동 생성 (Groq)
 * 
 * 이슈 메타데이터를 기반으로 SNS 최적화된 매력적인 텍스트를 생성합니다.
 * 본문은 절대 사용하지 않으며, 제목·카테고리·화력 등 메타데이터만 사용합니다.
 * 
 * 생성 텍스트:
 * - catchphrase: 훅 (10자 이내, 흥미 유발)
 * - subtitle: 부제목 (15자 이내, 상황 설명)
 * - cta: 행동 유도 (10자 이내)
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
    scene1: string
    scene2: string
    scene3: string
}

/**
 * 숏폼 텍스트 자동 생성
 * 
 * @param input - 이슈 메타데이터
 * @returns 생성된 텍스트 3종
 * @throws GEMINI_API_KEY 없으면 throw
 */
export async function generateShortformText(input: ShortformTextInput): Promise<ShortformTextOutput> {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) {
        throw new Error('GROQ_API_KEY가 설정되지 않았습니다')
    }

    const groq = new Groq({ apiKey })

    const prompt = `당신은 SNS 마케팅 전문가입니다. 아래 이슈 정보로 유튜브 쇼츠/인스타 릴스용 텍스트를 생성하세요.

이슈 정보:
- 제목: "${input.title}"
- 카테고리: ${input.category}
- 상태: ${input.status}
- 화력: ${input.heatGrade}
- 출처: 뉴스 ${input.newsCount}건, 커뮤니티 ${input.communityCount}건

생성 요구사항 (10초 동영상용 Scene별 자막 3개):
1. scene1: 첫 장면 훅 (20자 이내, 임팩트 있고 흥미 유발)
   - 이슈 제목 기반으로 감성적이고 시선을 끄는 문장
   - 예시: "이 순간을 기억하세요", "역사가 바뀌고 있습니다"
   
2. scene2: 중간 장면 맥락 (20자 이내, 상황 설명)
   - 이슈의 중요성이나 영향력 강조
   - 예시: "전 세계가 주목하고 있습니다", "뉴스 ${input.newsCount}건이 보도 중"
   
3. scene3: 마지막 CTA (20자 이내, 행동 유도)
   - 왜난리 서비스로 유도
   - 예시: "지금 왜난리에서 확인하세요", "실시간 여론을 확인하세요"

주의사항:
- 본문 내용 추측 금지 (이슈 제목과 메타데이터만 사용)
- 선정적이거나 부적절한 표현 금지
- 사실 기반 서술만 (과장 금지)
- 각 자막은 독립적이면서도 연결된 스토리로 구성

JSON 형식으로만 응답:
{"scene1":"...", "scene2":"...", "scene3":"..."}`

    try {
        const completion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 200,
        })

        const text = completion.choices[0]?.message?.content?.trim() ?? ''
        const cleanText = text.replace(/```json\n?|\n?```/g, '').trim()
        const parsed = JSON.parse(cleanText)

        return {
            scene1: String(parsed.scene1 ?? '지금 화제의 이슈').slice(0, 25),
            scene2: String(parsed.scene2 ?? `뉴스 ${input.newsCount}건이 주목 중`).slice(0, 25),
            scene3: String(parsed.scene3 ?? '왜난리에서 확인하세요').slice(0, 25),
        }
    } catch (error) {
        console.error('[Groq 텍스트 생성 실패]:', error)
        return {
            scene1: '지금 화제의 이슈',
            scene2: `뉴스 ${input.newsCount}건이 주목 중`,
            scene3: '왜난리에서 확인하세요',
        }
    }
}
