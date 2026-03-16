/**
 * scripts/check-musinsa-issue.ts
 * 
 * 무신사 이슈를 찾아서 현재 카테고리와 연결된 뉴스를 확인하는 스크립트
 */

// 환경변수 로드
import dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(__dirname, '../.env.local') })

import { supabaseAdmin } from '../lib/supabase/server'

async function checkMusinsaIssue() {
    console.log('=== 무신사 이슈 확인 ===\n')

    // 1. 무신사 관련 이슈 검색
    const { data: issues, error } = await supabaseAdmin
        .from('issues')
        .select('id, title, category, heat_index, approval_status, created_at')
        .ilike('title', '%무신사%')
        .order('created_at', { ascending: false })

    if (error) {
        console.error('이슈 조회 에러:', error)
        return
    }

    if (!issues || issues.length === 0) {
        console.log('무신사 관련 이슈를 찾을 수 없습니다.')
        return
    }

    console.log(`총 ${issues.length}개 무신사 이슈 발견\n`)

    // 2. 각 이슈별 상세 정보 확인
    for (const issue of issues) {
        console.log('━'.repeat(80))
        console.log(`제목: ${issue.title}`)
        console.log(`ID: ${issue.id}`)
        console.log(`카테고리: ${issue.category}`)
        console.log(`화력: ${issue.heat_index ?? 'null'}점`)
        console.log(`승인 상태: ${issue.approval_status}`)
        console.log(`등록일: ${issue.created_at}`)

        // 연결된 뉴스 확인
        const { data: news, error: newsError } = await supabaseAdmin
            .from('news_data')
            .select('id, title, source, category, created_at')
            .eq('issue_id', issue.id)
            .order('created_at', { ascending: false })
            .limit(10)

        if (newsError) {
            console.error('뉴스 조회 에러:', newsError)
        } else if (news && news.length > 0) {
            console.log(`\n연결된 뉴스 (${news.length}건):`)
            news.forEach((n, idx) => {
                console.log(`  ${idx + 1}. [${n.category ?? '미분류'}] ${n.title.substring(0, 60)}... (${n.source})`)
            })
        } else {
            console.log('\n연결된 뉴스: 없음')
        }

        // 연결된 커뮤니티 글 확인
        const { data: community, error: communityError } = await supabaseAdmin
            .from('community_data')
            .select('id, title, source_site, created_at')
            .eq('issue_id', issue.id)
            .order('created_at', { ascending: false })
            .limit(5)

        if (communityError) {
            console.error('커뮤니티 조회 에러:', communityError)
        } else if (community && community.length > 0) {
            console.log(`\n연결된 커뮤니티 글 (${community.length}건):`)
            community.forEach((c, idx) => {
                console.log(`  ${idx + 1}. ${c.title.substring(0, 60)}... (${c.source_site})`)
            })
        } else {
            console.log('\n연결된 커뮤니티 글: 없음')
        }

        console.log('\n')
    }

    console.log('━'.repeat(80))
    console.log('\n=== 문제 분석 ===\n')
    
    const wrongCategoryIssues = issues.filter(i => i.category === '스포츠')
    if (wrongCategoryIssues.length > 0) {
        console.log(`⚠️  스포츠 카테고리로 잘못 분류된 이슈: ${wrongCategoryIssues.length}개`)
        wrongCategoryIssues.forEach(i => {
            console.log(`   - "${i.title}"`)
        })
        console.log('\n올바른 카테고리: 기술 (이커머스 플랫폼의 신규 서비스)')
        console.log('\n재분류 방법:')
        console.log('  1. 특정 이슈만: npx tsx scripts/reclassify-single-issue.ts <issue_id>')
        console.log('  2. 스포츠 전체: npx tsx scripts/reclassify-issues.ts --category 스포츠 --dry-run')
    } else {
        console.log('✅ 모든 무신사 이슈가 올바른 카테고리로 분류되어 있습니다.')
    }
}

checkMusinsaIssue().catch(console.error)
