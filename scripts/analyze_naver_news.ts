// 네이버 뉴스 API 실제 응답 분석

const NAVER_CLIENT_ID = '3R2LcyDFmcC58BKqUNHI'
const NAVER_CLIENT_SECRET = 'YsRvAIHP75'

interface NaverNewsItem {
    title: string
    originallink?: string
    link: string
    description?: string
    pubDate: string
}

function stripHtmlTags(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim()
}

function extractKeywords(text: string): string[] {
    // 특수문자 제거, 2글자 이상 단어만
    return text
        .replace(/[^\wㄱ-ㅎㅏ-ㅣ가-힣\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 2)
        .filter(w => !['논란', '사건', '사고', '발표', '관련', '오늘', '어제'].includes(w))
}

async function analyzeCategory(category: string, query: string) {
    const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=100&sort=date`
    
    const response = await fetch(url, {
        headers: {
            'X-Naver-Client-Id': NAVER_CLIENT_ID,
            'X-Naver-Client-Secret': NAVER_CLIENT_SECRET,
        },
    })
    
    if (!response.ok) {
        console.error(`API 에러 (${query}):`, response.status)
        return
    }
    
    const data = await response.json()
    const items: NaverNewsItem[] = data.items ?? []
    
    console.log(`\n====== ${category} - "${query}" 검색 결과 ======`)
    console.log(`총 ${items.length}건 수집`)
    
    // 키워드 빈도 분석
    const keywordCount = new Map<string, number>()
    
    items.slice(0, 20).forEach((item, idx) => {
        const title = stripHtmlTags(item.title)
        const keywords = extractKeywords(title)
        
        if (idx < 5) {
            console.log(`\n[${idx + 1}] ${title}`)
            console.log(`    키워드: ${keywords.join(', ')}`)
        }
        
        keywords.forEach(kw => {
            keywordCount.set(kw, (keywordCount.get(kw) || 0) + 1)
        })
    })
    
    // 빈도 높은 키워드 상위 15개
    const topKeywords = Array.from(keywordCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
    
    console.log(`\n[상위 키워드 Top 15]`)
    topKeywords.forEach(([kw, count], idx) => {
        console.log(`${idx + 1}. ${kw} (${count}건)`)
    })
}

async function main() {
    console.log('네이버 뉴스 API 키워드 분석 (최신 100건 기준)\n')
    
    await analyzeCategory('연예', '연예')
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    await analyzeCategory('스포츠', '스포츠')
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    await analyzeCategory('정치', '정치')
}

main().catch(console.error)
