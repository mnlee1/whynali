/**
 * app/api/admin/rematch-community/route.ts
 * 
 * 기존 이슈의 커뮤니티 매칭을 개선된 로직으로 재처리
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin'
import { writeAdminLog } from '@/lib/admin-log'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5분

// 토큰화 로직 (issue-candidate.ts와 동일)
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
    // 단위·조사 (커뮤니티 오매칭 방지)
    '이상', '이하', '초과', '미만', '약', '명', '개', '건', '회', '번', '차',
    '일', '월', '년', '시간', '분', '초', '살', '세', '대', '곳', '군데',
    '정도', '가량', '여', '만', '억', '조', '퍼센트', '달러', '원',
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
        
        // 부분 매칭은 3글자 이상만 (2글자는 "이상", "명" 같은 단위가 매칭됨)
        if (lowerA.length >= 3) {
            for (const wordB of b) {
                const lowerB = wordB.toLowerCase()
                if (lowerB.length < 3) continue
                
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

export async function POST(request: NextRequest) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    try {
        console.log('=== 기존 이슈 커뮤니티 재매칭 시작 ===')
        
        const COMMUNITY_MATCH_THRESHOLD = parseInt(process.env.CANDIDATE_COMMUNITY_MATCH_THRESHOLD ?? '2')
        
        // 1. 승인된 이슈 목록
        const { data: issues, error: issuesError } = await supabaseAdmin
            .from('issues')
            .select('id, title')
            .in('approval_status', ['승인', '대기'])
        
        if (issuesError || !issues) {
            throw new Error(`이슈 조회 실패: ${issuesError?.message}`)
        }
        
        console.log(`처리 대상 이슈: ${issues.length}개`)
        
        // 2. 모든 커뮤니티 글
        const { data: allCommunity, error: communityError } = await supabaseAdmin
            .from('community_data')
            .select('id, title')
        
        if (communityError || !allCommunity) {
            throw new Error(`커뮤니티 조회 실패: ${communityError?.message}`)
        }
        
        console.log(`전체 커뮤니티: ${allCommunity.length}개`)
        
        const results = []
        
        // 3. 각 이슈별 재매칭
        for (const issue of issues) {
            console.log(`\n[이슈] ${issue.title}`)
            
            const issueTokens = tokenize(issue.title)
            
            // 핵심 키워드 추출
            const genericWords = new Set([
                '있다', '없다', '한다', '된다', '이다', '같다', '다르다',
                '많다', '적다', '크다', '작다', '좋다', '나쁘다',
                '사귄', '연인과', '결혼', '활동', '발탁', '적용', '흥행',
                '멈추지', '않는', '계속', '위해', '에게도', '라는', '하는',
                // 범용 명사 추가
                '배우', '배우로', '남배우', '여배우', '아이돌', '가수', '연예인',
                '국민', '출신', '변신', '등장', '공개', '출연', '캐스팅',
                '인터뷰', '영화', '드라마', '작품', '이번', '올해', '내년',
                '형', '누나', '동생', '선배', '후배', '친구',
                // 기업/브랜드명 (범용)
                '현대카드', '삼성카드', '신한카드', 'KB카드', '롯데카드', '우리카드',
                '삼성', '현대', '신한', '롯데', '우리', 'LG', 'SK',
            ])
            const coreKeywords = issueTokens.filter(t => 
                t.length >= 3 && !genericWords.has(t)
            )
            
            // 기존 연결 해제
            await supabaseAdmin
                .from('community_data')
                .update({ issue_id: null })
                .eq('issue_id', issue.id)
            
            // 새로운 매칭
            const matched: string[] = []
            
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
            
            results.push({
                issue_id: issue.id,
                issue_title: issue.title,
                matched_count: matched.length
            })
        }
        
        console.log('\n=== 재매칭 완료 ===')

        await writeAdminLog('커뮤니티 재매칭', 'system', null, auth.adminEmail, `이슈 ${issues.length}개 처리`)

        return NextResponse.json({
            success: true,
            processed: issues.length,
            results
        })
        
    } catch (error) {
        console.error('재매칭 에러:', error)
        return NextResponse.json(
            { 
                error: 'REMATCH_ERROR', 
                message: error instanceof Error ? error.message : '재매칭 실패' 
            },
            { status: 500 }
        )
    }
}
