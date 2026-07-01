/**
 * lib/pexels.ts
 *
 * Pexels 이미지 검색 유틸리티 (이슈 썸네일용)
 * - PEXELS_API_KEY 없으면 빈 배열 반환 (안전하게 스킵)
 * - 이미지 파일 저장 없음, URL만 반환 (영구 URL, 만료 없음)
 * - 라이선스: Pexels License (상업적 이용 가능, 출처 표기 불필요)
 * - API 한도: 200회/시간, 20,000회/월
 */

import { callGroq } from '@/lib/ai/groq-client'

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
 * callGroq로 한국어 이슈 제목 → 영어 검색 키워드 + 톤(dark/bright) 추출
 * JSON 포맷 사용 → thinking 블록 없음, 다중 키 순환 자동 처리
 */
export async function extractKeywordsAndTone(title: string, category: string, temperature = 0, exclude = ''): Promise<{ keywords: string; isDark: boolean } | null> {
    const prompt = `You pick a Pexels background photo for Korean news thumbnails.
Output JSON with "keywords" (2-3 English words for the SCENE/SETTING/OBJECT, no person/face) and "isDark" (boolean).

Tone rules:
- isDark: true → scandal, accident, crime, conflict, crisis, controversy, protest, disaster, fraud, resignation
- isDark: false → achievement, award, victory, celebration, launch, record, comeback, positive, romance

CRITICAL RULES:
1. [연예] IGNORE Korean person names — focus ONLY on the EVENT. Always use entertainment/media visual keywords.
2. Legal/crime topics (구속, 영장, 기소, 재판, 수사, 혐의, 징역, 체포) in ANY category:
   - 영장/재판/기소 → "courthouse exterior" or "gavel justice law"
   - 구속/체포 → "prison bars metal" or "police badge justice"
   - 수사/혐의 → "law document evidence" or "scales justice"
   - 성범죄/폭행 → "crime scene barrier" or "law enforcement badge"
3. [스포츠] with legal/crime angle: use legal keywords (rule 2), NOT sports keywords.

Category: ${category}
Examples:
- [연예] "BTS 새 앨범" → {"keywords":"concert stage lights","isDark":false}
- [연예] "배우 음주운전" → {"keywords":"night road rain","isDark":true}
- [스포츠] "손흥민 골든부트" → {"keywords":"soccer stadium trophy","isDark":false}
- [스포츠] "감독 자진 사퇴/경질/사임" → {"keywords":"football coach sideline bench","isDark":true}
- [스포츠] "대표팀 감독 교체/선임" → {"keywords":"football coach tactical board","isDark":true}
- [스포츠] "선수 구속영장" → {"keywords":"courthouse exterior dark","isDark":true}
- [정치] "대통령 취임식" → {"keywords":"flag ceremony podium","isDark":false}
- [정치] "의원 뇌물 구속" → {"keywords":"gavel justice law","isDark":true}
- [사회] "산불 피해" → {"keywords":"forest fire smoke","isDark":true}
- [경제] "코스피 최고치" → {"keywords":"stock market graph city","isDark":false}
- [기술] "AI 스타트업 투자" → {"keywords":"circuit board server room","isDark":false}
- [세계] "이스라엘 공습" → {"keywords":"ruins destruction smoke","isDark":true}

Korean headline: "${title}"
${exclude ? `Do NOT suggest these keywords (already shown): "${exclude}". Pick different words.\n` : ''}Reply with ONLY valid JSON.`

    try {
        const content = await callGroq(
            [{ role: 'user', content: prompt }],
            { model: 'openai/gpt-oss-20b', temperature, max_tokens: 300 }
        )
        const parsed = JSON.parse(content) as { keywords?: string; keyword?: string; isDark?: boolean }
        const kw = (parsed.keywords || parsed.keyword || '').trim()
        if (!kw) return null
        return { keywords: kw, isDark: parsed.isDark ?? false }
    } catch (e) {
        console.error('[extractKeywordsAndTone] 오류:', e)
        return null
    }
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
    const photos: Array<{ width: number; height: number; src: { large: string; original: string } }> = data.photos ?? []
    if (photos.length === 0) return []

    // 품질 필터: 저해상도(800px 미만) 및 정사각형에 가까운 이미지 제외
    // 세로형(9:16) 영상 배경으로 가로형 이미지를 쓸 때 ratio < 1.2면 좌우가 많이 잘림
    const qualified = photos.filter(p => p.width >= 800 && (p.width / p.height) >= 1.2)
    const pool = qualified.length >= count ? qualified : photos  // 필터 후 후보가 부족하면 원본 사용

    // seed 기반 Fisher-Yates 셔플 (재검색마다 다른 결과)
    let rng = seed !== undefined ? seed : Math.floor(Math.random() * 100000)
    const nextRng = () => { rng = (rng * 1664525 + 1013904223) & 0xffffffff; return (rng >>> 0) / 0x100000000 }
    const shuffled = [...pool]
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
 * 영어 키워드를 직접 받아 Pexels 검색 (관리자 직접 입력용)
 * @returns URL 배열 — 실패 시 빈 배열
 */
export async function fetchPexelsByKeyword(
    keyword: string,
    _category: string,
    seed?: number,
    count = 3,
): Promise<string[]> {
    const apiKey = process.env.PEXELS_API_KEY
    if (!apiKey) return []

    try {
        const photos = await searchPexels(keyword, apiKey, seed ?? Date.now(), count)
        if (photos.length > 0) return photos.map(p => p.large)
    } catch { /* 폴백 없음 — 키워드를 직접 입력한 경우 */ }

    return []
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
