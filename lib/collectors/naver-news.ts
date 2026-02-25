import { supabaseAdmin } from '@/lib/supabase/server'
import { decodeHtml } from '@/lib/utils/decode-html'

interface NaverNewsItem {
    title: string
    originallink?: string
    link: string
    description?: string
    pubDate: string
}

function getCategoryQuery(category: string): string {
    // 단순 카테고리명 대신 복합 쿼리 사용 → 수집 단계 노이즈 감소
    const queries: Record<string, string> = {
        '연예': '연예인 드라마 아이돌 논란',
        '스포츠': '야구 축구 농구 선수 경기',
        '정치': '국회 대통령 여당 야당 의원',
        '사회': '사건 사고 범죄 경찰 수사',
        '기술': 'AI 반도체 스마트폰 인공지능',
    }
    return queries[category] ?? '이슈'
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

    const query = getCategoryQuery(category)
    const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=100&sort=date`

    const response = await fetch(url, {
        headers: {
            'X-Naver-Client-Id': clientId,
            'X-Naver-Client-Secret': clientSecret,
        },
    })

    if (!response.ok) {
        throw new Error(`네이버 API 에러: ${response.status}`)
    }

    const data = await response.json()
    const items: NaverNewsItem[] = data.items ?? []

    const newsData = items.map((item) => ({
        title: stripHtmlTags(item.title),
        link: item.link,
        source: extractSource(item.link),
        published_at: new Date(item.pubDate).toISOString(),
        category,  // 이 줄 추가
    }))

    if (newsData.length > 0) {
        /* link UNIQUE 제약 + onConflict ignoreDuplicates로 원자적 중복 방지
           (migration: add_unique_constraints_for_collectors.sql) */
        const { error, data: upserted } = await supabaseAdmin
            .from('news_data')
            .upsert(newsData, { onConflict: 'link', ignoreDuplicates: true })
            .select('id')

        if (error) {
            console.error('뉴스 저장 에러:', error)
            throw error
        }

        return upserted?.length ?? 0
    }

    return 0
}
