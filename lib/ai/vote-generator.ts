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

import { incrementApiUsage } from '@/lib/api-usage-tracker'

export interface IssueMetadata {
    id: string
    title: string
    category: string
    status: string
    heat_index?: number
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
                        '당신은 사회 이슈에 대한 여론 투표 문항을 만드는 전문가입니다. ' +
                        '주어진 이슈 정보를 바탕으로 명확하고 중립적인 투표 질문과 선택지를 만드세요. ' +
                        '특정인 실명이나 특정 집단을 직접 지목하는 표현은 절대 사용하지 마세요. ' +
                        '반드시 JSON 배열로만 응답하세요.',
                },
                {
                    role: 'user',
                    content: buildPrompt(issue, count),
                },
            ],
            temperature: 0.7,
            max_tokens: 1000,
            response_format: { type: 'json_object' }
        }),
    })

    if (!response.ok) {
        const errText = await response.text()

        await incrementApiUsage('groq', {
            calls: 1,
            successes: 0,
            failures: 1,
        }).catch(err => console.error('API 사용량 추적 실패:', err))

        throw new Error(`Groq API 오류 (${response.status}): ${errText}`)
    }

    const data = await response.json()
    const raw: string = data.choices?.[0]?.message?.content ?? ''

    await incrementApiUsage('groq', {
        calls: 1,
        successes: 1,
        failures: 0,
    }).catch(err => console.error('API 사용량 추적 실패:', err))

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

    return `다음 이슈 정보를 참고하여, 시점별 여론을 파악할 수 있는 투표 문항을 ${count}개 만들어주세요.

이슈 정보:
- 카테고리: ${issue.category}
- 이슈 제목: ${issue.title}
- 상태: ${issue.status}
${heatLine}

규칙:
1. 특정인 실명이나 특정 집단을 직접 지목하는 표현 금지
2. 투표 제목은 명확하고 중립적인 질문 형태 (40자 이내)
3. 선택지는 2-4개, 각 선택지는 20자 이내
4. 선택지는 상호 배타적이고 명확하게 구분되어야 함
5. "찬성/반대", "긍정/부정/중립" 등 균형잡힌 선택지 제공

JSON 형식으로만 응답:
{
  "votes": [
    {
      "title": "투표 질문 1",
      "choices": ["선택지1", "선택지2", "선택지3"]
    },
    {
      "title": "투표 질문 2",
      "choices": ["선택지1", "선택지2"]
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

        return votesArray
            .filter((item): item is { title: string; choices: string[] } =>
                typeof item === 'object' &&
                item !== null &&
                'title' in item &&
                'choices' in item &&
                typeof item.title === 'string' &&
                Array.isArray(item.choices) &&
                item.choices.length >= 2 &&
                item.choices.length <= 4
            )
            .map((vote) => ({
                title: vote.title.trim().substring(0, 40),
                choices: vote.choices
                    .filter((c): c is string => typeof c === 'string')
                    .map((c) => c.trim().substring(0, 20))
                    .slice(0, 4),
            }))
    } catch (e) {
        console.error('투표 파싱 실패:', e, 'Raw:', raw)
        return []
    }
}
