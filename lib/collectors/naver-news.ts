import { supabaseAdmin } from '@/lib/supabase/server'
import { decodeHtml } from '@/lib/utils/decode-html'

interface NaverNewsItem {
    title: string
    originallink?: string
    link: string
    description?: string
    pubDate: string
}

function stripHtmlTags(html: string): string {
    // HTML 태그 제거 후 엔티티(&quot; &amp; 등)도 디코딩
    return decodeHtml(html.replace(/<[^>]*>/g, '').trim())
}

function extractSource(url: string): string {
    try {
        const urlObj = new URL(url)
        return urlObj.hostname.replace('www.', '')
    } catch {
        return 'Unknown'
    }
}

export async function collectNaverNews(category: string): Promise<number> {
    const clientId = process.env.NAVER_CLIENT_ID
    const clientSecret = process.env.NAVER_CLIENT_SECRET

    if (!clientId || !clientSecret) {
        throw new Error('네이버 API 키가 설정되지 않았습니다')
    }

    // 카테고리 자체를 검색어로 사용하여 해당 분야의 핵심 이슈를 타겟팅
    const query = category

    const allNewsData: Array<{
        title: string
        link: string
        source: string
        published_at: string
        category: string
    }> = []

    /* 
     * 핵심 전략: sort=sim (관련도순/정확도순)
     * 네이버 알고리즘상 해당 카테고리에서 가장 중요하게 다뤄지거나(랭킹/헤드라인급)
     * 연관성이 높은 뉴스 100건을 우선적으로 반환합니다.
     * (sort=date 는 단순 최신순이라 가십성/단신 뉴스가 너무 많이 섞임)
     */
    const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=100&sort=sim`

    const response = await fetch(url, {
        headers: {
            'X-Naver-Client-Id': clientId,
            'X-Naver-Client-Secret': clientSecret,
        },
    })

    if (!response.ok) {
        console.error(`네이버 API 에러 (카테고리: ${category}):`, response.status)
        return 0
    }

    const data = await response.json()
    const items: NaverNewsItem[] = data.items ?? []

    const newsData = items.map((item) => ({
        title: stripHtmlTags(item.title),
        link: item.link,
        // originallink = 실제 언론사 URL, link = 네이버 뷰어 URL
        // source는 고유 출처 구분에 사용되므로 반드시 originallink 우선
        source: extractSource(item.originallink ?? item.link),
        published_at: new Date(item.pubDate).toISOString(),
        category, // 요청받은 카테고리로 명확하게 분류
    }))

    allNewsData.push(...newsData)

    if (allNewsData.length > 0) {
        /* link UNIQUE 제약 + onConflict ignoreDuplicates로 원자적 중복 방지 */
        const { error, data: upserted } = await supabaseAdmin
            .from('news_data')
            .upsert(allNewsData, { onConflict: 'link', ignoreDuplicates: true })
            .select('id')

        if (error) {
            console.error('뉴스 저장 에러:', error)
            throw error
        }

        return upserted?.length ?? 0
    }

    return 0
}
