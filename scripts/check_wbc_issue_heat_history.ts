/**
 * scripts/check_wbc_issue_heat_history.ts
 * 
 * WBC 이슈의 화력 변화 추적
 * 
 * 현재 화력: 18점
 * 최소 기준: 15점
 * 상태: 반려 (auto)
 * 
 * 어느 시점에 화력이 15점 미만으로 떨어져 자동 반려되었는지 추적
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabaseAdmin = createClient(supabaseUrl, supabaseKey)

async function main() {
    console.log('=== WBC 이슈 화력 변화 추적 ===\n')

    const issueTitle = '"WBC 점수 조작 죄송"…대만에서 \'혐한\' 마케팅 펼친 한국 기업'
    const issueId = 'e95ec64d-18ff-45e3-b56f-dd671f75876b'

    // 1. 이슈 정보
    const { data: issue } = await supabaseAdmin
        .from('issues')
        .select('*')
        .eq('id', issueId)
        .single()

    console.log('[ 현재 이슈 상태 ]')
    console.log(`제목: ${issue.title}`)
    console.log(`현재 화력: ${issue.heat_index}점`)
    console.log(`approval_status: ${issue.approval_status}`)
    console.log(`approval_type: ${issue.approval_type}`)
    console.log(`생성: ${issue.created_at}`)
    console.log(`최종 수정: ${issue.updated_at}`)
    console.log()

    // 2. 연결된 뉴스 개수 및 최신 날짜
    const { data: news, count: newsCount } = await supabaseAdmin
        .from('issue_news')
        .select('news_id', { count: 'exact' })
        .eq('issue_id', issueId)

    console.log('[ 연결된 뉴스 ]')
    console.log(`총 ${newsCount}개`)

    if (news && news.length > 0) {
        // 뉴스 상세 정보 조회
        const newsIds = news.map(n => n.news_id)
        const { data: newsDetails } = await supabaseAdmin
            .from('news')
            .select('published_at')
            .in('id', newsIds)
            .order('published_at', { ascending: false })

        if (newsDetails && newsDetails.length > 0) {
            console.log(`최신 뉴스: ${newsDetails[0].published_at}`)
            console.log(`가장 오래된 뉴스: ${newsDetails[newsDetails.length - 1].published_at}`)
        }
    }
    console.log()

    // 3. 연결된 커뮤니티 글 개수
    const { count: communityCount } = await supabaseAdmin
        .from('issue_community_posts')
        .select('*', { count: 'exact', head: true })
        .eq('issue_id', issueId)

    console.log('[ 연결된 커뮤니티 글 ]')
    console.log(`총 ${communityCount}개`)
    console.log()

    // 4. 화력 재계산 로직 시뮬레이션
    console.log('[ 화력 계산 분석 ]')
    console.log(`뉴스: ${newsCount}개 × 1.0 = ${newsCount * 1.0}점`)
    console.log(`커뮤니티: ${communityCount}개 × 2.0 = ${communityCount * 2.0}점`)
    console.log(`추정 화력: ${newsCount * 1.0 + communityCount * 2.0}점`)
    console.log(`실제 화력: ${issue.heat_index}점`)
    console.log()

    // 5. 타임라인 분석
    const createTime = new Date(issue.created_at).getTime()
    const updateTime = new Date(issue.updated_at).getTime()
    const diffMinutes = Math.floor((updateTime - createTime) / 1000 / 60)

    console.log('[ 반려 처리 추정 ]')
    console.log(`생성 시각: ${issue.created_at}`)
    console.log(`수정 시각: ${issue.updated_at}`)
    console.log(`경과 시간: ${diffMinutes}분 (${Math.floor(diffMinutes / 60)}시간 ${diffMinutes % 60}분)`)
    console.log()

    // 6. 가능한 시나리오 분석
    console.log('[ 자동 반려 원인 추정 ]')
    console.log()
    console.log('현재 화력이 18점이지만 반려 상태인 이유:')
    console.log()
    console.log('시나리오 1) 생성 직후 화력이 15점 미만이었음')
    console.log('  - 생성 시각과 수정 시각이 2시간 이상 차이남')
    console.log('  - 화력 재계산 Cron(10분마다)이 실행되면서 자동 반려')
    console.log('  - 이후 뉴스가 더 추가되어 화력이 18점으로 상승')
    console.log()
    console.log('시나리오 2) 수동 스크립트 실행')
    console.log('  - reapply_issue_criteria.ts 같은 스크립트가 실행됨')
    console.log('  - 당시 화력이 15점 미만이어서 자동 반려')
    console.log('  - 이후 뉴스 추가로 화력 상승')
    console.log()
    console.log('시나리오 3) 카테고리 기준')
    console.log(`  - 현재 카테고리: ${issue.category}`)
    console.log('  - 카테고리가 자동 승인 대상이 아니면 수동 승인 필요')
    console.log('  - 화력이 15점 이상이지만 30점 미만이면 "대기" 유지')
    console.log('  - 하지만 현재는 "반려" 상태')
    console.log()

    // 7. Cron 실행 로그 확인 (만약 있다면)
    console.log('[ 권장 조치 ]')
    console.log()
    console.log('1. 현재 화력 18점으로 최소 기준(15점) 충족')
    console.log('2. 하지만 자동 승인 기준(30점)은 미달')
    console.log('3. approval_type이 "auto"이므로 시스템이 자동 반려 처리')
    console.log()
    console.log('해결 방법:')
    console.log('  A) 화력이 15점 이상이므로 "대기" 상태로 복구')
    console.log('  B) 관리자가 수동 승인')
    console.log('  C) 화력이 30점 이상 도달하면 자동 승인')
    console.log()
    console.log('복구 명령:')
    console.log(`  await supabaseAdmin`)
    console.log(`    .from('issues')`)
    console.log(`    .update({ approval_status: '대기', approval_type: null })`)
    console.log(`    .eq('id', '${issueId}')`)
}

main().catch(console.error)
