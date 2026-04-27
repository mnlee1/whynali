/**
 * lib/shortform/fetch-stock-images.ts
 *
 * 숏폼용 스톡 이미지 가져오기 (Pixabay)
 *
 * 우선순위: 이슈 제목 키워드(Groq 추출) → 카테고리 폴백
 */

import { fetchPixabayImages } from '@/lib/pixabay'

export async function fetch3StockImages(category: string, issueTitle?: string, seed?: number): Promise<string[]> {
    return fetchPixabayImages(issueTitle ?? '', category, seed)
}

/**
 * 이미지 URL 다운로드 (429 등 일시적 오류 시 최대 3회 재시도)
 */
export async function downloadImage(url: string): Promise<Buffer> {
    const MAX_RETRIES = 3
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        if (attempt > 0) {
            await new Promise(r => setTimeout(r, attempt * 1500))
        }
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WhyNali/1.0)' },
        })
        if (response.ok) {
            return Buffer.from(await response.arrayBuffer())
        }
        if (response.status === 429 && attempt < MAX_RETRIES - 1) {
            console.warn(`[downloadImage] 429 rate limit, ${attempt + 1}회 재시도 예정`)
            continue
        }
        throw new Error(`이미지 다운로드 실패: ${response.status}`)
    }
    throw new Error('이미지 다운로드 실패: 최대 재시도 초과')
}
