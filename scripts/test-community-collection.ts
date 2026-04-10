/**
 * scripts/test-community-collection.ts
 * 
 * 커뮤니티 수집을 로컬에서 직접 테스트
 */

import { collectAllCommunity } from '../lib/collectors/community'

async function testCollection() {
    console.log('=== 커뮤니티 수집 테스트 ===\n')
    
    try {
        const results = await collectAllCommunity()
        
        console.log('결과:\n')
        
        console.log('더쿠:')
        console.log(`  수집: ${results.theqoo.count}건`)
        console.log(`  스킵: ${results.theqoo.skipped}건`)
        if (results.theqoo.warning) console.log(`  경고: ${results.theqoo.warning}`)
        
        console.log('\n네이트판:')
        console.log(`  수집: ${results.natePann.count}건`)
        console.log(`  스킵: ${results.natePann.skipped}건`)
        if (results.natePann.warning) console.log(`  경고: ${results.natePann.warning}`)
        
        console.log('\n클리앙:')
        console.log(`  수집: ${results.clien.count}건`)
        console.log(`  스킵: ${results.clien.skipped}건`)
        if (results.clien.warning) console.log(`  경고: ${results.clien.warning}`)
        
        console.log('\n보배드림:')
        console.log(`  수집: ${results.bobaedream.count}건`)
        console.log(`  스킵: ${results.bobaedream.skipped}건`)
        if (results.bobaedream.warning) console.log(`  경고: ${results.bobaedream.warning}`)
        
        console.log('\n뽐뿌:')
        console.log(`  수집: ${results.ppomppu.count}건`)
        console.log(`  스킵: ${results.ppomppu.skipped}건`)
        if (results.ppomppu.warning) console.log(`  경고: ${results.ppomppu.warning}`)
        
        console.log('\n루리웹:')
        console.log(`  수집: ${results.ruliweb.count}건`)
        console.log(`  스킵: ${results.ruliweb.skipped}건`)
        if (results.ruliweb.warning) console.log(`  경고: ${results.ruliweb.warning}`)
        
        const totalCollected = results.theqoo.count + results.natePann.count + 
                              results.clien.count + results.bobaedream.count + 
                              results.ppomppu.count + results.ruliweb.count
        
        console.log(`\n총 수집: ${totalCollected}건`)
        
        if (totalCollected === 0) {
            console.log('\n⚠️ 새로 수집된 글이 없습니다!')
            console.log('원인:')
            console.log('  1. 커뮤니티에 실제로 새 글이 없음')
            console.log('  2. 모든 글이 이미 DB에 있음 (중복)')
            console.log('  3. 크롤링 실패 (HTML 구조 변경 또는 차단)')
        }
        
    } catch (error) {
        console.error('에러 발생:', error)
    }
}

testCollection()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error('테스트 실패:', e)
        process.exit(1)
    })
