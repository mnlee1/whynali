/**
 * scripts/fix-musinsa-category.ts
 * 
 * 무신사 이슈 카테고리를 수동으로 수정하는 스크립트
 */

// 환경변수 로드
import dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(__dirname, '../.env.local') })

import { supabaseAdmin } from '../lib/supabase/server'

async function fixMusinsaCategory() {
    console.log('=== 무신사 이슈 카테고리 수정 ===\n')

    const issueId = 'eda4c92d-d0ba-45c3-a068-b5a4ce40ea79'
    const newCategory = '기술'

    // 1. 카테고리 업데이트
    const { error: updateError } = await supabaseAdmin
        .from('issues')
        .update({ category: newCategory })
        .eq('id', issueId)

    if (updateError) {
        console.error('❌ 카테고리 업데이트 에러:', updateError)
        return
    }

    console.log('✅ 카테고리 업데이트 완료: 스포츠 → 기술\n')

    // 2. 잘못 연결된 뉴스 연결 해제
    console.log('잘못 연결된 스포츠 뉴스 해제 중...\n')

    const { data: linkedNews } = await supabaseAdmin
        .from('news_data')
        .select('id, title, category')
        .eq('issue_id', issueId)

    if (linkedNews && linkedNews.length > 0) {
        console.log(`현재 연결된 뉴스: ${linkedNews.length}건`)
        
        // 스포츠 카테고리 뉴스는 무신사 이슈와 무관하므로 모두 연결 해제
        const sportsNewsIds = linkedNews
            .filter(n => n.category === '스포츠')
            .map(n => n.id)

        if (sportsNewsIds.length > 0) {
            const { error: unlinkError } = await supabaseAdmin
                .from('news_data')
                .update({ issue_id: null })
                .in('id', sportsNewsIds)

            if (unlinkError) {
                console.error('❌ 뉴스 연결 해제 에러:', unlinkError)
            } else {
                console.log(`✅ 스포츠 뉴스 ${sportsNewsIds.length}건 연결 해제 완료\n`)
            }
        }
    }

    // 3. 새로운 관련 뉴스 찾기
    console.log('무신사 관련 뉴스 검색 중...\n')

    const { data: musinsaNews, error: searchError } = await supabaseAdmin
        .from('news_data')
        .select('id, title, source, created_at')
        .ilike('title', '%무신사%')
        .is('issue_id', null)
        .order('created_at', { ascending: false })
        .limit(10)

    if (searchError) {
        console.error('❌ 뉴스 검색 에러:', searchError)
    } else if (musinsaNews && musinsaNews.length > 0) {
        console.log(`발견된 무신사 관련 미연결 뉴스: ${musinsaNews.length}건\n`)
        
        musinsaNews.forEach((n, idx) => {
            console.log(`  ${idx + 1}. ${n.title.substring(0, 70)}... (${n.source})`)
        })

        // 관련 뉴스 자동 연결
        const newsIdsToLink = musinsaNews.map(n => n.id)

        const { error: linkError } = await supabaseAdmin
            .from('news_data')
            .update({ issue_id: issueId })
            .in('id', newsIdsToLink)

        if (linkError) {
            console.error('\n❌ 뉴스 연결 에러:', linkError)
        } else {
            console.log(`\n✅ ${newsIdsToLink.length}건의 무신사 관련 뉴스 연결 완료`)
        }
    } else {
        console.log('추가로 연결할 무신사 관련 뉴스를 찾지 못했습니다.')
    }

    // 4. 최종 확인
    console.log('\n=== 최종 확인 ===\n')

    const { data: issue } = await supabaseAdmin
        .from('issues')
        .select('id, title, category, heat_index')
        .eq('id', issueId)
        .single()

    const { count: newsCount } = await supabaseAdmin
        .from('news_data')
        .select('id', { count: 'exact', head: true })
        .eq('issue_id', issueId)

    if (issue) {
        console.log(`제목: ${issue.title}`)
        console.log(`카테고리: ${issue.category}`)
        console.log(`화력: ${issue.heat_index}점`)
        console.log(`연결된 뉴스: ${newsCount}건`)
        console.log('\n✅ 모든 수정 완료!')
    }
}

fixMusinsaCategory().catch(console.error)
