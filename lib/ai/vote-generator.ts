/**
 * lib/ai/vote-generator.ts
 *
 * [AI 투표 후보 생성기]
 *
 * 이슈 메타데이터를 기반으로 시점별 여론을 파악할 수 있는 투표 질문과 선택지를 생성한다.
 * 토론 주제 생성기와 동일한 패턴 사용.
 *
 * 법적 안전 원칙:
 * - 본문·요약문 절대 미사용 (04_서비스노출_법적검토.md §4.2)
 * - 생성된 투표는 phase='대기'로 저장, 관리자 승인 후에만 활성화
 * - 이슈 제목은 입력으로 허용하나, 출력에서 실명·특정인 직접 지목 금지
 *
 * AI: Groq (Llama 3.1, 무료)
 */

import { callGroq } from '@/lib/ai/groq-client'

export interface IssueMetadata {
    id: string
    title: string
    category: string
    status: string
    heat_index?: number
    news_titles?: string[] // 관련 뉴스 헤드라인 (맥락 파악용)
}

export interface GeneratedVote {
    title: string
    choices: string[]
}

/**
 * generateVoteOptions - AI 투표 후보 생성
 *
 * 이슈 메타데이터만 입력으로 받아 투표 제목과 2-4개 선택지를 생성한다.
 * 본문이나 요약문은 사용하지 않는다.
 *
 * 예시:
 * const votes = await generateVoteOptions({ id, title, category, status }, 2)
 */
export async function generateVoteOptions(
    issue: IssueMetadata,
    count: number = 2
): Promise<GeneratedVote[]> {
    const raw = await callGroq(
        [
            {
                role: 'system',
                content:
                    '당신은 한국 사회 이슈에 대한 여론 투표 문항을 만드는 전문가입니다. ' +
                    '당신은 한국 커뮤니티 사용자들이 부담 없이 참여할 수 있는 투표 문항을 만드는 전문가입니다. ' +
                    '친근하고 가벼운 말투로 작성하세요. 반말도 괜찮습니다. ' +
                    '단, "~냐?", "~이냐?", "~어떠냐?" 같은 거친 반말은 절대 금지입니다. ' +
                    '"몰라", "모름" 같은 단답형 대신 "잘 모르겠어", "판단 어려워" 처럼 부드러운 표현을 사용하세요. ' +
                    '질문은 반드시 "?"로 끝나는 의문문이어야 합니다. 선언문·권유문 금지. ' +
                    '선택지는 10자 이하의 짧은 어구나 문장으로 작성하세요. 완전히 끝맺는 형태로. ' +
                    '선택지끼리 공통 앞말을 반복하지 마세요. ' +
                    '절대 문장 중간에서 끊지 마세요. ' +
                    '특정인 실명이나 특정 집단을 직접 지목하는 표현은 절대 사용하지 마세요. ' +
                    '반드시 JSON 형식으로만 응답하세요.',
            },
            {
                role: 'user',
                content: buildPrompt(issue, count),
            },
        ],
        { model: 'llama-3.3-70b-versatile', temperature: 0.5, max_tokens: 1000 }
    )

    return parseVotes(raw)
}

/**
 * buildPrompt - 투표 생성 프롬프트 조립
 *
 * 법적 안전 포인트:
 * - 메타데이터만 전달 (이슈 본문·요약문 미포함)
 * - 출력에서 실명·사실 단정 금지 조건 명시
 * - 중립적이고 명확한 투표 문항 강제
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

    return `다음 이슈 정보를 참고하여 투표 문항을 ${count}개 만들어주세요.

이슈 정보:
- 카테고리: ${issue.category}
- 이슈 제목: ${issue.title}
- 상태: ${issue.status}
${heatLine}${newsLine}

규칙:
1. 특정인 실명이나 특정 집단을 직접 지목하는 표현 금지
2. 투표 제목: 이슈의 핵심 쟁점만 담은 짧고 명확한 의문형 (20자 이하, 서면체)
3. 이슈 제목을 그대로 쓰지 말 것. 핵심만 뽑아 재구성할 것
4. 선택지: 2~4개, 각 6자 이하의 단어나 짧은 어구. 완전한 어절로 끝낼 것
5. 선택지는 상호 배타적이고 대비가 명확해야 함

좋은 예시 (친근하고 짧게):
- 제목: "이번 협상 결과, 어떻게 생각해?" / 선택지: ["잘 된 거 같아", "별로인 것 같아", "잘 모르겠어"]
- 제목: "티켓팅 서버 마비, 누구 책임일까?" / 선택지: ["주최 측 책임", "시스템 문제", "둘 다"]
- 제목: "이번 결정, 지지해?" / 선택지: ["지지해", "반대해", "중립"]
- 제목: "교보문고 번호 따기, 어떻게 생각해?" / 선택지: ["제한해야 해", "지나친 거 같아", "잘 모르겠어"]

나쁜 예시 (금지):
- 제목: "이란·이스라엘 휴전에 찬성이냐?" ← 거친 반말 (~냐)
- 제목: "아이유 콘서트 티켓팅 서버 마비 논란에 대해 어떻게 생각하십니까?" ← 이슈 제목 그대로 + 너무 김
- 선택지: "투자와 경영의 새로운 가능성을 열어준" ← 끊김, 너무 김

JSON 형식으로만 응답:
{
  "votes": [
    {
      "title": "20자 이하 질문",
      "choices": ["6자이하", "6자이하", "6자이하"]
    }
  ]
}`
}

/**
 * parseVotes - API 응답에서 투표 배열 파싱
 */
function parseVotes(raw: string): GeneratedVote[] {
    try {
        const parsed = JSON.parse(raw)
        const votesArray = parsed.votes || parsed

        if (!Array.isArray(votesArray)) {
            console.error('투표 배열이 아닙니다:', raw)
            return []
        }

        // 거친 반말 어미만 차단 (~냐 계열)
        const COLLOQUIAL = /[이]?냐\?*$|어떠냐\?*$/
        // ASCII/한자 외 비정상 문자 포함 여부
        const ABNORMAL = /[^\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uD7B0-\uD7FF\u0020-\u007E·–—\-·…,]/

        return votesArray
            .filter((item): item is { title: string; choices: string[] } =>
                typeof item === 'object' &&
                item !== null &&
                'title' in item &&
                'choices' in item &&
                typeof item.title === 'string' &&
                item.title.trim().length > 0 &&
                item.title.trim().length <= 35 &&  // 초과 시 필터링 (잘리지 않도록)
                item.title.trim().endsWith('?') &&  // 반드시 의문문
                !COLLOQUIAL.test(item.title.trim()) && // 구어체 차단
                !ABNORMAL.test(item.title.trim()) &&   // 한자·이상 문자 차단
                Array.isArray(item.choices) &&
                item.choices.length >= 2 &&
                item.choices.length <= 4
            )
            .map((vote) => ({
                title: vote.title.trim(),
                choices: vote.choices
                    .filter((c): c is string =>
                        typeof c === 'string' &&
                        c.trim().length >= 2 &&  // 1자 이하 쓰레기 값 제거
                        c.trim().length <= 15 && // 문장형 선택지 허용
                        !ABNORMAL.test(c.trim())  // 한자·이상 문자 차단
                    )
                    .map((c) => c.trim())
                    .slice(0, 4),
            }))
            .filter((vote) => vote.choices.length >= 2)  // 선택지 필터 후 2개 미만 제거
    } catch (e) {
        console.error('투표 파싱 실패:', e, 'Raw:', raw)
        return []
    }
}
