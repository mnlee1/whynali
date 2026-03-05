/**
 * lib/candidate/issue-candidate.ts
 *
 * [이슈 후보 자동 생성]
 *
 * 최근 24시간 미연결 수집 건(뉴스·커뮤니티)을 키워드 기반으로 묶어
 * 이슈 후보 그룹을 만들고, 07_이슈등록_화력_정렬_규격 §1 조건에 따라
 * 이슈를 대기 등록하거나 자동 승인합니다.
 *
 * 흐름:
 *   1. 뉴스 5건 이상 + 고유 출처 2곳 이상 + 화력 10점 이상: approval_status='대기'로 등록
 *   2. 화력 30점 이상 + 허용 카테고리(사회/기술/스포츠): 자동 승인
 *   3. 같은 제목이 최근 24시간 내 이미 등록된 경우 중복 등록 방지
 *
 * 임계값은 환경변수로 조정 가능:
 *   CANDIDATE_ALERT_THRESHOLD (기본 5) - 최소 뉴스 건수
 *   CANDIDATE_AUTO_APPROVE_THRESHOLD (기본 30) - 자동 승인 화력 기준
 *   CANDIDATE_MIN_HEAT_TO_REGISTER (기본 10) - 최소 등록 화력
 *   CANDIDATE_WINDOW_HOURS (기본 24) — 건수 집계 시간 창
 */

import { supabaseAdmin } from '@/lib/supabase/server'
import { calculateHeatIndex } from '@/lib/analysis/heat'
import type { IssueCategory } from '@/lib/config/categories'
import {
    getAllCategoryKeywords,
    getAllContextRules,
    getCategoryIds,
} from '@/lib/config/categories'
import { validateGroups } from '@/lib/ai/perplexity-group-validator'
import { groupNewsByPerplexity, applyAIGrouping } from '@/lib/ai/perplexity-grouping'

const ALERT_THRESHOLD = parseInt(process.env.CANDIDATE_ALERT_THRESHOLD ?? '5')
const AUTO_APPROVE_THRESHOLD = parseInt(process.env.CANDIDATE_AUTO_APPROVE_THRESHOLD ?? '30')
const NO_RESPONSE_HOURS = parseInt(process.env.CANDIDATE_NO_RESPONSE_HOURS ?? '6')
/* 건수 집계 시간 창 (시간 단위). 기본 3시간 → 임시로 24시간 */
const WINDOW_HOURS = parseInt(process.env.CANDIDATE_WINDOW_HOURS ?? '24')
/* 대기 등록을 위한 최소 고유 출처 수. 같은 언론사의 반복 배포를 걸러낸다 */
const MIN_UNIQUE_SOURCES = parseInt(process.env.CANDIDATE_MIN_UNIQUE_SOURCES ?? '2')
/* 이슈 등록 후 화력이 이 값 미만이면 자동 반려 처리 (관리자 목록에 노출 안 됨) */
const MIN_HEAT_TO_REGISTER = parseInt(process.env.CANDIDATE_MIN_HEAT_TO_REGISTER ?? '10')
/*
 * 커뮤니티 글을 이슈에 매칭할 때 요구하는 최소 공통 키워드 수.
 * 뉴스 그루핑(>= 1)과 별도로 더 엄격하게 적용해 관련 없는 글 유입 방지.
 * 기본 2: "김연아" 한 단어만 겹쳐도 매칭되는 노이즈를 차단.
 */
const COMMUNITY_MATCH_THRESHOLD = parseInt(process.env.CANDIDATE_COMMUNITY_MATCH_THRESHOLD ?? '2')

interface RawItem {
    id: string
    title: string
    created_at: string
    type: 'news' | 'community'
    category: string | null  // news_data.category (커뮤니티는 null)
    source: string | null    // news_data.source (출처 다양성 판별용, 커뮤니티는 null)
}

interface CandidateGroup {
    tokens: string[]      // 후보 대표 토큰 (합집합으로 갱신됨)
    items: RawItem[]
}

export interface CandidateAlert {
    title: string         // 후보 대표 제목 (첫 번째 수집 건)
    count: number         // 집계 창(기본 3시간) 내 건수
    newsCount: number
    communityCount: number
}

export interface CandidateResult {
    created: number                  // 자동 승인된 이슈 수
    alerts: CandidateAlert[]         // 대기 등록된 후보 목록 (관리자 배너용)
    evaluated: number                // 평가된 전체 후보 수
}

/**
 * stripMediaPrefix - 언론 접두어 제거
 *
 * 뉴스 기사 제목 앞의 [단독], [속보], [해외연예] 같은 언론사 형식 접두어를 제거한다.
 * 이 접두어가 이슈 제목에 남아 있으면 토큰을 오염시켜 threshold를 불필요하게 높인다.
 *
 * 예시:
 *   "[해외연예] 조로사, 팔로워 1억 돌파" → "조로사, 팔로워 1억 돌파"
 *   "[단독][속보] 이재명 대선 출마" → "이재명 대선 출마"
 */
function stripMediaPrefix(title: string): string {
    return title
        .replace(/^(\[[^\]]{1,30}\]\s*)+/, '')
        .replace(/\.{2,}$/, '') // 끝에 붙은 불필요한 줄임표(..) 제거
        .trim()
}

/**
 * selectRepresentativeTitle - 그룹 내 대표 제목 선택
 *
 * 접두어 제거 후 가장 정보가 풍부하면서도 핵심 키워드를 잘 포함하는 제목을 선택한다.
 * 기준:
 * 1. 그룹 내 빈출 키워드(핵심 인물/주제)를 가장 많이 포함한 제목 우선
 * 2. 빈출 키워드 포함 수가 같으면, 전체 키워드(토큰) 개수가 많은 제목 우선 (상세한 설명)
 * 3. 토큰 개수도 같으면, 글자 수가 긴 제목 우선
 */
