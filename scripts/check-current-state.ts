import { createClient } from '@supabase/supabase-js'
const supabase = createClient(
  'https://mdxshmfmcdcotteevwgi.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1keHNobWZtY2Rjb3R0ZWV2d2dpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTYyNzAyMCwiZXhwIjoyMDkxMjAzMDIwfQ.Eo354xCPQxr2XOdxwvQfu0X-E6d9cdm7lqSJP6DkcRM'
)
async function main() {
  // 가입자 수 (운영자 3명 제외)
  const { data: allUsers } = await supabase.auth.admin.listUsers({ perPage: 100 })
  const total = allUsers?.users.length ?? 0
  const admins = allUsers?.users.filter(u => u.app_metadata?.is_admin === true).length ?? 0
  console.log(`가입자 수: ${total}명 (운영자 ${admins}명 포함) / 실유저 ${total - admins}명`)

  // 진행중 이슈 (점화 + 논란중)
  const { count: active } = await supabase.from('issues').select('*', { count: 'exact', head: true })
    .in('status', ['점화', '논란중'])
  const { count: waiting } = await supabase.from('issues').select('*', { count: 'exact', head: true })
    .eq('status', '대기')
  const { count: closed } = await supabase.from('issues').select('*', { count: 'exact', head: true })
    .eq('status', '종결')
  console.log(`진행중 이슈: ${active}개 (점화+논란중) / 대기: ${waiting}개 / 종결: ${closed}개`)

  // 이슈 승인율
  const { count: totalIssues } = await supabase.from('issues').select('*', { count: 'exact', head: true })
  const { count: approved } = await supabase.from('issues').select('*', { count: 'exact', head: true }).eq('approval_status', '승인')
  const { count: merged } = await supabase.from('issues').select('*', { count: 'exact', head: true }).eq('approval_status', '병합됨')
  const { count: rejected } = await supabase.from('issues').select('*', { count: 'exact', head: true }).eq('approval_status', '반려')
  const { count: pending } = await supabase.from('issues').select('*', { count: 'exact', head: true }).eq('approval_status', '대기')
  const approvalRate = ((approved! / totalIssues!) * 100).toFixed(1)
  console.log(`이슈 승인율: ${approvalRate}% (${approved}/${totalIssues}) / 병합: ${merged} / 반려: ${rejected} / 대기: ${pending}`)

  // 자동승인 비율
  const { data: approvedIssues } = await supabase.from('issues').select('created_at, approved_at').eq('approval_status', '승인').not('approved_at', 'is', null)
  const hours = approvedIssues?.map(i => (new Date(i.approved_at).getTime() - new Date(i.created_at).getTime()) / 3600000) ?? []
  const autoApproved = hours.filter(h => h <= 7).length
  console.log(`자동승인 비율: ${((autoApproved / hours.length) * 100).toFixed(0)}% (7시간 이내 ${autoApproved}/${hours.length}건)`)

  // 숏폼 업로드 성공률
  const { data: sf } = await supabase.from('shortform_jobs').select('upload_status')
  const total_sf = sf?.length ?? 0
  const ytOk = sf?.filter(s => (s.upload_status as any)?.youtube?.status === 'success').length ?? 0
  const igOk = sf?.filter(s => (s.upload_status as any)?.instagram?.status === 'success').length ?? 0
  const ttOk = sf?.filter(s => (s.upload_status as any)?.tiktok?.status === 'success').length ?? 0
  console.log(`숏폼: 총 ${total_sf}건 / 유튜브 ${ytOk}건(${((ytOk/total_sf)*100).toFixed(0)}%) / 인스타 ${igOk}건(${((igOk/total_sf)*100).toFixed(0)}%) / 틱톡 ${ttOk}건(${((ttOk/total_sf)*100).toFixed(0)}%)`)

  // 누적 댓글·반응·투표
  const { count: comments } = await supabase.from('comments').select('*', { count: 'exact', head: true })
  const { count: reactions } = await supabase.from('reactions').select('*', { count: 'exact', head: true })
  const { count: votes } = await supabase.from('votes').select('*', { count: 'exact', head: true })
  console.log(`누적 댓글: ${comments}건 / 반응: ${reactions}건 / 투표: ${votes}회`)

  // 일평균 이슈 승인 (최근 정상 운영 기간 4/23~)
  const { data: recentApproved } = await supabase.from('issues').select('approved_at').eq('approval_status', '승인')
    .gte('approved_at', '2026-04-23').not('approved_at', 'is', null)
  const days = (new Date('2026-05-11').getTime() - new Date('2026-04-23').getTime()) / 86400000
  console.log(`일평균 이슈 승인 (4/23~): ${(recentApproved!.length / days).toFixed(1)}건/일 (${recentApproved!.length}건 / ${Math.round(days)}일)`)
}
main().catch(console.error)
