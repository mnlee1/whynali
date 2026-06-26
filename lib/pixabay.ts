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

    // [테스트], [속보] 등 대괄호 프리픽스 제거
    const cleanTitle = title.replace(/^\[.*?\]\s*/, '').trim()

    try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'qwen/qwen3.6-27b',
                messages: [
                    {
                        role: 'user',
                        content: `You pick a Pixabay background photo for Korean news thumbnails.
Output 2-3 specific English keywords representing the SCENE, SETTING, or OBJECT of this news.
Focus on visually recognizable locations, objects, or symbolic scenes.

Tone: append ::dark or ::bright based on topic sentiment.
- ::dark → scandal, accident, crime, conflict, crisis, controversy, protest, disaster, tax evasion, doping, fraud
- ::bright → achievement, award, victory, celebration, launch, record, comeback, positive, love, romance

Category: ${category}
IMPORTANT: For drama/show titles, extract the VISUAL THEME of the show, not literal word meanings.
- "취사병" in a drama = kitchen cooking chef (NOT military)
- "형사" in a drama = detective crime scene (NOT police uniform)
- "의사" in a drama = hospital surgery (NOT medical textbook)

Examples:
- [연예] "BTS 새 앨범 발매" → "concert stage lights::bright"
- [연예] "아이유 콘서트 매진" → "stage spotlight neon::bright"
- [연예] "배우 음주운전 적발" → "night road police::dark"
- [연예] "아이돌 열애설 공식 인정" → "couple romantic flowers::bright"
- [연예] "유명 유튜버 세금 탈루 의혹" → "tax document money audit::dark"
- [연예] "연예인 사생활 폭로 논란" → "dark hallway spotlight::dark"
- [연예] "취사병 전설이 되다 첫 방송" → "kitchen cooking chef::bright"
- [연예] "형사 록 첫 방송" → "detective crime night::dark"
- [스포츠] "토트넘 강등 위기" → "empty stadium fog::dark"
- [스포츠] "손흥민 골든부트 수상" → "soccer stadium trophy::bright"
- [스포츠] "야구 선수 도핑 적발" → "laboratory syringe medical::dark"
- [스포츠] "올림픽 금메달 획득" → "podium medal celebration::bright"
- [정치] "국회의원 막말 논란" → "government building interior::dark"
- [정치] "대통령 취임식" → "flag ceremony podium::bright"
- [정치] "선거 부정 의혹" → "ballot box voting::dark"
- [사회] "이태원 참사 추모" → "candles memorial night::dark"
- [사회] "산불 피해 확산" → "forest fire smoke::dark"
- [사회] "묻지마 범죄 급증" → "dark alley urban night::dark"
- [경제] "한국은행 기준금리 인하" → "bank building finance::dark"
- [경제] "삼성전자 노조 파업" → "factory industrial strike::dark"
- [경제] "코스피 사상 최고치" → "stock market graph city::bright"
- [경제] "가상화폐 시세 폭등" → "digital currency blockchain::bright"
- [기술] "AI 스타트업 투자 열풍" → "circuit board server room::bright"
- [기술] "개인정보 유출 사고" → "cybersecurity hacker dark::dark"
- [세계] "이스라엘 공습" → "ruins destruction smoke::dark"
- [세계] "G7 정상회담" → "conference hall diplomacy::bright"
- [생활문화] "카페 창업 열풍" → "cafe interior coffee shop::bright"
- [생활문화] "반려동물 인구 급증" → "pet dog park::bright"

Korean headline: "${cleanTitle}"
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

/** 미리보기용(640px, 안정적) + 동영상용(1280px+, 고화질) URL 쌍 */
interface PixabayHit {
    preview: string  // webformatURL — 관리자 썸네일용
    full: string     // largeImageURL — 동영상 생성용
}

/**
 * Pixabay 검색 후 PixabayHit 배열 반환 (최대 needed개)
 * 사람 관련 태그 이미지는 우선 제외 (needed 미만이면 포함)
 */
async function searchPixabay(query: string, apiKey: string, needed: number, seed?: number): Promise<PixabayHit[]> {
    const params = new URLSearchParams({
        key: apiKey,
        q: query,
        image_type: 'photo',
        per_page: '50',
        safesearch: 'true',
        min_width: '1080',
    })

    let res: Response
    try {
        res = await fetch(`https://pixabay.com/api/?${params}`)
    } catch (e) {
        console.error(`[Pixabay] fetch 네트워크 예외 query="${query}" error=${e}`)
        return []
    }
    if (!res.ok) {
        const body = await res.text().catch(() => '')
        console.error(`[Pixabay] API 오류 status=${res.status} query="${query}" body=${body}`)
        return []
    }

    const data = await res.json()
    const hits: Array<{ webformatURL: string; largeImageURL: string; tags: string }> = data.hits ?? []
    if (hits.length === 0) {
        console.warn(`[Pixabay] 검색 결과 0건 query="${query}"`)
        return []
    }

    const filtered = hits.filter(h => !PERSON_TAGS.some(t => h.tags.toLowerCase().includes(t)))
    const pool = filtered.length >= needed ? filtered : hits

    let rng = seed !== undefined ? seed : Math.floor(Math.random() * 100000)
    const nextRng = () => { rng = (rng * 1664525 + 1013904223) & 0xffffffff; return (rng >>> 0) / 0x100000000 }
    const shuffled = [...pool]
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(nextRng() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }

    return shuffled.slice(0, needed).map(h => ({
        preview: h.webformatURL || h.largeImageURL || '',
        full: h.largeImageURL || h.webformatURL || '',
    })).filter(h => h.preview !== '')
}

