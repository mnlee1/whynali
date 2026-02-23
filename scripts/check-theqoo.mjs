const html = await fetch('https://theqoo.net/square', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
}).then(r => r.text())

console.log('HTML length:', html.length)

// 모든 tr 찾기
const allTr = [...html.matchAll(/<tr[\s>]/g)]
console.log('total tr count:', allTr.length)

// tr 클래스들 확인
const classMatches = [...html.matchAll(/<tr\s+class="([^"]+)"/g)]
const classSet = {}
for (const m of classMatches) {
    classSet[m[1]] = (classSet[m[1]] || 0) + 1
}
console.log('tr classes:', JSON.stringify(classSet, null, 2))

// 5번째 tr 내용 확인
if (allTr.length > 8) {
    const m = allTr[8]
    const row = html.substring(m.index, html.indexOf('</tr>', m.index) + 5)
    console.log('\n=== tr[8] ===')
    console.log(row.substring(0, 1200))
}
