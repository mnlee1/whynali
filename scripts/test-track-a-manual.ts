/**
 * scripts/test-track-a-manual.ts
 * 
 * [트랙 A API 수동 테스트 스크립트]
 * 
 * 트랙 A 크론을 로컬에서 수동으로 실행하여 테스트합니다.
 * 
 * 실행:
 * npx tsx scripts/test-track-a-manual.ts
 */

import { config } from 'dotenv'

// .env.local 로드
config({ path: '.env.local' })

async function testTrackA() {
    console.log('\n🧪 트랙 A API 테스트 시작\n')
    
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    const cronSecret = process.env.CRON_SECRET
    
    if (!cronSecret) {
        console.error('❌ CRON_SECRET 환경변수가 설정되지 않았습니다')
        process.exit(1)
    }
    
    console.log(`📍 API 엔드포인트: ${baseUrl}/api/cron/track-a`)
    console.log(`🔑 인증: Bearer ${cronSecret.substring(0, 10)}...`)
    console.log('\n🚀 API 호출 중...\n')
    
    try {
        const startTime = Date.now()
        
        const response = await fetch(`${baseUrl}/api/cron/track-a`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${cronSecret}`,
                'Content-Type': 'application/json',
            },
        })
        
        const elapsed = Date.now() - startTime
        
        console.log(`⏱️  응답 시간: ${elapsed}ms`)
        console.log(`📊 상태 코드: ${response.status} ${response.statusText}`)
        
        const data = await response.json()
        
        console.log('\n📦 응답 데이터:')
        console.log(JSON.stringify(data, null, 2))
        
        if (response.ok) {
            console.log('\n✅ 트랙 A 실행 성공!')
            
            if (data.success > 0) {
                console.log(`\n🎉 ${data.success}개의 이슈 후보가 생성되었습니다!`)
                console.log(`\n📋 다음 단계:`)
                console.log(`1. Supabase에서 issues 테이블 확인`)
                console.log(`2. approval_status='대기' 이슈 확인`)
                console.log(`3. 관리자 페이지에서 승인/반려 테스트`)
            } else if (data.failed > 0) {
                console.log(`\n⚠️  ${data.failed}개의 키워드가 이슈 생성 실패`)
                console.log(`\n실패 원인:`)
                console.log(`- AI 검증 실패 (신뢰도 낮음)`)
                console.log(`- 뉴스 0건 (루머 가능성)`)
                console.log(`- 화력 15점 미만`)
                console.log(`- 중복 이슈`)
            } else {
                console.log(`\n📭 급증 키워드가 없습니다.`)
                console.log(`\n테스트 팁:`)
                console.log(`1. 커뮤니티 데이터가 충분히 수집되었는지 확인`)
                console.log(`2. COMMUNITY_BURST_THRESHOLD 값을 낮춰보세요 (기본 10)`)
                console.log(`3. COMMUNITY_BURST_WINDOW_MINUTES 값을 늘려보세요 (기본 10)`)
            }
        } else {
            console.log('\n❌ 트랙 A 실행 실패')
            if (response.status === 401) {
                console.log('🔐 인증 실패: CRON_SECRET이 올바른지 확인하세요')
            }
        }
        
    } catch (error) {
        console.error('\n❌ 에러 발생:', error)
        
        if (error instanceof Error && error.message.includes('ECONNREFUSED')) {
            console.log('\n💡 로컬 서버가 실행 중인지 확인하세요:')
            console.log('   npm run dev')
        }
    }
    
    console.log('\n')
}

testTrackA().catch(console.error)
