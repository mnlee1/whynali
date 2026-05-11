import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://mdxshmfmcdcotteevwgi.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1keHNobWZtY2Rjb3R0ZWV2d2dpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTYyNzAyMCwiZXhwIjoyMDkxMjAzMDIwfQ.Eo354xCPQxr2XOdxwvQfu0X-E6d9cdm7lqSJP6DkcRM'
)

async function main() {
  // page_views 데이터 현황
  const { count } = await supabase.from('page_views').select('*', { count: 'exact', head: true })
  console.log('\npage_views total rows:', count)

  const { data: sample } = await supabase.from('page_views').select('*').limit(5)
  console.log('page_views sample:', JSON.stringify(sample, null, 2))

  // user_id null 여부 (비로그인 방문 포함 여부)
  const { count: withUser } = await supabase
    .from('page_views')
    .select('*', { count: 'exact', head: true })
    .not('user_id', 'is', null)
  const { count: noUser } = await supabase
    .from('page_views')
    .select('*', { count: 'exact', head: true })
    .is('user_id', null)
  console.log(`\nwith user_id: ${withUser}, without user_id (anonymous): ${noUser}`)

  // auth.users 전체 last_sign_in_at 현황
  const { data: allUsers } = await supabase.auth.admin.listUsers({ perPage: 100 })
  const users = allUsers?.users ?? []
  console.log('\nTotal auth users:', users.length)
  
  const now = new Date('2026-05-11')
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  
  const active30 = users.filter(u => u.last_sign_in_at && new Date(u.last_sign_in_at) > thirtyDaysAgo).length
  const active7 = users.filter(u => u.last_sign_in_at && new Date(u.last_sign_in_at) > sevenDaysAgo).length
  console.log(`Active last 30 days: ${active30}`)
  console.log(`Active last 7 days: ${active7}`)
  console.log('last_sign_in_at list:', users.map(u => u.last_sign_in_at?.slice(0,10)).sort())
}

main().catch(console.error)
