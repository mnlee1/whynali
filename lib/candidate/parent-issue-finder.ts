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

const PARENT_CONFIDENCE_THRESHOLD = parseInt(
    process.env.PARENT_CONFIDENCE_THRESHOLD ?? '95'
)
const MAX_CANDIDATE_ISSUES = 15

// 의미 없는 한국어 단어 (조사, 부사, 일반 명사 등)
const STOPWORDS = new Set([
    '이', '가', '은', '는', '을', '를', '의', '에', '로', '으로', '와', '과', '이나', '나',
    '도', '만', '까지', '부터', '에서', '에게', '한', '하는', '하고', '하여', '해서',
    '이다', '있다', '없다', '하다', '되다', '이고', '하며', '이라', '라', '것', '수',
    '등', '및', '또', '그', '더', '이후', '앞서', '관련', '대해', '위해', '따라',
    '통해', '대한', '위한', '같은', '지난', '현재', '오늘', '내일', '어제', '해당',
    '논란', '이슈', '사건', '사고', '화제', '소식',
])

/** 제목에서 의미 있는 키워드 추출 (2글자 이상, 불용어 제외) */
function extractKeywords(title: string): Set<string> {
    return new Set(
        title
            .split(/[\s\[\]()「」『』<>【】·,./…!?"']+/)
            .map(t => t.trim())
            .filter(t => t.length >= 2 && !STOPWORDS.has(t))
    )
}

/**
 * countKeywordOverlap - 두 제목 간 겹치는 키워드 수 반환
 */
export function countKeywordOverlap(titleA: string, titleB: string): number {
    const keywordsA = extractKeywords(titleA)
    const keywordsB = extractKeywords(titleB)
    let count = 0
    for (const kw of keywordsA) {
        if (keywordsB.has(kw)) count++
    }
    return count
}

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

    // 키워드 프리필터: AI 호출 전에 제목 키워드가 1개 이상 겹치는 이슈만 후보로 좁힘
    // → 카테고리만 같고 내용이 전혀 다른 이슈가 AI 후보에 올라가는 것을 차단
    const MIN_KEYWORD_OVERLAP = parseInt(process.env.PARENT_MIN_KEYWORD_OVERLAP ?? '2')
    const filteredIssues = (activeIssues as Array<{ id: string; title: string }>)
        .filter(iss => countKeywordOverlap(newTitle, iss.title) >= MIN_KEYWORD_OVERLAP)

    if (filteredIssues.length === 0) return null

    const issueList = filteredIssues
        .map((iss, i) => `${i + 1}. ${iss.title}`)
        .join('\n')

    const prompt = `새 이벤트가 아래 기존 이슈들 중 하나의 후속/파생 사건인지 판단하세요.

새 이벤트: "${newTitle}"

기존 이슈 목록:
${issueList}

판단 기준:
- 전개: 같은 사건의 직접적인 다음 단계 (입장 발표, 후속 조치, 수사 진행 등)
- 파생: 기존 이슈로 인해 새로 불거진 연관 논란 (다른 인물 등장, 연관 사건 등)
- 별개: 이름/키워드만 겹치는 완전히 다른 사건 → isDerivative: false

## 중요 판단 원칙 (반드시 준수)
- 주인공 인물·장소·사건이 실질적으로 동일해야만 전개/파생으로 판단
- 같은 인물이라도 완전히 다른 사건이면 무조건 별개 (isDerivative: false)
- 단순히 같은 시기에 화제이거나 카테고리가 같다는 이유만으로는 파생이 아님
- 확신이 없으면 반드시 isDerivative: false
- 신뢰도 95% 미만이면 반드시 isDerivative: false

응답 형식 (JSON만):
{
  "isDerivative": true,
  "parentIndex": 1,
  "stage": "전개",
  "confidence": 95,
  "reason": "판단 이유 (한 줄)"
}`

    try {
        const content = await getGroq().complete(prompt, {
            model: 'llama-3.3-70b-versatile',
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

        const parent = filteredIssues[result.parentIndex - 1]
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
