/**
 * lib/linker/linker-utils.ts
 *
 * [이슈-뉴스/커뮤니티 링커 공통 유틸리티]
 *
 * issue-news-linker.ts와 issue-community-linker.ts에서 공유하는
 * 키워드 추출, 제목 파싱, 매칭 함수를 정의합니다.
 */

// 복합 키워드 패턴 (우선 추출) — 단어 분리 전 먼저 매칭
const COMPOUND_PATTERNS = [
    // 시설·장소 복합어
    { pattern: /스포츠[\s·]*MICE[\s·]*파크/gi, replacement: '스포츠MICE파크' },
    { pattern: /MICE[\s·]*파크/gi, replacement: 'MICE파크' },
    { pattern: /돔[\s·]*구장/gi, replacement: '돔구장' },
    { pattern: /야구[\s·]*장/gi, replacement: '야구장' },
    { pattern: /축구[\s·]*장/gi, replacement: '축구장' },
    { pattern: /체육[\s·]*관/gi, replacement: '체육관' },
    { pattern: /전시[\s·]*관/gi, replacement: '전시관' },
    // 이벤트·행사 복합어
    { pattern: /올림픽[\s·]*공원/gi, replacement: '올림픽공원' },
    { pattern: /월드[\s·]*컵/gi, replacement: '월드컵' },
    // 기업·브랜드 복합어
    { pattern: /삼성[\s·]*전자/gi, replacement: '삼성전자' },
    { pattern: /현대[\s·]*자동차/gi, replacement: '현대자동차' },
]

// 뉴스 기사·커뮤니티 제목에 자주 등장하지만 이슈 식별에 무의미한 단어
const STOPWORDS = new Set([
    '논란', '사건', '사고', '통보', '불참', '발표', '확인', '관련', '이후',
    '결국', '충격', '공개', '최초', '단독', '속보', '긴급', '오늘', '어제',
    '지금', '올해', '최근', '현재', '직접', '처음', '마지막', '드디어',
    '알고', '보니', '위해', '대해', '통해', '따라', '의해', '부터', '까지',
    '이번', '해당', '모든', '일부', '전체', '이미', '아직', '더욱', '매우',
    // 방향/위치 관련 범용어 추가 (너무 일반적)
    '어디', '어디로', '어디서', '어디에', '여기', '저기', '거기',
    // 모집/참여 관련 범용어 (지역명 없이 단독 사용 시 오매칭 원인)
    '모집', '참여', '신청', '접수', '지원', '선발', '채용',
])

/**
 * stripMediaPrefix - 언론 접두어 제거
 *
 * 이슈 제목 앞의 [단독], [해외연예] 같은 접두어를 제거해 토큰 오염을 방지.
 * 기존 DB에 이미 접두어가 포함된 이슈 title이 있어도 linker 단에서 처리한다.
 */
export function stripMediaPrefix(title: string): string {
    return title.replace(/^(\[[^\]]{1,30}\]\s*)+/, '').trim()
}

// 1글자이지만 중요한 의미를 가져서 필터링하면 안 되는 예외 키워드
export const ALLOWED_ONE_CHAR_KEYWORDS = new Set([
    '환', '뷔', '진', '첸', '츄', '뱀', '윤', '문', '안', '정', '이', '박', '김', '최',
    '권', '조', '강', '류', '홍', '송', '백', '유', '오', '신', '양', '황', '허', '고',
    '설', '선', '길', '표', '명', '범', '혁', '훈', '빈', '결', '률', '현', '린'
])

/**
 * extractKeywords - 제목에서 핵심 키워드 추출
 *
 * 복합 키워드 우선 추출 → 언론 접두어 제거 → 특수문자 제거 → 공백 분리 → 2글자 미만 제거(예외 허용) → 불용어 제거
 */
export function extractKeywords(text: string): string[] {
    let cleaned = stripMediaPrefix(text)
    
    // 1. 복합 키워드 먼저 추출 (단어 분리 전)
    const compounds: string[] = []
    for (const { pattern, replacement } of COMPOUND_PATTERNS) {
        const matches = cleaned.match(pattern)
        if (matches) {
            compounds.push(...matches.map(() => replacement.toLowerCase()))
            // 복합어를 공백으로 치환하여 중복 추출 방지
            cleaned = cleaned.replace(pattern, ' ')
        }
    }
    
    // 2. 일반 키워드 추출
    const words = cleaned
        .replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ')
        .split(/\s+/)
        .filter((w) => (w.length >= 2 || ALLOWED_ONE_CHAR_KEYWORDS.has(w)) && !STOPWORDS.has(w))
    
    // 3. 복합 키워드 + 일반 키워드 (중복 제거)
    return Array.from(new Set([...compounds, ...words]))
}

/**
 * extractTitleWords - 뉴스/커뮤니티 제목을 단어 Set으로 변환
 *
 * includes() 부분 매칭 대신 단어 단위 정확 일치 비교를 위해 사용.
 * 예: "이재민 구호" → Set(["이재민", "구호"]) → "이재" 키워드와 매칭 안 됨
 */
export function extractTitleWords(text: string): Set<string> {
    return new Set(
        text
            .replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ')
            .split(/\s+/)
            .filter((w) => w.length >= 2 || ALLOWED_ONE_CHAR_KEYWORDS.has(w))
            .map((w) => w.toLowerCase())
    )
}

/**
 * buildDateRange - 이슈 생성일 기준 날짜 범위 반환
 */
export function buildDateRange(
    issueCreatedAt: string,
    beforeDays: number,
    afterDays: number
): { from: string; to: string } {
    const issueDt = new Date(issueCreatedAt)
    return {
        from: new Date(issueDt.getTime() - beforeDays * 24 * 60 * 60 * 1000).toISOString(),
        to: new Date(issueDt.getTime() + afterDays * 24 * 60 * 60 * 1000).toISOString(),
    }
}

/**
 * isMatch - 제목이 이슈 키워드 기준을 통과하는지 판단
 */
export function isMatch(title: string, keywordsLower: string[], threshold: number): boolean {
    const titleWords = extractTitleWords(title)
    const matchCount = keywordsLower.filter((kw) => titleWords.has(kw)).length
    return matchCount >= threshold
}
