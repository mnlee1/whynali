/**
 * lib/ai/discussion-generator.ts
 *
 * [AI 토론 주제 생성기]
 *
 * 관리자가 승인한 이슈의 메타데이터(제목, 카테고리, 상태, 화력)만을 입력으로 사용하여
 * 철학적·윤리적 관점에서 논의할 수 있는 토론 주제 후보를 생성한다.
 *
 * 법적 안전 원칙:
 * - 본문·요약문 절대 미사용 (04_서비스노출_법적검토.md §4.2)
 * - 이슈 제목은 입력으로 허용하나, 출력에서 실명·특정인 직접 지목 금지 (§7.1)
 * - 생성된 주제는 반드시 approval_status='대기'로 저장, 관리자 승인 후에만 노출 (02_AI기획_판단포인트.md §6.4)
 *
 * AI: Groq (Llama 3.1, 무료)
 */

import { incrementApiUsage } from '@/lib/api-usage-tracker'

export interface IssueMetadata {
    id: string
    title: string       // 이슈 제목 (그레이존이나 출력이 사실 나열형이므로 허용)
    category: string    // 연예, 스포츠, 정치, 사회, 기술
    status: string      // 점화, 논란 중, 종결
    heat_index?: number // 화력 지수 0–100
    news_titles?: string[] // 관련 뉴스 헤드라인 (맥락 파악용)
}

export interface GeneratedTopic {
    content: string
}

/**
 * generateDiscussionTopics - AI 토론 주제 후보 생성
 *
 * 이슈 메타데이터만 입력으로 받아 Groq API를 통해 철학적 토론 주제를 생성한다.
 * 본문이나 요약문은 사용하지 않는다.
 *
 * 예시:
 * const topics = await generateDiscussionTopics({ id, title, category, status }, 3)
 */
export async function generateDiscussionTopics(
    issue: IssueMetadata,
    count: number = 3
): Promise<GeneratedTopic[]> {
    const apiKey = (process.env.GROQ_API_KEY ?? '').split(',')[0].trim()
    if (!apiKey) {
        throw new Error('GROQ_API_KEY 환경변수가 설정되지 않았습니다.')
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: 'llama-3.1-8b-instant',
            messages: [
                {
                    role: 'system',
                    content:
                        '당신은 한국 커뮤니티 사용자들이 실제로 댓글을 달고 싶어지는 토론 주제를 만드는 전문가입니다. ' +
                        '학술적·철학적 표현은 절대 금지입니다. 균형, 경계, 가치, 정당성, 경제권익 같은 어려운 추상어 사용 금지. ' +
                        '일반인이 바로 이해할 수 있는 쉽고 구체적인 말로 써야 합니다. ' +
                        '반드시 완전한 문장으로 끝내고, 절대 문장 중간에서 끊지 마세요. ' +
                        '특정인 실명이나 특정 집단을 직접 지목하는 표현은 절대 사용하지 마세요. ' +
                        '반드시 JSON 형식으로만 응답하세요.',
                },
                {
                    role: 'user',
                    content: buildPrompt(issue, count),
                },
            ],
            temperature: 0.7,
            max_tokens: 800,
            response_format: { type: 'json_object' }
        }),
    })

    if (!response.ok) {
        const errText = await response.text()
        
        // API 사용량 추적 (실패)
        await incrementApiUsage('groq', {
            calls: 1,
            successes: 0,
            failures: 1,
        }).catch(err => console.error('API 사용량 추적 실패:', err))
        
        throw new Error(`Groq API 오류 (${response.status}): ${errText}`)
    }

    const data = await response.json()
    const raw: string = data.choices?.[0]?.message?.content ?? ''

    // API 사용량 추적 (성공)
    await incrementApiUsage('groq', {
        calls: 1,
        successes: 1,
        failures: 0,
    }).catch(err => console.error('API 사용량 추적 실패:', err))

    return parseTopics(raw)
}

/**
 * buildPrompt - 토론 주제 생성 프롬프트 조립
 *
 * 법적 안전 포인트:
 * - 메타데이터만 전달 (이슈 본문·요약문 미포함)
 * - 출력에서 실명·사실 단정 금지 조건 명시
 * - 질문형·성찰형 열린 문장 강제
 */
