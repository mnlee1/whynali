import { createClient } from '@supabase/supabase-js'
const supabase = createClient(
  'https://mdxshmfmcdcotteevwgi.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
async function main() {
  // 1. approved_at IS NOT NULL (엑셀 기준)
  const { count: c1 } = await supabase.from('issues').select('*', { count: 'exact', head: true }).not('approved_at', 'is', null)
  console.log('approved_at IS NOT NULL:', c1)

  // 2. approval_status = 'approved'
  const { count: c2 } = await supabase.from('issues').select('*', { count: 'exact', head: true }).eq('approval_status', 'approved')
  console.log("approval_status = 'approved':", c2)

  // 3. approval_status별 전체 분포
  const { data } = await supabase.from('issues').select('approval_status, approved_at')
  const dist: Record<string, number> = {}
  data?.forEach(i => { dist[i.approval_status ?? 'null'] = (dist[i.approval_status ?? 'null'] || 0) + 1 })
  console.log('\napproval_status 분포:', JSON.stringify(dist, null, 2))

  // 4. approved_at 있는데 approval_status가 approved 아닌 것
  const diff = data?.filter(i => i.approved_at && i.approval_status !== 'approved')
  console.log('\napproved_at 있지만 approval_status != approved:', diff?.length, '건')
  diff?.slice(0, 5).forEach(i => console.log(' ', JSON.stringify(i)))
}
main().catch(console.error)
