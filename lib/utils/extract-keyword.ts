/**
 * lib/utils/extract-keyword.ts
 *
 * [이슈 제목 → 검색 키워드 추출 유틸]
 *
 * 이슈 제목에서 사용자가 검색할 법한 2~3개 핵심 단어 조합 키워드를 추출합니다.
 * 헤더 글로벌 검색바와 카테고리 페이지 검색바에서 공통으로 사용합니다.
 *
 * 예시:
 *   extractKeyword('[단독] 아이유 열애설 공식 인정') → '아이유 열애'
 *   extractKeyword('배우 OOO 마약 혐의 구속 기소') → 'OOO 마약 구속'
 */

// 의미 없는 단어 (조사·어미·접속사·시간 부사 등)
const STOPWORDS = new Set([
    '통보', '불참', '발표', '확인', '관련', '이후',
    '결국', '충격', '공개', '최초', '단독', '속보', '긴급',
    '알고', '보니', '위해', '대해', '통해', '따라', '의해', '부터', '까지',
    '이번', '해당', '모든', '일부', '전체', '이미', '아직', '더욱', '매우',
    '어디', '어디로', '어디서', '어디에', '여기', '저기', '거기',
    '논란', '사고', '오늘', '어제', '지금', '올해', '최근', '현재',
    '직접', '처음', '마지막', '드디어',
    '유명', '유명인', '인기', '스타', '셀럽',
    '방지법', '출격준비', '이상무', '혐의', '소지',
    '연예기획사', '차단', '비연예인', '예비', '신부', '배려', '진행', '사항',
    '발의', '차단', '관리', '의무화', '언팩',
])

// 검색어로 반드시 포함되어야 할 핵심 단어
const CORE_KEYWORDS = new Set([
    '탈세', '마약', '체포', '구속', '기소', '선고',
    '결혼', '이혼', '열애', '사망', '출산', '임신',
    '갤럭시', 'S26', '아이폰', '맥북',
])

// 따옴표 안에서 무시할 단어 (법률용어, 일반용어)
const QUOTED_STOPWORDS = new Set(['방지법', '혐의', '소지', '투약', '사건', '사고'])

/** 날짜/시간 패턴 판별 */
function isDateTimeWord(word: string): boolean {
    return /^\d+[일월년시분초]$/.test(word) || /^\d{2,4}$/.test(word)
}

/** 언론 접두어 제거 ([MBC], [단독] 등) */
function stripMediaPrefix(title: string): string {
    return title.replace(/^(\[[^\]]{1,30}\]\s*)+/, '').trim()
}

/**
 * extractKeyword - 이슈 제목에서 검색 키워드 추출
 *
 * 예시:
 *   extractKeyword('[MBC] 삼성 갤럭시 S26 언팩 공개') → '갤럭시 S26'
 *   extractKeyword('아이유 열애 인정, 상대는 장기하') → '아이유 열애'
 */
export function extractKeyword(text: string): string | null {
    const cleanText = stripMediaPrefix(text)

    // 1. 제목 앞쪽 따옴표로 묶인 내용 우선 추출 (이벤트명, 프로그램명 등)
    const quotedMatch = cleanText.match(/^['"「『]([^'"」』]{3,20})['"」』]/)
    if (quotedMatch) {
        const quoted = quotedMatch[1].trim()
        const hasStopword = Array.from(QUOTED_STOPWORDS).some(sw => quoted.includes(sw))
        if (!hasStopword && quoted.length >= 3 && quoted.length <= 20) {
            return quoted
        }
    }

    // 2. 일반 단어 추출 (조사 제거 + 불용어 필터)
    const words = cleanText
        .replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣0-9]/g, ' ')
        .split(/\s+/)
        .map((w) => w.replace(/(의|로|에|는|은|이|가|을|를|와|과|도|만|으로|으|에서|부터|까지|한테|에게|께|께서)$/, ''))
        .filter((w) => {
            if (w.length < 2) return false
            if (STOPWORDS.has(w)) return false
            if (/^\d+$/.test(w)) return false
            if (isDateTimeWord(w)) return false
            return true
        })

    if (words.length === 0) return null

    // 3. 핵심 키워드 확인
    const coreWords = words.filter(w => CORE_KEYWORDS.has(w))

    // 4. 핵심 키워드가 있으면 끝에 배치
    if (coreWords.length > 0) {
        if (coreWords.length >= 2) {
            const nonCoreWords = words.filter(w => !CORE_KEYWORDS.has(w))
            const result = [...nonCoreWords.slice(0, 2), ...coreWords.slice(0, 2)]
            const phrase = result.join(' ')
            if (phrase.length <= 15) return phrase
            return [nonCoreWords[0], ...coreWords.slice(0, 2)].join(' ')
        }
        const result = [words[0]]
        coreWords.forEach(core => {
            if (!result.includes(core) && result.length < 3) result.push(core)
        })
        const phrase = result.join(' ')
        if (phrase.length <= 15) return phrase
    }

    // 5. 핵심 키워드 없으면 앞 2~3개 단어 조합 (15자 이내)
    if (words.length >= 3) {
        const phrase3 = words.slice(0, 3).join(' ')
        if (phrase3.length <= 15) return phrase3
    }
    if (words.length >= 2) {
        const phrase2 = words.slice(0, 2).join(' ')
        if (phrase2.length <= 15) return phrase2
    }

    return words[0]
}
