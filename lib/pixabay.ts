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
    '연예': 'stage spotlight neon',
    '스포츠': 'stadium lights aerial',
    '정치': 'marble columns government',
    '사회': 'city street urban blur',
    '경제': 'financial skyline glass',
    'IT과학': 'server room digital blue',
    '기술': 'server room digital blue',
    '생활문화': 'cafe interior warm light',
    '세계': 'ocean horizon earth',
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
                        content: `You pick a Pixabay background photo mood for Korean news thumbnails.
Output 2 simple visual/atmospheric English words + ::dark or ::bright tone.
Focus on ATMOSPHERE, not news content. Avoid person/face keywords.

Tone rules:
- ::dark → scandal, accident, crime, conflict, death, protest, crisis, defeat, controversy
- ::bright → achievement, award, victory, celebration, debut, record, comeback, release

Category: ${category}
Examples:
- [연예] "BTS 새 앨범 발매" → "neon bokeh::bright"
- [연예] "지수 크레딧 삭제 논란" → "dark smoke::dark"
- [연예] "아이유 콘서트 매진" → "stage spotlight::bright"
- [연예] "배우 음주운전 적발" → "night rain::dark"
- [스포츠] "토트넘 강등 위기" → "stadium fog::dark"
- [스포츠] "손흥민 골든부트 수상" → "stadium golden::bright"
- [정치] "국회의원 막말 논란" → "marble shadow::dark"
- [정치] "대통령 취임식" → "flag sunrise::bright"
- [사회] "이태원 참사 추모" → "candles dark::dark"
- [사회] "산불 피해 확산" → "fire smoke::dark"
- [경제] "삼성전자 노조 파업" → "factory smoke::dark"
- [경제] "코스피 사상 최고치" → "skyline sunrise::bright"
- [기술] "AI 스타트업 투자 열풍" → "circuit blue::bright"
- [세계] "이스라엘 공습" → "ruins smoke::dark"
- [세계] "G7 정상회담" → "marble columns::bright"
- [생활문화] "카페 창업 열풍" → "cafe warm::bright"

Korean headline: "${title}"
Reply with ONLY the 2-word keywords::tone format, nothing else.`,
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
async function searchPixabay(query: string, apiKey: string, seed?: number): Promise<string[]> {
    const params = new URLSearchParams({
        key: apiKey,
        q: query,
        image_type: 'photo',
        orientation: 'horizontal',
        per_page: '50',
        safesearch: 'true',
        min_width: '1280',
    })

    const res = await fetch(`https://pixabay.com/api/?${params}`)
    if (!res.ok) {
        console.warn(`[Pixabay] API 오류: ${res.status}`)
        return []
    }

    const data = await res.json()
    const hits: Array<{ webformatURL: string; largeImageURL: string; tags: string }> = data.hits ?? []
    if (hits.length === 0) return []

    // 사람 관련 태그 포함 이미지 제외 (가능한 경우만)
    const personTags = ['person', 'people', 'man', 'woman', 'human', 'face', 'portrait', 'crowd', 'girl', 'boy', 'child']
    const filtered = hits.filter(h => {
        const tags = h.tags.toLowerCase()
        return !personTags.some(t => tags.includes(t))
    })

    // seed 기반 셔플 (재생성 시 다른 결과)
    let rng = seed !== undefined ? seed : Math.floor(Math.random() * 100000)
    const seededRandom = () => { rng = (rng * 1664525 + 1013904223) & 0xffffffff; return (rng >>> 0) / 0x100000000 }

    // 필터 후 3개 미만이면 원본 hits로 부족분 보충 (항상 3개 반환)
    const shuffledFiltered = [...filtered].sort(() => seededRandom() - 0.5)
    const selected = shuffledFiltered.slice(0, 3)
    if (selected.length < 3) {
        const usedSet = new Set(selected.map(h => h.largeImageURL || h.webformatURL))
        const extras = [...hits]
            .sort(() => seededRandom() - 0.5)
            .filter(h => !usedSet.has(h.largeImageURL || h.webformatURL))
            .slice(0, 3 - selected.length)
        selected.push(...extras)
    }

    return selected
        .map(h => h.largeImageURL || h.webformatURL)
        .filter(Boolean)
}

/**
 * 이슈 제목과 카테고리로 Pixabay 이미지 URL 최대 3개 반환
 * @returns 이미지 URL 배열 (최대 3개) — 실패 시 빈 배열
 */
export async function fetchPixabayImages(title: string, category: string, seed?: number): Promise<string[]>
export async function fetchPixabayImages(title: string, category: string, debug: true): Promise<{ urls: string[]; keyword: string; isDark: boolean; source: 'groq' | 'fallback' }>
export async function fetchPixabayImages(title: string, category: string, seedOrDebug?: number | boolean): Promise<string[] | { urls: string[]; keyword: string; isDark: boolean; source: 'groq' | 'fallback' }> {
    const debug = seedOrDebug === true
    const seed = typeof seedOrDebug === 'number' ? seedOrDebug : undefined
    const apiKey = process.env.PIXABAY_API_KEY
    if (!apiKey) return debug ? { urls: [], keyword: '', isDark: false, source: 'fallback' } : []

    // 1차: Groq로 영어 키워드 + 톤 추출 후 검색
    const groqResult = await extractKeywordsAndTone(title, category)
    if (groqResult) {
        try {
            const urls = await searchPixabay(groqResult.keywords, apiKey, seed)
            if (urls.length > 0) return debug ? { urls, keyword: groqResult.keywords, isDark: groqResult.isDark, source: 'groq' } : urls
        } catch {
            // 실패 시 카테고리 폴백으로 진행
        }
    }

    // 2차 폴백: 카테고리 영어 키워드로 재검색 (톤 미적용)
    const fallbackQuery = CATEGORY_FALLBACK[category] ?? 'news'
    try {
        const urls = await searchPixabay(fallbackQuery, apiKey, seed)
        return debug ? { urls, keyword: fallbackQuery, isDark: false, source: 'fallback' } : urls
    } catch {
        return debug ? { urls: [], keyword: fallbackQuery, isDark: false, source: 'fallback' } : []
    }
}
