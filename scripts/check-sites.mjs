const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

const html = await fetch('https://theqoo.net/square', { headers: { 'User-Agent': UA } }).then(r => r.text())

// 실제 게시글 앵커 주변 HTML 확인
const anchors = [...html.matchAll(/<a[^>]+href="\/square\/(\d{10,})"[^>]*>([^<]+)/g)]
console.log('post anchors:', anchors.length)

if (anchors.length > 0) {
    // 첫 번째 게시글 앵커의 주변 HTML 확인 (앞 300자, 뒤 200자)
    const m = anchors[0]
    const start = Math.max(0, m.index - 400)
    const end = Math.min(html.length, m.index + 400)
    console.log('context around first post link:')
    console.log(html.substring(start, end))
    
    console.log('\n=== 두 번째 게시글 ===')
    const m2 = anchors[1]
    const s2 = Math.max(0, m2.index - 400)
    const e2 = Math.min(html.length, m2.index + 400)
    console.log(html.substring(s2, e2))
}
