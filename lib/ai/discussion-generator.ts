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
 */

export interface IssueMetadata {
    id: string
    title: string       // 이슈 제목 (그레이존이나 출력이 사실 나열형이므로 허용)
    category: string    // 연예, 스포츠, 정치, 사회, 기술
    status: string      // 점화, 논란 중, 종결
    heat_index?: number // 화력 지수 0–100
}

export interface GeneratedTopic {
    content: string
}

/**
 * generateDiscussionTopics - AI 토론 주제 후보 생성
 *
 * 이슈 메타데이터만 입력으로 받아 Perplexity API를 통해 철학적 토론 주제를 생성한다.
 * 본문이나 요약문은 사용하지 않는다.
 *
 * 예시:
 * const topics = await generateDiscussionTopics({ id, title, category, status }, 3)
 */
export async function generateDiscussionTopics(
    issue: IssueMetadata,
    count: number = 3
): Promise<GeneratedTopic[]> {
    const apiKey = process.env.PERPLEXITY_API_KEY
    if (!apiKey) {
        throw new Error('PERPLEXITY_API_KEY 환경변수가 설정되지 않았습니다.')
    }

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'sonar',
            messages: [
                {
                    role: 'system',
                    // 실명·특정인 지목 금지를 시스템 역할에서도 명시
                    content:
                        '당신은 사회 이슈에서 철학적·윤리적 토론 주제를 만드는 전문가입니다. ' +
                        '주어진 이슈 정보를 바탕으로 누구나 깊이 생각해볼 수 있는 보편적인 질문을 만드세요. ' +
                        '특정인 실명이나 특정 집단을 직접 지목하는 표현은 절대 사용하지 마세요. ' +
                        '반드시 JSON 배열로만 응답하세요.',
                },
                {
                    role: 'user',
                    content: buildPrompt(issue, count),
                },
            ],
            temperature: 0.7,
            max_tokens: 800,
        }),
    })

    if (!response.ok) {
        const errText = await response.text()
        throw new Error(`Perplexity API 오류 (${response.status}): ${errText}`)
    }

    const data = await response.json()
    const raw: string = data.choices?.[0]?.message?.content ?? ''

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

    return `다음 이슈 정보를 참고하여, 철학적·윤리적 관점에서 누구나 의견을 나눌 수 있는 토론 주제를 ${count}개 만들어주세요.

이슈 정보:
- 카테고리: ${issue.category}
- 이슈 제목: ${issue.title}
- 상태: ${issue.status}
${heatLine}

규칙:
1. 특정인 실명이나 특정 집단을 직접 지목하는 표현 금지
2. "~인가?", "~할 수 있을까?", "~의 경계는 어디인가?" 처럼 열린 질문 형태로 작성
3. 원인·책임·가치 기준·공정성 등 보편적으로 논의 가능한 주제
4. 한 문장, 60자 이내

JSON 배열 형식으로만 응답 (설명 없이):
["주제1", "주제2", "주제3"]`
}

/**
 * parseTopics - API 응답에서 토론 주제 배열 파싱
 */
function parseTopics(raw: string): GeneratedTopic[] {
    const match = raw.match(/\[[\s\S]*?\]/)
    if (!match) return []

    try {
        const arr: unknown[] = JSON.parse(match[0])
        return arr
            .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
            .map((content) => ({ content: content.trim() }))
    } catch {
        return []
    }
}
