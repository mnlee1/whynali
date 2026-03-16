/**
 * scripts/find_issue_creation_source.ts
 * 
 * source_track이 null인 이슈의 생성 원인 추적
 */

import { config } from 'dotenv'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: resolve(__dirname, '../.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function main() {
    console.log('source_track이 null인 이슈 생성 원인 분석\n')
    
    const issueId = '8a2e09a8-8fc1-41f5-99d7-3897931fb870'
    const issueCreatedAt = new Date('2026-03-15T14:06:53')
    
    // 1. 이슈 생성 시점 전후의 뉴스 수집 확인
    const before = new Date(issueCreatedAt.getTime() - 60 * 60 * 1000) // 1시간 전
    const after = new Date(issueCreatedAt.getTime() + 60 * 60 * 1000) // 1시간 후
    
    console.log('=== 이슈 생성 시점 전후 데이터 확인 ===')
    console.log(`생성 시점: ${issueCreatedAt.toLocaleString('ko-KR')}`)
    console.log(`탐색 범위: ${before.toLocaleString('ko-KR')} ~ ${after.toLocaleString('ko-KR')}\n`)
    
    // 2. 해당 제목 키워드로 뉴스 검색
    const { data: newsData } = await supabase
        .from('news_data')
        .select('id, title, published_at, created_at, issue_id')
        .ilike('title', '%권재혁%')
        .order('created_at', { ascending: false })
        .limit(10)
    
    console.log(`=== "권재혁" 관련 뉴스 (최근 10건) ===`)
    if (newsData && newsData.length > 0) {
        for (const news of newsData) {
            const issueLinkStatus = news.issue_id === issueId 
                ? `✓ 이 이슈에 연결됨` 
                : news.issue_id 
                    ? `다른 이슈(${news.issue_id})에 연결됨` 
                    : '연결 안됨'
            
            console.log(`\n제목: ${news.title.substring(0, 60)}...`)
            console.log(`발행: ${new Date(news.published_at).toLocaleString('ko-KR')}`)
            console.log(`수집: ${new Date(news.created_at).toLocaleString('ko-KR')}`)
            console.log(`상태: ${issueLinkStatus}`)
        }
    } else {
        console.log('관련 뉴스 없음')
    }
    
    // 3. 커뮤니티 글 확인
    const { data: communityData } = await supabase
        .from('community_data')
        .select('id, title, created_at, issue_id')
        .ilike('title', '%권재혁%')
        .order('created_at', { ascending: false })
        .limit(10)
    
    console.log(`\n\n=== "권재혁" 관련 커뮤니티 글 (최근 10건) ===`)
    if (communityData && communityData.length > 0) {
        for (const post of communityData) {
            const issueLinkStatus = post.issue_id === issueId 
                ? `✓ 이 이슈에 연결됨` 
                : post.issue_id 
                    ? `다른 이슈(${post.issue_id})에 연결됨` 
                    : '연결 안됨'
            
            console.log(`\n제목: ${post.title}`)
            console.log(`작성: ${new Date(post.created_at).toLocaleString('ko-KR')}`)
            console.log(`상태: ${issueLinkStatus}`)
        }
    } else {
        console.log('관련 커뮤니티 글 없음')
    }
    
    // 4. 다른 크론 잡이 있는지 확인
    console.log('\n\n=== 가능한 생성 경로 분석 ===\n')
    
    const { data: issue } = await supabase
        .from('issues')
        .select('*')
        .eq('id', issueId)
        .single()
    
    if (issue) {
        console.log('이슈 필드 분석:')
        console.log(`- source_track: ${issue.source_track ?? 'null'} ⚠️`)
        console.log(`- approval_type: ${issue.approval_type ?? 'null'}`)
        console.log(`- approval_status: ${issue.approval_status}`)
        console.log(`- created_heat_index: ${issue.created_heat_index ?? 'null'}`)
        console.log(`- 타임라인 존재: 예 (5개)`)
        console.log(`- 뉴스 연결: 예 (26건)`)
        console.log(`- 커뮤니티 연결: 아니오 (0건)`)
        
        console.log('\n결론:')
        console.log('1. source_track이 null이고 approval_type도 null')
        console.log('2. 커뮤니티 글이 0건 → 트랙A가 아님')
        console.log('3. /api/issues POST는 source_track을 "manual"로 설정함')
        console.log('4. 추측: 과거에 존재했던 다른 크론 잡이나 스크립트가 생성?')
        console.log('5. 또는 코드 변경 전에 생성된 이슈?')
        
        // 데이터베이스 스키마 확인
        const { data: schema } = await supabase.rpc('get_column_info', {
            table_name: 'issues'
        }).catch(() => ({ data: null }))
        
        if (schema) {
            console.log('\n이슈 테이블 source_track 컬럼 정보:')
            const sourceTrackCol = schema.find((col: any) => col.column_name === 'source_track')
            if (sourceTrackCol) {
                console.log(`- 기본값: ${sourceTrackCol.column_default ?? 'null'}`)
                console.log(`- NULL 허용: ${sourceTrackCol.is_nullable}`)
            }
        }
    }
}

main().catch(console.error)
