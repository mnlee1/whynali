import { supabaseAdmin } from '../lib/supabase/server'

async function check() {
    // 최근 1시간 내 정국 뉴스
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    
    const { data: news } = await supabaseAdmin
        .from('news_data')
        .select('id, title, created_at, issue_id, category, source')
        .ilike('title', '%정국%')
        .gte('created_at', oneHourAgo)
        .order('created_at', { ascending: false })
    
    console.log(`\n최근 1시간 정국 뉴스: ${news?.length || 0}건`)
    news?.forEach((n, i) => {
        console.log(`  ${i+1}. [${n.category}] ${n.title.slice(0, 70)}`)
        console.log(`     출처: ${n.source}`)
        console.log(`     연결 이슈: ${n.issue_id || '없음'}`)
    })
    
    // 공통 키워드 분석
    if (news && news.length >= 2) {
        console.log(`\n키워드 분석:`)
        const titles = news.map(n => n.title)
        const words = titles.join(' ')
            .replace(/[^\wㄱ-ㅎㅏ-ㅣ가-힣\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length >= 2)
        
        const wordCount = new Map<string, number>()
        words.forEach(w => {
            wordCount.set(w, (wordCount.get(w) || 0) + 1)
        })
        
        const common = Array.from(wordCount.entries())
            .filter(([_, count]) => count >= 2)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
        
        console.log(`공통 키워드 (2개 이상 등장):`)
        common.forEach(([word, count]) => {
            console.log(`  "${word}": ${count}개 뉴스에서 등장`)
        })
    }
}

check()
