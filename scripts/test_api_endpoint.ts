/**
 * scripts/test_api_endpoint.ts
 * 
 * API 엔드포인트 직접 테스트
 */

async function testAPI() {
    const baseURL = 'http://localhost:3000'
    
    console.log('='.repeat(80))
    console.log('API 엔드포인트 테스트')
    console.log('='.repeat(80))
    console.log()

    // 테스트할 필터들
    const filters = [
        { name: '전체', url: '/api/admin/issues' },
        { name: '승인 전체', url: '/api/admin/issues?approval_status=승인' },
        { name: '자동 승인', url: '/api/admin/issues?approval_status=승인&approval_type=auto' },
        { name: '관리자 승인', url: '/api/admin/issues?approval_status=승인&approval_type=manual' },
    ]

    for (const filter of filters) {
        console.log(`테스트: ${filter.name}`)
        console.log(`URL: ${filter.url}`)
        console.log('-'.repeat(80))
        
        try {
            const response = await fetch(baseURL + filter.url, {
                headers: {
                    'Cookie': process.env.TEST_COOKIE || ''
                }
            })
            
            if (!response.ok) {
                console.log(`❌ HTTP ${response.status}: ${response.statusText}`)
            } else {
                const data = await response.json()
                console.log(`✅ 응답 성공: ${data.data?.length || 0}개 이슈`)
                
                if (data.data && data.data.length > 0) {
                    data.data.forEach((issue: any) => {
                        console.log(`  - [${issue.approval_type || 'null'}] ${issue.title.substring(0, 50)}`)
                    })
                }
            }
        } catch (error) {
            console.log(`❌ 에러: ${error}`)
        }
        
        console.log()
    }

    console.log('='.repeat(80))
    console.log('참고: 로컬 서버가 실행 중이어야 합니다 (npm run dev)')
    console.log('='.repeat(80))
}

testAPI().catch(console.error)
