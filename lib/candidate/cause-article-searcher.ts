/**
 * lib/candidate/cause-article-searcher.ts
 *
 * 이슈 생성 직후, 논란의 '원인' 기사를 역방향 탐색하여 발단에 연결합니다.
 *
 * 문제 배경:
 *   track-a는 기사가 5건 이상 클러스터링된 시점에 이슈를 등록합니다.
 *   이 시점엔 이미 "사과", "활동중단" 같은 후속 기사가 주를 이루고
 *   논란의 원인이 된 최초 기사는 연결되지 않는 경우가 많습니다.
 *
 * 해결:
 *   Groq로 "원인 탐색형 키워드"를 생성 → Naver 뉴스 검색 →
 *   이슈 생성 72시간 이전 기사 중 관련성 높은 것만 발단으로 연결
 *
 * 보완 사항:
 *   1. 시간 필터: 이슈 생성 시점 72시간 이내 기사만
 *   2. 관련성 필터: 이슈 제목과 키워드 최소 1개 이상 겹침
 *   3. 결과형 키워드 필터: "사과", "활동중단" 등 후속 기사 제외
 *   4. 중복 방지: 이미 발단에 있는 유사 제목 제외
 */

import { supabaseAdmin } from '@/lib/supabase/server'
import { callGroq } from '@/lib/ai/groq-client'
import { parseJsonArray } from '@/lib/ai/parse-json-response'

const NAVER_NEWS_API = 'https://openapi.naver.com/v1/search/news.json'

// 후속/결과형 키워드 — 이 단어들만으로 구성된 기사는 원인 기사가 아님
const RESULT_KEYWORDS = new Set([
    '사과', '사과문', '활동중단', '활동 중단', '해명', '인정', '부인', '반박',
    '입장', '입장문', '사퇴', '사임', '체포', '구속', '기소', '해고', '퇴출',
    '탈퇴', '은퇴', '복귀', '재개', '재활동', '후속', '추가 입장',
])

// 불용어
const STOPWORDS = new Set([
    '이', '가', '은', '는', '을', '를', '의', '에', '로', '으로', '와', '과',
    '도', '만', '등', '및', '또', '그', '더', '이후', '관련', '대해', '위해',
    '통해', '대한', '위한', '같은', '지난', '현재', '오늘', '해당', '기자',
])

