import { createClient } from '@supabase/supabase-js'
const supabase = createClient(
  'https://mdxshmfmcdcotteevwgi.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
async function main() {
  const { data } = await supabase.from('issues').select('status, approval_status').order('status')
  
  // status × approval_status 교차 집계
  const cross: Record<string, Record<string, number>> = {}
  data?.forEach(i => {
    if (!cross[i.status]) cross[i.status] = {}
    const as = i.approval_status ?? 'null'
    cross[i.status][as] = (cross[i.status][as] || 0) + 1
  })
  
  console.log('status × approval_status 분포:')
  for (const [status, approvals] of Object.entries(cross)) {
    const total = Object.values(approvals).reduce((a, b) => a + b, 0)
    console.log(`  ${status} (${total}개):`, JSON.stringify(approvals))
  }
}
main().catch(console.error)
