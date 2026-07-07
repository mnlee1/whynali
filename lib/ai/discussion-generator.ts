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

import { callGroq } from '@/lib/ai/groq-client'
import { parseJsonObject } from '@/lib/ai/parse-json-response'

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
    const raw = await callGroq(
        [
            {
                role: 'user',
                content: buildPrompt(issue, count),
            },
        ],
        { model: 'qwen/qwen3.6-27b', max_tokens: 2000 }
    )

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

    return `당신은 한국 커뮤니티용 토론 주제를 만드는 전문가입니다.
아래 이슈를 보고 사람들이 즉시 "나는 찬성/반대"를 고르게 만드는 논쟁형 질문을 ${count}개 생성하세요.

[이슈 정보]
- 카테고리: ${issue.category}
- 제목: ${issue.title}
- 상태: ${issue.status}
${heatLine}${newsLine}

[필수 조건]
- 40자 이하 완성된 의문형 문장 (문장 중간 끊김 금지)
- 읽는 순간 찬반이 갈리는 질문 (중립적인 질문 금지)
- 특정인 실명·특정 집단 직접 지목 금지
- 추상어 금지: "균형", "가치", "정당성", "경제권익" 등
- 주제마다 다른 쟁점, 다른 문장 구조 사용

[좋은 예시 - 다양한 패턴]
- "팬들이 연예인 사생활까지 알 권리 있을까?"
- "콘서트 티켓값 인상, 팬들이 받아들여야 할까?"
- "실수한 선수, 국가대표에서 제외하는 게 맞나?"
- "기부한 선수, 진심인지 이미지 관리인지 알 수 있을까?"
- "정치인 해외 순방, 세금 낭비라고 봐야 하나?"
- "판정 논란, 재심사 요청하는 게 당연한 권리인가?"
- "논란이 된 발언, 사과만으로 충분한가?"
- "방송 하차 요구, 시청자가 결정할 문제인가?"

[나쁜 예시 - 금지]
- "공정성의 균형은 어디에 있을까?" → 추상어
- "이 사안이 사회에 미치는 영향은?" → 중립적, 찬반 안 갈림
- "어떻게 생각하세요?" → 너무 막연함

아래 JSON 형식으로만 응답하세요. 다른 텍스트는 절대 포함하지 마세요:
{"topics": ["주제1", "주제2", "주제3"]}`
}

/**
 * parseTopics - API 응답에서 토론 주제 배열 파싱
 */
function parseTopics(raw: string): GeneratedTopic[] {
    try {
        console.log('[parseTopics] Raw:', raw)

        const parsed = parseJsonObject<{ topics?: unknown[] } | unknown[]>(raw)
        if (!parsed) {
            console.error('[parseTopics] JSON 파싱 실패. Raw:', raw)
            return []
        }

        const topicsArray: unknown[] = Array.isArray(parsed)
            ? parsed
            : (parsed as { topics?: unknown[] }).topics ?? []

        // 질문형 마무리 패턴 - 다양한 의문형 어미 허용
        const QUESTION_ENDINGS = /[?？]$|는가\??$|인가\??$|ㄴ가\??$|겠는가\??$|있나\??$|하나\??$|할까\??$|될까\??$|맞나\??$|맞을까\??$|볼까\??$|걸까\??$|일까\??$|건가\??$|는가\??$|권리인가\??$/
        // 한자·이상 문자 포함 여부 (전각 ?！도 허용)
        const ABNORMAL = /[^가-힣ᄀ-ᇿ㄰-㆏ꥠ-꥿ힰ-퟿ -~！？·–—…]/
        // 거친 반말 어미만 차단 (~냐 계열)
        const COLLOQUIAL_ENDING = /[이]?냐\??$|어떠냐\??$/

        const isValidTopic = (s: string): boolean => {
            const t = s.trim()
            if (t.length === 0) {
                console.log('[parseTopics] 탈락(빈 문자열)')
                return false
            }
            if (t.length > 50) {
                console.log(`[parseTopics] 탈락(${t.length}자>50자): ${t}`)
                return false
            }
            if (!QUESTION_ENDINGS.test(t)) {
                console.log(`[parseTopics] 탈락(의문형 아님): ${t}`)
                return false
            }
            if (COLLOQUIAL_ENDING.test(t)) {
                console.log(`[parseTopics] 탈락(거친 반말): ${t}`)
                return false
            }
            if (ABNORMAL.test(t)) {
                console.log(`[parseTopics] 탈락(이상 문자): ${t}`)
                return false
            }
            return true
        }

        const results = topicsArray
            .filter((item): item is string =>
                typeof item === 'string' && isValidTopic(item)
            )
            .map((content) => ({ content: content.trim() }))
        console.log(`[parseTopics] ${topicsArray.length}개 중 ${results.length}개 통과`)
        return results
    } catch (e) {
        console.error('[parseTopics] 파싱 실패:', e, 'Raw:', raw)
        return []
    }
}
