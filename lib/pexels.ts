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
                        content: `You pick a Pexels background photo mood for Korean news thumbnails.
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
