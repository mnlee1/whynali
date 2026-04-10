/**
 * scripts/clear-isr-cache.ts
 * 
 * Next.js ISR 캐시를 강제로 갱신하는 스크립트
 */

async function revalidatePaths() {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    
    const paths = [
        '/',
        '/sports',
        '/tech',
        '/economy',
        '/entertain',
        '/politics',
        '/society',
        '/world',
    ]

    console.log('=== ISR 캐시 갱신 중 ===\n')
    
    for (const path of paths) {
        try {
            const url = `${baseUrl}/api/revalidate?path=${encodeURIComponent(path)}`
            console.log(`갱신 중: ${path}`)
            const res = await fetch(url)
            
            if (res.ok) {
                console.log(`  ✅ 성공`)
            } else {
                console.log(`  ❌ 실패 (${res.status})`)
            }
        } catch (error) {
            console.log(`  ❌ 에러:`, error)
        }
    }

    console.log('\n완료!')
    console.log('\n또는 개발 서버를 재시작하세요:')
    console.log('  npm run dev')
}

revalidatePaths().catch(console.error)
