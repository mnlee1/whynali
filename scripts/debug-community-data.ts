/**
 * scripts/debug-community-data.ts
 * 
 * 커뮤니티 데이터 상세 분석
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function debugCommunityData() {
    console.log('\n🔍 커뮤니티 데이터 상세 분석\n')
    
    // 1. 전체 커뮤니티 데이터 개수
    const { count: totalCount } = await supabase
        .from('community_data')
        .select('*', { count: 'exact', head: true })
    
    console.log(`📦 전체 커뮤니티 데이터: ${totalCount}건`)
    
    // 2. 최근 1시간 데이터
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { data: recentData, count: recentCount } = await supabase
        .from('community_data')
        .select('id, title, created_at', { count: 'exact' })
        .gte('created_at', oneHourAgo)
        .order('created_at', { ascending: false })
    
    console.log(`⏰ 최근 1시간 데이터: ${recentCount}건`)
    
    if (recentCount && recentCount > 0) {
        console.log('\n최신 5개 게시글:')
        for (const post of recentData?.slice(0, 5) || []) {
            const timeAgo = Math.floor((Date.now() - new Date(post.created_at).getTime()) / 60000)
            console.log(`  • [${timeAgo}분 전] ${post.title.substring(0, 50)}...`)
        }
    }
    
    // 3. 최근 24시간 데이터
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count: dayCount } = await supabase
        .from('community_data')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', oneDayAgo)
    
    console.log(`📅 최근 24시간 데이터: ${dayCount}건`)
    
    // 4. 가장 최근 데이터
    const { data: latestData } = await supabase
        .from('community_data')
        .select('id, title, created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
    
    if (latestData) {
        const timeAgo = Math.floor((Date.now() - new Date(latestData.created_at).getTime()) / 60000)
        console.log(`\n🕐 가장 최근 수집: ${timeAgo}분 전`)
        console.log(`   "${latestData.title.substring(0, 60)}..."`)
    }
    
    // 5. 권장 설정
    console.log('\n\n💡 권장 설정:')
    
    if (!recentCount || recentCount === 0) {
        console.log('\n⚠️  최근 1시간 데이터가 없습니다!')
        console.log('\n해결 방법 1: 커뮤니티 수집 크론 실행')
        console.log('  curl -X POST http://localhost:3000/api/cron/collect-community \\')
        console.log('    -H "Authorization: Bearer ' + process.env.CRON_SECRET + '"')
        console.log('\n해결 방법 2: 시간 창을 더 늘리기')
        console.log('  COMMUNITY_BURST_WINDOW_MINUTES=1440  # 24시간')
    } else if (recentCount < 50) {
        console.log('\n⚠️  데이터가 적습니다.')
        console.log('\n권장 설정:')
        console.log('  COMMUNITY_BURST_WINDOW_MINUTES=60   # 1시간')
        console.log('  COMMUNITY_BURST_THRESHOLD=3         # 3건')
    } else {
        console.log('\n✅ 데이터 충분합니다!')
        console.log('\n권장 설정:')
        console.log('  COMMUNITY_BURST_WINDOW_MINUTES=30')
        console.log('  COMMUNITY_BURST_THRESHOLD=5')
    }
    
    console.log('\n')
}

debugCommunityData().catch(console.error)
