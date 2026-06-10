/**
 * lib/pexels.ts
 *
 * Pexels 이미지 검색 유틸리티 (이슈 썸네일용)
 * - PEXELS_API_KEY 없으면 빈 배열 반환 (안전하게 스킵)
 * - 이미지 파일 저장 없음, URL만 반환 (영구 URL, 만료 없음)
 * - 라이선스: Pexels License (상업적 이용 가능, 출처 표기 불필요)
 * - API 한도: 200회/시간, 20,000회/월
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
 * Groq API로 한국어 이슈 제목 → 영어 검색 키워드 + 톤(dark/bright) 추출
 */
async function extractKeywordsAndTone(title: string, category: string): Promise<{ keywords: string; isDark: boolean } | null> {
    const keys = (process.env.GROQ_API_KEY ?? '')
        .split(',')
        .map((k) => k.trim())
        .filter((k) => k.length > 0)

    if (keys.length === 0) return null

    for (const apiKey of keys) {
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
                            content: `You pick a Pexels background photo for Korean news thumbnails.
Output 2-3 specific English keywords representing the SCENE, SETTING, or OBJECT. Avoid person/face keywords.

Tone: append ::dark or ::bright based on topic sentiment.
- ::dark → scandal, accident, crime, conflict, crisis, controversy, protest, disaster, fraud, evasion
- ::bright → achievement, award, victory, celebration, launch, record, comeback, positive, romance

CRITICAL RULES (override all other logic):
1. [연예] ALWAYS use entertainment/media visual keywords (cinema, stage, film, screen, neon, spotlight). NEVER map 역사→history/ruins, 왜곡→ruins, 논란→smoke.
2. For legal/crime topics (구속, 영장, 기소, 재판, 수사, 혐의, 징역, 체포) in ANY category: choose the most contextually fitting scene below. NEVER use "court" alone (it maps to sports courts on Pexels).
   - 영장 발부 / 재판 / 기소 → "courthouse exterior dark" or "gavel justice law"
   - 구속 / 체포 → "prison bars metal dark" or "police badge justice"
   - 수사 / 혐의 → "law document evidence dark" or "scales justice dark"
   - 성범죄 / 폭행 → "crime scene barrier dark" or "law enforcement badge"
   - Vary the keyword — do NOT always pick the same one. Consider which scene best fits the headline.
3. [스포츠] topic with legal/crime angle: use legal/crime scene keywords (rule 2), NOT sports keywords.

Category: ${category}
Examples:
- [연예] "BTS 새 앨범 발매" → "concert stage lights::bright"
- [연예] "아이유 콘서트 매진" → "stage spotlight neon::bright"
- [연예] "배우 음주운전 적발" → "night road rain::dark"
- [연예] "아이돌 열애설 인정" → "couple romantic flowers::bright"
- [연예] "드라마 역사 왜곡 논란" → "drama filming::dark"
- [연예] "배우 마약 혐의 구속" → "prison bars metal dark::dark"
- [스포츠] "토트넘 강등 위기" → "empty stadium fog::dark"
- [스포츠] "손흥민 골든부트 수상" → "soccer stadium trophy::bright"
- [스포츠] "야구 선수 도핑 적발" → "laboratory syringe medical::dark"
- [스포츠] "선수 구속영장 발부" → "courthouse exterior dark::dark"
- [스포츠] "감독 성폭행 혐의 구속" → "law enforcement badge dark::dark"
- [정치] "국회의원 막말 논란" → "government building interior::dark"
- [정치] "대통령 취임식" → "flag ceremony podium::bright"
- [정치] "의원 뇌물 혐의 구속" → "gavel justice law::dark"
- [사회] "이태원 참사 추모" → "candles memorial night::dark"
- [사회] "산불 피해 확산" → "forest fire smoke::dark"
- [사회] "피의자 구속영장 발부" → "scales justice dark::dark"
- [사회] "살인범 기소" → "courthouse exterior dark::dark"
- [경제] "삼성전자 노조 파업" → "factory industrial strike::dark"
- [경제] "코스피 사상 최고치" → "stock market graph city::bright"
- [기술] "AI 스타트업 투자 열풍" → "circuit board server room::bright"
- [기술] "개인정보 유출 사고" → "cybersecurity hacker dark::dark"
- [세계] "이스라엘 공습" → "ruins destruction smoke::dark"
- [세계] "G7 정상회담" → "conference hall diplomacy::bright"
- [생활문화] "카페 창업 열풍" → "cafe interior coffee shop::bright"
- [생활문화] "반려동물 인구 급증" → "pet dog park::bright"

Korean headline: "${title}"
Reply with ONLY the 2-word keywords::tone format, nothing else.`,
                        },
                    ],
                    max_tokens: 25,
                    temperature: 0,
                }),
            })

            if (res.status === 401) continue
            if (!res.ok) continue

            const data = await res.json()
            const raw: string = data.choices?.[0]?.message?.content?.trim() ?? ''
            if (!raw) continue

            const [keywords, tone] = raw.split('::')
            return {
                keywords: keywords.trim(),
                isDark: tone?.trim() === 'dark',
            }
        } catch {
            continue
        }
    }

    return null
}

/**
 * Pexels 검색 후 랜덤 N개 반환 (seed 기반 셔플)
 * preview(large)와 full(original) 쌍으로 반환
 */