function extractKeywords(title: string): Set<string> {
    return new Set(
        title
            .split(/[\s\[\]()「」『』<>【】·,./…!?"']+/)
            .map(t => t.trim())
            .filter(t => t.length >= 2 && !STOPWORDS.has(t))
    )
}

/** 제목에 결과형 키워드가 하나라도 있으면 원인 기사가 아님 */
function hasResultKeyword(title: string): boolean {
    const keywords = extractKeywords(title)
    return [...keywords].some(k => RESULT_KEYWORDS.has(k))
}

/** 두 제목이 유사한지 판단 (키워드 4개 이상 겹침) */
function isSimilarTitle(a: string, b: string): boolean {
    const ka = extractKeywords(a)
    const kb = extractKeywords(b)
    let overlap = 0
    for (const k of ka) { if (kb.has(k)) overlap++ }
    return overlap >= 4
}

/** Groq로 원인 탐색형 키워드 2개 생성 */
async function generateCauseKeywords(
    issueTitle: string,
    topicDescription: string | null
): Promise<string[]> {
    const backgroundLine = topicDescription
        ? `배경: "${topicDescription}"\n`
        : ''

    const prompt = `이슈: "${issueTitle}"
${backgroundLine}
이 이슈가 논란이 된 '원인'을 찾기 위한 뉴스 검색 키워드 2개를 생성하세요.

규칙:
- "사과", "활동중단", "해명", "사퇴", "인정", "부인", "입장", "체포", "구속" 같은 결과/후속 키워드는 절대 포함 금지
- "발언", "행동", "논란", "의혹", "사건", "갑질", "폭로", "혐의" 같은 원인 탐색 키워드 사용
- 인물명/기관명 + 원인 키워드 조합, 2~4단어
- 너무 일반적인 키워드 금지 (예: "연예인 발언" X → "알디원 발언" O)

JSON 배열로만 응답: ["키워드1", "키워드2"]`

    try {
        const content = await callGroq(
            [{ role: 'user', content: prompt }],
            { model: 'llama-3.1-8b-instant', temperature: 0.1, max_tokens: 100 },
        )
        const parsed = parseJsonArray<string>(content)
        return (parsed ?? []).filter(k => typeof k === 'string' && k.length >= 2).slice(0, 2)
    } catch {
        return []
    }
}

/** Naver 뉴스 API 직접 호출 (저장 없이 결과만 반환) */
async function fetchNaverNews(keyword: string): Promise<Array<{
    title: string
    link: string
    originallink: string
    pubDate: string
    source: string
}>> {
    const clientId = process.env.NAVER_CLIENT_ID
    const clientSecret = process.env.NAVER_CLIENT_SECRET
    if (!clientId || !clientSecret) return []

    try {
        const url = `${NAVER_NEWS_API}?query=${encodeURIComponent(keyword)}&display=20&sort=date`
        const res = await fetch(url, {
            headers: {
                'X-Naver-Client-Id': clientId,
                'X-Naver-Client-Secret': clientSecret,
            },
        })
        if (!res.ok) return []
        const data = await res.json()
        return (data.items ?? []).map((item: { title: string; link: string; originallink?: string; pubDate: string }) => ({
            title: item.title.replace(/<[^>]*>/g, '').trim(),
            link: item.link,
            originallink: item.originallink ?? item.link,
            pubDate: item.pubDate,
            source: (() => {
                try { return new URL(item.originallink ?? item.link).hostname.replace('www.', '') } catch { return 'Unknown' }
            })(),
        }))
    } catch {
        return []
    }
}

/**
 * 이슈 생성 직후 호출 — 원인 기사를 역방향 탐색하여 발단에 추가
 * 실패해도 이슈 생성에 영향 없도록 내부에서 catch 처리
 */
export async function searchAndLinkCauseArticles(
    issueId: string,
    issueTitle: string,
    topicDescription: string | null,
    issueCreatedAt: string,
    category: string,
): Promise<void> {
    try {
        // 1. 원인 탐색형 키워드 생성
        const causeKeywords = await generateCauseKeywords(issueTitle, topicDescription)
        if (causeKeywords.length === 0) {
            console.log(`  [원인탐색] "${issueTitle}" — 키워드 생성 실패, 스킵`)
            return
        }
        console.log(`  [원인탐색] "${issueTitle}" — 키워드: ${causeKeywords.join(', ')}`)

        // 2. 이슈 생성 시점 기준 7일 이내만 허용
        const issueCreatedMs = new Date(issueCreatedAt).getTime()
        const windowStart = new Date(issueCreatedMs - 7 * 24 * 60 * 60 * 1000)
        const windowEnd = new Date(issueCreatedAt)

        // 3. 이슈 제목 키워드 (관련성 필터용)
        const issueTitleKeywords = extractKeywords(issueTitle)

        // 4. 기존 발단 포인트 제목 (중복 방지)
        const { data: existingPoints } = await supabaseAdmin
            .from('timeline_points')
            .select('title, source_url')
            .eq('issue_id', issueId)
            .eq('stage', '발단')

        const existingUrls = new Set((existingPoints ?? []).map(p => p.source_url).filter(Boolean))
        const existingTitles = (existingPoints ?? []).map(p => p.title).filter(Boolean) as string[]

        // 5. 키워드별 검색 및 필터링
        const candidateMap = new Map<string, { title: string; link: string; source: string; publishedAt: string }>()

        for (const keyword of causeKeywords) {
            const results = await fetchNaverNews(keyword)

            for (const item of results) {
                const pubDate = new Date(item.pubDate)

                // 시간 필터: 이슈 생성 72시간 이전 기사만
                if (pubDate < windowStart || pubDate > windowEnd) continue

                // 결과형 기사 제외
                if (hasResultKeyword(item.title)) continue

                // 이슈 제목과 키워드 겹침 최소 1개
                const articleKeywords = extractKeywords(item.title)
                const overlap = [...articleKeywords].filter(k => issueTitleKeywords.has(k)).length
                if (overlap === 0) continue

                // 이미 연결된 URL 제외
                if (existingUrls.has(item.link)) continue

                // 기존 발단 제목과 유사한 기사 제외
                if (existingTitles.some(t => isSimilarTitle(t, item.title))) continue

                // 중복 URL 방지 (같은 검색에서 나온 중복)
                if (!candidateMap.has(item.link)) {
                    candidateMap.set(item.link, {
                        title: item.title,
                        link: item.link,
                        source: item.source,
                        publishedAt: pubDate.toISOString(),
                    })
                }
            }
        }

        if (candidateMap.size === 0) {
            console.log(`  [원인탐색] "${issueTitle}" — 조건에 맞는 원인 기사 없음`)
            return
        }

        // 6. 최대 3건만 추가 (발단 섹션이 너무 길어지지 않도록)
        const candidates = [...candidateMap.values()]
            .sort((a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime())
            .slice(0, 3)

        // 7. news_data에 저장 (중복 무시)
        const { data: savedNews } = await supabaseAdmin
            .from('news_data')
            .upsert(
                candidates.map(c => ({
                    title: c.title,
                    link: c.link,
                    source: c.source,
                    published_at: c.publishedAt,
                    category,
                    issue_id: issueId,
                })),
                { onConflict: 'link', ignoreDuplicates: false }
            )
            .select('id, title, published_at')

        if (!savedNews || savedNews.length === 0) {
            console.log(`  [원인탐색] "${issueTitle}" — news_data 저장 실패 또는 이미 다른 이슈에 연결됨`)
            return
        }

        // 8. timeline_points에 발단으로 추가
        const newPoints = savedNews.map(n => ({
            issue_id: issueId,
            title: n.title,
            occurred_at: n.published_at,
            source_url: candidates.find(c => c.title === n.title)?.link ?? '',
            stage: '발단' as const,
            ai_summary: null,
        }))

        const { error } = await supabaseAdmin
            .from('timeline_points')
            .insert(newPoints)

        if (error) {
            console.warn(`  ⚠️ [원인탐색] 타임라인 포인트 추가 실패: ${error.message}`)
        } else {
            console.log(`  ✓ [원인탐색] "${issueTitle}" — 원인 기사 ${newPoints.length}건 발단에 추가`)
        }
    } catch (err) {
        // 원인 탐색 실패는 이슈 생성에 영향 없음
        console.warn(`  ⚠️ [원인탐색] "${issueTitle}" 실패:`, err)
    }
}