function selectRepresentativeTitle(items: RawItem[]): string {
    // 1. 모든 제목의 토큰 추출 및 빈도 계산
    const allTokensList = items.map(i => {
        const cleanTitle = stripMediaPrefix(i.title)
        return {
            title: cleanTitle,
            tokens: tokenize(cleanTitle)
        }
    })

    const tokenFreq = new Map<string, number>()
    for (const item of allTokensList) {
        for (const t of item.tokens) {
            tokenFreq.set(t, (tokenFreq.get(t) || 0) + 1)
        }
    }

    // 2. 핵심 키워드 선정 (그룹 내 기사 중 40% 이상에서 등장한 단어)
    const threshold = Math.max(2, Math.ceil(items.length * 0.4))
    const coreKeywords = Array.from(tokenFreq.entries())
        .filter(([_, count]) => count >= threshold)
        .map(([t]) => t)

    // 3. 각 제목 평가
    const titlesWithInfo = allTokensList.map((item) => {
        // 핵심 키워드 포함 개수
        const coreMatchCount = coreKeywords.filter(core => item.tokens.includes(core)).length
        
        // 특정 고유명사(인물명, 영어 약자 등 빈도가 높은 핵심어)가 빠진 긴 제목이 선택되는 것을 방지하기 위해
        // 가장 빈도가 높은 최상위 키워드 1~2개가 포함되어 있는지 확인
        const topKeywords = Array.from(tokenFreq.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 2)
            .map(([t]) => t)
            
        const hasTopKeywords = topKeywords.some(top => item.tokens.includes(top))
        
        // 최상위 키워드를 포함하지 않으면 패널티
        const penalty = hasTopKeywords ? 0 : -10

        return {
            title: item.title,
            coreMatchCount: coreMatchCount + penalty, // 최우선 정렬 기준
            tokenCount: item.tokens.length,          // 2순위
            length: item.title.length                // 3순위
        }
    })
    
    // 정렬: 핵심 키워드 포함 수(내림차순) -> 토큰 개수(내림차순) -> 길이(내림차순)
    titlesWithInfo.sort((a, b) => {
        if (b.coreMatchCount !== a.coreMatchCount) {
            return b.coreMatchCount - a.coreMatchCount
        }
        if (b.tokenCount !== a.tokenCount) {
            return b.tokenCount - a.tokenCount
        }
        return b.length - a.length
    })
    
    return titlesWithInfo[0].title
}

/**
 * normalizeKeyword - 키워드 정규화 (한자→한글, 약어→전체명)
 * 
 * 같은 의미지만 다르게 표현된 키워드를 통일합니다.
 * 예: 尹 → 윤석열, 與 → 여당, 野 → 야당
 */
function normalizeKeyword(word: string): string {
    const normalizationMap: Record<string, string> = {
        // 정치인 (한자→한글)
        '尹': '윤석열',
        '李': '이재명',
        // 정당 (한자→한글)
        '與': '여당',
        '野': '야당',
        // 기관 (약어→전체)
        'TK': '대구경북',
        'PK': '부산경남',
        // 연예인 (약어→전체)
        '민희진': '민희진',
        '뉴진스': '뉴진스',
        'NewJeans': '뉴진스',
        // 기타
        '內': '내',
        '外': '외',
    }
    
    return normalizationMap[word] || word
}

/**
 * tokenize - 제목을 키워드 배열로 분리
 *
 * 특수문자 제거 후 공백 기준 분리, 2글자 미만 제거.
 * 키워드 정규화를 통해 한자/약어를 한글로 통일.
 */
// 뉴스 제목에 자주 등장하지만 이슈 식별에 무의미한 광범위 단어
// 이 단어만으로 전혀 다른 기사들이 같은 그룹으로 묶이는 것을 방지
const GROUPING_STOPWORDS = new Set([
    // 기관·직책 (단독으로는 이슈 식별 불가)
    '경찰', '검찰', '의원', '정부', '대통령', '국회', '법원', '재판',
    '시장', '대표', '대학', '교수', '학교', '병원', '회사', '기업',
    '위원회', '특검', '공수처', '검사', '판사', '변호사', '장관',
    // 법률·제도 용어
    '법인', '수사', '의혹', '혐의', '판결', '기소', '체포', '구속',
    // 뉴스 수식어
    '발표', '관련', '사건', '사고', '논란', '문제',
    '뉴스', '기자', '취재', '단독', '속보', '긴급', '오늘', '실시간',
    // 정당·정파 (국내외 공통, 범용 단어)
    '민주당', '공화당', '여당', '야당', '보수', '진보', '좌파', '우파',
    '당', '정당', '지지율', '여론조사', '선거', '투표', '득표',
    // 지역·국가·행정 (단독으로는 이슈 식별 불가)
    '한국', '서울', '미국', '중국', '일본', '북한', '러시아', '영국', '프랑스',
    '유럽', '아시아', '동남아', '중동', '아프리카', '세계', '글로벌',
    '통합', '행정', '지방', '지역', '개최', '교육', '공개',
    // 방향·위치 관련 범용어 (너무 일반적)
    '어디', '어디로', '어디서', '어디에', '여기', '저기', '거기',
    // 모집·참여 관련 범용어 (지역명 없이 단독 사용 시 오매칭 원인)
    '모집', '참여', '신청', '접수', '지원', '선발', '채용',
    // 범용 정치·소통 용어
    '발언', '언급', '입장', '반박', '대응', '논평', '성명', '담화', '연설', '회견', '인터뷰',
    // 범용 동사·형용사·조사 (커뮤니티 오매칭 방지)
    '있다', '없다', '한다', '된다', '된다는', '된다면', '한다는', '한다면',
    '이다', '아니다', '같다', '다르다', '많다', '적다', '크다', '작다',
    '좋다', '나쁘다', '높다', '낮다', '빠르다', '느리다',
    // 수식어·형용사 (의미 없이 자주 쓰임)
    '강자', '절대', '주목', '화제', '인기', '최고', '최대', '최소', '최초', '최신',
    '급증', '급등', '폭등', '폭락', '급락', '상승', '하락', '증가', '감소',
    '성공', '실패', '위기', '기회', '가능', '불가능', '필수', '필요',
    '중요', '심각', '긴급', '특별', '일반', '보통', '평범',
    '대규모', '소규모', '대형', '소형', '거대', '미니',
    '역대', '사상', '전례', '이례', '예상', '전망', '예측',
    '주장', '비판', '반발', '우려', '기대', '희망', '요구',
    // 단위·조사 (숫자와 함께 쓰이는 단어, 커뮤니티 오매칭 주범)
    '이상', '이하', '초과', '미만', '약', '명', '개', '건', '회', '번', '차',
    '일', '월', '년', '시간', '분', '초', '살', '세', '대', '곳', '군데',
    '정도', '가량', '여', '만', '억', '조', '퍼센트', '달러', '원',
])

