import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://mdxshmfmcdcotteevwgi.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  const { data: sf } = await supabase.from('shortform_jobs').select('*').limit(2)
  console.log('shortform_jobs columns:', Object.keys(sf?.[0] ?? {}))
  console.log('shortform_jobs sample:', JSON.stringify(sf?.[0], null, 2))

  const { data: issues } = await supabase.from('issues').select('created_at, status').order('created_at')
  const byDay: Record<string, number> = {}
  issues?.forEach(i => { const d = i.created_at.slice(0,10); byDay[d] = (byDay[d]||0)+1 })
  console.log('\nissues 일별:', JSON.stringify(byDay))
}

main().catch(console.error)
