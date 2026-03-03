/**
 * scripts/test_category_logic.ts
 * 
 * 개선된 카테고리 분류 로직 테스트
 */

// 테스트용 간소화 버전
type IssueCategory = '연예' | '스포츠' | '정치' | '사회' | '기술'

const CATEGORY_KEYWORDS: Record<IssueCategory, string[]> = {
    연예: ['배우', '가수', '아이돌', '드라마', '영화'],
    스포츠: ['야구', '축구', '선수', '감독', '경기', '우승', '리그'],
    정치: ['대통령', '국회', '정부', '행안부', '여당', '야당', '장관'],
    사회: ['사건', '불법', '점용', '하천', '화재', '범죄', '재판', '재조사', '계곡'],
    기술: ['AI', '반도체', '타이어', 'OE', '신차용', 'BMW', '넥센타이어'],
}

const CONTEXT_RULES: Array<{
    keywords: string[]
    category: IssueCategory
    boost: number
}> = [
    { keywords: ['타이어', 'OE'], category: '기술', boost: 15 },
    { keywords: ['타이어', '신차용'], category: '기술', boost: 15 },
    { keywords: ['넥센타이어'], category: '기술', boost: 10 },
    { keywords: ['국회', '법안'], category: '정치', boost: 15 },
    { keywords: ['여당', '야당'], category: '정치', boost: 15 },
    { keywords: ['불법', '점용'], category: '사회', boost: 15 },
    { keywords: ['하천', '불법'], category: '사회', boost: 15 },
    { keywords: ['재조사', '불법'], category: '사회', boost: 12 },
    { keywords: ['정부', '재조사'], category: '사회', boost: 10 },
    { keywords: ['행안부', '재조사'], category: '사회', boost: 10 },
    { keywords: ['선수', '경기'], category: '스포츠', boost: 15 },
]

function inferCategory(titles: string[], naverCategory: string | null): IssueCategory {
    const validCategories: IssueCategory[] = ['연예', '스포츠', '정치', '사회', '기술']
    const allTitles = titles.join(' ')

    // 1차: 키워드 점수
    const keywordScores = validCategories.reduce<Record<IssueCategory, number>>(
        (acc, cat) => {
            acc[cat] = CATEGORY_KEYWORDS[cat].filter((kw) => allTitles.includes(kw)).length
            return acc
        },
        { 연예: 0, 스포츠: 0, 정치: 0, 사회: 0, 기술: 0 }
    )

    // 2차: 맥락 기반 규칙 적용
    let contextMatched = false
    for (const rule of CONTEXT_RULES) {
        const allKeywordsPresent = rule.keywords.every((kw) => allTitles.includes(kw))
        if (allKeywordsPresent) {
            keywordScores[rule.category] += rule.boost
            contextMatched = true
        }
    }

    const topKeyword = (Object.entries(keywordScores) as [IssueCategory, number][])
        .sort((a, b) => b[1] - a[1])[0]

    // 3차: 우선순위 판단
    
    // 맥락 규칙이 매칭되었으면 키워드 우선
    if (contextMatched && topKeyword[1] > 0) {
        return topKeyword[0]
    }

    // 네이버 카테고리가 있지만 해당 카테고리의 키워드 점수가 0이면 네이버 오류로 판단
    if (naverCategory && validCategories.includes(naverCategory as IssueCategory)) {
        const naverKeywordScore = keywordScores[naverCategory as IssueCategory]
        
        // 네이버 카테고리의 키워드 점수가 0이고, 다른 카테고리에 키워드가 있으면 키워드 우선
        if (naverKeywordScore === 0 && topKeyword[1] > 0) {
            return topKeyword[0]
        }
        
        return naverCategory as IssueCategory
    }

    // 네이버 카테고리 없으면 키워드
    if (topKeyword[1] > 0) {
        return topKeyword[0]
    }

    return '사회'
}

// 테스트 케이스
console.log('='.repeat(80))
console.log('카테고리 분류 로직 테스트')
console.log('='.repeat(80))

const testCases = [
    {
        name: '하천·계곡 불법 시설',
        titles: [
            '정부, 하천·계곡 불법 시설 전면 재조사',
            '행안부, 하천·계곡 불법 점용 전면 재조사',
            '李 대통령 질타에 하천·계곡 불법시설 전면 재조사',
        ],
        naverCategory: '스포츠',
        expected: '사회' // 불법 시설 사회 문제
    },
    {
        name: '넥센타이어 BMW',
        titles: [
            '넥센타이어, 신형 BMW iX3에 신차용 타이어로 엔페라 스포츠 공급',
            '넥센타이어, BMW iX3에 엔페라 스포츠 신차용 타이어 공급',
            '넥센타이어, BMW 신형 iX3에 엔페라 스포츠 OE 공급',
        ],
        naverCategory: '스포츠',
        expected: '기술'
    },
    {
        name: '실제 스포츠 뉴스',
        titles: [
            '손흥민 선수, 오늘 경기에서 2골 기록',
            '김감독, 선수 기용 논란에 해명',
            '프리미어리그 우승 경쟁 치열',
        ],
        naverCategory: '스포츠',
        expected: '스포츠'
    },
]

testCases.forEach((testCase, idx) => {
    console.log(`\n${idx + 1}. ${testCase.name}`)
    console.log(`   네이버 카테고리: ${testCase.naverCategory}`)
    console.log(`   제목 예시: "${testCase.titles[0]}"`)
    
    const result = inferCategory(testCase.titles, testCase.naverCategory)
    const isCorrect = result === testCase.expected
    
    console.log(`   예상 결과: ${testCase.expected}`)
    console.log(`   실제 결과: ${result}`)
    console.log(`   판정: ${isCorrect ? '✓ 성공' : '✗ 실패'}`)
})

console.log('\n' + '='.repeat(80))
console.log('테스트 완료')
console.log('='.repeat(80))
