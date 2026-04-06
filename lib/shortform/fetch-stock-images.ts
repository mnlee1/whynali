/**
 * lib/shortform/fetch-stock-images.ts
 *
 * Unsplash API로 이슈 제목 기반 스톡 이미지 3장 가져오기
 *
 * 우선순위: 이슈 제목 키워드(Groq 추출) → 카테고리 폴백
 */

import { createApi } from 'unsplash-js'
import { extractUnsplashKeywords } from './generate-text'

const CATEGORY_KEYWORDS: Record<string, string[]> = {
    '정치': ['government', 'politics', 'architecture', 'city hall', 'parliament'],
    '연예': ['entertainment', 'stage', 'spotlight', 'theater', 'performance'],
    '스포츠': ['sports', 'stadium', 'athletic', 'competition', 'game'],
    '사회': ['society', 'people', 'community', 'urban', 'city'],
    '경제': ['business', 'finance', 'office', 'corporate', 'economics'],
    '기술': ['technology', 'innovation', 'digital', 'computer', 'modern'],
    '세계': ['international', 'global', 'travel', 'world', 'geography'],
}

/**
 * 단일 키워드로 Unsplash 세로형 이미지 1장 검색.
 * pickIndex로 결과 목록 중 어떤 항목을 선택할지 지정해 이슈마다 다른 이미지를 반환한다.
 * 결과 없으면 null 반환.
 */
async function searchOneImage(
    unsplash: ReturnType<typeof createApi>,
    query: string,
    pickIndex: number = 0
): Promise<string | null> {
    try {
        const result = await unsplash.search.getPhotos({
            query,
            orientation: 'portrait',
            perPage: 10,
            orderBy: 'relevant',
        })
        const photos = result.response?.results ?? []
        if (photos.length === 0) return null
        const idx = pickIndex % photos.length
        return photos[idx]?.urls?.regular ?? null
    } catch {
        return null
    }
}

/**
 * 이슈 제목 키워드를 1순위로, 카테고리 키워드를 폴백으로 스톡 이미지 3장 가져오기
 *
 * @param category - 이슈 카테고리
 * @param issueTitle - 이슈 제목 (Groq로 영문 키워드 추출)
 */
/**
 * 이슈 제목에서 숫자 기반 해시(0~9)를 생성하여 pickIndex 오프셋으로 사용.
 * 동일 쿼리라도 이슈마다 다른 이미지를 선택하게 한다.
 */
function titlePickOffset(title: string): number {
    let hash = 0
    for (let i = 0; i < title.length; i++) {
        hash = (hash * 31 + title.charCodeAt(i)) >>> 0
    }
    return hash % 8  // 최대 8번째 결과까지
}

export async function fetch3StockImages(category: string, issueTitle?: string): Promise<string[]> {
    const apiKey = process.env.UNSPLASH_ACCESS_KEY

    if (!apiKey) {
        console.warn('[Unsplash] API 키 없음 - 기본 이미지 사용')
        return []
    }

    const unsplash = createApi({ accessKey: apiKey })
    const categoryKeywords = CATEGORY_KEYWORDS[category] ?? ['news', 'media', 'information']

    // 이슈 제목 해시로 pickIndex 오프셋 결정 → 같은 쿼리도 이슈마다 다른 이미지
    const offset = issueTitle ? titlePickOffset(issueTitle) : 0

    // 1순위: 이슈 제목에서 추출한 영문 키워드
    let titleKeywords: string[] = []
    if (issueTitle) {
        titleKeywords = await extractUnsplashKeywords(issueTitle)
        console.log(`[Unsplash] 제목 키워드 (title="${issueTitle}", offset=${offset}):`, titleKeywords)
    } else {
        console.log(`[Unsplash] issueTitle 없음 → 카테고리(${category}) 키워드만 사용`)
    }

    try {
        const images: string[] = []

        for (let i = 0; i < 3; i++) {
            const primaryQuery = titleKeywords[i] ?? null
            // 카테고리 폴백도 씬마다 다른 키워드 조합 사용
            const fallbackQuery = categoryKeywords.slice(i % categoryKeywords.length, i % categoryKeywords.length + 2).join(' ')
            const pickIndex = offset + i  // 씬마다 다른 인덱스

            let url: string | null = null

            if (primaryQuery) {
                url = await searchOneImage(unsplash, primaryQuery, pickIndex)
                console.log(`[Unsplash] Scene${i + 1} 제목키워드 "${primaryQuery}"[${pickIndex}] → ${url ? '성공' : '결과없음 → 폴백'}`)
            }

            if (!url) {
                url = await searchOneImage(unsplash, fallbackQuery, pickIndex)
                console.log(`[Unsplash] Scene${i + 1} 카테고리 "${fallbackQuery}"[${pickIndex}] → ${url ? '성공' : '결과없음'}`)
            }

            if (url) images.push(url)
        }

        // 3장 미만이면 마지막 이미지로 채우기
        while (images.length < 3 && images.length > 0) {
            images.push(images[images.length - 1])
        }

        return images
    } catch (error) {
        console.error('[Unsplash] 이미지 가져오기 실패:', error)
        return []
    }
}

/**
 * 이미지 URL 다운로드
 */
export async function downloadImage(url: string): Promise<Buffer> {
    const response = await fetch(url)
    if (!response.ok) {
        throw new Error(`이미지 다운로드 실패: ${response.status}`)
    }
    return Buffer.from(await response.arrayBuffer())
}
