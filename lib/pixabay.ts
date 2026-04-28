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
                        content: `You pick a Pixabay background photo for Korean news thumbnails.
Output 2-3 specific English keywords representing the SCENE, SETTING, or OBJECT of this news.
Avoid person, face, crowd, portrait keywords. Focus on visually recognizable locations or objects.

Tone: append ::dark or ::bright based on topic sentiment.
- ::dark → scandal, accident, crime, conflict, crisis, controversy, protest, disaster
- ::bright → achievement, award, victory, celebration, launch, record, comeback, positive

Category: ${category}
Examples:
- [연예] "BTS 새 앨범 발매" → "concert stage lights::bright"
- [연예] "지수 크레딧 삭제 논란" → "music studio dark::dark"
- [연예] "아이유 콘서트 매진" → "stage spotlight audience::bright"
- [연예] "배우 음주운전 적발" → "night road police::dark"
- [스포츠] "토트넘 강등 위기" → "empty stadium fog::dark"
- [스포츠] "손흥민 골든부트 수상" → "soccer stadium trophy::bright"
- [정치] "국회의원 막말 논란" → "government building interior::dark"
- [정치] "대통령 취임식" → "flag ceremony podium::bright"
- [사회] "이태원 참사 추모" → "candles memorial night::dark"
- [사회] "산불 피해 확산" → "forest fire smoke::dark"
- [경제] "한국은행 기준금리 인하" → "bank building finance::dark"
- [경제] "삼성전자 노조 파업" → "factory industrial workers::dark"
- [경제] "코스피 사상 최고치" → "stock market graph city::bright"
- [기술] "AI 스타트업 투자 열풍" → "circuit board server room::bright"
- [세계] "이스라엘 공습" → "ruins destruction smoke::dark"
- [세계] "G7 정상회담" → "conference hall diplomacy::bright"
- [생활문화] "카페 창업 열풍" → "cafe interior coffee shop::bright"

Korean headline: "${title}"
Reply with ONLY the keywords::tone format, nothing else.`,
                    },
                ],
                max_tokens: 40,
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

// 항상 충분한 결과가 보장되는 범용 쿼리 (최후 보루)
const SAFE_FALLBACK_QUERIES = [
    'nature landscape',
    'abstract bokeh blur',
    'sky clouds sunlight',
    'city night lights',
]

const PERSON_TAGS = ['person', 'people', 'man', 'woman', 'human', 'face', 'portrait', 'crowd', 'girl', 'boy', 'child']

/**
 * Pixabay 검색 후 랜덤 URL 배열 반환 (최대 needed개)
 * 사람 관련 태그 이미지는 우선 제외 (3개 미만이면 포함)
 */
async function searchPixabay(query: string, apiKey: string, needed: number, seed?: number): Promise<string[]> {
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

    const filtered = hits.filter(h => !PERSON_TAGS.some(t => h.tags.toLowerCase().includes(t)))
    const pool = filtered.length >= needed ? filtered : hits

    let rng = seed !== undefined ? seed : Math.floor(Math.random() * 100000)
    const nextRng = () => { rng = (rng * 1664525 + 1013904223) & 0xffffffff; return (rng >>> 0) / 0x100000000 }
    const shuffled = [...pool]
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(nextRng() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }

    return shuffled.slice(0, needed).map(h => h.webformatURL || h.largeImageURL).filter(Boolean)
}

/**
 * 이슈 제목과 카테고리로 Pixabay 이미지 URL 3개 반환
 * 여러 쿼리를 순차 시도해 반드시 3개를 채움:
 *   1차: Groq 키워드 → 2차: 카테고리 폴백 → 3차: 범용 안전 쿼리들
 */
export async function fetchPixabayImages(title: string, category: string, seed?: number): Promise<string[]>
export async function fetchPixabayImages(title: string, category: string, debug: true): Promise<{ urls: string[]; keyword: string; isDark: boolean; source: 'groq' | 'fallback' }>
export async function fetchPixabayImages(title: string, category: string, seedOrDebug?: number | boolean): Promise<string[] | { urls: string[]; keyword: string; isDark: boolean; source: 'groq' | 'fallback' }> {
    const debug = seedOrDebug === true
    const seed = typeof seedOrDebug === 'number' ? seedOrDebug : undefined
    const apiKey = process.env.PIXABAY_API_KEY
    if (!apiKey) return debug ? { urls: [], keyword: '', isDark: false, source: 'fallback' } : []

    const TARGET = 3
    const collected: string[] = []
    const addUnique = (urls: string[]) => {
        for (const u of urls) {
            if (!collected.includes(u) && collected.length < TARGET) collected.push(u)
        }
    }

    let firstKeyword = ''
    let firstIsDark = false
    let source: 'groq' | 'fallback' = 'fallback'

    // 1차: Groq로 영어 키워드 + 톤 추출 후 검색
    const groqResult = await extractKeywordsAndTone(title, category)
    if (groqResult) {
        try {
            const urls = await searchPixabay(groqResult.keywords, apiKey, TARGET, seed)
            addUnique(urls)
            if (urls.length > 0) {
                firstKeyword = groqResult.keywords
                firstIsDark = groqResult.isDark
                source = 'groq'
            }
        } catch {
            // 실패 시 다음 단계로
        }
    }

    // 2차: 카테고리 폴백 키워드
    if (collected.length < TARGET) {
        const fallbackQuery = CATEGORY_FALLBACK[category] ?? 'news'
        try {
            const urls = await searchPixabay(fallbackQuery, apiKey, TARGET - collected.length, seed)
            addUnique(urls)
            if (!firstKeyword && urls.length > 0) firstKeyword = fallbackQuery
        } catch {
            // 실패 시 다음 단계로
        }
    }

    // 3차: 범용 안전 쿼리 순차 시도 (항상 결과 충분)
    if (collected.length < TARGET) {
        for (const q of SAFE_FALLBACK_QUERIES) {
            if (collected.length >= TARGET) break
            try {
                const urls = await searchPixabay(q, apiKey, TARGET - collected.length, seed)
                addUnique(urls)
            } catch {
                // 계속 다음 쿼리 시도
            }
        }
    }

    if (debug) return { urls: collected, keyword: firstKeyword, isDark: firstIsDark, source }
    return collected
}
