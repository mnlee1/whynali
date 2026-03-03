import { supabaseAdmin } from '../lib/supabase/server'
import { evaluateCandidates } from '../lib/candidate/issue-candidate'

async function run() {
    console.log('🔄 최근 24시간 내 모든 미승인 이슈 강제 초기화 시작...')
    
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    
    // 1. 최근 24시간 내 생성된 '대기' 또는 '반려' 상태 이슈들 조회
    // (승인된 이슈는 건드리지 않음 - 사용자에게 이미 노출된 데이터이므로)
    const { data: targetIssues, error: fetchError } = await supabaseAdmin
        .from('issues')
        .select('id, title, approval_status, heat_index')
        .gte('created_at', oneDayAgo)
        .in('approval_status', ['대기', '반려'])

    if (fetchError) {
        console.error('이슈 조회 실패:', fetchError)
        return
    }

    if (!targetIssues || targetIssues.length === 0) {
        console.log('초기화할 이슈가 없습니다.')
    } else {
        const issueIds = targetIssues.map(i => i.id)
        console.log(`삭제 대상 이슈: ${issueIds.length}개`)
        console.log('상태별 분포:')
        console.log(`  - 대기: ${targetIssues.filter(i => i.approval_status === '대기').length}개`)
        console.log(`  - 반려: ${targetIssues.filter(i => i.approval_status === '반려').length}개`)

        // 2. 연결된 뉴스/커뮤니티 데이터의 issue_id를 null로 해제 (재수집을 위해)
        console.log('\n연결된 데이터(뉴스/커뮤니티) 링크 해제 중...')
        await supabaseAdmin.from('news_data').update({ issue_id: null }).in('issue_id', issueIds)
        await supabaseAdmin.from('community_data').update({ issue_id: null }).in('issue_id', issueIds)

        // 3. 이슈 삭제
        console.log('이슈 삭제 중...')
        const { error: deleteError } = await supabaseAdmin.from('issues').delete().in('id', issueIds)
        if (deleteError) {
            console.error('이슈 삭제 실패:', deleteError)
            return
        }
        console.log('✅ 기존 이슈 초기화 완료! (반려된 것들까지 포함)')
    }

    // 4. 새로운 기준으로 이슈 후보 생성 로직 재실행
    console.log('\n🚀 새로운 기준으로 이슈 생성 평가 시작...')
    const result = await evaluateCandidates()
    
    console.log('\n✅ 평가 완료 결과:')
    console.log(`- 새로 승인/등록된 이슈: ${result.created}건`)
    console.log(`- 대기로 등록된 알림(후보): ${result.alerts.length}건`)
    console.log(`- 평가된 총 후보(그룹): ${result.evaluated}건`)
    
    if (result.alerts.length > 0) {
        console.log('\n[새로 생성된 대기 이슈 목록]')
        result.alerts.forEach((alert, i) => {
            console.log(`${i+1}. ${alert.title} (뉴스 ${alert.newsCount}, 커뮤니티 ${alert.communityCount})`)
        })
    }
}

run().catch(console.error)