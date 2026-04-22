/**
 * scripts/fill-missing-thumbnails.ts
 *
 * thumbnail_urls 가 없는 이슈에 Pixabay 이미지를 일괄 채움
 * 실서버: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY 가 실서버 값이면 실서버에 적용
 *
 * 실행: npx ts-node -r tsconfig-paths/register scripts/fill-missing-thumbnails.ts
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const CATEGORY_FALLBACK: Record<string, string> = {
    '연예': 'entertainment stage concert',
    '스포츠': 'sports stadium field',
    '정치': 'politics building architecture',
    '사회': 'society cityscape urban',
    '경제': 'economy business skyline',
    'IT과학': 'technology abstract circuit',
    '기술': 'technology abstract circuit',
    '생활문화': 'lifestyle architecture interior',
    '세계': 'world landmark architecture',
}

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function extractKeywords(title: string): Promise<string | null> {
    const apiKey = (process.env.GROQ_API_KEY ?? '').split(',')[0].trim()
    if (!apiKey) return null
    try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'llama-3.1-8b-instant',
                messages: [{ role: 'user', content: `Extract 2 English search keywords for a stock photo search from this Korean news headline. Reply with ONLY the keywords, nothing else.\n\n"${title}"` }],
                max_tokens: 20,
                temperature: 0,
            }),
        })
        if (!res.ok) return null
        const data = await res.json()
        return data.choices?.[0]?.message?.content?.trim() || null
    } catch {
        return null
    }
}

async function searchPixabay(query: string, apiKey: string): Promise<string[]> {
    const params = new URLSearchParams({
        key: apiKey,
        q: query,
        image_type: 'photo',
        orientation: 'horizontal',
        per_page: '30',
        safesearch: 'true',
        min_width: '1280',
    })

    const res = await fetch(`https://pixabay.com/api/?${params}`)
    if (!res.ok) {
        console.warn(`  ⚠ Pixabay API 오류: ${res.status}`)
        return []
    }

    const data = await res.json()
    const hits: Array<{ largeImageURL: string; tags: string }> = data.hits ?? []
    if (hits.length === 0) return []

    const personTags = ['person', 'people', 'man', 'woman', 'human', 'face', 'portrait', 'crowd', 'girl', 'boy', 'child']
    const filtered = hits.filter(h => {
        const tags = h.tags.toLowerCase()
        return !personTags.some(t => tags.includes(t))
    })

    const final = filtered.length > 0 ? filtered : hits
    return [...final].sort(() => Math.random() - 0.5).slice(0, 3).map(h => h.largeImageURL).filter(Boolean)
}

async function main() {
    const apiKey = process.env.PIXABAY_API_KEY
    if (!apiKey) {
        console.error('❌ PIXABAY_API_KEY 없음')
        return
    }

    console.log('='.repeat(60))
    console.log('썸네일 없는 이슈 일괄 이미지 채우기 (Pixabay)')
    console.log(`DB: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`)
    console.log('='.repeat(60))

    const { data: targets, error } = await supabase
        .from('issues')
        .select('id, title, category, approval_status')
        .or('thumbnail_urls.is.null,thumbnail_urls.eq.{}')
        .eq('approval_status', '승인')
        .order('created_at', { ascending: false })

    if (error) { console.error('❌ 조회 실패:', error); return }
    if (!targets || targets.length === 0) { console.log('✅ 이미지 없는 승인 이슈 없음'); return }

    console.log(`\n대상 이슈: ${targets.length}건\n`)

    let filled = 0
    let failed = 0

    for (const issue of targets) {
        process.stdout.write(`  처리 중: "${issue.title}" ... `)

        const keywords = await extractKeywords(issue.title)
        let urls: string[] = []

        if (keywords) urls = await searchPixabay(keywords, apiKey)
        if (urls.length === 0) {
            const fallback = CATEGORY_FALLBACK[issue.category] ?? 'news'
            urls = await searchPixabay(fallback, apiKey)
        }

        if (urls.length === 0) {
            console.log('⚠️  이미지 없음 (스킵)')
            failed++
            continue
        }

        const { error: updateError } = await supabase
            .from('issues')
            .update({ thumbnail_urls: urls, primary_thumbnail_index: 0 })
            .eq('id', issue.id)

        if (updateError) {
            console.log('❌ 저장 실패')
            failed++
        } else {
            console.log(`✅ ${urls.length}개 저장 (키워드: ${keywords ?? 'fallback'})`)
            filled++
        }

        // Pixabay 5,000회/시간 — 여유 있지만 Groq rate limit 방지용 간격
        await new Promise(r => setTimeout(r, 500))
    }

    console.log('\n' + '='.repeat(60))
    console.log(`완료 — 성공: ${filled}건 / 실패: ${failed}건 / 전체: ${targets.length}건`)
    console.log('='.repeat(60))
}

main().catch(console.error)
