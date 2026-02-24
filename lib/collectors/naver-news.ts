import { supabaseAdmin } from '@/lib/supabase/server'

interface NaverNewsItem {
    title: string
    originallink?: string
    link: string
    description?: string
    pubDate: string
}

function getCategoryQuery(category: string): string {
    const queries: Record<string, string> = {
        '연예': '연예',
        '스포츠': '스포츠',
        '정치': '정치',
        '사회': '사회',
        '기술': 'IT 기술',
    }
    return queries[category] ?? '이슈'
}

function stripHtmlTags(html: string): string {
    return html.replace(/<[^>]*>/g, '').trim()
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
