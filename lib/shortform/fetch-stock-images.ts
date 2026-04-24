/**
 * lib/shortform/fetch-stock-images.ts
 *
 * 숏폼용 스톡 이미지 가져오기 (Pixabay)
 *
 * 우선순위: 이슈 제목 키워드(Groq 추출) → 카테고리 폴백
 */

import { fetchPixabayImages } from '@/lib/pixabay'

export async function fetch3StockImages(category: string, issueTitle?: string, _seed?: number): Promise<string[]> {
    return fetchPixabayImages(issueTitle ?? '', category)
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