async function searchPexels(
    query: string,
    apiKey: string,
    seed?: number,
    count = 3,
): Promise<Array<{ large: string; original: string }>> {
    const params = new URLSearchParams({
        query,
        per_page: '30',
        orientation: 'landscape',
    })

    const res = await fetch(`https://api.pexels.com/v1/search?${params}`, {
        headers: { Authorization: apiKey },
    })
    if (!res.ok) {
        console.warn(`[Pexels] API 오류: ${res.status}`)
        return []
    }

    const data = await res.json()
    const photos: Array<{ src: { large: string; original: string } }> = data.photos ?? []
    if (photos.length === 0) return []

    // seed 기반 Fisher-Yates 셔플 (재검색마다 다른 결과)
    let rng = seed !== undefined ? seed : Math.floor(Math.random() * 100000)
    const nextRng = () => { rng = (rng * 1664525 + 1013904223) & 0xffffffff; return (rng >>> 0) / 0x100000000 }
    const shuffled = [...photos]
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(nextRng() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }

    return shuffled
        .slice(0, count)
        .filter(p => p.src.large)
        .map(p => ({ large: p.src.large, original: p.src.original }))
}

/**
 * 이슈 제목과 카테고리로 Pexels 이미지 URL 반환 (preview만)
 * @returns URL 배열 — 실패 시 빈 배열
 */
export async function fetchPexelsImages(
    title: string,
    category: string,
    seed?: number,
    count = 3,
): Promise<string[]> {
    const apiKey = process.env.PEXELS_API_KEY
    if (!apiKey) return []

    const groqResult = await extractKeywordsAndTone(title, category)
    if (groqResult) {
        try {
            const photos = await searchPexels(groqResult.keywords, apiKey, seed, count)
            if (photos.length > 0) return photos.map(p => p.large)
        } catch {
            // 실패 시 카테고리 폴백으로 진행
        }
    }

    const fallbackQuery = CATEGORY_FALLBACK[category] ?? 'news'
    try {
        const photos = await searchPexels(fallbackQuery, apiKey, seed, count)
        return photos.map(p => p.large)
    } catch {
        return []
    }
}

/**
 * 이슈 제목과 카테고리로 Pexels 이미지 URL 반환 (preview + original)
 * 숏폼 생성 시 원본 해상도가 필요한 경우 사용
 * @returns { previews: large URL 배열, fulls: original URL 배열 }
 */
export async function fetchPexelsImagesWithFull(
    title: string,
    category: string,
    seed?: number,
    count = 3,
): Promise<{ previews: string[]; fulls: string[] }> {
    const apiKey = process.env.PEXELS_API_KEY
    if (!apiKey) return { previews: [], fulls: [] }

    const groqResult = await extractKeywordsAndTone(title, category)
    if (groqResult) {
        try {
            const photos = await searchPexels(groqResult.keywords, apiKey, seed, count)
            if (photos.length > 0) return {
                previews: photos.map(p => p.large),
                fulls: photos.map(p => p.original),
            }
        } catch {
            // 실패 시 카테고리 폴백으로 진행
        }
    }

    const fallbackQuery = CATEGORY_FALLBACK[category] ?? 'news'
    try {
        const photos = await searchPexels(fallbackQuery, apiKey, seed, count)
        return {
            previews: photos.map(p => p.large),
            fulls: photos.map(p => p.original),
        }
    } catch {
        return { previews: [], fulls: [] }
    }
}

/**
 * 씬 텍스트 배열을 받아 씬마다 개별 Pexels 검색.
 * 각 씬 텍스트에서 키워드를 추출해 씬에 최적화된 이미지를 반환.
 * 키워드 추출 실패 시 카테고리 폴백 이미지 사용.
 */
export async function fetchPexelsImagesForScenes(
    sceneTexts: string[],
    category: string,
    seed?: number,
): Promise<{ previews: string[]; fulls: string[] }> {
    const apiKey = process.env.PEXELS_API_KEY
    if (!apiKey) return { previews: [], fulls: [] }

    const fallbackQuery = CATEGORY_FALLBACK[category] ?? 'news'
    const usedUrls = new Set<string>()

    const results = await Promise.all(
        sceneTexts.map(async (text, idx) => {
            // 씬마다 다른 seed를 사용해 동일 키워드라도 다른 사진이 선택되도록
            const sceneSeed = seed !== undefined ? seed + idx * 7919 : undefined
            const groqResult = await extractKeywordsAndTone(text, category)
            try {
                const query = groqResult?.keywords ?? fallbackQuery
                const photos = await searchPexels(query, apiKey, sceneSeed, 5)
                const pick = photos.find(p => !usedUrls.has(p.large))
                if (pick) {
                    usedUrls.add(pick.large)
                    return { preview: pick.large, full: pick.original }
                }
            } catch { /* 폴백으로 진행 */ }
            // 폴백
            try {
                const photos = await searchPexels(fallbackQuery, apiKey, sceneSeed, 5)
                const pick = photos.find(p => !usedUrls.has(p.large))
                if (pick) {
                    usedUrls.add(pick.large)
                    return { preview: pick.large, full: pick.original }
                }
            } catch { /* 최종 실패 */ }
            return null
        })
    )

    return {
        previews: results.map(r => r?.preview ?? ''),
        fulls: results.map(r => r?.full ?? ''),
    }
}
