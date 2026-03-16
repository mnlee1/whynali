/**
 * scripts/test-track-a-reset.ts
 * 
 * [트랙 A 테스트를 위한 데이터 리셋 스크립트]
 * 
 * 주의: 이 스크립트는 모든 이슈를 삭제합니다!
 * 프로덕션에서 절대 실행하지 마세요.
 * 
 * 실행:
 * CONFIRM_RESET=yes npx tsx scripts/test-track-a-reset.ts
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

// .env.local 로드
config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ 환경변수가 설정되지 않았습니다')
    console.error('NEXT_PUBLIC_SUPABASE_URL:', !!supabaseUrl)
    console.error('SUPABASE_SERVICE_ROLE_KEY:', !!supabaseServiceKey)
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function resetForTrackATest() {
    console.log('\n🧪 트랙 A 테스트를 위한 데이터 리셋 시작\n')
    
    // 1. 현재 이슈 개수 확인
    const { count: issueCount } = await supabase
        .from('issues')
        .select('*', { count: 'exact', head: true })
    
    console.log(`📊 현재 이슈 개수: ${issueCount}개`)
    
    if (!issueCount || issueCount === 0) {
        console.log('✅ 이미 이슈가 없습니다. 리셋 불필요.')
        return
    }
    
    // 2. 사용자 확인
    console.log('\n⚠️  경고: 모든 이슈가 삭제됩니다!')
    console.log('⚠️  관련 데이터(타임라인, 댓글, 투표, 리액션 등)도 함께 삭제됩니다.')
    console.log('\n계속하려면 환경변수 CONFIRM_RESET=yes 를 설정하세요.')
    
    if (process.env.CONFIRM_RESET !== 'yes') {
        console.log('\n❌ 리셋 취소됨 (CONFIRM_RESET=yes 미설정)')
        process.exit(0)
    }
    
    console.log('\n🗑️  데이터 삭제 시작...\n')
    
    // 3. 이슈 삭제 (CASCADE로 관련 데이터 자동 삭제)
    const { error: deleteError } = await supabase
        .from('issues')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000') // 모든 행 삭제
    
    if (deleteError) {
        console.error('❌ 이슈 삭제 실패:', deleteError)
        process.exit(1)
    }
    
    console.log('✅ 모든 이슈 삭제 완료')
    
    // 4. 뉴스/커뮤니티 데이터의 issue_id를 NULL로 리셋
    const { error: newsResetError } = await supabase
        .from('news_data')
        .update({ issue_id: null })
        .not('issue_id', 'is', null)
    
    if (newsResetError) {
        console.error('❌ 뉴스 데이터 리셋 실패:', newsResetError)
    } else {
        console.log('✅ 뉴스 데이터 issue_id 리셋 완료')
    }
    
    const { error: communityResetError } = await supabase
        .from('community_data')
        .update({ issue_id: null })
        .not('issue_id', 'is', null)
    
    if (communityResetError) {
        console.error('❌ 커뮤니티 데이터 리셋 실패:', communityResetError)
    } else {
        console.log('✅ 커뮤니티 데이터 issue_id 리셋 완료')
    }
    
    // 5. 최종 확인
    const { count: finalCount } = await supabase
        .from('issues')
        .select('*', { count: 'exact', head: true })
    
    console.log(`\n📊 최종 이슈 개수: ${finalCount}개`)
    console.log('\n✨ 리셋 완료! 트랙 A 테스트를 시작할 수 있습니다.\n')
}

resetForTrackATest().catch(console.error)
