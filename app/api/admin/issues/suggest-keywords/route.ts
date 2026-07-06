/**
 * app/api/admin/issues/suggest-keywords/route.ts
 *
 * [이슈 키워드 추천 API]
 *
 * 커뮤니티에서 언급되고 네이버 뉴스에도 있는 키워드를 추천합니다.
 * Track A가 이미 이슈로 만든 키워드는 제외합니다.
 *
 * 흐름:
 * 1. 최근 2시간 community_data에서 키워드 추출 (빈도 집계)
 * 2. Track A에서 이미 처리 완료된 키워드(issue_created, auto_approved, duplicate_linked) 제외
 * 3. 빈도 상위 12개에 대해 네이버 뉴스 병렬 확인
 * 4. 뉴스 1건 이상인 것만 반환
 */

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/admin'
import { tokenize } from '@/lib/candidate/tokenizer'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// ─── 타입 ────────────────────────────────────────────────────────────────────

export interface KeywordSuggestion {
    keyword: string
    communityCount: number
    newsCount: number
    reason: string
}

// Track A extractCommunityKeywords의 STOPWORDS + EXCLUDED_KEYWORDS 통합
const STOPWORDS = new Set([
    // 조사/어미
    '이', '가', '을', '를', '의', '에', '도', '는', '은', '과', '와', '로', '으로',
    '이다', '입니다', '합니다', '했다', '한다', '하다', '되다', '이라',
    // 일반 부사/형용사
    '진짜', '정말', '완전', '너무', '대박', '엄청', '정말로', '매우',
    '같은', '다른', '이런', '저런', '그런', '어떤', '무슨',
    '하면', '하는', '했다', '할', '한', '이렇게', '저렇게', '그렇게',
    // 접속사
    '근데', '그런데', '그리고', '그래서', '그러면', '그러나', '하지만',
    // 구어체 부사
    '그냥', '좀', '걍', '막',
    // 감탄사
    '아니', '아', '오', '우와', '헐', '와', '어', '음',
    // 지시어
    '이거', '저거', '그거', '요거', '여기', '저기', '거기',
    '이게', '저게', '그게', '요게', '이건', '저건', '그건', '요건',
    '이걸', '저걸', '그걸', '요걸', '이것', '저것', '그것',
    // 시간 일반어
    '오늘', '내일', '어제', '지금', '이제', '나중', '다시', '또',
    // 기타 일반어
    '있다', '없다', '되다', '하다', '이유', '때문', '사람', '거', '것',
    '뭐', '왜', '어떻게', '언제', '누구', '얼마',
    // 이모티콘
    'ㅋㅋ', 'ㄷㄷ', 'ㅠㅠ', 'ㅎㅎ', 'ㅇㅇ',
    // 문법/뉴스 접두사
    '단독', '속보', '공식', '사진', '영상', '동영상',
    // 대명사
    '나는', '나도', '내가', '저는', '저도', '제가', '우리', '우리가', '우리는',
    '너는', '너도', '네가', '당신', '여러분', '다들', '모두', '모두가', '모두들',
    '각자', '저들', '이들', '그들',
    // 동사 활용형
    '있는', '있어', '있음', '없는', '없어', '없음',
    '보고', '보는', '봤는데', '봤어', '보니',
    '좋아하는', '싫어하는', '좋아해', '싫어해',
    '하고', '하면서', '하지만', '하는데',
    // 부사 활용형
    '많이', '빨리', '느리게', '크게', '작게', '좋아', '싫어', '높아', '낮아',
    // 시간/빈도 부사
    '요즘', '아직', '아직도', '벌써', '드디어', '이미', '항상', '맨날', '계속',
    // 전치사/후치사류
    '중에', '중에서', '사이에', '이후에', '이전에', '때문에',
    // 커뮤니티 관용어
    '레전드', '미쳤다', '소름', '공감', '비밀', '질문', '추천', '후기', '리뷰',
    '모음', '정리', '모르겠', '궁금', '혹시', '도움', '감사',
    // 파일 확장자
    'jpg', 'jpeg', 'png', 'gif', 'mp4', 'webp', 'pdf',
    // 범용어 (이벤트형)
    '결혼', '이혼', '임신', '열애', '사망', '부고', '사고', '사과', '고소', '고백', '은퇴',
    // 사투리/방언
    '사투리',
    // 범용 명사 (단독으로 이슈 식별 불가)
    '사람들', '선수들', '사람', '선생님', '학생들', '아이들', '친구들',
    '내용', '방법', '생각', '마음', '시간', '상황', '문제', '결과', '느낌',
    '얘기', '이야기', '대화', '경험', '기억', '이유', '방식',
    // 동사/형용사 활용형 (불용어 누락 방어)
    '사는', '살다', '살면', '사는데', '살아', '살고',
    '쓰는', '쓰면', '써서', '써도', '쓰고',
    '보면', '봐도', '봐서', '보니까',
    '가면', '가도', '가서', '가니까',
    '오면', '와도', '와서', '오니까',
    '되면', '돼도', '돼서',
    '하네', '하냐', '하나', '하니', '하며',
    // 구어체/신조어 감탄/반응어
    '무섭노', '진심임', '실화냐', '가능함', '맞음', '틀림', '아님',
    '왜게', '왜긴', '뭔데', '뭔가', '뭔지', '어쩌라', '어쩌고',
    '이거봐', '저거봐',
    // 이중 범용어
    '같이', '함께', '서로', '모두', '모든', '어디', '어디서', '어디로',
    // 부사 / 감탄 / 평가어
    '솔직히', '사실은', '그냥은', '진짜로', '실제로', '당연히', '확실히',
    '갑자기', '결국에', '어쨌든', '그렇다', '그렇지',
    // 동사 활용형 (패턴 정규식으로 잡기 어려운 것들)
    '아니고', '아니다', '아니라', '아닌데', '아닌가', '아닌지',
    '왜이렇게', '왜그렇게', '왜저렇게',
    '어떻게', '어떤지', '어떤가', '어디서', '어디에',
])

