import { supabaseAdmin } from '../lib/supabase/server'

async function check() {
    // 최근 24시간 내 커뮤니티 데이터 중 "환"이 포함되고 길이가 짧은 단어가 있는지 확인
    const { data: posts } = await supabaseAdmin
        .from('community_data')
        .select('title')
        .ilike('title', '%환%')
        .order('created_at', { ascending: false })
        .limit(20)
    
    console.log(`\n최근 '환' 포함 커뮤니티 글: ${posts?.length || 0}건`)
    posts?.forEach((p, i) => {
        console.log(`  ${i+1}. ${p.title}`)
    })
    
    // 최근 24시간 내 생성된 이슈 중 "환" 포함 여부
    const { data: issues } = await supabaseAdmin
        .from('issues')
        .select('title')
        .ilike('title', '%환%')
        .order('created_at', { ascending: false })
        .limit(10)
        
    console.log(`\n최근 '환' 포함 이슈: ${issues?.length || 0}건`)
    issues?.forEach((p, i) => {
        console.log(`  ${i+1}. ${p.title}`)
    })
}

check()
