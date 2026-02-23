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
    }))

    if (newsData.length > 0) {
        /* 이미 저장된 link 필터링 (중복 방지) */
        const links = newsData.map((n) => n.link)
        const { data: existing } = await supabaseAdmin
            .from('news_data')
            .select('link')
            .in('link', links)
        const existingLinks = new Set(existing?.map((e) => e.link) || [])
        const newNews = newsData.filter((n) => !existingLinks.has(n.link))

        if (newNews.length > 0) {
            const { error } = await supabaseAdmin.from('news_data').insert(newNews)
            if (error) {
                console.error('뉴스 저장 에러:', error)
                throw error
            }
        }

        return newNews.length
    }

    return 0
}
