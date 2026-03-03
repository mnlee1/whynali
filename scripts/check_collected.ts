import { supabaseAdmin } from '../lib/supabase/server'

async function checkCollected() {
    // 방금 수집된 뉴스 확인 (1분 이내)
    const oneMinAgo = new Date(Date.now() - 60 * 1000).toISOString()
    
    const { data: recentNews } = await supabaseAdmin
        .from('news_data')
        .select('id, title, category, created_at')
        .or('title.ilike.%윤종신%,title.ilike.%행크스%,title.ilike.%정국%')
        .gte('created_at', oneMinAgo)
        .order('created_at', { ascending: false })
    
    console.log(`\n방금 수집된 뉴스 (윤종신/행크스/정국): ${recentNews?.length || 0}건`)
    recentNews?.slice(0, 10).forEach((n, i) => {
        console.log(`  ${i+1}. [${n.category}] ${n.title.slice(0, 60)}`)
    })
}

checkCollected()
