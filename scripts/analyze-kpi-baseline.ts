import { createClient } from '@supabase/supabase-js'
const supabase = createClient(
  'https://mdxshmfmcdcotteevwgi.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  // 이슈 승인율
  const { count: total } = await supabase.from('issues').select('*', { count: 'exact', head: true })
  const { count: approved } = await supabase.from('issues').select('*', { count: 'exact', head: true }).eq('approval_status', '승인')
  const { count: merged } = await supabase.from('issues').select('*', { count: 'exact', head: true }).eq('approval_status', '병합됨')
  const { count: rejected } = await supabase.from('issues').select('*', { count: 'exact', head: true }).eq('approval_status', '반려')
  const { count: pending } = await supabase.from('issues').select('*', { count: 'exact', head: true }).eq('approval_status', '대기')
  console.log('=== 이슈 파이프라인 ===')
  console.log(`전체: ${total} | 승인: ${approved} | 병합: ${merged} | 반려: ${rejected} | 대기: ${pending}`)
  console.log(`승인율: ${((approved!/total!)*100).toFixed(1)}%`)
  console.log(`반려율: ${((rejected!/total!)*100).toFixed(1)}%`)

  // 이슈 승인 소요시간 (created_at → approved_at)
  const { data: issueTimes } = await supabase
    .from('issues').select('created_at, approved_at').eq('approval_status', '승인').not('approved_at', 'is', null)
  const hours = issueTimes?.map(i => {
    const diff = new Date(i.approved_at).getTime() - new Date(i.created_at).getTime()
    return diff / (1000 * 60 * 60)
  }) ?? []
  const avgHours = hours.reduce((a, b) => a + b, 0) / hours.length
  const autoApproved = hours.filter(h => h <= 7).length  // 6시간 자동승인 + 여유
  console.log(`\n이슈 승인 소요 평균: ${avgHours.toFixed(1)}시간`)
  console.log(`자동승인 추정 (7시간 이내): ${autoApproved}건 / ${hours.length}건 (${((autoApproved/hours.length)*100).toFixed(0)}%)`)

  // 정상 운영 기간 이슈 등록 속도 (4/23 이후, 초기 복구 배치 제외)
  const { data: recentIssues } = await supabase
    .from('issues').select('created_at').gte('created_at', '2026-04-23').order('created_at')
  const days = recentIssues ? (new Date('2026-05-11').getTime() - new Date('2026-04-23').getTime()) / (1000*60*60*24) : 1
  console.log(`\n=== 정상 운영 기간 이슈 등록 속도 (4/23~5/11) ===`)
  console.log(`${recentIssues?.length}건 / ${Math.round(days)}일 = 일평균 ${(recentIssues!.length/days).toFixed(1)}건`)
  console.log(`월 환산: ${Math.round(recentIssues!.length/days*30)}건`)

  // 숏폼 업로드 성공률
  const { data: sf } = await supabase.from('shortform_jobs').select('upload_status, created_at')
  const us = sf?.map(s => s.upload_status as Record<string, {status: string}> | null) ?? []
  const ytOk = us.filter(u => u?.youtube?.status === 'success').length
  const igOk = us.filter(u => u?.instagram?.status === 'success').length
  const ttOk = us.filter(u => u?.tiktok?.status === 'success').length
  console.log(`\n=== 숏폼 업로드 성공률 (전체 ${sf?.length}건) ===`)
  console.log(`유튜브: ${ytOk}/${sf?.length} (${((ytOk/sf!.length)*100).toFixed(0)}%)`)
  console.log(`인스타: ${igOk}/${sf?.length} (${((igOk/sf!.length)*100).toFixed(0)}%)`)
  console.log(`틱톡: ${ttOk}/${sf?.length} (${((ttOk/sf!.length)*100).toFixed(0)}%)`)

  // 현재 22명 기준 참여 밀도 (이슈 있었던 시기)
  const { count: voteCount } = await supabase.from('votes').select('*', { count: 'exact', head: true })
  const { count: reactionCount } = await supabase.from('reactions').select('*', { count: 'exact', head: true })
  const { count: commentCount } = await supabase.from('comments').select('*', { count: 'exact', head: true })
  console.log(`\n=== 현재 참여 현황 (22명 기준) ===`)
  console.log(`투표: ${voteCount}회 | 반응: ${reactionCount}건 | 댓글: ${commentCount}건`)
  console.log(`1인당 투표: ${(voteCount!/22).toFixed(1)}회 | 반응: ${(reactionCount!/22).toFixed(1)}건 | 댓글: ${(commentCount!/22).toFixed(1)}건`)
}

main().catch(console.error)
