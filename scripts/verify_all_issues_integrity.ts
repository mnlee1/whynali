/**
 * scripts/verify_all_issues_integrity.ts
 * 
 * [전체 이슈 무결성 검증]
 * 
 * 관리자 페이지에 표시되는 모든 이슈를 검증합니다:
 * 1. source_track 값 검증 (null, track_a, manual 분포)
 * 2. approval_status 값 검증 (대기, 승인, 반려 분포)
 * 3. 트랙A 프로세스 준수 여부 (커뮤니티/뉴스 연결)
 * 4. 이상 데이터 탐지
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

interface IssueSummary {
    id: string
    title: string
    source_track: string | null
    approval_status: string
    approval_type: string | null
    heat_index: number | null
    created_at: string
    community_count?: number
    news_count?: number
}

async function verifyAllIssues() {
    console.log('═'.repeat(80))
    console.log('전체 이슈 무결성 검증')
    console.log('═'.repeat(80))
    console.log('')

    // 1. 모든 이슈 조회 (병합된 이슈 제외)
    const { data: issues, error } = await supabase
        .from('issues')
        .select('*')
        .not('approval_status', 'is', null)
        .neq('approval_status', '병합됨')
        .is('merged_into_id', null)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('❌ 조회 실패:', error)
        return
    }

    if (!issues || issues.length === 0) {
        console.log('이슈가 없습니다.')
        return
    }

    console.log(`📊 총 ${issues.length}개 이슈 검증 시작\n`)

    // 2. source_track 분포
    const sourceTrackDistribution: Record<string, number> = {}
    issues.forEach(issue => {
        const key = issue.source_track ?? 'null'
        sourceTrackDistribution[key] = (sourceTrackDistribution[key] || 0) + 1
    })

    console.log('1️⃣  source_track 분포')
    console.log('─'.repeat(80))
    Object.entries(sourceTrackDistribution)
        .sort((a, b) => b[1] - a[1])
        .forEach(([key, count]) => {
            const percent = ((count / issues.length) * 100).toFixed(1)
            console.log(`  ${key.padEnd(15)}: ${count.toString().padStart(4)}개 (${percent}%)`)
        })
    console.log('')

    // 3. approval_status 분포
    const approvalDistribution: Record<string, number> = {}
    issues.forEach(issue => {
        const key = issue.approval_status ?? 'null'
        approvalDistribution[key] = (approvalDistribution[key] || 0) + 1
    })

    console.log('2️⃣  approval_status 분포')
    console.log('─'.repeat(80))
    Object.entries(approvalDistribution)
        .sort((a, b) => b[1] - a[1])
        .forEach(([key, count]) => {
            const percent = ((count / issues.length) * 100).toFixed(1)
            console.log(`  ${key.padEnd(15)}: ${count.toString().padStart(4)}개 (${percent}%)`)
        })
    console.log('')

    // 4. approval_type 분포 (승인된 이슈만)
    const approvedIssues = issues.filter(i => i.approval_status === '승인')
    const approvalTypeDistribution: Record<string, number> = {}
    approvedIssues.forEach(issue => {
        const key = issue.approval_type ?? 'null'
        approvalTypeDistribution[key] = (approvalTypeDistribution[key] || 0) + 1
    })

    console.log('3️⃣  approval_type 분포 (승인된 이슈만)')
    console.log('─'.repeat(80))
    Object.entries(approvalTypeDistribution)
        .sort((a, b) => b[1] - a[1])
        .forEach(([key, count]) => {
            const percent = ((count / approvedIssues.length) * 100).toFixed(1)
            console.log(`  ${key.padEnd(15)}: ${count.toString().padStart(4)}개 (${percent}%)`)
        })
    console.log('')

    // 5. 트랙A 이슈 검증 (커뮤니티/뉴스 연결)
    console.log('4️⃣  트랙A 이슈 검증 (커뮤니티/뉴스 연결)')
    console.log('─'.repeat(80))
    
    const trackAIssues = issues.filter(i => i.source_track === 'track_a')
    console.log(`트랙A 이슈 ${trackAIssues.length}개 검증 중...\n`)

    const issuesWithoutCommunity: IssueSummary[] = []
    const issuesWithoutNews: IssueSummary[] = []

    for (const issue of trackAIssues) {
        // 커뮤니티 연결 확인
        const { count: communityCount } = await supabase
            .from('community_data')
            .select('*', { count: 'exact', head: true })
            .eq('issue_id', issue.id)

        // 뉴스 연결 확인
        const { count: newsCount } = await supabase
            .from('news_data')
            .select('*', { count: 'exact', head: true })
            .eq('issue_id', issue.id)

        if ((communityCount ?? 0) === 0) {
            issuesWithoutCommunity.push({
                id: issue.id,
                title: issue.title,
                source_track: issue.source_track,
                approval_status: issue.approval_status,
                approval_type: issue.approval_type,
                heat_index: issue.heat_index,
                created_at: issue.created_at,
                community_count: 0,
                news_count: newsCount ?? 0,
            })
        }

        if ((newsCount ?? 0) === 0) {
            issuesWithoutNews.push({
                id: issue.id,
                title: issue.title,
                source_track: issue.source_track,
                approval_status: issue.approval_status,
                approval_type: issue.approval_type,
                heat_index: issue.heat_index,
                created_at: issue.created_at,
                community_count: communityCount ?? 0,
                news_count: 0,
            })
        }
    }

    if (issuesWithoutCommunity.length > 0) {
        console.log(`⚠️  커뮤니티 글이 연결되지 않은 트랙A 이슈: ${issuesWithoutCommunity.length}개`)
        issuesWithoutCommunity.slice(0, 5).forEach(issue => {
            console.log(`   - ${issue.title.substring(0, 50)} (뉴스: ${issue.news_count}건)`)
        })
        if (issuesWithoutCommunity.length > 5) {
            console.log(`   ... 외 ${issuesWithoutCommunity.length - 5}개`)
        }
        console.log('')
    } else {
        console.log('✅ 모든 트랙A 이슈에 커뮤니티 글이 연결되어 있습니다.')
    }

    if (issuesWithoutNews.length > 0) {
        console.log(`⚠️  뉴스가 연결되지 않은 트랙A 이슈: ${issuesWithoutNews.length}개`)
        issuesWithoutNews.slice(0, 5).forEach(issue => {
            console.log(`   - ${issue.title.substring(0, 50)} (커뮤니티: ${issue.community_count}건)`)
        })
        if (issuesWithoutNews.length > 5) {
            console.log(`   ... 외 ${issuesWithoutNews.length - 5}개`)
        }
        console.log('')
    } else {
        console.log('✅ 모든 트랙A 이슈에 뉴스가 연결되어 있습니다.')
    }

    // 6. 이상 데이터 탐지
    console.log('')
    console.log('5️⃣  이상 데이터 탐지')
    console.log('─'.repeat(80))

    const anomalies: Array<{ issue: any; reason: string }> = []

    issues.forEach(issue => {
        // source_track이 null인 경우
        if (issue.source_track === null) {
            anomalies.push({
                issue,
                reason: 'source_track이 null'
            })
        }

        // 승인되었는데 approval_type이 null
        if (issue.approval_status === '승인' && issue.approval_type === null) {
            anomalies.push({
                issue,
                reason: '승인되었으나 approval_type이 null'
            })
        }

        // 화력이 너무 낮은데 승인됨
        if (issue.approval_status === '승인' && (issue.heat_index ?? 0) < 15) {
            anomalies.push({
                issue,
                reason: `화력 ${issue.heat_index ?? 0}점으로 기준(15점) 미달인데 승인됨`
            })
        }

        // 대기 상태인데 approved_at이 있음
        if (issue.approval_status === '대기' && issue.approved_at !== null) {
            anomalies.push({
                issue,
                reason: '대기 상태인데 approved_at 값이 있음'
            })
        }
    })

    if (anomalies.length > 0) {
        console.log(`⚠️  ${anomalies.length}개의 이상 데이터 발견:\n`)
        anomalies.slice(0, 10).forEach(({ issue, reason }) => {
            console.log(`  • ${reason}`)
            console.log(`    제목: ${issue.title.substring(0, 60)}`)
            console.log(`    ID: ${issue.id}`)
            console.log(`    생성일: ${issue.created_at}`)
            console.log('')
        })
        if (anomalies.length > 10) {
            console.log(`  ... 외 ${anomalies.length - 10}개\n`)
        }
    } else {
        console.log('✅ 이상 데이터가 발견되지 않았습니다.\n')
    }

    // 7. 최근 생성된 이슈 샘플
    console.log('6️⃣  최근 생성된 이슈 (최신 5개)')
    console.log('─'.repeat(80))
    issues.slice(0, 5).forEach((issue, idx) => {
        console.log(`${idx + 1}. ${issue.title.substring(0, 60)}`)
        console.log(`   source_track: ${issue.source_track ?? 'null'} | approval: ${issue.approval_status} | 화력: ${issue.heat_index ?? 0}`)
        console.log(`   생성: ${issue.created_at}`)
        console.log('')
    })

    // 요약
    console.log('═'.repeat(80))
    console.log('검증 요약')
    console.log('═'.repeat(80))
    console.log(`총 이슈 수: ${issues.length}개`)
    console.log(`트랙A 이슈: ${trackAIssues.length}개`)
    console.log(`수동 생성: ${sourceTrackDistribution['manual'] ?? 0}개`)
    console.log(`source_track null: ${sourceTrackDistribution['null'] ?? 0}개`)
    console.log(`승인된 이슈: ${approvedIssues.length}개`)
    console.log(`대기 중: ${approvalDistribution['대기'] ?? 0}개`)
    console.log(`반려됨: ${approvalDistribution['반려'] ?? 0}개`)
    console.log(`이상 데이터: ${anomalies.length}개`)
    console.log('═'.repeat(80))
}

verifyAllIssues().catch(console.error)
