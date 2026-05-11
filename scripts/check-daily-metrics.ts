import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://mdxshmfmcdcotteevwgi.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1keHNobWZtY2Rjb3R0ZWV2d2dpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTYyNzAyMCwiZXhwIjoyMDkxMjAzMDIwfQ.Eo354xCPQxr2XOdxwvQfu0X-E6d9cdm7lqSJP6DkcRM'
)

async function main() {
  // 1. 일별 신규 가입자 (auth.users created_at 기준)
  const { data: allUsers } = await supabase.auth.admin.listUsers({ perPage: 100 })
  const users = allUsers?.users ?? []
  console.log('\n=== 신규 가입자 (일별) ===')
  const usersByDay: Record<string, number> = {}
  users.forEach(u => {
    const day = u.created_at.slice(0, 10)
    usersByDay[day] = (usersByDay[day] || 0) + 1
  })
  console.log(JSON.stringify(usersByDay, null, 2))

  // 2. 반응 테이블
  const { data: reactions, error: re } = await supabase.from('reactions').select('created_at').order('created_at')
  if (re) console.log('reactions error:', re.message)
  else {
    const byDay: Record<string, number> = {}
    reactions?.forEach(r => { const d = r.created_at.slice(0,10); byDay[d] = (byDay[d]||0)+1 })
    console.log('\n=== 반응 (일별) ===', JSON.stringify(byDay, null, 2))
  }

  // 3. 투표 테이블
  const { data: votes, error: ve } = await supabase.from('votes').select('created_at').order('created_at')
  if (ve) console.log('votes error:', ve.message)
  else {
    const byDay: Record<string, number> = {}
    votes?.forEach(v => { const d = v.created_at.slice(0,10); byDay[d] = (byDay[d]||0)+1 })
    console.log('\n=== 투표 (일별) ===', JSON.stringify(byDay, null, 2))
  }

  // 4. 댓글 테이블
  const { data: comments, error: ce } = await supabase.from('comments').select('created_at').order('created_at')
  if (ce) console.log('comments error:', ce.message)
  else {
    const byDay: Record<string, number> = {}
    comments?.forEach(c => { const d = c.created_at.slice(0,10); byDay[d] = (byDay[d]||0)+1 })
    console.log('\n=== 댓글 (일별) ===', JSON.stringify(byDay, null, 2))
  }

  // 5. 페이지뷰
  const { data: pv, error: pve } = await supabase.from('page_views').select('created_at, user_id').order('created_at')
  if (pve) console.log('page_views error:', pve.message)
  else {
    const byDay: Record<string, number> = {}
    pv?.forEach(p => { const d = p.created_at.slice(0,10); byDay[d] = (byDay[d]||0)+1 })
    console.log('\n=== 페이지뷰 (일별) ===', JSON.stringify(byDay, null, 2))
  }
}

main().catch(console.error)
