/**
 * scripts/check-community-collection.ts
 * 
 * 네이트판/더쿠 수집 상태 확인
 */

// 환경변수 로드
import dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(__dirname, '../.env.local') })

import { supabaseAdmin } from '../lib/supabase/server'

async function checkCommunityCollection() {
    console.log('=== 커뮤니티 수집 상태 확인 ===\n')

    // 1. 최근 24시간 수집 통계
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const { data: recentData } = await supabaseAdmin
        .from('community_data')
        .select('id, source_site, created_at')
        .gte('created_at', oneDayAgo)

    const { data: weekData } = await supabaseAdmin
        .from('community_data')
        .select('id, source_site, created_at')
        .gte('created_at', sevenDaysAgo)

    if (recentData) {
        const theqooRecent = recentData.filter(d => d.source_site === '더쿠').length
        const natepannRecent = recentData.filter(d => d.source_site === '네이트판').length

        console.log('📊 최근 24시간 수집 현황:')
        console.log(`  더쿠: ${theqooRecent}건`)
        console.log(`  네이트판: ${natepannRecent}건`)
        console.log(`  합계: ${recentData.length}건\n`)

        if (natepannRecent === 0) {
            console.log('⚠️  네이트판 수집이 최근 24시간 동안 없습니다!\n')
        }
    }

    if (weekData) {
        const theqooWeek = weekData.filter(d => d.source_site === '더쿠').length
        const natepannWeek = weekData.filter(d => d.source_site === '네이트판').length

        console.log('📈 최근 7일 수집 현황:')
        console.log(`  더쿠: ${theqooWeek}건`)
        console.log(`  네이트판: ${natepannWeek}건`)
        console.log(`  합계: ${weekData.length}건\n`)
    }

    // 2. 네이트판 최근 데이터 샘플
    const { data: natepannSample } = await supabaseAdmin
        .from('community_data')
        .select('id, title, view_count, comment_count, created_at')
        .eq('source_site', '네이트판')
        .order('created_at', { ascending: false })
        .limit(10)

    if (natepannSample && natepannSample.length > 0) {
        console.log('📝 네이트판 최근 수집 샘플:\n')
        natepannSample.forEach((item, idx) => {
            const date = new Date(item.created_at)
            const timeAgo = Math.floor((Date.now() - date.getTime()) / (60 * 1000))
            console.log(`${idx + 1}. ${item.title.substring(0, 50)}...`)
            console.log(`   조회: ${item.view_count} | 댓글: ${item.comment_count} | ${timeAgo}분 전\n`)
        })
    } else {
        console.log('❌ 네이트판 데이터가 없습니다!\n')
    }

    // 3. 더쿠 최근 데이터 샘플
    const { data: theqooSample } = await supabaseAdmin
        .from('community_data')
        .select('id, title, view_count, comment_count, created_at')
        .eq('source_site', '더쿠')
        .order('created_at', { ascending: false })
        .limit(10)

    if (theqooSample && theqooSample.length > 0) {
        console.log('📝 더쿠 최근 수집 샘플:\n')
        theqooSample.forEach((item, idx) => {
            const date = new Date(item.created_at)
            const timeAgo = Math.floor((Date.now() - date.getTime()) / (60 * 1000))
            console.log(`${idx + 1}. ${item.title.substring(0, 50)}...`)
            console.log(`   조회: ${item.view_count} | 댓글: ${item.comment_count} | ${timeAgo}분 전\n`)
        })
    }

    // 4. 수집 주기 확인
    console.log('━'.repeat(80))
    console.log('\n⏰ 수집 주기 설정:\n')
    console.log('  GitHub Actions: .github/workflows/cron-collect-community.yml')
    console.log('  주기: 3분마다')
    console.log('  대상: 더쿠 + 네이트판\n')

    // 5. 수집 테스트 제안
    console.log('━'.repeat(80))
    console.log('\n🧪 수집 테스트 방법:\n')
    console.log('1. 수동 수집 테스트:')
    console.log('   cd whynali')
    console.log('   npx tsx -e "import { collectAllCommunity } from \'./lib/collectors/community\'; collectAllCommunity().then(r => console.log(r))"\n')
    console.log('2. API 엔드포인트 호출:')
    console.log('   curl http://localhost:3000/api/cron/collect-community\n')
    console.log('3. Vercel Cron 로그 확인:')
    console.log('   vercel logs | grep "collect-community"\n')
}

checkCommunityCollection().catch(console.error)
