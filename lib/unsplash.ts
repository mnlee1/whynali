/**
 * lib/unsplash.ts
 *
 * Unsplash 이미지 검색 유틸리티
 * - UNSPLASH_ACCESS_KEY 없으면 null 반환 (안전하게 스킵)
 * - 이미지 파일 저장 없음, URL만 반환
 * - 라이선스: Unsplash License (상업적 이용 가능, 출처 표기 불필요)
 *
 * 제거 방법: 이 파일 삭제 + approve/route.ts에서 fetchUnsplashImage 호출 제거
 *           + HotIssueHighlight.tsx에서 thumbnail_url 관련 코드 제거
 */

import { callGroq } from '@/lib/ai/groq-client'

const CATEGORY_FALLBACK: Record<string, string> = {
    '연예': 'entertainment celebrity',
    '스포츠': 'sports stadium',
    '정치': 'politics government',
    '사회': 'society community',
    '경제': 'economy business finance',
    'IT과학': 'technology science',
    '생활문화': 'lifestyle culture',
    '세계': 'world international',
}

/**
 * Groq AI로 한국어 이슈 제목 → 영어 검색 키워드 2개 추출
 */
async function extractEnglishKeywords(title: string): Promise<string | null> {
    try {
        const result = await callGroq([
            {
                role: 'user',
                content: `Extract 2 English search keywords for a stock photo search from this Korean news headline. Reply with ONLY the keywords, nothing else.\n\n"${title}"`,
            },
        ], { max_tokens: 20, temperature: 0 })

        const keywords = result?.trim()
        return keywords || null
    } catch {
        return null
    }
}

/**
 * 이슈 제목과 카테고리로 Unsplash 이미지 URL 검색
 * @returns 이미지 URL (small 사이즈, ~400px) 또는 null
 */
export async function fetchUnsplashImage(title: string, category: string): Promise<string | null> {
    const accessKey = process.env.UNSPLASH_ACCESS_KEY
    if (!accessKey) return null

    // 1차: Groq로 영어 키워드 추출 후 검색
    const englishKeywords = await extractEnglishKeywords(title)
    if (englishKeywords) {
        try {
            const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(englishKeywords)}&per_page=1&orientation=landscape`
            const res = await fetch(url, {
                headers: { Authorization: `Client-ID ${accessKey}` },
            })
            if (res.ok) {
                const data = await res.json()
                const imageUrl = data.results?.[0]?.urls?.regular
                if (imageUrl) return imageUrl
            }
        } catch {
            // 실패 시 카테고리 폴백으로 진행
        }
    }

    // 2차 폴백: 카테고리 영어 키워드로 재검색
    const fallbackQuery = CATEGORY_FALLBACK[category] ?? 'news'
    try {
        const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(fallbackQuery)}&per_page=1&orientation=landscape`
        const res = await fetch(url, {
            headers: { Authorization: `Client-ID ${accessKey}` },
        })
        if (res.ok) {
            const data = await res.json()
            return data.results?.[0]?.urls?.regular ?? null
        }
    } catch {
        // 폴백도 실패 시 null 반환 → 슬라이더는 기존 그라디언트로 표시
    }

    return null
}
