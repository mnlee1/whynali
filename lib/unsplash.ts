/**
 * lib/unsplash.ts
 *
 * Unsplash 이미지 검색 유틸리티
 * - UNSPLASH_ACCESS_KEY 없으면 빈 배열 반환 (안전하게 스킵)
 * - 이미지 파일 저장 없음, URL만 반환
 * - 라이선스: Unsplash License (상업적 이용 가능, 출처 표기 불필요)
 *
 * 제거 방법: 이 파일 삭제 + approve/route.ts에서 fetchUnsplashImages 호출 제거
 *           + HotIssueHighlight.tsx에서 thumbnail_urls 관련 코드 제거
 *           + IssuePreviewDrawer.tsx에서 이미지 미리보기 섹션 제거
 */

const CATEGORY_FALLBACK: Record<string, string> = {
    '연예': 'entertainment celebrity',
    '스포츠': 'sports stadium',
    '정치': 'politics government',
    '사회': 'society news',
    '경제': 'economy business finance',
    'IT과학': 'technology science',
    '기술': 'technology science',
    '생활문화': 'lifestyle culture',
    '세계': 'world international',
}

/**
 * Groq API 직접 호출로 한국어 이슈 제목 → 영어 검색 키워드 추출
 * (rate limit 시스템 우회 — 키워드 추출은 단순 작업이라 직접 호출이 안정적)
 */
async function extractEnglishKeywords(title: string): Promise<string | null> {
    const apiKey = (process.env.GROQ_API_KEY ?? '').split(',')[0].trim()
    if (!apiKey) return null

    try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'llama-3.1-8b-instant',
                messages: [
                    {
                        role: 'user',
                        content: `Extract 2 English search keywords for a stock photo search from this Korean news headline. Reply with ONLY the keywords, nothing else.\n\n"${title}"`,
                    },
                ],
                max_tokens: 20,
                temperature: 0,
            }),
        })

        if (!res.ok) return null
        const data = await res.json()
        const keywords = data.choices?.[0]?.message?.content?.trim()
        return keywords || null
    } catch {
        return null
    }
}

/**
 * Unsplash 검색 후 결과 중 앞 3개 URL 반환
 */
async function searchUnsplash(query: string, accessKey: string): Promise<string[]> {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=10&orientation=landscape`
    const res = await fetch(url, {
        headers: { Authorization: `Client-ID ${accessKey}` },
    })
    if (!res.ok) return []
    const data = await res.json()
    const results: Array<{ urls: { regular: string } }> = data.results ?? []
    return results
        .slice(0, 3)
        .map(r => r.urls?.regular)
        .filter(Boolean)
}

/**
 * 이슈 제목과 카테고리로 Unsplash 이미지 URL 최대 3개 반환
 * @returns 이미지 URL 배열 (1080px, 최대 3개) — 실패 시 빈 배열
 */
export async function fetchUnsplashImages(title: string, category: string): Promise<string[]>
export async function fetchUnsplashImages(title: string, category: string, debug: true): Promise<{ urls: string[]; keyword: string; source: 'groq' | 'fallback' }>
export async function fetchUnsplashImages(title: string, category: string, debug?: boolean): Promise<string[] | { urls: string[]; keyword: string; source: 'groq' | 'fallback' }> {
    const accessKey = process.env.UNSPLASH_ACCESS_KEY
    if (!accessKey) return debug ? { urls: [], keyword: '', source: 'fallback' } : []

    // 1차: Groq로 영어 키워드 추출 후 검색
    const englishKeywords = await extractEnglishKeywords(title)
    if (englishKeywords) {
        try {
            const urls = await searchUnsplash(englishKeywords, accessKey)
            if (urls.length > 0) return debug ? { urls, keyword: englishKeywords, source: 'groq' } : urls
        } catch {
            // 실패 시 카테고리 폴백으로 진행
        }
    }

    // 2차 폴백: 카테고리 영어 키워드로 재검색
    const fallbackQuery = CATEGORY_FALLBACK[category] ?? 'news'
    try {
        const urls = await searchUnsplash(fallbackQuery, accessKey)
        return debug ? { urls, keyword: fallbackQuery, source: 'fallback' } : urls
    } catch {
        return debug ? { urls: [], keyword: fallbackQuery, source: 'fallback' } : []
    }
}
