/**
 * lib/config/categories.ts
 * 
 * 카테고리 시스템 중앙 설정 파일
 * 
 * 모든 카테고리 관련 설정을 한 곳에서 관리합니다.
 * 새로운 카테고리 추가 시 이 파일만 수정하면 전체 시스템에 반영됩니다.
 */

export interface CategoryConfig {
    id: string
    label: string
    badgeColors: {
        bg: string
        text: string
        border: string
    }
    gradientColors: string
    keywords: string[]
    contextRules: Array<{
        keywords: string[]
        boost: number
    }>
}

/**
 * CATEGORIES - 카테고리 설정 배열
 * 
 * 새 카테고리 추가 방법:
 * 1. 이 배열에 새 항목 추가
 * 2. DB 마이그레이션 실행 (CHECK 제약이 있는 경우)
 * 3. 자동으로 전체 시스템에 반영됨
 */
export const CATEGORIES: CategoryConfig[] = [
    {
        id: '연예',
        label: '연예',
        badgeColors: {
            bg: 'bg-pink-100',
            text: 'text-pink-700',
            border: 'border-pink-200',
        },
        gradientColors: 'from-pink-500 via-purple-500 to-indigo-500',
        keywords: [
            '배우', '가수', '아이돌', '드라마', '영화', '방송', '팬', '연기',
            '뮤직비디오', '콘서트', '공연', '데뷔', '컴백', '연예인', '스타', '오디션',
            // '활동' 제거: 너무 범용적이어서 "사회적 활동", "경제 활동" 등과 오매칭
            'SM', 'JYP', 'HYBE', '걸그룹', '보이그룹', '솔로', '앨범', '뮤지컬',
            '소속사', '매니저', '스캔들', '열애', '결혼', '이혼', '임신', '은퇴',
            '넷플릭스', '유튜브', '엔터', '아티스트', '연예활동',
            // 연예인 부동산 관련 (추가)
            '김태희', '비', '송혜교', '현빈', '이민호', '전지현', '한남더힐', '더힐',
            '펜트하우스', '고급빌라', '연예인주택', '셀럽', '연예계',
        ],
        contextRules: [],
    },
    {
        id: '스포츠',
        label: '스포츠',
        badgeColors: {
            bg: 'bg-blue-100',
            text: 'text-blue-700',
            border: 'border-blue-200',
        },
        gradientColors: 'from-blue-500 via-cyan-500 to-teal-500',
        keywords: [
            '야구', '축구', '농구', '배구', '선수', '감독', '경기', '우승', '리그',
            '득점', '올림픽', '월드컵', '체육', '코치', '트레이드', '시즌', '챔피언',
            '골', '타자', '투수', '수비', '공격', '패', '승', '골키퍼', '에이전트',
            '구단', '팀', '육상', '수영', '탁구', '테니스', '골프', '마라톤',
            'MVP', '프로리그', 'K리그', 'KBO', 'NBA', 'EPL', 'MLB',
        ],
        contextRules: [
            { keywords: ['선수', '경기'], boost: 15 },
            { keywords: ['감독', '선수'], boost: 15 },
            { keywords: ['우승', '경기'], boost: 12 },
            { keywords: ['리그', '시즌'], boost: 12 },
            { keywords: ['득점', '경기'], boost: 12 },
            { keywords: ['골', '경기'], boost: 12 },
        ],
    },
    {
        id: '정치',
        label: '정치',
        badgeColors: {
            bg: 'bg-purple-100',
            text: 'text-purple-700',
            border: 'border-purple-200',
        },
        gradientColors: 'from-red-500 via-orange-500 to-amber-500',
        keywords: [
            '대통령', '국회', '정당', '여당', '야당', '선거', '의원', '장관',
            '탄핵', '법안', '총리', '내각', '청와대', '국무', '당대표',
            '정책', '입법', '개헌', '헌법', '투표', '공천', '후보', '정부',
            '여론', '국정', '국방', '외교', '안보',
            '특검', '공수처', '검사', '기소', '수사', '편파수사',
            '국힘', '민주당', '대선', '총선', '내란',
            '사면', '탄핵소추', '헌재', '법사위',
            '행안부', '국토부', '환경부', '복지부',
        ],
        contextRules: [
            { keywords: ['국회', '법안'], boost: 15 },
            { keywords: ['여당', '야당'], boost: 15 },
            { keywords: ['대통령', '탄핵'], boost: 20 },
            { keywords: ['특검', '수사'], boost: 18 },
        ],
    },
    {
        id: '사회',
        label: '사회',
        badgeColors: {
            bg: 'bg-green-100',
            text: 'text-green-700',
            border: 'border-green-200',
        },
        gradientColors: 'from-emerald-500 via-teal-500 to-cyan-500',
        keywords: [
            '사건', '사망', '부상', '화재', '범죄', '재판',
            '피해', '시위', '갈등', '체포', '실종', '사고', '폭행',
            '성범죄', '마약', '사기', '횡령', '뇌물', '비리', '항의',
            '파업', '시위대', '집회', '조사', '구속', '판결',
            '청약', '아파트', '부동산', '임대차', '전세사기',
            '학교폭력', '직장내괴롭힘', '갑질', '인종차별',
            '교통사고', '산업재해', '식품안전',
            '불법', '점용', '재조사', '하천', '계곡', '시설',
        ],
        contextRules: [
            { keywords: ['사고', '사망'], boost: 15 },
            { keywords: ['범죄', '체포'], boost: 15 },
            { keywords: ['부동산', '청약'], boost: 12 },
        ],
    },
    {
        id: '기술',
        label: '기술',
        badgeColors: {
            bg: 'bg-amber-100',
            text: 'text-amber-700',
            border: 'border-amber-200',
        },
        gradientColors: 'from-violet-500 via-blue-500 to-cyan-500',
        keywords: [
            'AI', '인공지능', '반도체', '스마트폰', '앱', '플랫폼', '스타트업',
            '구글', '애플', '메타', '삼성전자', 'LG전자', 'SK하이닉스', '소프트웨어',
            '클라우드', '데이터', '사이버', '해킹', '개발자', '코딩', '로봇',
            '드론', '자율주행', '전기차', '배터리', '디지털', '서비스', '유튜브',
            '타이어', 'OE', '신차용', 'BMW', '벤츠', '아우디', '테슬라',
            '현대차', '기아', '넥센타이어', '한국타이어',
            '기술', '과학', '연구', '실험', 'DGIST', 'KAIST', 'POSTECH', 'GIST',
            '연구소', '연구원', '논문', '발표', '개발', '특허', '혁신',
            '뇌과학', '신경과학', '생명과학', '의료기기', '바이오', '제약',
            '미인도', '복원', '분석', '알고리즘', '머신러닝', '딥러닝',
            '무신사', '쿠팡', '네이버쇼핑', '이커머스', '온라인쇼핑', '유통',
            '패션', '브랜드', '큐레이션', '스토어', '론칭', '입점', '판매',
        ],
        contextRules: [
            { keywords: ['타이어', 'OE'], boost: 15 },
            { keywords: ['타이어', '신차용'], boost: 15 },
            { keywords: ['타이어', '공급'], boost: 12 },
            { keywords: ['BMW', '공급'], boost: 10 },
            { keywords: ['넥센타이어'], boost: 10 },
            { keywords: ['한국타이어'], boost: 10 },
            { keywords: ['반도체', '생산'], boost: 15 },
            { keywords: ['AI', '모델'], boost: 12 },
            { keywords: ['전기차', '배터리'], boost: 12 },
            { keywords: ['DGIST', 'AI'], boost: 20 },
            { keywords: ['KAIST', '연구'], boost: 15 },
            { keywords: ['뇌', '과학'], boost: 18 },
            { keywords: ['미인도', 'AI'], boost: 20 },
            { keywords: ['연구', '개발'], boost: 12 },
            { keywords: ['기술', '개발'], boost: 12 },
            { keywords: ['무신사', '큐레이션'], boost: 18 },
            { keywords: ['무신사', '스토어'], boost: 18 },
            { keywords: ['이커머스', '플랫폼'], boost: 15 },
            { keywords: ['온라인쇼핑', '서비스'], boost: 12 },
        ],
    },
]

/**
 * 유틸리티 함수들
 */

export function getCategoryIds(): string[] {
    return CATEGORIES.map((c) => c.id)
}

export function getCategoryById(id: string): CategoryConfig | undefined {
    return CATEGORIES.find((c) => c.id === id)
}

export function getCategoryKeywords(id: string): string[] {
    return getCategoryById(id)?.keywords ?? []
}

export function getCategoryContextRules(id: string) {
    return getCategoryById(id)?.contextRules ?? []
}

export function getAllCategoryKeywords(): Record<string, string[]> {
    return CATEGORIES.reduce(
        (acc, cat) => {
            acc[cat.id] = cat.keywords
            return acc
        },
        {} as Record<string, string[]>
    )
}

export function getAllContextRules(): Array<{
    keywords: string[]
    category: string
    boost: number
}> {
    return CATEGORIES.flatMap((cat) =>
        cat.contextRules.map((rule) => ({
            ...rule,
            category: cat.id,
        }))
    )
}

/**
 * 타입 정의
 * Union 타입을 자동 생성하여 타입 안정성 유지
 */
export type IssueCategory = (typeof CATEGORIES)[number]['id']
