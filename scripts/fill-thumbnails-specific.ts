/**
 * scripts/fill-thumbnails-specific.ts
 *
 * 특정 이슈에만 Unsplash 이미지를 채움
 * 실행: npx ts-node -r tsconfig-paths/register scripts/fill-thumbnails-specific.ts
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

const isProd = process.argv.includes('--prod')
config({ path: isProd ? '.env.production.local' : '.env.local' })

// ✏️ 이미지 채울 이슈 제목 (부분 일치)
const TARGET_TITLES = [
    '계엄령 놀이',
    '전한길 명예훼손',
]

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

async function searchUnsplash(query: string, accessKey: string, excludeUrls: string[]): Promise<string[]> {
    const excludeTerms = '-person -people -face -portrait -human -man -woman -selfie -crowd'
    const searchQuery = `${query} architecture abstract object concept ${excludeTerms}`
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(searchQuery)}&per_page=30&orientation=landscape`
    const res = await fetch(url, { headers: { Authorization: `Client-ID ${accessKey}` } })
    if (!res.ok) return []
    const data = await res.json()
    const results: Array<{ urls: { regular: string }; description?: string; alt_description?: string }> = data.results ?? []
    if (results.length === 0) return []

    const personKeywords = ['person', 'people', 'man', 'woman', 'human', 'face', 'portrait', 'selfie', 'crowd', 'girl', 'boy', 'child', 'adult']
    const filtered = results.filter(r => {
        const desc = (r.description || r.alt_description || '').toLowerCase()
        return !personKeywords.some(k => desc.includes(k)) && !excludeUrls.includes(r.urls?.regular)
    })

    const final = filtered.length > 0 ? filtered : results.filter(r => !excludeUrls.includes(r.urls?.regular))
    return [...final].sort(() => Math.random() - 0.5).slice(0, 3).map(r => r.urls?.regular).filter(Boolean)
}

async function main() {
    const accessKey = process.env.UNSPLASH_ACCESS_KEY
    if (!accessKey) { console.error('❌ UNSPLASH_ACCESS_KEY 없음'); return }

    console.log('='.repeat(60))
    console.log('특정 이슈 썸네일 채우기')
    console.log(`DB: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`)
    console.log('='.repeat(60))

    // 이미 사용 중인 이미지 URL 수집 (중복 방지)
    const { data: allIssues } = await supabase.from('issues').select('thumbnail_urls').not('thumbnail_urls', 'is', null)
    const usedUrls: string[] = []
    allIssues?.forEach(i => { if (Array.isArray(i.thumbnail_urls)) usedUrls.push(...i.thumbnail_urls) })

    for (const keyword of TARGET_TITLES) {
        console.log(`\n🔍 "${keyword}" 검색 중...`)

        const { data: issues, error } = await supabase
            .from('issues')
            .select('id, title, category')
            .ilike('title', `%${keyword}%`)
            .limit(5)

        if (error || !issues || issues.length === 0) {
            console.log(`  ⚠️  이슈를 찾을 수 없음`)
            continue
        }

        for (const issue of issues) {
            console.log(`  이슈: "${issue.title}" (ID: ${issue.id})`)
            process.stdout.write(`  이미지 검색 중 ... `)

            const keywords = await extractKeywords(issue.title)
            let urls: string[] = []

            if (keywords) {
                urls = await searchUnsplash(keywords, accessKey, usedUrls)
            }
            if (urls.length === 0) {
                const fallback = CATEGORY_FALLBACK[issue.category] ?? 'news'
                urls = await searchUnsplash(fallback, accessKey, usedUrls)
            }

            if (urls.length === 0) {
                console.log('⚠️  이미지 없음')
                continue
            }

            const { error: updateError } = await supabase
                .from('issues')
                .update({ thumbnail_urls: urls, primary_thumbnail_index: 0 })
                .eq('id', issue.id)

            if (updateError) {
                console.log('❌ 저장 실패:', updateError.message)
            } else {
                console.log(`✅ ${urls.length}개 저장 (키워드: ${keywords ?? 'fallback'})`)
                usedUrls.push(...urls)
            }

            await new Promise(r => setTimeout(r, 1200))
        }
    }

    console.log('\n' + '='.repeat(60))
    console.log('완료')
    console.log('='.repeat(60))
}

main().catch(console.error)
