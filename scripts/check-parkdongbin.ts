import { createClient } from '@supabase/supabase-js'

const sb = createClient(
    'https://mdxshmfmcdcotteevwgi.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
    const { data: issues } = await sb
        .from('issues')
        .select('id,title,status,heat_index,updated_at')
        .ilike('title', '%박동빈%')

    if (!issues || issues.length === 0) { console.log('이슈 없음'); return }
    console.log('=== 이슈 ===')
    issues.forEach((i: any) => console.log(` [${i.status}] heat:${i.heat_index} updated:${i.updated_at?.slice(0,16)} | ${i.title}`))
    const id = issues[0].id

    const today = new Date('2026-05-11')
    function daysAgo(dateStr: string) {
        return Math.floor((today.getTime() - new Date(dateStr).getTime()) / (1000*60*60*24))
    }
    function weight(dateStr: string) {
        const d = daysAgo(dateStr)
        if (d <= 3) return 1.0
        if (d >= 14) return 0
        return +(1.0 - (d - 3) / 11).toFixed(3)
    }

    const { data: news } = await sb
        .from('news_data')
        .select('title,created_at,published_at,source')
        .eq('issue_id', id)
        .order('created_at', { ascending: false })

    console.log(`\n=== 뉴스 (${news?.length}건) ===`)
    news?.forEach((n: any) => {
        const d = daysAgo(n.created_at)
        const w = weight(n.created_at)
        console.log(` [${d}일전 w:${w}] created:${n.created_at.slice(0,10)} pub:${n.published_at?.slice(0,10)} | ${n.title?.slice(0,50)}`)
    })

    const { data: comm } = await sb
        .from('community_data')
        .select('title,created_at,view_count,comment_count')
        .eq('issue_id', id)
        .order('created_at', { ascending: false })

    console.log(`\n=== 커뮤니티 (${comm?.length}건) ===`)
    comm?.forEach((c: any) => {
        const d = daysAgo(c.created_at)
        const w = weight(c.created_at)
        console.log(` [${d}일전 w:${w}] v:${c.view_count} cm:${c.comment_count} | ${c.title?.slice(0,50)}`)
    })
}
main().catch(console.error)
