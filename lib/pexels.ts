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
2. For any arrest/legal topic (구속, 영장, 기소, 재판, 수사, 혐의, 징역, 체포) in ANY category: use "handcuffs arrest crime::dark" or "courthouse justice law::dark". NEVER output "court" alone — it maps to sports courts on Pexels, not a courtroom.
3. [스포츠] topic with legal/crime angle: use crime/legal keywords, NOT sports keywords.

Category: ${category}
Examples:
- [연예] "BTS 새 앨범 발매" → "concert stage lights::bright"
- [연예] "아이유 콘서트 매진" → "stage spotlight neon::bright"
- [연예] "배우 음주운전 적발" → "night road rain::dark"
- [연예] "아이돌 열애설 인정" → "couple romantic flowers::bright"
- [연예] "드라마 역사 왜곡 논란" → "drama filming::dark"
- [연예] "배우 마약 혐의 구속" → "handcuffs arrest crime::dark"
- [스포츠] "토트넘 강등 위기" → "empty stadium fog::dark"
- [스포츠] "손흥민 골든부트 수상" → "soccer stadium trophy::bright"
- [스포츠] "야구 선수 도핑 적발" → "laboratory syringe medical::dark"
- [스포츠] "선수 구속영장 발부" → "handcuffs arrest crime::dark"
- [스포츠] "감독 성폭행 혐의 구속" → "handcuffs courthouse dark::dark"
- [정치] "국회의원 막말 논란" → "government building interior::dark"
- [정치] "대통령 취임식" → "flag ceremony podium::bright"
- [정치] "의원 뇌물 혐의 구속" → "handcuffs courthouse justice::dark"
- [사회] "이태원 참사 추모" → "candles memorial night::dark"
- [사회] "산불 피해 확산" → "forest fire smoke::dark"
- [사회] "피의자 구속영장 발부" → "handcuffs arrest crime::dark"
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
 * Pexels 검색 후 결과 중 랜덤 3개 URL 반환 (src.large — 영구 URL)
 */
async function searchPexels(query: string, apiKey: string, seed?: number): Promise<string[]> {
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
    const photos: Array<{ src: { large: string } }> = data.photos ?? []
    if (photos.length === 0) return []

    // seed 기반 Fisher-Yates 셔플 (재생성마다 균등하게 다른 결과)
    let rng = seed !== undefined ? seed : Math.floor(Math.random() * 100000)
    const nextRng = () => { rng = (rng * 1664525 + 1013904223) & 0xffffffff; return (rng >>> 0) / 0x100000000 }
    const shuffled = [...photos]
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(nextRng() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }

    return shuffled.slice(0, 3).map(p => p.src.large).filter(Boolean)
}

/**
 * 이슈 제목과 카테고리로 Pexels 이미지 URL 최대 3개 반환
 * @returns 이미지 URL 배열 (최대 3개) — 실패 시 빈 배열
 */
export async function fetchPexelsImages(title: string, category: string, seed?: number): Promise<string[]> {
    const apiKey = process.env.PEXELS_API_KEY
    if (!apiKey) return []

    // 1차: Groq로 영어 키워드 추출 후 검색
    const groqResult = await extractKeywordsAndTone(title, category)
    if (groqResult) {
        try {
            const urls = await searchPexels(groqResult.keywords, apiKey, seed)
            if (urls.length > 0) return urls
        } catch {
            // 실패 시 카테고리 폴백으로 진행
        }
    }

    // 2차 폴백: 카테고리 영어 키워드로 재검색
    const fallbackQuery = CATEGORY_FALLBACK[category] ?? 'news'
    try {
        return await searchPexels(fallbackQuery, apiKey, seed)
    } catch {
        return []
    }
}
