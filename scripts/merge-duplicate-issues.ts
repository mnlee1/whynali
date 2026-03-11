/**
 * scripts/merge-duplicate-issues.ts
 * 
 * 중복 이슈 병합
 */

// 환경변수 로드
import dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(__dirname, '../.env.local') })

import { supabaseAdmin } from '../lib/supabase/server'

async function mergeDuplicateIssues() {
    console.log('=== 유한재단 중복 이슈 병합 ===\n')

    const title1 = '유한재단, 사회보장정보원과 돌봄 청소년·청년 지원 업무협약 체결'
    const title2 = '유한재단, 한국사회보장정보원과 맞손…돌봄 청소년·청년 지원사업 추'

    // 1. 이슈 조회
    const { data: issues } = await supabaseAdmin
        .from('issues')
        .select('id, title, category, created_at, created_heat_index')
        .or(`title.eq.${title1},title.eq.${title2}`)
        .order('created_at', { ascending: true })

    if (!issues || issues.length !== 2) {
        console.log(`❌ 이슈를 찾을 수 없습니다. (${issues?.length || 0}건 발견)`)
        return
    }

    const [keepIssue, deleteIssue] = issues
    
    console.log('📋 발견된 이슈:\n')
    console.log(`유지할 이슈 (먼저 생성):`)
    console.log(`  ID: ${keepIssue.id}`)
    console.log(`  제목: ${keepIssue.title}`)
    console.log(`  카테고리: ${keepIssue.category}`)
    console.log(`  화력: ${keepIssue.created_heat_index}`)
    console.log(`  생성: ${new Date(keepIssue.created_at).toLocaleString()}\n`)

    console.log(`삭제할 이슈 (나중 생성):`)
    console.log(`  ID: ${deleteIssue.id}`)
    console.log(`  제목: ${deleteIssue.title}`)
    console.log(`  카테고리: ${deleteIssue.category}`)
    console.log(`  화력: ${deleteIssue.created_heat_index}`)
    console.log(`  생성: ${new Date(deleteIssue.created_at).toLocaleString()}\n`)

    console.log('━'.repeat(80) + '\n')

    // 2. 연결된 뉴스 확인
    const { data: keepNews, count: keepNewsCount } = await supabaseAdmin
        .from('news_data')
        .select('id', { count: 'exact' })
        .eq('issue_id', keepIssue.id)

    const { data: deleteNews, count: deleteNewsCount } = await supabaseAdmin
        .from('news_data')
        .select('id', { count: 'exact' })
        .eq('issue_id', deleteIssue.id)

    console.log(`연결된 뉴스:`)
    console.log(`  유지 이슈: ${keepNewsCount}건`)
    console.log(`  삭제 이슈: ${deleteNewsCount}건\n`)

    // 3. 연결된 커뮤니티 확인
    const { data: keepCommunity, count: keepCommunityCount } = await supabaseAdmin
        .from('community_data')
        .select('id', { count: 'exact' })
        .eq('issue_id', keepIssue.id)

    const { data: deleteCommunity, count: deleteCommunityCount } = await supabaseAdmin
        .from('community_data')
        .select('id', { count: 'exact' })
        .eq('issue_id', deleteIssue.id)

    console.log(`연결된 커뮤니티:`)
    console.log(`  유지 이슈: ${keepCommunityCount}건`)
    console.log(`  삭제 이슈: ${deleteCommunityCount}건\n`)

    console.log('━'.repeat(80) + '\n')

    // 4. 병합 작업
    console.log('🔄 병합 작업 시작...\n')

    // 4-1. 삭제 이슈의 뉴스를 유지 이슈로 이동
    if (deleteNewsCount && deleteNewsCount > 0) {
        const { error: newsError } = await supabaseAdmin
            .from('news_data')
            .update({ issue_id: keepIssue.id })
            .eq('issue_id', deleteIssue.id)

        if (newsError) {
            console.error('❌ 뉴스 이동 실패:', newsError)
            return
        }
        console.log(`✅ 뉴스 ${deleteNewsCount}건 이동 완료`)
    }

    // 4-2. 삭제 이슈의 커뮤니티를 유지 이슈로 이동
    if (deleteCommunityCount && deleteCommunityCount > 0) {
        const { error: communityError } = await supabaseAdmin
            .from('community_data')
            .update({ issue_id: keepIssue.id })
            .eq('issue_id', deleteIssue.id)

        if (communityError) {
            console.error('❌ 커뮤니티 이동 실패:', communityError)
            return
        }
        console.log(`✅ 커뮤니티 ${deleteCommunityCount}건 이동 완료`)
    }

    // 4-3. 삭제 이슈 삭제
    const { error: deleteError } = await supabaseAdmin
        .from('issues')
        .delete()
        .eq('id', deleteIssue.id)

    if (deleteError) {
        console.error('❌ 이슈 삭제 실패:', deleteError)
        return
    }
    console.log(`✅ 중복 이슈 삭제 완료`)

    console.log('\n━'.repeat(80) + '\n')

    // 5. 결과 확인
    const { data: finalNews, count: finalNewsCount } = await supabaseAdmin
        .from('news_data')
        .select('id', { count: 'exact' })
        .eq('issue_id', keepIssue.id)

    const { data: finalCommunity, count: finalCommunityCount } = await supabaseAdmin
        .from('community_data')
        .select('id', { count: 'exact' })
        .eq('issue_id', keepIssue.id)

    console.log('✅ 병합 완료!\n')
    console.log(`최종 결과:`)
    console.log(`  이슈 ID: ${keepIssue.id}`)
    console.log(`  제목: ${keepIssue.title}`)
    console.log(`  연결 뉴스: ${finalNewsCount}건 (기존 ${keepNewsCount} + 이동 ${deleteNewsCount})`)
    console.log(`  연결 커뮤니티: ${finalCommunityCount}건 (기존 ${keepCommunityCount} + 이동 ${deleteCommunityCount})\n`)

    console.log('━'.repeat(80) + '\n')

    console.log('💡 향후 방지:\n')
    console.log('  토크나이저 개선으로 향후 이런 케이스는 자동으로 묶입니다.')
    console.log('  - "XXX과/와" 조사 자동 제거')
    console.log('  - "한국XXX" → "XXX" 정규화 (4글자 이상)\n')
}

mergeDuplicateIssues().catch(console.error)
