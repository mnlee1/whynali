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

CRITICAL for [연예] category: ALWAYS use entertainment/media visual keywords (cinema, film, stage, screen, neon, spotlight, drama) regardless of the controversy topic. NEVER use literal keywords from the headline (e.g. 역사→history, 왜곡→ruins, 논란→smoke alone).
- "역사 왜곡 논란" in 연예 → drama filming dark (NOT ruins/history)
- "사생활 폭로" in 연예 → cinema dark (NOT literal exposure)
- "표절 논란" in 연예 → film reel dark (NOT document/paper)

Category: ${category}
Examples:
- [연예] "BTS 새 앨범 발매" → "neon bokeh::bright"
- [연예] "지수 크레딧 삭제 논란" → "dark smoke::dark"
- [연예] "아이유 콘서트 매진" → "stage spotlight::bright"
- [연예] "배우 음주운전 적발" → "night rain::dark"
- [연예] "드라마 역사 왜곡 논란" → "drama filming::dark"
- [연예] "드라마 고증 오류 논란" → "cinema screen::dark"
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

interface PexelsHit {
    preview: string  // src.large — 관리자 썸네일용
    full: string     // src.original — 동영상 생성용
}

/**
 * Pexels 검색 후 PexelsHit 배열 반환
 */
async function searchPexels(query: string, apiKey: string, needed: number, seed?: number): Promise<PexelsHit[]> {
    const params = new URLSearchParams({
        query,
        per_page: '30',
        orientation: 'portrait',
    })

    const res = await fetch(`https://api.pexels.com/v1/search?${params}`, {
        headers: { Authorization: apiKey },
    })
    if (!res.ok) {
        console.error(`[Pexels] API 오류 status=${res.status} query="${query}"`)
        return []
    }

    const data = await res.json()
    const photos: Array<{ src: { large: string; original: string } }> = data.photos ?? []
    if (photos.length === 0) {
        console.warn(`[Pexels] 검색 결과 0건 query="${query}"`)
        return []
    }

    let rng = seed !== undefined ? seed : Math.floor(Math.random() * 100000)
    const nextRng = () => { rng = (rng * 1664525 + 1013904223) & 0xffffffff; return (rng >>> 0) / 0x100000000 }
    const shuffled = [...photos]
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(nextRng() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }

    return shuffled.slice(0, needed)
        .map(p => ({ preview: p.src.large, full: p.src.original }))
        .filter(h => h.preview)
}

async function collectPexelsHits(title: string, category: string, count: number, seed?: number): Promise<PexelsHit[]> {
    const apiKey = process.env.PEXELS_API_KEY
    if (!apiKey) return []

    const groqResult = await extractKeywordsAndTone(title, category)
    if (groqResult) {
        try {
            const hits = await searchPexels(groqResult.keywords, apiKey, count, seed)
            if (hits.length > 0) return hits
        } catch {}
    }

    const fallbackQuery = CATEGORY_FALLBACK[category] ?? 'news'
    try {
        return await searchPexels(fallbackQuery, apiKey, count, seed)
    } catch {
        return []
    }
}

export async function fetchPexelsImages(title: string, category: string, seed?: number, count = 3): Promise<string[]> {
    const hits = await collectPexelsHits(title, category, count, seed)
    return hits.map(h => h.preview)
}

export async function fetchPexelsImagesWithFull(
    title: string, category: string, seed?: number, count = 3
): Promise<{ previews: string[]; fulls: string[] }> {
    const hits = await collectPexelsHits(title, category, count, seed)
    return {
        previews: hits.map(h => h.preview),
        fulls: hits.map(h => h.full),
    }
}
