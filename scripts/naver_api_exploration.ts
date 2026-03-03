// 네이버 뉴스 API 다른 접근 방법 탐색

const NAVER_CLIENT_ID = '3R2LcyDFmcC58BKqUNHI'
const NAVER_CLIENT_SECRET = 'YsRvAIHP75'

async function testEmptyQuery() {
    console.log('=== 1. 빈 쿼리 테스트 (전체 뉴스) ===')
    const url = `https://openapi.naver.com/v1/search/news.json?query=&display=100&sort=date`
    
    const response = await fetch(url, {
        headers: {
            'X-Naver-Client-Id': NAVER_CLIENT_ID,
            'X-Naver-Client-Secret': NAVER_CLIENT_SECRET,
        },
    })
    
    console.log('Status:', response.status)
    const data = await response.json()
    console.log('결과:', data.items ? `${data.items.length}건` : data)
}

async function testWildcard() {
    console.log('\n=== 2. 와일드카드 테스트 (*) ===')
    const url = `https://openapi.naver.com/v1/search/news.json?query=*&display=100&sort=date`
    
    const response = await fetch(url, {
        headers: {
            'X-Naver-Client-Id': NAVER_CLIENT_ID,
            'X-Naver-Client-Secret': NAVER_CLIENT_SECRET,
        },
    })
    
    console.log('Status:', response.status)
    const data = await response.json()
    console.log('결과:', data.items ? `${data.items.length}건` : data)
}

async function testBroadKeywords() {
    console.log('\n=== 3. 광범위 키워드 테스트 ===')
    
    const keywords = ['뉴스', '오늘', '최신', '속보']
    
    for (const kw of keywords) {
        const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(kw)}&display=100&sort=date`
        
        const response = await fetch(url, {
            headers: {
                'X-Naver-Client-Id': NAVER_CLIENT_ID,
                'X-Naver-Client-Secret': NAVER_CLIENT_SECRET,
            },
        })
        
        const data = await response.json()
        console.log(`"${kw}": ${data.items?.length || 0}건`)
        
        if (data.items && data.items.length > 0) {
            console.log(`  샘플: ${data.items[0].title.replace(/<[^>]*>/g, '')}`)
        }
    }
}

async function testSortOptions() {
    console.log('\n=== 4. 정렬 옵션 테스트 (date vs sim) ===')
    
    const sorts = ['date', 'sim']
    
    for (const sort of sorts) {
        const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent('이슈')}&display=10&sort=${sort}`
        
        const response = await fetch(url, {
            headers: {
                'X-Naver-Client-Id': NAVER_CLIENT_ID,
                'X-Naver-Client-Secret': NAVER_CLIENT_SECRET,
            },
        })
        
        const data = await response.json()
        console.log(`\n정렬: ${sort}`)
        data.items?.slice(0, 3).forEach((item: any, i: number) => {
            console.log(`  ${i+1}. ${item.title.replace(/<[^>]*>/g, '')}`)
            console.log(`     발행: ${item.pubDate}`)
        })
    }
}

async function main() {
    console.log('네이버 뉴스 API 대안 탐색\n')
    
    await testEmptyQuery()
    await new Promise(r => setTimeout(r, 500))
    
    await testWildcard()
    await new Promise(r => setTimeout(r, 500))
    
    await testBroadKeywords()
    await new Promise(r => setTimeout(r, 500))
    
    await testSortOptions()
}

main().catch(console.error)