// 이미 처리 완료된 것으로 간주하는 결과 타입
const COMPLETED_RESULTS = new Set(['issue_created', 'auto_approved', 'duplicate_linked'])

/**
 * checkNaverNewsCount - 최근 7일 이내 뉴스 건수 확인
 * searchNaverNewsByKeyword와 동일한 7일 필터 적용
 */
async function checkNaverNewsCount(keyword: string, clientId: string, clientSecret: string): Promise<number> {
    try {
        const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(keyword)}&display=10&sort=sim`
        const res = await fetch(url, {
            headers: { 'X-Naver-Client-Id': clientId, 'X-Naver-Client-Secret': clientSecret },
        })
        if (!res.ok) return 0
        const data = await res.json()
        const items: Array<{ pubDate: string }> = data.items ?? []
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        return items.filter(item => new Date(item.pubDate) >= sevenDaysAgo).length
    } catch {
        return 0
    }
}

/**
 * getCommunityCount - preview API와 동일한 방식으로 커뮤니티 건수 조회
 * updated_at >= 48시간 + title ILIKE '%keyword%'
 */
async function getCommunityCount(keyword: string): Promise<number> {
    try {
        const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
        const { count } = await supabaseAdmin
            .from('community_data')
            .select('id', { count: 'exact', head: true })
            .gte('updated_at', cutoff48h)
            .ilike('title', `%${keyword}%`)
        return count ?? 0
    } catch {
        return 0
    }
}

// ─── 핸들러 ───────────────────────────────────────────────────────────────────

export async function GET() {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const clientId = process.env.NAVER_CLIENT_ID
    const clientSecret = process.env.NAVER_CLIENT_SECRET

    try {
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()

        // 1. 최근 2시간 커뮤니티 글 조회
        const { data: posts, error: postsError } = await supabaseAdmin
            .from('community_data')
            .select('title')
            .gte('created_at', twoHoursAgo)
            .limit(500)

        if (postsError || !posts || posts.length === 0) {
            return NextResponse.json({ suggestions: [] })
        }

        // 2. Track A에서 처리 완료된 키워드 수집 (최근 24h)
        const { data: completedLogs } = await supabaseAdmin
            .from('track_a_logs')
            .select('keyword')
            .in('result', Array.from(COMPLETED_RESULTS))
            .gte('run_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

        const completedKeywords = new Set<string>(
            (completedLogs ?? []).map(l => l.keyword?.trim()).filter(Boolean)
        )

        // 3. 최근 7일 이슈 키워드도 제외 (이미 이슈로 등록된 것)
        const { data: recentIssues } = await supabaseAdmin
            .from('issues')
            .select('topic')
            .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
            .limit(200)

        const existingTopics = new Set<string>(
            (recentIssues ?? []).map(i => i.topic?.trim()).filter(Boolean)
        )

        // 4. 커뮤니티 글 tokenize → 키워드 빈도 집계
        const keywordCount = new Map<string, number>()

            for (const post of posts) {
            const tokens = tokenize(post.title ?? '')
                .map(w => w.toLowerCase().trim())
                .filter(w => {
                    if (w.length < 3) return false  // 2자 이하 범용어 제거
                    if (STOPWORDS.has(w)) return false
                    if (/^[ㄱ-ㅎㅏ-ㅣ]+$/.test(w)) return false
                    if (/^\d+$/.test(w)) return false
                    if (/^(이|저|그|요)(게|건|걸|거|것|게다|건데|거야|걸로|거랑|거라|것도|것은|것이|것을|것과)$/.test(w)) return false
                    // 동사/형용사 활용 어미로 끝나는 단어 제거
                    if (/(는데|는거|는건|니고|직히|렇게|았는데|었는데|했는|됐는|않는|않아|않고|않지|이라고|이라서|이라는|이므로|이었다|이었는|이었어|이잖아|이잖니|이라도|이어서|이어도|고있어|고있는|고있음)$/.test(w)) return false
                    return true
                })

            for (const token of tokens) {
                if (completedKeywords.has(token) || existingTopics.has(token)) continue
                keywordCount.set(token, (keywordCount.get(token) ?? 0) + 1)
            }
        }

        // 5. 빈도 2 이상, 상위 12개 선택
        const candidates = Array.from(keywordCount.entries())
            .filter(([, cnt]) => cnt >= 2)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 12)

        if (candidates.length === 0) {
            return NextResponse.json({ suggestions: [] })
        }

        const candidateKeywords = candidates.map(([kw]) => kw)

        // 6. 각 후보 키워드마다 실제 커뮤니티 건수 + 뉴스 존재 여부 병렬 조회
        const [communityResults, newsResults] = await Promise.all([
            Promise.all(candidateKeywords.map(kw => getCommunityCount(kw))),
            clientId && clientSecret
                ? Promise.all(candidateKeywords.map(kw => checkNaverNewsCount(kw, clientId!, clientSecret!)))
                : Promise.resolve(candidateKeywords.map(() => 0)),
        ])

        // 7. 커뮤니티 1건 이상 + 뉴스 1건 이상인 것만, 커뮤니티 건수 내림차순
        const suggestions: KeywordSuggestion[] = candidateKeywords
            .map((keyword, i) => ({
                keyword,
                communityCount: communityResults[i],
                newsCount: newsResults[i],
                reason: `커뮤니티 ${communityResults[i]}건 · 뉴스 ${newsResults[i]}건`,
            }))
            .filter(s => s.communityCount > 0 && s.newsCount > 0)
            .sort((a, b) => b.communityCount - a.communityCount)

        return NextResponse.json({ suggestions })
    } catch (err) {
        console.error('[suggest-keywords]', err)
        return NextResponse.json({ error: '키워드 추천 실패' }, { status: 500 })
    }
}
