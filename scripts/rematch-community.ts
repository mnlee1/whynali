/**
 * scripts/rematch-community.ts
 * 
 * 기존 이슈의 커뮤니티 매칭을 개선된 로직으로 재처리
 * 
 * 실행:
 * 1. 터미널에서 환경변수 export
 *    source .env.local
 * 2. 스크립트 실행
 *    npx tsx scripts/rematch-community.ts
 */

import { createClient } from '@supabase/supabase-js'

// Supabase 클라이언트 초기화
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('환경변수 누락:')
    console.error('  NEXT_PUBLIC_SUPABASE_URL:', !!supabaseUrl)
    console.error('  SUPABASE_SERVICE_ROLE_KEY:', !!supabaseServiceKey)
    console.error('\n실행 방법:')
    console.error('  export $(cat .env.local | xargs)')
    console.error('  npx tsx scripts/rematch-community.ts')
    process.exit(1)
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
})

// 토큰화 및 매칭 로직 (issue-candidate.ts와 동일)
const GROUPING_STOPWORDS = new Set([
    '경찰', '검찰', '의원', '정부', '대통령', '국회', '법원', '재판',
    '시장', '대표', '대학', '교수', '학교', '병원', '회사', '기업',
    '위원회', '특검', '공수처', '검사', '판사', '변호사', '장관',
    '법인', '수사', '의혹', '혐의', '판결', '기소', '체포', '구속',
    '발표', '관련', '사건', '사고', '논란', '문제',
    '뉴스', '기자', '취재', '단독', '속보', '긴급', '오늘', '실시간',
    '민주당', '공화당', '여당', '야당', '보수', '진보', '좌파', '우파',
    '당', '정당', '지지율', '여론조사', '선거', '투표', '득표',
    '한국', '서울', '미국', '중국', '일본', '북한', '러시아', '영국', '프랑스',
    '유럽', '아시아', '동남아', '중동', '아프리카', '세계', '글로벌',
    '통합', '행정', '지방', '지역', '개최', '교육', '공개',
    '발언', '언급', '입장', '반박', '대응', '논평', '성명', '담화', '연설', '회견', '인터뷰',
    '있다', '없다', '한다', '된다', '된다는', '된다면', '한다는', '한다면',
    '이다', '아니다', '같다', '다르다', '많다', '적다', '크다', '작다',
    '좋다', '나쁘다', '높다', '낮다', '빠르다', '느리다',
    '강자', '절대', '주목', '화제', '인기', '최고', '최대', '최소', '최초', '최신',
    '급증', '급등', '폭등', '폭락', '급락', '상승', '하락', '증가', '감소',
    '성공', '실패', '위기', '기회', '가능', '불가능', '필수', '필요',
    '중요', '심각', '긴급', '특별', '일반', '보통', '평범',
    '대규모', '소규모', '대형', '소형', '거대', '미니',
    '역대', '사상', '전례', '이례', '예상', '전망', '예측',
    '주장', '비판', '반발', '우려', '기대', '희망', '요구',
])

function tokenize(text: string): string[] {
    const words = text
        .replace(/[^\wㄱ-ㅎㅏ-ㅣ가-힣\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 2 && !GROUPING_STOPWORDS.has(w))
    return Array.from(new Set(words))
}

function commonKeywordCount(a: string[], b: string[]): number {
    const setB = new Set(b.map((w) => w.toLowerCase()))
    let count = 0
    
    const productNamePattern = /^(갤럭시|아이폰|갤럭시버즈|에어팟|갤워치|애플워치)([a-z0-9]+)$/i
    
    for (const wordA of a) {
        const lowerA = wordA.toLowerCase()
        
        if (setB.has(lowerA)) {
            count++
            continue
        }
        
        if (lowerA.length >= 2) {
            for (const wordB of b) {
                const lowerB = wordB.toLowerCase()
                if (lowerB.length < 2) continue
                
                const aIsProduct = productNamePattern.test(lowerA)
                const bIsProduct = productNamePattern.test(lowerB)
                
                if (aIsProduct && bIsProduct) {
                    continue
                }
                
                if (lowerA.includes(lowerB) || lowerB.includes(lowerA)) {
                    count++
                    break
                }
            }
        }
    }
    
    return count
}

async function rematchCommunity() {
    console.log('=== 기존 이슈 커뮤니티 재매칭 시작 ===\n')
    
    const COMMUNITY_MATCH_THRESHOLD = parseInt(process.env.CANDIDATE_COMMUNITY_MATCH_THRESHOLD ?? '2')
    
    // 1. 승인된 이슈 목록 가져오기
    const { data: issues, error: issuesError } = await supabaseAdmin
        .from('issues')
        .select('id, title')
        .eq('approval_status', '승인')
    
    if (issuesError || !issues) {
        console.error('이슈 조회 실패:', issuesError)
        return
    }
    
    console.log(`처리 대상 이슈: ${issues.length}개\n`)
    
    // 2. 모든 커뮤니티 글 가져오기
    const { data: allCommunity, error: communityError } = await supabaseAdmin
        .from('community_data')
        .select('id, title')
    
    if (communityError || !allCommunity) {
        console.error('커뮤니티 조회 실패:', communityError)
        return
    }
    
    console.log(`전체 커뮤니티: ${allCommunity.length}개\n`)
    
    // 3. 각 이슈별로 커뮤니티 재매칭
    for (const issue of issues) {
        console.log(`\n[이슈] ${issue.title}`)
        
        const issueTokens = tokenize(issue.title)
        console.log(`  토큰: ${issueTokens.join(', ')}`)
        
        // 핵심 키워드 추출
        const genericWords = new Set([
            '있다', '없다', '한다', '된다', '이다', '같다', '다르다',
            '많다', '적다', '크다', '작다', '좋다', '나쁘다',
            '사귄', '연인과', '결혼', '활동', '발탁', '적용', '흥행',
            '멈추지', '않는', '계속', '위해', '에게도', '라는', '하는',
        ])
        const coreKeywords = issueTokens.filter(t => 
            t.length >= 3 && !genericWords.has(t)
        )
        console.log(`  핵심: ${coreKeywords.join(', ')}`)
        
        // 기존 연결 해제
        await supabaseAdmin
            .from('community_data')
            .update({ issue_id: null })
            .eq('issue_id', issue.id)
        
        // 새로운 매칭
        const matched: string[] = []
        const removed: string[] = []
        
        for (const community of allCommunity) {
            const communityTokens = tokenize(community.title)
            
            // 방법1: 토큰 기반 매칭
            const commonCount = commonKeywordCount(communityTokens, issueTokens)
            if (commonCount >= COMMUNITY_MATCH_THRESHOLD) {
                matched.push(community.id)
                continue
            }
            
            // 방법2: 핵심 키워드 포함
            if (coreKeywords.length > 0) {
                const titleLower = community.title.toLowerCase()
                const matchedKeywords = coreKeywords.filter(k => 
                    titleLower.includes(k.toLowerCase())
                )
                if (matchedKeywords.length > 0) {
                    matched.push(community.id)
                }
            }
        }
        
        // 매칭된 커뮤니티 연결
        if (matched.length > 0) {
            await supabaseAdmin
                .from('community_data')
                .update({ issue_id: issue.id })
                .in('id', matched)
            
            console.log(`  ✓ 매칭: ${matched.length}건`)
        } else {
            console.log(`  ⚠ 매칭: 0건`)
        }
    }
    
    console.log('\n=== 재매칭 완료 ===')
}

rematchCommunity().catch(console.error)
