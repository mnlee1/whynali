/**
 * lib/pixabay.ts
 *
 * Pixabay 이미지 검색 유틸리티 (이슈 썸네일용)
 * - PIXABAY_API_KEY 없으면 빈 배열 반환 (안전하게 스킵)
 * - 이미지 파일 저장 없음, URL만 반환
 * - 라이선스: Pixabay License (상업적 이용 가능, 출처 표기 불필요)
 * - API 한도: 5,000회/시간 (Unsplash 데모 50회/시간 대비 100배)
 */

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

/**
 * Groq API 직접 호출로 한국어 이슈 제목 → 영어 검색 키워드 추출
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
                        content: `You are finding stock photos for Korean news articles. Extract 2-3 English keywords that describe the visual theme or scene (NOT literal word translation). Focus on what background image would fit the topic.

Examples:
- "BTS 새 앨범 발매" → "music concert stage"
- "삼성전자 노조 파업" → "factory workers protest"
- "토트넘 강등 위기" → "soccer stadium match"
- "이스라엘 레바논 공습" → "war conflict explosion"
- "AI 주식 투자 열풍" → "stock market technology"

Korean headline: "${title}"
Reply with ONLY the keywords, nothing else.`,
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
 * Pixabay 검색 후 결과 중 랜덤 3개 URL 반환
 * 사람 관련 태그가 포함된 이미지는 자동 제외
 */
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
        console.warn(`[Pixabay] API 오류: ${res.status}`)
        return []
    }

    const data = await res.json()
    const hits: Array<{ largeImageURL: string; tags: string }> = data.hits ?? []
    if (hits.length === 0) return []

    // 사람 관련 태그 포함 이미지 제외
    const personTags = ['person', 'people', 'man', 'woman', 'human', 'face', 'portrait', 'crowd', 'girl', 'boy', 'child']
    const filtered = hits.filter(h => {
        const tags = h.tags.toLowerCase()
        return !personTags.some(t => tags.includes(t))
    })

    const finalHits = filtered.length > 0 ? filtered : hits
    const shuffled = [...finalHits].sort(() => Math.random() - 0.5)
    return shuffled
        .slice(0, Math.min(3, shuffled.length))
        .map(h => h.largeImageURL)
        .filter(Boolean)
}

/**
 * 이슈 제목과 카테고리로 Pixabay 이미지 URL 최대 3개 반환
 * @returns 이미지 URL 배열 (최대 3개) — 실패 시 빈 배열
 */
export async function fetchPixabayImages(title: string, category: string): Promise<string[]>
export async function fetchPixabayImages(title: string, category: string, debug: true): Promise<{ urls: string[]; keyword: string; source: 'groq' | 'fallback' }>
export async function fetchPixabayImages(title: string, category: string, debug?: boolean): Promise<string[] | { urls: string[]; keyword: string; source: 'groq' | 'fallback' }> {
    const apiKey = process.env.PIXABAY_API_KEY
    if (!apiKey) return debug ? { urls: [], keyword: '', source: 'fallback' } : []

    // 1차: Groq로 영어 키워드 추출 후 검색
    const englishKeywords = await extractEnglishKeywords(title)
    if (englishKeywords) {
        try {
            const urls = await searchPixabay(englishKeywords, apiKey)
            if (urls.length > 0) return debug ? { urls, keyword: englishKeywords, source: 'groq' } : urls
        } catch {
            // 실패 시 카테고리 폴백으로 진행
        }
    }

    // 2차 폴백: 카테고리 영어 키워드로 재검색
    const fallbackQuery = CATEGORY_FALLBACK[category] ?? 'news'
    try {
        const urls = await searchPixabay(fallbackQuery, apiKey)
        return debug ? { urls, keyword: fallbackQuery, source: 'fallback' } : urls
    } catch {
        return debug ? { urls: [], keyword: fallbackQuery, source: 'fallback' } : []
    }
}