// 1글자이지만 중요한 의미를 가져서 필터링하면 안 되는 예외 키워드
const ALLOWED_ONE_CHAR_KEYWORDS = new Set([
    '환', '뷔', '진', '첸', '츄', '뱀', '윤', '문', '안', '정', '이', '박', '김', '최',
    '권', '조', '강', '류', '홍', '송', '백', '유', '오', '신', '양', '황', '허', '고',
    '설', '선', '길', '표', '명', '범', '혁', '훈', '빈', '결', '률', '현', '린'
])

function tokenize(text: string): string[] {
    const words = text
        .replace(/[^\wㄱ-ㅎㅏ-ㅣ가-힣\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => (w.length >= 2 || ALLOWED_ONE_CHAR_KEYWORDS.has(w)) && !GROUPING_STOPWORDS.has(w))
        .map(normalizeKeyword) // 정규화 적용
    return Array.from(new Set(words))
}

/**
 * fallbackTokenMatching - AI 매칭 실패 시 토큰 기반 매칭 (폴백)
 */
function fallbackTokenMatching(
    communityTokenList: Array<{ id: string; title: string; tokens: string[] }>,
    representativeTitle: string
): string[] {
    const representativeTokens = tokenize(representativeTitle)
    const COMMUNITY_MATCH_THRESHOLD = parseInt(
        process.env.CANDIDATE_COMMUNITY_MATCH_THRESHOLD ?? '2'
    )
    
    return communityTokenList
        .filter((c) => {
            const commonCount = commonKeywordCount(c.tokens, representativeTokens)
            if (commonCount >= COMMUNITY_MATCH_THRESHOLD) {
                console.log(`[토큰 매칭] "${c.title.substring(0, 40)}..." ← 공통: ${commonCount}개`)
                return true
            }
            return false
        })
        .map((c) => c.id)
}

/**
 * commonKeywordCount - 두 토큰 배열의 공통 키워드 수 반환
 * 
 * 완전 일치 + 부분 문자열 포함도 체크
 * 예: "내란"과 "내란죄" → 매칭
 * 
 * 주의: 제품명(갤럭시S26, 갤럭시버즈4)은 브랜드명이 포함되어도 다른 제품으로 취급
 */
function commonKeywordCount(a: string[], b: string[]): number {
    const setB = new Set(b.map((w) => w.toLowerCase()))
    let count = 0
    
    // 제품명 패턴 (브랜드 + 모델명)
    // 갤럭시S26, 갤럭시버즈4, 아이폰16 등
    const productNamePattern = /^(갤럭시|아이폰|갤럭시버즈|에어팟|갤워치|애플워치)([a-z0-9]+)$/i
    
    for (const wordA of a) {
        const lowerA = wordA.toLowerCase()
        
        // 완전 일치
        if (setB.has(lowerA)) {
            count++
            continue
        }
        
        // 부분 문자열 매칭 (3글자 이상일 때만)
        // 2글자는 "이상", "명" 같은 단위/조사가 매칭될 위험 높음
        if (lowerA.length >= 3) {
            for (const wordB of b) {
                const lowerB = wordB.toLowerCase()
                if (lowerB.length < 3) continue
                
                // 제품명 특수 처리: 둘 다 제품명이면 부분 매칭 금지
                const aIsProduct = productNamePattern.test(lowerA)
                const bIsProduct = productNamePattern.test(lowerB)
                
                if (aIsProduct && bIsProduct) {
                    // 제품명끼리는 완전 일치만 허용 (이미 위에서 체크됨)
                    continue
                }
                
                // 일반 단어는 부분 매칭 허용
                if (lowerA.includes(lowerB) || lowerB.includes(lowerA)) {
                    count++
                    break
                }
            }
        }
    }
    
    return count
}

/**
 * groupItems - 수집 건을 키워드 기반으로 후보 그룹으로 묶음
 *
 * 공통 키워드 2개 이상이면 같은 후보로 판단.
 * 단, 핵심 인물(3글자 이상 고유명사)이 공통이면 키워드 1개여도 같은 그룹.
 * 
 * 개선: 카테고리가 다르면 3개 이상 키워드 필요 (2개→3개로 상향)
 * 범용 단어 하나로 무관한 뉴스가 묶이는 문제 방지
 * 
 * 노이즈 방지는 ALERT_THRESHOLD(기본 3건)와 고유 출처 조건으로 2차 방어.
 *
 * 주의: 그룹 tokens를 합집합으로 갱신하지 않는다.
 * 합집합 방식은 뉴스A→B→C 순서로 각 1개씩 공통이면 A와 C가 무관해도 같은 그룹이 되는
 * 연쇄 그루핑(chaining) 문제를 일으킨다.
 * 그룹의 기준 토큰은 첫 번째 아이템으로 고정해 이를 방지한다.
 */
function groupItems(items: RawItem[]): CandidateGroup[] {
    const groups: CandidateGroup[] = []
    
    /*
     * 핵심 인물/그룹 키워드 (3글자 이상 고유명사)
     * 이 키워드가 공통이면 키워드 1개여도 같은 그룹으로 묶음
     * 
     * 카테고리별 분류:
     * - 정치: 주요 정치인
     * - 연예: 최근 이슈 인물/그룹, 엔터사
     * - 스포츠: 주요 선수/감독
     */
    const corePersons = [
        // 정치
        '윤석열', '이재명', '한동훈', '이준석', '추경호', '박찬대', '권영세',
        // 연예
        '민희진', '뉴진스', '하이브', '어도어', '방시혁',
        '옥택연', '김연경', '서장훈', '추신수', '송혜교', '현빈', '블랙핑크',
        '에스파', '아이브', 'BTS', '세븐틴', '트와이스',
        // 스포츠
        '손흥민', '이강인', '황희찬', '김하성', '류현진', '오타니',
        // 기업/단체
        '삼성전자', 'LG전자', 'SK하이닉스', '네이버', '카카오',
    ]

    for (const item of items) {
        const tokens = tokenize(item.title)
        let matched = false

        for (const group of groups) {
            const commonCount = commonKeywordCount(tokens, group.tokens)
            
            // 핵심 인물이 공통이면 키워드 1개여도 같은 그룹 (카테고리 무시)
            const hasCommonPerson = tokens.some(t => 
                corePersons.includes(t) && group.tokens.includes(t)
            )
            
            // 같은 카테고리인지 확인
            const sameCategory = !item.category || !group.items[0].category || 
                                 item.category === group.items[0].category
            
            // 조건 개선:
            // - (키워드 3개 이상) → 카테고리 무관하게 같은 이슈 (확실한 매칭)
            // - (키워드 2개 이상 && 같은 카테고리) → 같은 카테고리 내에서 2개 키워드로 묶기
            // - (키워드 1개 이상 && 핵심 인물 공통) → 핵심 인물 중심 이슈는 1개 키워드로도 묶기
            // 
            // 기존에 "카테고리 달라도 3개 이상 키워드면 무조건 묶기"는 유지
            // 하지만 2개 키워드는 같은 카테고리일 때만 → 범용 단어로 인한 오매칭 방지
            if (commonCount >= 3 || (commonCount >= 2 && sameCategory) || (commonCount >= 1 && hasCommonPerson)) {
                group.items.push(item)
                // 토큰을 합집합으로 갱신하지 않음 — 연쇄 그루핑 방지
                matched = true
                break
            }
        }

        if (!matched) {
            groups.push({ tokens, items: [item] })
        }
    }

    // 그루핑 후 병합: 대표 제목 간 유사도가 높은 그룹들을 통합
    return mergeRelatedGroups(groups)
}

/**
 * mergeRelatedGroups - 유사한 그룹들을 병합
 * 
 * 그루핑 후 각 그룹의 대표 제목(가장 짧은 제목)을 추출하여
 * Jaccard 유사도가 0.4 이상이면 같은 이슈로 병합.
 * 
 * Jaccard 유사도 = 공통 키워드 수 / 전체 키워드 수 (합집합)
 * 예: A={윤석열, 내란, 무기징역}, B={윤석열, 내란, 법원, 사형}
 *     공통=2, 합집합=5, 유사도=2/5=0.4
 */
function mergeRelatedGroups(groups: CandidateGroup[]): CandidateGroup[] {
    if (groups.length <= 1) return groups

    const beforeCount = groups.length
    const merged: CandidateGroup[] = []
    const used = new Set<number>()

    for (let i = 0; i < groups.length; i++) {
        if (used.has(i)) continue

        const baseGroup = groups[i]
        const baseTitle = selectRepresentativeTitle(baseGroup.items)
        const baseTokens = tokenize(baseTitle)

        // i번 그룹과 병합 가능한 그룹들 찾기
        const toMerge = [baseGroup]
        
        for (let j = i + 1; j < groups.length; j++) {
            if (used.has(j)) continue

            const targetGroup = groups[j]
            const targetTitle = selectRepresentativeTitle(targetGroup.items)
            const targetTokens = tokenize(targetTitle)

            // Jaccard 유사도 계산
            const intersection = commonKeywordCount(baseTokens, targetTokens)
            const union = new Set([...baseTokens, ...targetTokens]).size
            const similarity = union > 0 ? intersection / union : 0
            
            // 핵심 인물 키워드 (고유명사, 3글자 이상) - groupItems와 동일
            const coreKeywords = [
                // 정치
                '윤석열', '이재명', '한동훈', '이준석', '추경호', '박찬대', '권영세',
                // 연예
                '민희진', '뉴진스', '하이브', '어도어', '방시혁',
                '옥택연', '김연경', '서장훈', '추신수', '송혜교', '현빈', '블랙핑크',
                '에스파', '아이브', 'BTS', '세븐틴', '트와이스',
                // 스포츠
                '손흥민', '이강인', '황희찬', '김하성', '류현진', '오타니',
                // 기업/단체
                '삼성전자', 'LG전자', 'SK하이닉스', '네이버', '카카오',
            ]
            const hasCommonCorePerson = baseTokens.some(t => 
                coreKeywords.includes(t) && targetTokens.includes(t)
            )

            // 디버깅: 유사도 0.3 이상인 그룹들 로그
            if (similarity >= 0.3 || hasCommonCorePerson) {
                console.log(`병합 검토: "${baseTitle}" vs "${targetTitle}"`)
                console.log(`  - 공통: ${intersection}개, 합집합: ${union}개, 유사도: ${(similarity * 100).toFixed(0)}%`)
                console.log(`  - Base 토큰: ${baseTokens.join(', ')}`)
                console.log(`  - Target 토큰: ${targetTokens.join(', ')}`)
                if (hasCommonCorePerson) console.log(`  - 공통 핵심 인물 있음!`)
            }

            // 유사도 0.4 이상 OR 핵심 인물 공통이면 병합
            if (similarity >= 0.4 || hasCommonCorePerson) {
                toMerge.push(targetGroup)
                used.add(j)
                console.log(`  ✓ 병합 완료!`)
            }
        }

        // 병합된 그룹들을 하나로 통합
        const mergedItems = toMerge.flatMap(g => g.items)
        merged.push({
            tokens: baseTokens,
            items: mergedItems,
        })
        used.add(i)
    }

    const afterCount = merged.length
    console.log(`그루핑 병합: ${beforeCount}개 → ${afterCount}개 (${beforeCount - afterCount}개 병합됨)`)

    return merged
}

/**
 * linkCollections - 수집 건에 issue_id 연결
 *
 * 이슈 등록(대기·승인) 시 관련 뉴스·커뮤니티 수집 건에 issue_id를 연결합니다.
 */
async function linkCollections(
    issueId: string,
    newsIds: string[],
    communityIds: string[]
): Promise<void> {
    const linkPromises: PromiseLike<unknown>[] = []

    if (newsIds.length > 0) {
        linkPromises.push(
            supabaseAdmin
                .from('news_data')
                .update({ issue_id: issueId })
                .in('id', newsIds)
        )
    }

    if (communityIds.length > 0) {
        linkPromises.push(
            supabaseAdmin
                .from('community_data')
                .update({ issue_id: issueId })
                .in('id', communityIds)
        )
    }

    await Promise.all(linkPromises as Promise<unknown>[])
}

/**
 * CATEGORY_KEYWORDS - 카테고리별 제목 키워드 사전
 * 설정 파일에서 자동 로드
 */
const CATEGORY_KEYWORDS = getAllCategoryKeywords()

/**
 * CONTEXT_RULES - 맥락 기반 카테고리 판단 규칙
 * 설정 파일에서 자동 로드
 */
const CONTEXT_RULES = getAllContextRules()

/**
 * inferCategory - 그룹 내 제목 키워드 스코어링으로 카테고리 결정
 *
 * 1차: 전체 제목을 합산해 카테고리별 키워드 매칭 수를 점수화
 * 2차: 맥락 기반 규칙 적용 (특정 키워드 조합 시 점수 대폭 증가)
 * 3차: 수집 카테고리 다수결 점수 계산
 * 4차: 키워드 점수와 다수결 점수를 비교해 더 명확한 쪽 선택
 *      - 맥락 규칙 매칭되면 키워드 우선
 *      - 다수결 카테고리의 키워드 점수가 0이면 키워드 우선 (네이버 오류 판단)
 *      - 그 외에는 다수결 우선 (네이버 카테고리가 더 정확한 경우 많음)
 * 5차(폴백): 둘 다 없으면 '사회' 기본값
 */
function inferCategory(items: RawItem[]): IssueCategory {
    const validCategories = getCategoryIds() as IssueCategory[]
    const allTitles = items.map((i) => i.title).join(' ')

    const keywordScores = validCategories.reduce<Record<string, number>>(
        (acc, cat) => {
            acc[cat] = CATEGORY_KEYWORDS[cat].filter((kw) => allTitles.includes(kw)).length
            return acc
        },
        {}
    )

    let contextMatched = false
    for (const rule of CONTEXT_RULES) {
        const allKeywordsPresent = rule.keywords.every((kw) => allTitles.includes(kw))
        if (allKeywordsPresent) {
            keywordScores[rule.category] = (keywordScores[rule.category] ?? 0) + rule.boost
            contextMatched = true
        }
    }

    const categoryCounts = items
        .filter((i) => i.category !== null)
        .reduce<Record<string, number>>((acc, i) => {
            const cat = i.category as string
            if (validCategories.includes(cat as IssueCategory)) {
                acc[cat] = (acc[cat] ?? 0) + 1
            }
            return acc
        }, {})

    const topKeyword = (Object.entries(keywordScores) as [IssueCategory, number][])
        .sort((a, b) => b[1] - a[1])[0]
    
    const topMajority = (Object.entries(categoryCounts) as [string, number][])
        .sort((a, b) => b[1] - a[1])[0]

    if (contextMatched && topKeyword && topKeyword[1] > 0) {
        return topKeyword[0]
    }

    if (topMajority && topMajority[1] > 0) {
        const majorityCategory = topMajority[0] as IssueCategory
        const majorityKeywordScore = keywordScores[majorityCategory] ?? 0
        
        if (majorityKeywordScore === 0 && topKeyword && topKeyword[1] > 0) {
            return topKeyword[0]
        }
        
        return majorityCategory
    }

    if (topKeyword && topKeyword[1] > 0) {
        return topKeyword[0]
    }

    return '사회'
}

/**
 * evaluateCandidates - 수집 데이터 분석 후 이슈 후보 평가·등록
 *
 * Cron에서 주기적으로 호출합니다. 관리자 알람 조회 API에서도 사용합니다.
 *
 * 예시:
 * const result = await evaluateCandidates()
 * // result.created: 자동 승인된 이슈 수
 * // result.alerts: 대기 등록된 후보 목록 (관리자 배너용)
 */
export async function evaluateCandidates(): Promise<CandidateResult> {
    const now = new Date()
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
    /* 집계 시간 창: 환경변수 CANDIDATE_WINDOW_HOURS (기본 3시간) */
    const sinceWindow = new Date(now.getTime() - WINDOW_HOURS * 60 * 60 * 1000).toISOString()
    const noResponseCutoff = new Date(
        now.getTime() - NO_RESPONSE_HOURS * 60 * 60 * 1000
    ).toISOString()

    /*
     * 그루핑 전략:
     * - 뉴스만 집계 창(WINDOW_HOURS, 기본 3시간) 내 데이터로 그루핑
     * - 커뮤니티는 최근 24시간 전체를 가져와 키워드 매칭으로 연결
     *   → 커뮤니티 글은 이슈가 뜨고 난 뒤 몇 시간 후에 반응이 올라오므로
     *     3시간 창으로 제한하면 매칭 기회가 거의 없음.
     *   → 커뮤니티 글 제목("장동혁 대표 ㅋㅋ")은 뉴스 제목과 형태가 달라
     *     함께 그루핑하지 않고, 키워드 1개 이상 포함 시 반응 있음으로 처리.
     * - 중복 체크(existingIssues)는 since24h 사용.
     */
    const [{ data: newsItems }, { data: communityItems }] = await Promise.all([
        supabaseAdmin
            .from('news_data')
            .select('id, title, created_at, category, source')
            .is('issue_id', null)
            .gte('created_at', sinceWindow)
            .order('created_at', { ascending: true }),
        supabaseAdmin
            .from('community_data')
            .select('id, title, created_at')
            .is('issue_id', null)
            .gte('created_at', since24h)   // 커뮤니티는 24시간 창으로 더 넓게 조회
            .order('created_at', { ascending: true }),
    ])

    const newsRawItems: RawItem[] = (newsItems ?? []).map((n) => ({
        ...n, type: 'news' as const, category: n.category ?? null, source: n.source ?? null,
    }))

    if (newsRawItems.length === 0) {
        return { created: 0, alerts: [], evaluated: 0 }
    }

    // 커뮤니티 토큰 목록: 각 글의 토큰 배열 + id + 원본 제목 보관
    const communityTokenList = (communityItems ?? []).map((c) => ({
        id: c.id,
        title: c.title,  // 원본 제목 추가
        tokens: tokenize(c.title),
    }))

    /*
     * AI 그루핑 활성화 여부 체크
     * 환경변수 ENABLE_AI_GROUPING=true 시 Perplexity로 그루핑
     * 비활성화 시 기존 키워드 방식 사용
     */
    const enableAIGrouping = process.env.ENABLE_AI_GROUPING === 'true'
    let groups: CandidateGroup[] = []

    if (enableAIGrouping) {
        console.log(`[AI 그루핑] ${newsRawItems.length}건 뉴스 처리 시작`)
        
        // 100건씩 배치로 나눠서 처리 (Perplexity 토큰 제한)
        const BATCH_SIZE = 100
        const batches: RawItem[][] = []
        for (let i = 0; i < newsRawItems.length; i += BATCH_SIZE) {
            batches.push(newsRawItems.slice(i, i + BATCH_SIZE))
        }
        
        console.log(`[AI 그루핑] ${batches.length}개 배치로 분할 (배치당 최대 ${BATCH_SIZE}건)`)
        
        try {
            const allGroups: CandidateGroup[] = []
            
            for (const [batchIdx, batch] of batches.entries()) {
                console.log(`[AI 그루핑] 배치 ${batchIdx + 1}/${batches.length} 처리 중 (${batch.length}건)`)
                
                try {
                    // 1. Perplexity에게 그루핑 요청
                    const groupIndices = await groupNewsByPerplexity(
                        batch.map(item => ({ id: item.id, title: item.title }))
                    )
                    
                    // 2. 인덱스를 실제 아이템 그룹으로 변환
                    const itemGroups = applyAIGrouping(batch, groupIndices)
                    
                    // 3. CandidateGroup 형태로 변환
                    const batchGroups = itemGroups.map(items => ({
                        tokens: tokenize(selectRepresentativeTitle(items)),
                        items,
                    }))
                    
                    allGroups.push(...batchGroups)
                    
                    // Rate Limit 방지를 위해 배치 사이 대기 (1초)
                    if (batchIdx < batches.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 1000))
                    }
                } catch (batchError) {
                    console.error(`[AI 그루핑] 배치 ${batchIdx + 1} 실패, 키워드 방식으로 폴백:`, batchError)
                    // 해당 배치만 키워드 방식으로 처리
                    allGroups.push(...groupItems(batch))
                }
            }
            
            groups = allGroups
            console.log(`[AI 그루핑 완료] ${newsRawItems.length}건 → ${groups.length}개 그룹`)
        } catch (error) {
            console.error('[AI 그루핑 전체 실패] 키워드 방식으로 폴백:', error)
            // 폴백: 기존 키워드 방식
            groups = groupItems(newsRawItems)
        }
    } else {
        // 기존 키워드 방식
        groups = groupItems(newsRawItems)
        console.log(`[키워드 그루핑] ${newsRawItems.length}건 → ${groups.length}개 그룹`)
    }
    
    // AI 검증: ALERT_THRESHOLD 이상 그룹만 AI로 검증 (선택적)
    // 환경변수로 ON/OFF 가능 (ENABLE_AI_GROUP_VALIDATION=true)
    const enableValidation = process.env.ENABLE_AI_GROUP_VALIDATION === 'true'
    const groupsToValidate = groups.filter(g => g.items.length >= ALERT_THRESHOLD)
    
    let validatedGroupIds = new Set<number>()
    if (enableValidation && groupsToValidate.length > 0) {
        try {
            const validationInputs = groupsToValidate.map((group, idx) => ({
                groupId: String(idx),
                titles: group.items.map(i => i.title),
            }))
            
            const validationResults = await validateGroups(validationInputs)
            
            // isIssue=true && score>=6 인 그룹만 통과 (스포츠/IT 이슈 포함)
            validatedGroupIds = new Set(
                validationResults
                    .filter(r => r.isIssue && r.score >= 6)
                    .map(r => parseInt(r.groupId))
            )
            
            console.log(`AI 그룹 검증: ${groupsToValidate.length}개 중 ${validatedGroupIds.size}개 통과`)
        } catch (error) {
            console.error('AI 그룹 검증 실패, 전체 통과 처리:', error)
            // 에러 시 안전하게 전체 통과
            validatedGroupIds = new Set(groupsToValidate.map((_, idx) => idx))
        }
    }
    
    const result: CandidateResult = { created: 0, alerts: [], evaluated: groups.length }

    for (const [groupIndex, group] of groups.entries()) {
        // 그루핑 대상이 이미 집계 창 내 데이터이므로 그룹 전체 건수가 곧 집계 건수
        const recentCount = group.items.length

        if (recentCount < ALERT_THRESHOLD) continue
        
        // AI 검증이 활성화되어 있으면 통과한 그룹만 처리
        if (enableValidation && !validatedGroupIds.has(groupIndex)) {
            console.log(`그룹 ${groupIndex} AI 검증 탈락, 제목: ${group.items[0]?.title}`)
            continue
        }

        // 팩트체크 필터: 최소 2개 언론사 이상 보도 필수
        // 1. 뉴스 최소 1개 이상 (커뮤니티 전용 그룹 제외)
        // 2. 고유 언론사 최소 2개 이상 (단독 보도/오보 방지)
        const uniqueSources = new Set(
            group.items
                .filter((i) => i.type === 'news' && i.source)
                .map((i) => i.source as string)
        ).size
        const hasNews = group.items.some((i) => i.type === 'news')
        
        if (!hasNews) {
            console.log(`[필터] 뉴스 없음 (커뮤니티 전용) → 제외: "${group.items[0]?.title?.substring(0, 40)}..."`)
            continue
        }
        if (uniqueSources < MIN_UNIQUE_SOURCES) {
            console.log(`[필터] 고유 출처 부족 (${uniqueSources}개 < ${MIN_UNIQUE_SOURCES}개) → 제외: "${group.items[0]?.title?.substring(0, 40)}..."`)
            continue
        }

        // 접두어 제거 후 그룹 내 가장 짧은 제목을 대표 제목으로 선택
        const representativeTitle = selectRepresentativeTitle(group.items)

        /*
         * 커뮤니티 반응 체크 (AI 기반 매칭):
         * 
         * 1) AI 우선: Perplexity AI로 의미 기반 매칭 (ENABLE_AI_COMMUNITY_MATCHING=true)
         * 2) 폴백: 토큰 기반 매칭 (AI 비활성화 또는 에러 시)
         * 3) 매칭 0건이어도 이슈 등록은 허용 (화력으로 최종 필터링)
         */
        const enableAICommunityMatching = process.env.ENABLE_AI_COMMUNITY_MATCHING === 'true'
        let matchedCommunityIds: string[] = []
        
        if (enableAICommunityMatching && communityTokenList.length > 0) {
            try {
                const { batchMatchCommunities } = await import('@/lib/ai/perplexity-community-matcher')
                
                const result = await batchMatchCommunities(
                    representativeTitle,
                    communityTokenList.map(c => c.title),
                    70
                )
                
                // AI로 매칭된 결과
                const aiMatchedIds = result.matchedIndices.map(idx => communityTokenList[idx].id)
                
                // 나머지는 토큰 방식으로 보완
                const remainingCount = result.totalCount - result.checkedCount
                
                if (remainingCount > 0) {
                    const remainingList = communityTokenList.slice(result.checkedCount)
                    const tokenMatchedIds = fallbackTokenMatching(remainingList, representativeTitle)
                    matchedCommunityIds = [...aiMatchedIds, ...tokenMatchedIds]
                    console.log(`[커뮤니티 매칭] AI ${result.checkedCount}개 + 토큰 ${remainingCount}개 → 총 ${matchedCommunityIds.length}건`)
                } else {
                    matchedCommunityIds = aiMatchedIds
                    console.log(`[커뮤니티 매칭] AI ${result.checkedCount}개 → 총 ${matchedCommunityIds.length}건`)
                }
                
            } catch (error) {
                console.error('[AI 매칭 에러] 토큰 방식으로 폴백:', error)
                matchedCommunityIds = fallbackTokenMatching(communityTokenList, representativeTitle)
            }
        } else {
            matchedCommunityIds = fallbackTokenMatching(communityTokenList, representativeTitle)
        }
        const firstSeenAt = group.items[0].created_at
        // 그룹 아이템은 뉴스만 포함됨. 커뮤니티는 키워드 매칭으로 별도 수집한 matchedCommunityIds 사용
        const newsIds = group.items.map((i) => i.id)
        const communityIds = matchedCommunityIds
        const issueCategory = inferCategory(group.items)

        // 자동 승인 조건 판단
        // 화력 기반 자동 승인 (뉴스 건수 무관)
        // 카테고리 허용: 사회/기술/스포츠만 자동 승인 (연예/정치는 관리자 필수)
        const AUTO_APPROVE_CATEGORIES = process.env.AUTO_APPROVE_CATEGORIES?.split(',') ?? 
            ['사회', '기술', '스포츠']

        // 최근 24시간 내 유사 이슈 존재 여부 확인 (AI 기반 중복 방지)
        // Race Condition 방지: 중복 체크를 함수로 분리하여 재사용
        const checkForDuplicateIssue = async (): Promise<{ id: string; title: string; approval_status: string; heat_index: number | null } | null> => {
            const enableAIDuplicateCheck = process.env.ENABLE_AI_DUPLICATE_CHECK === 'true'
            
            // 1단계: 정확한 제목 일치 체크 (빠른 체크)
            const { data: exactMatch } = await supabaseAdmin
                .from('issues')
                .select('id, title, approval_status, heat_index')
                .eq('title', representativeTitle)
                .gte('created_at', since24h)
                .limit(1)

            let existingIssue = exactMatch?.[0] ?? null

            // 2단계: AI 기반 유사 이슈 체크 (정확한 일치 없을 때만)
            if (!existingIssue && enableAIDuplicateCheck) {
                const { data: recentIssues } = await supabaseAdmin
                    .from('issues')
                    .select('id, title, approval_status, heat_index')
                    .gte('created_at', since24h)
                    .order('created_at', { ascending: false })
                    .limit(20) // 최근 20개만 체크
                
                if (recentIssues && recentIssues.length > 0) {
                    const { checkDuplicateWithAI } = await import('@/lib/ai/duplicate-checker')
                    
                    for (const issue of recentIssues) {
                        try {
                            const result = await checkDuplicateWithAI(issue.title, representativeTitle)
                            
                            if (result.isDuplicate) {
                                console.log(`[AI 중복 감지] "${representativeTitle}" → "${issue.title}" (${result.confidence}% - ${result.reason})`)
                                existingIssue = issue
                                break
                            }
                            
                            // Rate Limit 방지: 3초 대기
                            await new Promise(resolve => setTimeout(resolve, 3000))
                            
                        } catch (error) {
                            console.error('[AI 중복 체크 에러]', error)
                            break // 에러 시 중단하고 신규 등록
                        }
                    }
                }
            }
            
            return existingIssue
        }
        
        let existingIssue = await checkForDuplicateIssue()

        if (existingIssue) {
            // 기존 이슈 화력 재계산 후 필터링
            await linkCollections(existingIssue.id, newsIds, communityIds)
            const actualHeat = await calculateHeatIndex(existingIssue.id).catch(() => 0)
            
            // 실제 화력이 기준 미달이면 삭제
            if (actualHeat < MIN_HEAT_TO_REGISTER) {
                console.log(`[필터] 기존 이슈 실제 화력 부족으로 삭제: "${representativeTitle}" (실제 화력: ${actualHeat}, 최소: ${MIN_HEAT_TO_REGISTER})`)
                await supabaseAdmin
                    .from('issues')
                    .delete()
                    .eq('id', existingIssue.id)
                continue
            }
            
            if (existingIssue.approval_status === '대기') {
                // 화력 기반 자동 승인 판정
                const shouldAutoApprove = actualHeat >= AUTO_APPROVE_THRESHOLD &&
                    AUTO_APPROVE_CATEGORIES.includes(issueCategory)
                
                if (shouldAutoApprove) {
                    // 기존 대기 이슈를 자동 승인으로 업데이트
                    const { error: updateError } = await supabaseAdmin
                        .from('issues')
                        .update({ 
                            approval_status: '승인', 
                            approval_type: 'auto',
                            approved_at: now.toISOString() 
                        })
                        .eq('id', existingIssue.id)

                    if (!updateError) {
                        console.log(`[자동승인 완료] 기존 이슈 "${representativeTitle}" (카테고리: ${issueCategory}, 화력: ${actualHeat}점)`)
                        result.created++
                    }
                } else {
                    const reason = actualHeat < AUTO_APPROVE_THRESHOLD
                        ? `화력 ${actualHeat}점 (자동승인 기준 ${AUTO_APPROVE_THRESHOLD}점 미만)`
                        : `${issueCategory} 카테고리는 관리자 승인 필요`
                    console.log(`[대기유지] 기존 이슈 "${representativeTitle}" (${reason})`)
                    // 여전히 대기 중 → 배너 알람 목록에 추가
                    result.alerts.push({
                        title: representativeTitle,
                        count: recentCount,
                        newsCount: newsIds.length,
                        communityCount: communityIds.length,
                    })
                }
            }
            // 승인 또는 반려된 이슈는 재처리하지 않음
            continue
        }

        // 기존 이슈 없음 → 신규 등록
        // 화력 계산을 먼저 하고, 충분하면 등록 (관리자 UI 노출 방지)
        
        // 1단계: 임시 이슈 생성 (approval_status를 null로 설정해서 UI 노출 안 됨)
        const { data: tempIssue, error: tempError } = await supabaseAdmin
            .from('issues')
            .insert({
                title: representativeTitle,
                description: null,
                status: '점화',
                category: issueCategory,
                approval_status: null as any, // 임시 상태 (UI에서 필터링됨)
                approved_at: null,
            })
            .select('id')
            .single()

        if (tempError || !tempIssue) {
            // Race Condition 가능성: 동시에 같은 이슈가 등록되었을 수 있음
            if (tempError?.code === '23505') { // Unique constraint violation
                console.log(`[Race Condition 감지] "${representativeTitle}" 이미 등록됨, 재체크`)
                // 다시 중복 체크
                const recheckIssue = await checkForDuplicateIssue()
                if (recheckIssue) {
                    // 기존 이슈에 수집 건 연결만 수행
                    await linkCollections(recheckIssue.id, newsIds, communityIds)
                    console.log(`[기존 이슈 연결] "${representativeTitle}"에 ${newsIds.length}건 뉴스 + ${communityIds.length}건 커뮤니티 연결`)
                    continue
                }
            }
            console.error('임시 이슈 생성 에러:', tempError)
            continue
        }
        
        // 1.5단계: 임시 이슈 생성 직후 최종 중복 체크 (Race Condition 최종 방어)
        const finalCheck = await checkForDuplicateIssue()
        if (finalCheck && finalCheck.id !== tempIssue.id) {
            console.log(`[Race Condition 방어] 임시 이슈 생성 중 중복 발견, 임시 이슈 삭제: "${representativeTitle}"`)
            // 방금 생성한 임시 이슈 삭제
            await supabaseAdmin
                .from('issues')
                .delete()
                .eq('id', tempIssue.id)
            
            // 기존 이슈에 수집 건 연결
            await linkCollections(finalCheck.id, newsIds, communityIds)
            const actualHeat = await calculateHeatIndex(finalCheck.id).catch(() => 0)
            
            // 실제 화력이 기준 미달이면 삭제
            if (actualHeat < MIN_HEAT_TO_REGISTER) {
                console.log(`[필터] 기존 이슈 실제 화력 부족으로 삭제: "${representativeTitle}" (실제 화력: ${actualHeat}, 최소: ${MIN_HEAT_TO_REGISTER})`)
                await supabaseAdmin
                    .from('issues')
                    .delete()
                    .eq('id', finalCheck.id)
                continue
            }
            
            // 기존 이슈가 대기 상태이고 자동 승인 조건이면 승인 처리
            if (finalCheck.approval_status === '대기') {
                const shouldAutoApprove = actualHeat >= AUTO_APPROVE_THRESHOLD &&
                    AUTO_APPROVE_CATEGORIES.includes(issueCategory)
                
                if (shouldAutoApprove) {
                    await supabaseAdmin
                        .from('issues')
                        .update({ 
                            approval_status: '승인', 
                            approval_type: 'auto',
                            approved_at: now.toISOString() 
                        })
                        .eq('id', finalCheck.id)
                    console.log(`[자동승인 완료] 기존 이슈 "${representativeTitle}" (카테고리: ${issueCategory}, 화력: ${actualHeat}점)`)
                    result.created++
                }
            }
            continue
        }

        // 2단계: 수집 건 연결 + 화력 계산
        await linkCollections(tempIssue.id, newsIds, communityIds)
        const actualHeat = await calculateHeatIndex(tempIssue.id).catch(() => 0)
        
        // 3단계: 화력 부족 시 삭제
        if (actualHeat < MIN_HEAT_TO_REGISTER) {
            console.log(`[필터] 화력 부족으로 이슈 삭제: "${representativeTitle}" (화력: ${actualHeat}, 최소: ${MIN_HEAT_TO_REGISTER})`)
            await supabaseAdmin
                .from('issues')
                .delete()
                .eq('id', tempIssue.id)
            continue
        }
        
        // 4단계: 화력 충분 → 정식 등록 (approval_status 업데이트)
        // 화력 기반 자동 승인 판정
        const shouldAutoApprove = actualHeat >= AUTO_APPROVE_THRESHOLD &&
            AUTO_APPROVE_CATEGORIES.includes(issueCategory)
        
        const approvalStatus = shouldAutoApprove ? '승인' : '대기'
        
        const { error: updateError } = await supabaseAdmin
            .from('issues')
            .update({
                approval_status: approvalStatus,
                approval_type: shouldAutoApprove ? 'auto' : null,
                approved_at: shouldAutoApprove ? now.toISOString() : null,
            })
            .eq('id', tempIssue.id)
        
        if (updateError) {
            console.error('이슈 상태 업데이트 에러:', updateError)
            // 실패 시 삭제
            await supabaseAdmin.from('issues').delete().eq('id', tempIssue.id)
            continue
        }

        if (shouldAutoApprove) {
            console.log(`[자동승인 완료] "${representativeTitle}" (카테고리: ${issueCategory}, 뉴스: ${recentCount}건, 화력: ${actualHeat}점)`)
            result.created++
        } else {
            const reason = actualHeat < AUTO_APPROVE_THRESHOLD
                ? `화력 ${actualHeat}점 (자동승인 기준 ${AUTO_APPROVE_THRESHOLD}점 미만)`
                : `${issueCategory} 카테고리는 관리자 승인 필요`
            console.log(`[대기등록 완료] "${representativeTitle}" (${reason}, 뉴스: ${recentCount}건, 화력: ${actualHeat}점)`)
            // 대기 등록 → 배너 알람 목록에 추가
            result.alerts.push({
                title: representativeTitle,
                count: recentCount,
                newsCount: newsIds.length,
                communityCount: communityIds.length,
            })
        }
    }

    return result
}
