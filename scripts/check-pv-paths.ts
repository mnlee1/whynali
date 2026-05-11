import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://mdxshmfmcdcotteevwgi.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1keHNobWZtY2Rjb3R0ZWV2d2dpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTYyNzAyMCwiZXhwIjoyMDkxMjAzMDIwfQ.Eo354xCPQxr2XOdxwvQfu0X-E6d9cdm7lqSJP6DkcRM'
)

async function main() {
  const { data } = await supabase
    .from('page_views')
    .select('page_path, created_at, user_id')
    .order('created_at')

  console.log('\n전체 page_views 경로 목록:')
  data?.forEach(r => {
    console.log(`  ${r.created_at.slice(0,10)} | ${r.page_path} | user_id: ${r.user_id ?? 'null'}`)
  })

  console.log('\n/admin 아닌 경로:')
  const nonAdmin = data?.filter(r => !r.page_path.startsWith('/admin'))
  nonAdmin?.forEach(r => {
    console.log(`  ${r.created_at.slice(0,10)} | ${r.page_path}`)
  })
  console.log(`총 ${nonAdmin?.length}건`)
}

main().catch(console.error)
