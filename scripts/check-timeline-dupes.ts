import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

async function main() {
    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    )

    const { data: issue } = await sb
        .from('issues')
        .select('id')
        .eq('title', '트럼프 이란 휴전 협상 동향')
        .single()

    const { data: points } = await sb
        .from('timeline_points')
        .select('id, title, occurred_at, stage, source_url')
        .eq('issue_id', issue!.id)
        .order('occurred_at', { ascending: true })

    console.log(`\n타임라인 포인트 총 ${points?.length}건\n`)

    // source_url 기준 중복 탐지
    const urlMap = new Map<string, typeof points>()
    for (const p of points ?? []) {
        const key = p.source_url ?? p.title ?? ''
        if (!urlMap.has(key)) urlMap.set(key, [])
        urlMap.get(key)!.push(p)
    }

    const dupes = [...urlMap.entries()].filter(([, arr]) => arr.length > 1)
    console.log(`중복 URL/제목: ${dupes.length}건\n`)

    for (const [key, arr] of dupes.slice(0, 10)) {
        console.log(`• ${key.slice(0, 60)}`)
        for (const p of arr) {
            console.log(`  [${p.stage}] ${p.occurred_at} id:${p.id}`)
        }
    }

    // 전체 목록 (최근 20개)
    console.log(`\n--- 전체 타임라인 (최근 20개) ---`)
    for (const p of (points ?? []).slice(-20)) {
        console.log(`[${p.stage}] ${p.occurred_at?.slice(0, 16)} "${(p.title ?? '').slice(0, 40)}"`)
    }
}
main().catch(console.error)
