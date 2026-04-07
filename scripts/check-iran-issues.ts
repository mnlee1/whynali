import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

async function main() {
    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    )
    const { data } = await sb
        .from('issues')
        .select('title, category, status, heat_index, approval_status, merged_into_id, created_at')
        .or('title.ilike.%이란%,title.ilike.%트럼프%,title.ilike.%미국%')
        .order('merged_into_id', { ascending: true, nullsFirst: true })
        .order('created_at', { ascending: true })

    console.log(`\n총 ${data?.length}건\n`)
    data?.forEach((i: any) => {
        const state = i.merged_into_id ? '병합됨' : '활성'
        const date = i.created_at.slice(0, 10)
        console.log(`[${state}|${i.approval_status}|${i.status}] 화력:${String(i.heat_index).padStart(3)} [${date}] "${i.title}"`)
    })
}
main()
