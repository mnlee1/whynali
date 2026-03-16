/**
 * scripts/check-admin-community-data.ts
 * 
 * 관리자 페이지에서 보이는 커뮤니티 데이터 확인
 */

// 환경변수 로드
import dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(__dirname, '../.env.local') })

import { supabaseAdmin } from '../lib/supabase/server'

async function checkAdminCommunityData() {
    console.log('=== 관리자 페이지 커뮤니티 데이터 확인 ===\n')

    // 1. 전체 데이터 확인 (기본 정렬: comment_count desc)
    const { data: allData, count: allCount } = await supabaseAdmin
        .from('community_data')
        .select('id, title, source_site, comment_count, view_count, written_at, created_at', { count: 'exact' })
        .order('comment_count', { ascending: false, nullsFirst: false })
        .range(0, 19)

    console.log(`📊 전체 데이터 (댓글순 TOP 20):`)
    console.log(`   총 ${allCount}건\n`)

    if (allData) {
        const theqooCount = allData.filter(d => d.source_site === '더쿠').length
        const natepannCount = allData.filter(d => d.source_site === '네이트판').length

        console.log(`   TOP 20 분포:`)
        console.log(`   - 더쿠: ${theqooCount}건`)
        console.log(`   - 네이트판: ${natepannCount}건\n`)

        console.log(`   상위 10개:`)
        allData.slice(0, 10).forEach((item, idx) => {
            console.log(`   ${idx + 1}. [${item.source_site}] ${item.title.substring(0, 40)}...`)
            console.log(`      댓글: ${item.comment_count} | 조회: ${item.view_count} | ${new Date(item.created_at).toLocaleString()}`)
        })
    }

    console.log('\n' + '━'.repeat(80) + '\n')

    // 2. 더쿠만 확인
    const { data: theqooData, count: theqooCount } = await supabaseAdmin
        .from('community_data')
        .select('id, title, comment_count, view_count, created_at', { count: 'exact' })
        .eq('source_site', '더쿠')
        .order('comment_count', { ascending: false, nullsFirst: false })
        .range(0, 4)

    console.log(`📊 더쿠 데이터 (댓글순 TOP 5):`)
    console.log(`   총 ${theqooCount}건\n`)
    
    if (theqooData) {
        theqooData.forEach((item, idx) => {
            console.log(`   ${idx + 1}. ${item.title.substring(0, 50)}...`)
            console.log(`      댓글: ${item.comment_count} | 조회: ${item.view_count}`)
        })
    }

    console.log('\n' + '━'.repeat(80) + '\n')

    // 3. 네이트판만 확인
    const { data: natepannData, count: natepannCount } = await supabaseAdmin
        .from('community_data')
        .select('id, title, comment_count, view_count, created_at', { count: 'exact' })
        .eq('source_site', '네이트판')
        .order('comment_count', { ascending: false, nullsFirst: false })
        .range(0, 4)

    console.log(`📊 네이트판 데이터 (댓글순 TOP 5):`)
    console.log(`   총 ${natepannCount}건\n`)
    
    if (natepannData) {
        natepannData.forEach((item, idx) => {
            console.log(`   ${idx + 1}. ${item.title.substring(0, 50)}...`)
            console.log(`      댓글: ${item.comment_count} | 조회: ${item.view_count}`)
        })
    }

    console.log('\n' + '━'.repeat(80) + '\n')

    // 4. 사이트별 댓글수 평균 비교
    const { data: stats } = await supabaseAdmin
        .from('community_data')
        .select('source_site, comment_count, view_count')

    if (stats) {
        const theqooStats = stats.filter(s => s.source_site === '더쿠')
        const natepannStats = stats.filter(s => s.source_site === '네이트판')

        const theqooAvgComments = theqooStats.reduce((sum, s) => sum + s.comment_count, 0) / theqooStats.length
        const natepannAvgComments = natepannStats.reduce((sum, s) => sum + s.comment_count, 0) / natepannStats.length

        const theqooMaxComments = Math.max(...theqooStats.map(s => s.comment_count))
        const natepannMaxComments = Math.max(...natepannStats.map(s => s.comment_count))

        console.log(`📈 사이트별 통계:\n`)
        console.log(`   더쿠:`)
        console.log(`   - 평균 댓글수: ${theqooAvgComments.toFixed(1)}개`)
        console.log(`   - 최대 댓글수: ${theqooMaxComments}개`)
        console.log(`   - 총 게시글: ${theqooStats.length}건\n`)

        console.log(`   네이트판:`)
        console.log(`   - 평균 댓글수: ${natepannAvgComments.toFixed(1)}개`)
        console.log(`   - 최대 댓글수: ${natepannMaxComments}개`)
        console.log(`   - 총 게시글: ${natepannStats.length}건\n`)
    }

    console.log('━'.repeat(80) + '\n')

    // 5. 결론
    console.log('💡 결론:\n')
    
    if (allData) {
        const theqooInTop20 = allData.filter(d => d.source_site === '더쿠').length
        const natepannInTop20 = allData.filter(d => d.source_site === '네이트판').length

        if (natepannInTop20 === 0) {
            console.log('⚠️  관리자 페이지에서 네이트판이 안 보이는 이유:')
            console.log('   - 기본 정렬: 댓글수 내림차순')
            console.log('   - TOP 20에 네이트판 0건')
            console.log('   - 네이트판 댓글수가 더쿠보다 적어서 밀림\n')
            console.log('✅ 해결 방법:')
            console.log('   1. 관리자 페이지에서 "네이트판" 탭 클릭')
            console.log('   2. 또는 정렬을 "작성일" 또는 "수집일"로 변경')
            console.log('   3. 데이터는 정상 수집 중')
        } else {
            console.log(`✅ TOP 20에 네이트판 ${natepannInTop20}건 포함됨`)
            console.log('   - 네이트판 데이터가 정상적으로 보임')
        }
    }
}

checkAdminCommunityData().catch(console.error)
