/**
 * lib/shortform/fetch-stock-images.ts
 * 
 * Unsplash API로 카테고리별 스톡 이미지 3장 가져오기
 */

import { createApi } from 'unsplash-js'

const CATEGORY_KEYWORDS: Record<string, string[]> = {
    '정치': ['government', 'politics', 'architecture', 'city hall', 'parliament'],
    '연예': ['entertainment', 'stage', 'spotlight', 'theater', 'performance'],
    '스포츠': ['sports', 'stadium', 'athletic', 'competition', 'game'],
    '사회': ['society', 'people', 'community', 'urban', 'city'],
    '경제': ['business', 'finance', 'office', 'corporate', 'economics'],
    '기술': ['technology', 'innovation', 'digital', 'computer', 'modern'],
    '세계': ['international', 'global', 'travel', 'world', 'geography'],
    '생활문화': ['lifestyle', 'culture', 'daily life', 'modern living', 'art'],
}

/**
 * 카테고리에 맞는 스톡 이미지 3장 가져오기
 */
export async function fetch3StockImages(category: string): Promise<string[]> {
    const apiKey = process.env.UNSPLASH_ACCESS_KEY
    
    if (!apiKey) {
        console.warn('[Unsplash] API 키 없음 - 기본 이미지 사용')
        return []
    }
    
    const unsplash = createApi({ accessKey: apiKey })
    const keywords = CATEGORY_KEYWORDS[category] || ['news', 'media', 'information']
    
    try {
        const images: string[] = []
        
        // 3가지 다른 키워드로 검색
        for (let i = 0; i < 3; i++) {
            const query = keywords.slice(i, i + 2).join(' ')
            
            const result = await unsplash.search.getPhotos({
                query,
                orientation: 'portrait',
                perPage: 1,
            })
            
            if (result.response?.results[0]?.urls.regular) {
                images.push(result.response.results[0].urls.regular)
            }
        }
        
        // 3장 미만이면 첫 번째 이미지로 채우기
        while (images.length < 3 && images.length > 0) {
            images.push(images[0])
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
