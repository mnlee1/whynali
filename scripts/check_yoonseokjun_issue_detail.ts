/**
 * scripts/check_yoonseokjun_issue_detail.ts
 * 
 * 윤석준 이슈 상세 확인
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
    console.log('='.repeat(80))
    console.log('윤석준 대구 동구청장 이슈 상세 확인')
    console.log('='.repeat(80))
    console.log()

    // 1. 이슈 검색
    const { data: issues, error: issueError } = await supabase
        .from('issues')
        .select('*')
        .ilike('title', '%윤석준%')
        .order('created_at', { ascending: false })

    if (issueError) {
        console.error('❌ 이슈 조회 실패:', issueError.message)
        process.exit(1)
    }

    if (!issues || issues.length === 0) {
        console.log('❌ "윤석준" 관련 이슈를 찾을 수 없습니다.')
        process.exit(0)
    }

    console.log(`📋 총 ${issues.length}개 이슈 발견\n`)

    for (const issue of issues) {
        console.log('='.repeat(80))
        console.log('이슈 기본 정보')
        console.log('='.repeat(80))
        console.log(`제목: ${issue.title}`)
        console.log(`ID: ${issue.id}`)
        console.log(`카테고리: ${issue.category}`)
        console.log(`상태: ${issue.status}`)
        console.log(`승인 상태: ${issue.approval_status}`)
        console.log(`승인 타입: ${issue.approval_type || 'N/A'}`)
        console.log(`소스 트랙: ${issue.source_track || 'N/A'}`)
        console.log()
        console.log(`화력 추이:`)
        console.log(`  - 등록 시점: ${issue.created_heat_index || 'N/A'}점`)
        console.log(`  - 현재: ${issue.heat_index || 'N/A'}점`)
        console.log(`  - 변화: ${issue.created_heat_index && issue.heat_index ? issue.heat_index - issue.created_heat_index : 'N/A'}점`)
        console.log()
        console.log(`생성일: ${new Date(issue.created_at).toLocaleString('ko-KR')}`)
        console.log(`승인일: ${issue.approved_at ? new Date(issue.approved_at).toLocaleString('ko-KR') : 'N/A'}`)
        console.log()

        // 2. 연결된 뉴스 확인
        const { data: news, error: newsError } = await supabase
            .from('news_data')
            .select('id, title, source, published_at, created_at')
            .eq('issue_id', issue.id)
            .order('published_at', { ascending: true })

        if (newsError) {
            console.error('❌ 뉴스 조회 실패:', newsError.message)
        } else {
            console.log('='.repeat(80))
            console.log(`연결된 뉴스: ${news?.length || 0}개`)
            console.log('='.repeat(80))
            
            if (news && news.length > 0) {
                // 시간 가중치 계산
                const now = Date.now()
                let totalWeight = 0
                const sources = new Set<string>()
                
                for (const n of news) {
                    const age = now - new Date(n.created_at).getTime()
                    const daysSinceCreated = age / (1000 * 60 * 60 * 24)
                    
                    let weight = 1.0
                    if (daysSinceCreated <= 7) weight = 1.0
                    else if (daysSinceCreated >= 30) weight = 0.1
                    else weight = 1.0 - ((daysSinceCreated - 7) / 23) * 0.9
                    
                    totalWeight += weight
                    sources.add(n.source)
                    
                    const ageInfo = daysSinceCreated < 1 
                        ? `${Math.floor(daysSinceCreated * 24)}시간 전`
                        : `${Math.floor(daysSinceCreated)}일 전`
                    
                    console.log(`\n[${n.source}] ${n.title}`)
                    console.log(`  발행: ${new Date(n.published_at).toLocaleString('ko-KR')}`)
                    console.log(`  수집: ${ageInfo} (가중치: ${weight.toFixed(2)})`)
                }
                
                console.log()
                console.log('뉴스 통계:')
                console.log(`  - 총 뉴스: ${news.length}건`)
                console.log(`  - 시간 가중 뉴스: ${totalWeight.toFixed(2)}건`)
                console.log(`  - 고유 출처: ${sources.size}개`)
                console.log()
            }
        }

        // 3. 연결된 커뮤니티 확인
        const { data: community, error: communityError } = await supabase
            .from('community_data')
            .select('id, title, source, view_count, comment_count, created_at')
            .eq('issue_id', issue.id)
            .order('created_at', { ascending: true })

        if (communityError) {
            console.error('❌ 커뮤니티 조회 실패:', communityError.message)
        } else {
            console.log('='.repeat(80))
            console.log(`연결된 커뮤니티 글: ${community?.length || 0}개`)
            console.log('='.repeat(80))
            
            if (community && community.length > 0) {
                // 시간 가중치 계산
                const now = Date.now()
                let totalViews = 0
                let totalComments = 0
                let weightedViews = 0
                let weightedComments = 0
                
                for (const c of community) {
                    const age = now - new Date(c.created_at).getTime()
                    const daysSinceCreated = age / (1000 * 60 * 60 * 24)
                    
                    let weight = 1.0
                    if (daysSinceCreated <= 7) weight = 1.0
                    else if (daysSinceCreated >= 30) weight = 0.1
                    else weight = 1.0 - ((daysSinceCreated - 7) / 23) * 0.9
                    
                    totalViews += (c.view_count || 0)
                    totalComments += (c.comment_count || 0)
                    weightedViews += (c.view_count || 0) * weight
                    weightedComments += (c.comment_count || 0) * weight
                    
                    const ageInfo = daysSinceCreated < 1 
                        ? `${Math.floor(daysSinceCreated * 24)}시간 전`
                        : `${Math.floor(daysSinceCreated)}일 전`
                    
                    console.log(`\n[${c.source}] ${c.title}`)
                    console.log(`  조회: ${c.view_count || 0}, 댓글: ${c.comment_count || 0}`)
                    console.log(`  수집: ${ageInfo} (가중치: ${weight.toFixed(2)})`)
                }
                
                console.log()
                console.log('커뮤니티 통계:')
                console.log(`  - 총 조회수: ${totalViews}회 → 가중: ${weightedViews.toFixed(0)}회`)
                console.log(`  - 총 댓글: ${totalComments}개 → 가중: ${weightedComments.toFixed(0)}개`)
                console.log()
            }
        }

        // 4. 화력 계산 검증
        console.log('='.repeat(80))
        console.log('화력 계산 검증')
        console.log('='.repeat(80))
        
        const newsCount = news?.length || 0
        const communityCount = community?.length || 0
        
        console.log(`등록 기준: 화력 15점 이상`)
        console.log(`현재 화력: ${issue.heat_index}점`)
        console.log()
        
        if (issue.created_heat_index && issue.created_heat_index >= 15) {
            console.log(`✅ 등록 시점 화력 ${issue.created_heat_index}점으로 정상 등록됨`)
        } else if (!issue.created_heat_index) {
            console.log(`⚠️  등록 시점 화력 기록 없음 (created_heat_index = null)`)
        } else {
            console.log(`❌ 등록 시점 화력 ${issue.created_heat_index}점으로 기준 미달 (15점 미만)`)
        }
        
        if (issue.heat_index && issue.heat_index >= 15) {
            console.log(`✅ 현재 화력 ${issue.heat_index}점으로 기준 충족`)
        } else {
            console.log(`⚠️  현재 화력 ${issue.heat_index}점으로 기준 미달`)
        }
        
        console.log()
        console.log('데이터 연결 상태:')
        console.log(`  - 뉴스: ${newsCount}건`)
        console.log(`  - 커뮤니티: ${communityCount}건`)
        
        if (newsCount === 0) {
            console.log(`  ❌ 연결된 뉴스 없음 (비정상)`)
        }
        
        console.log()
    }

    console.log('='.repeat(80))
    console.log('검증 완료')
    console.log('='.repeat(80))
}

main().catch(console.error)
