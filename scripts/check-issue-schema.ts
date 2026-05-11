import { createClient } from '@supabase/supabase-js'
const supabase = createClient(
  'https://mdxshmfmcdcotteevwgi.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1keHNobWZtY2Rjb3R0ZWV2d2dpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTYyNzAyMCwiZXhwIjoyMDkxMjAzMDIwfQ.Eo354xCPQxr2XOdxwvQfu0X-E6d9cdm7lqSJP6DkcRM'
)
async function main() {
  const { data } = await supabase.from('issues').select('*').limit(1)
  console.log('issues columns:', Object.keys(data?.[0] ?? {}))

  // status별 건수
  const { data: statuses } = await supabase.from('issues').select('status')
  const counts: Record<string, number> = {}
  statuses?.forEach(i => { counts[i.status] = (counts[i.status] || 0) + 1 })
  console.log('\nstatus별 건수:', JSON.stringify(counts, null, 2))
}
main().catch(console.error)
