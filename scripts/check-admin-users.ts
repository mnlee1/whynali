import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://mdxshmfmcdcotteevwgi.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  const { data: allUsers } = await supabase.auth.admin.listUsers({ perPage: 100 })
  const users = allUsers?.users ?? []

  const admins = users.filter(u => u.app_metadata?.is_admin === true)
  const nonAdmins = users.filter(u => u.app_metadata?.is_admin !== true)

  console.log(`\n전체 유저: ${users.length}명`)
  console.log(`is_admin=true: ${admins.length}명`)
  console.log(`일반 유저: ${nonAdmins.length}명`)

  console.log('\n--- 어드민 계정 ---')
  admins.forEach(u => {
    console.log(`  id: ${u.id.slice(0,8)}... | email: ${u.email} | app_metadata:`, JSON.stringify(u.app_metadata))
  })

  console.log('\n--- is_admin 미설정 (일반 유저로 처리) ---')
  nonAdmins.forEach(u => {
    console.log(`  id: ${u.id.slice(0,8)}... | is_admin: ${u.app_metadata?.is_admin ?? 'undefined'} | app_metadata:`, JSON.stringify(u.app_metadata))
  })
}

main().catch(console.error)
