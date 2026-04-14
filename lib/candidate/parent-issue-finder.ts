/**
 * lib/candidate/parent-issue-finder.ts
 *
 * [파생 이슈 감지]
 *
 * 새 이벤트가 기존 활성 이슈(점화/논란중)의 후속/파생 사건인지 판단합니다.
 * 중복이 아니지만 같은 사건의 연속선상에 있는 경우를 감지합니다.
 *
 * 예시:
 * - 기존: "트럼프 이란 최후통첩" → 신규: "이란 트럼프 거부 선언" → 전개 연결
 * - 기존: "뉴진스 해체 위기" → 신규: "민희진 기자회견 반박" → 파생 연결
 *
 * 비용 정책:
 * - GroqProvider 직접 사용 (AI_PROVIDER 환경변수 무시)
 * - 추가 Claude API 비용 없음
 */

import { GroqProvider } from '@/lib/ai/groq-provider'
import { parseJsonObject } from '@/lib/ai/parse-json-response'

export interface ParentIssueResult {
    parentIssueId: string
    parentIssueTitle: string
    stage: '전개' | '파생'
    confidence: number
    reason: string
}

const PARENT_CONFIDENCE_THRESHOLD = 85
const MAX_CANDIDATE_ISSUES = 15

// 인스턴스 재사용 (호출마다 키 로딩 방지)
let groqProvider: GroqProvider | null = null
function getGroq(): GroqProvider {
    if (!groqProvider) groqProvider = new GroqProvider()
    return groqProvider
}

/**
 * findParentIssue - 기존 이슈 중 부모 이슈 탐색
 *
 * @param supabaseAdmin - Supabase Admin 클라이언트
 * @param newTitle - 새 이벤트 제목 (tentativeTitle)
 * @param category - 이슈 카테고리
 * @returns 부모 이슈 정보 (없으면 null)
 */
export async function findParentIssue(
    supabaseAdmin: any,
    newTitle: string,
    category: string
): Promise<ParentIssueResult | null> {
    const { data: activeIssues, error } = await supabaseAdmin
        .from('issues')
        .select('id, title')
        .in('status', ['점화', '논란중', '대기'])
        .eq('approval_status', '승인')
        .eq('category', category)
        .order('heat_index', { ascending: false })
        .limit(MAX_CANDIDATE_ISSUES)

    if (error || !activeIssues || activeIssues.length === 0) return null

    const issueList = activeIssues
        .map((iss: { id: string; title: string }, i: number) => `${i + 1}. ${iss.title}`)
        .join('\n')

    const prompt = `새 이벤트가 아래 기존 이슈들 중 하나의 후속/파생 사건인지 판단하세요.

새 이벤트: "${newTitle}"

기존 이슈 목록:
${issueList}

판단 기준:
- 전개: 같은 사건의 직접적인 다음 단계 (입장 발표, 후속 조치, 수사 진행 등)
- 파생: 기존 이슈로 인해 새로 불거진 연관 논란 (다른 인물 등장, 연관 사건 등)
- 별개: 이름/키워드만 겹치는 완전히 다른 사건 → isDerivative: false

신뢰도 70% 미만이면 반드시 isDerivative: false로 응답하세요.

응답 형식 (JSON만):
{
  "isDerivative": true,
  "parentIndex": 1,
  "stage": "전개",
  "confidence": 85,
  "reason": "판단 이유 (한 줄)"
}`

    try {
        const content = await getGroq().complete(prompt, {
            model: 'llama-3.1-8b-instant',
            temperature: 0.2,
            maxTokens: 200,
        })

        const result = parseJsonObject<{
            isDerivative: boolean
            parentIndex: number
            stage: string
            confidence: number
            reason: string
        }>(content)

        if (!result || !result.isDerivative || result.confidence < PARENT_CONFIDENCE_THRESHOLD) {
            return null
        }

        const parent = activeIssues[result.parentIndex - 1]
        if (!parent) return null

        return {
            parentIssueId: parent.id,
            parentIssueTitle: parent.title,
            stage: result.stage === '파생' ? '파생' : '전개',
            confidence: result.confidence,
            reason: result.reason,
        }
    } catch (error) {
        console.warn('[findParentIssue] Groq 호출 실패, 건너뜀:', error)
        return null
    }
}