interface CollectResult {
    hits: PixabayHit[]
    firstKeyword: string
    firstIsDark: boolean
    source: 'groq' | 'fallback'
}

/**
 * 1차(Groq 키워드) → 2차(카테고리 폴백) → 3차(범용 쿼리) 순서로
 * target개의 PixabayHit을 수집하는 내부 함수
 */
async function collectPixabayHits(title: string, category: string, target: number, seed?: number): Promise<CollectResult> {
    const apiKey = process.env.PIXABAY_API_KEY
    if (!apiKey) return { hits: [], firstKeyword: '', firstIsDark: false, source: 'fallback' }

    const collected: PixabayHit[] = []
    let firstKeyword = ''
    let firstIsDark = false
    let source: 'groq' | 'fallback' = 'fallback'

    const addUnique = (newHits: PixabayHit[]) => {
        for (const h of newHits) {
            if (!collected.some(c => c.preview === h.preview) && collected.length < target) {
                collected.push(h)
            }
        }
    }

    // 1차: Groq로 영어 키워드 + 톤 추출 후 검색
    const groqResult = await extractKeywordsAndTone(title, category)
    if (groqResult) {
        try {
            const hits = await searchPixabay(groqResult.keywords, apiKey, target, seed)
            addUnique(hits)
            if (hits.length > 0) {
                firstKeyword = groqResult.keywords
                firstIsDark = groqResult.isDark
                source = 'groq'
            }
        } catch {
            // 실패 시 다음 단계로
        }
    }

    // 2차: 카테고리 폴백 키워드
    if (collected.length < target) {
        const fallbackQuery = CATEGORY_FALLBACK[category] ?? 'news'
        try {
            const hits = await searchPixabay(fallbackQuery, apiKey, target - collected.length, seed)
            addUnique(hits)
            if (!firstKeyword && hits.length > 0) firstKeyword = fallbackQuery
        } catch {
            // 실패 시 다음 단계로
        }
    }

    // 3차: 범용 안전 쿼리 순차 시도 (항상 결과 충분)
    if (collected.length < target) {
        for (const q of SAFE_FALLBACK_QUERIES) {
            if (collected.length >= target) break
            try {
                const hits = await searchPixabay(q, apiKey, target - collected.length, seed)
                addUnique(hits)
            } catch {
                // 계속 다음 쿼리 시도
            }
        }
    }

    return { hits: collected, firstKeyword, firstIsDark, source }
}

/**
 * 이슈 제목과 카테고리로 Pixabay 이미지 URL 배열 반환 (미리보기용 preview URL)
 * 기존 호환성 유지: string[] 반환
 */
export async function fetchPixabayImages(title: string, category: string, seed?: number, count?: number): Promise<string[]>
export async function fetchPixabayImages(title: string, category: string, debug: true): Promise<{ urls: string[]; keyword: string; isDark: boolean; source: 'groq' | 'fallback' }>
export async function fetchPixabayImages(title: string, category: string, seedOrDebug?: number | boolean, count = 3): Promise<string[] | { urls: string[]; keyword: string; isDark: boolean; source: 'groq' | 'fallback' }> {
    const debug = seedOrDebug === true
    const seed = typeof seedOrDebug === 'number' ? seedOrDebug : undefined
    if (!process.env.PIXABAY_API_KEY) return debug ? { urls: [], keyword: '', isDark: false, source: 'fallback' } : []

    const TARGET = debug ? 3 : count
    const result = await collectPixabayHits(title, category, TARGET, seed)
    const urls = result.hits.map(h => h.preview)

    if (debug) return { urls, keyword: result.firstKeyword, isDark: result.firstIsDark, source: result.source }
    return urls
}

/**
 * 이슈 제목과 카테고리로 Pixabay 이미지를 검색해
 * 미리보기용(preview, 640px) + 동영상 생성용(full, 1280px+) URL을 함께 반환
 */
export async function fetchPixabayImagesWithFull(
    title: string, category: string, seed?: number, count = 3
): Promise<{ previews: string[]; fulls: string[] }> {
    if (!process.env.PIXABAY_API_KEY) return { previews: [], fulls: [] }
    const result = await collectPixabayHits(title, category, count, seed)
    return {
        previews: result.hits.map(h => h.preview),
        fulls: result.hits.map(h => h.full),
    }
}