function buildPrompt(issue: IssueMetadata, count: number): string {
    const heatLine =
        issue.heat_index !== undefined
            ? `- 화력 지수: ${issue.heat_index}/100`
            : ''

    const newsLine =
        issue.news_titles && issue.news_titles.length > 0
            ? `\n관련 뉴스 헤드라인:\n${issue.news_titles.map((t) => `- ${t}`).join('\n')}`
            : ''

    return `다음 이슈 정보를 참고하여 토론 주제를 ${count}개 만들어주세요.

이슈 정보:
- 카테고리: ${issue.category}
- 이슈 제목: ${issue.title}
- 상태: ${issue.status}
${heatLine}${newsLine}

규칙:
1. 특정인 실명이나 특정 집단을 직접 지목하는 표현 금지
2. 이슈의 핵심 쟁점 하나만, 35자 이하 의문형으로 작성 (끊김 절대 금지)
3. 쉬운 말로: "균형", "경계", "가치", "정당성", "경제권익" 같은 추상어 사용 금지
4. 같은 단어·같은 문장 패턴 반복 금지 (주제마다 다른 쟁점, 다른 구조)
5. "~것에 대해", "~어떻게 생각하십니까" 같은 긴 서두 금지

좋은 예시 (쉽고 짧고 직접적):
- "선수 기부, 진심인가 이미지 관리인가?"
- "연예인 사생활, 팬이 알 권리 있나?"
- "콘서트 티켓값 인상, 납득할 수 있나?"
- "티켓팅 서버 마비, 누구 책임인가?"
- "10대 프로 계약, 허용해야 하나?"

나쁜 예시 (금지):
- "스포츠 경쟁에서 공정성과 정의의 균형은 어디에 있을까?" ← 추상어, 반말체
- "프로 선수의 재산 기부는 사회의 부의 경계를 흐린다." ← 선언문, 의문형 아님
- "국제 협상에서 강대국의 책임과 경제권익의 균형인가?" ← 어려운 단어

JSON 형식으로만 응답:
{
  "topics": ["35자 이하 주제1", "35자 이하 주제2", "35자 이하 주제3"]
}`
}

/**
 * parseTopics - API 응답에서 토론 주제 배열 파싱
 */
function parseTopics(raw: string): GeneratedTopic[] {
    try {
        const parsed = JSON.parse(raw)
        // topics 배열 또는 직접 배열 처리
        const topicsArray = parsed.topics || parsed

        // 질문형 마무리 패턴 (반드시 의문형으로 끝나야 함, 반말 할까/있을까 제외)
        const QUESTION_ENDINGS = /[?？]$|는가\??$|인가\??$|ㄴ가\??$|겠는가\??$|있나\??$|하나\??$/
        // 한자·이상 문자 포함 여부
        const ABNORMAL = /[^\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uD7B0-\uD7FF\u0020-\u007E·–—\-·…,?！]/
        // 거친 반말 어미만 차단 (~냐 계열)
        const COLLOQUIAL_ENDING = /[이]?냐\??$|어떠냐\??$/

        const isValidTopic = (s: string) =>
            s.trim().length > 0 &&
            s.trim().length <= 35 &&            // 35자 이하
            QUESTION_ENDINGS.test(s.trim()) &&  // 반드시 의문형
            !COLLOQUIAL_ENDING.test(s.trim()) && // 반말 어미 차단
            !ABNORMAL.test(s.trim())            // 이상 문자 차단

        if (Array.isArray(topicsArray)) {
            return topicsArray
                .filter((item): item is string =>
                    typeof item === 'string' && isValidTopic(item)
                )
                .map((content) => ({ content: content.trim() }))
        }

        // JSON 객체에서 배열 찾기 시도
        const match = raw.match(/\[[\s\S]*?\]/)
        if (!match) return []

        const arr: unknown[] = JSON.parse(match[0])
        return arr
            .filter((item): item is string =>
                typeof item === 'string' && isValidTopic(item)
            )
            .map((content) => ({ content: content.trim() }))
    } catch (e) {
        console.error('토론 주제 파싱 실패:', e, 'Raw:', raw)
        return []
    }
}
