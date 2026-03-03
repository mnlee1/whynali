import { supabaseAdmin } from '../lib/supabase/server'

async function check() {
    const { data: news } = await supabaseAdmin
        .from('news_data')
        .select('id, title, category, created_at')
        .ilike('title', '%환%')
        .order('created_at', { ascending: false })
        .limit(10)
    
    console.log(`\n최근 '환' 포함 뉴스: ${news?.length || 0}건`)
    news?.forEach((n, i) => {
        console.log(`  ${i+1}. [${n.category}] ${n.title}`)
    })
}

check()
