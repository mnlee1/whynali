/**
 * lib/pixabay.ts
 *
 * Pixabay 이미지 검색 유틸리티 (이슈 썸네일용)
 * - PIXABAY_API_KEY 없으면 빈 배열 반환 (안전하게 스킵)
 * - 이미지 파일 저장 없음, URL만 반환
 * - 라이선스: Pixabay License (상업적 이용 가능, 출처 표기 불필요)
 * - API 한도: 5,000회/시간
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
 * Groq API 직접 호출로 한국어 이슈 제목 → 영어 검색 키워드 + 톤(dark/bright) 추출
 * 반환 형식: { keywords: "...", isDark: boolean }
 */
async function extractKeywordsAndTone(title: string, category: string): Promise<{ keywords: string; isDark: boolean } | null> {
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
                        content: `You are finding stock photos for Korean news articles. Extract 2-3 English keywords for the visual background image, then add ::dark or ::bright based on the issue tone.

Rules:
- ::dark → controversy, scandal, accident, crime, conflict, death, protest, crisis, defeat
- ::bright → comeback, release, achievement, award, victory, celebration, debut

Category: ${category}
Examples:
- [연예] "BTS 새 앨범 발매" → "music concert stage::bright"
- [연예] "지수 친오빠 크레딧 삭제 논란" → "music studio silhouette::dark"
- [연예] "아이유 콘서트 매진" → "concert spotlight stage::bright"
- [연예] "배우 음주운전 적발" → "night city road::dark"
- [스포츠] "토트넘 강등 위기" → "soccer stadium empty::dark"
- [스포츠] "손흥민 골든부트 수상" → "soccer trophy celebration::bright"
- [정치] "국회의원 막말 논란" → "parliament building shadow::dark"
- [사회] "이태원 참사 추모" → "memorial candles vigil::dark"
- [경제] "삼성전자 노조 파업" → "factory gate protest::dark"
- [경제] "코스피 사상 최고치" → "stock market graph::bright"
- [기술] "AI 주식 투자 열풍" → "stock market technology::bright"
- [세계] "이스라엘 레바논 공습" → "war conflict destruction::dark"

Korean headline: "${title}"
Reply with ONLY the keywords::tone format, nothing else.`,
                    },
                ],
                max_tokens: 25,
                temperature: 0,
            }),
        })

        if (!res.ok) return null
        const data = await res.json()
        const raw: string = data.choices?.[0]?.message?.content?.trim() ?? ''
        if (!raw) return null

        const [keywords, tone] = raw.split('::')
        return {
            keywords: keywords.trim(),
            isDark: tone?.trim() === 'dark',
        }
    } catch {
        return null
    }
}

/**
 * Pixabay 검색 후 결과 중 랜덤 3개 URL 반환
 * 사람 관련 태그가 포함된 이미지는 자동 제외
 * 톤은 키워드 자체(shadow, night 등)로 반영 — colors 필터 미사용 (결과 다양성 확보)
 */
async function searchPixabay(query: string, apiKey: string): Promise<string[]> {
    const params = new URLSearchParams({
        key: apiKey,
        q: query,
        image_type: 'photo',
        orientation: 'horizontal',
        per_page: '30',
        safesearch: 'true',
        min_width: '640',
    })

    const res = await fetch(`https://pixabay.com/api/?${params}`)
    if (!res.ok) {
        console.warn(`[Pixabay] API 오류: ${res.status}`)
        return []
    }

    const data = await res.json()
    // webformatURL: 웹 표시 전용 URL (핫링크 허용), _640을 _1280으로 교체해 고해상도 사용
    const hits: Array<{ webformatURL: string; tags: string }> = data.hits ?? []
    if (hits.length === 0) return []

    // 사람 관련 태그 포함 이미지 제외
    const personTags = ['person', 'people', 'man', 'woman', 'human', 'face', 'portrait', 'crowd', 'girl', 'boy', 'child']
    const filtered = hits.filter(h => {
        const tags = h.tags.toLowerCase()
        return !personTags.some(t => tags.includes(t))
    })

    // 관련도 상위 15개 중 랜덤 3개 — 품질 유지 + 매번 다른 이미지
    const pool = (filtered.length > 0 ? filtered : hits).slice(0, 15)
    const shuffled = [...pool].sort(() => Math.random() - 0.5)
    return shuffled
        .slice(0, Math.min(3, shuffled.length))
        .map(h => h.webformatURL)
        .filter(Boolean)
}

/**
 * 이슈 제목과 카테고리로 Pixabay 이미지 URL 최대 3개 반환
 * @returns 이미지 URL 배열 (최대 3개) — 실패 시 빈 배열
 */
export async function fetchPixabayImages(title: string, category: string): Promise<string[]>
export async function fetchPixabayImages(title: string, category: string, debug: true): Promise<{ urls: string[]; keyword: string; isDark: boolean; source: 'groq' | 'fallback' }>
export async function fetchPixabayImages(title: string, category: string, debug?: boolean): Promise<string[] | { urls: string[]; keyword: string; isDark: boolean; source: 'groq' | 'fallback' }> {
    const apiKey = process.env.PIXABAY_API_KEY
    if (!apiKey) return debug ? { urls: [], keyword: '', isDark: false, source: 'fallback' } : []

    // 1차: Groq로 영어 키워드 + 톤 추출 후 검색
    const groqResult = await extractKeywordsAndTone(title, category)
    if (groqResult) {
        try {
            const urls = await searchPixabay(groqResult.keywords, apiKey)
            if (urls.length > 0) return debug ? { urls, keyword: groqResult.keywords, isDark: groqResult.isDark, source: 'groq' } : urls
        } catch {
            // 실패 시 카테고리 폴백으로 진행
        }
    }

    // 2차 폴백: 카테고리 영어 키워드로 재검색 (톤 미적용)
    const fallbackQuery = CATEGORY_FALLBACK[category] ?? 'news'
    try {
        const urls = await searchPixabay(fallbackQuery, apiKey)
        return debug ? { urls, keyword: fallbackQuery, isDark: false, source: 'fallback' } : urls
    } catch {
        return debug ? { urls: [], keyword: fallbackQuery, isDark: false, source: 'fallback' } : []
    }
}
