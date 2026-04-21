/**
 * scripts/fill-missing-thumbnails.ts
 *
 * thumbnail_urls 가 없는 이슈에 Unsplash 이미지를 일괄 채움
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
    if (!accessKey) {
        console.error('❌ UNSPLASH_ACCESS_KEY 없음')
        return
    }

    console.log('='.repeat(60))
    console.log('썸네일 없는 이슈 일괄 이미지 채우기')
    console.log(`DB: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`)
    console.log('='.repeat(60))

    // 이미 사용 중인 이미지 URL 수집 (중복 방지)
    const { data: allIssues } = await supabase.from('issues').select('thumbnail_urls').not('thumbnail_urls', 'is', null)
    const usedUrls: string[] = []
    allIssues?.forEach(i => { if (Array.isArray(i.thumbnail_urls)) usedUrls.push(...i.thumbnail_urls) })

    // 이미지 없는 이슈 조회
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

        if (keywords) {
            urls = await searchUnsplash(keywords, accessKey, usedUrls)
        }
        if (urls.length === 0) {
            const fallback = CATEGORY_FALLBACK[issue.category] ?? 'news'
            urls = await searchUnsplash(fallback, accessKey, usedUrls)
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
            usedUrls.push(...urls)
            filled++
        }

        // Unsplash rate limit 방지 (50req/hour 무료)
        await new Promise(r => setTimeout(r, 1200))
    }

    console.log('\n' + '='.repeat(60))
    console.log(`완료 — 성공: ${filled}건 / 실패: ${failed}건 / 전체: ${targets.length}건`)
    console.log('='.repeat(60))
}

main().catch(console.error)
