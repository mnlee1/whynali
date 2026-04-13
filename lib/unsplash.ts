/**
 * lib/unsplash.ts
 *
 * Unsplash 이미지 검색 유틸리티
 * - UNSPLASH_ACCESS_KEY 없으면 빈 배열 반환 (안전하게 스킵)
 * - 이미지 파일 저장 없음, URL만 반환
 * - 중복 방지: 다른 이슈에서 사용 중인 이미지 자동 제외
 * - 라이선스: Unsplash License (상업적 이용 가능, 출처 표기 불필요)
 *
 * 제거 방법: 이 파일 삭제 + approve/route.ts에서 fetchUnsplashImages 호출 제거
 *           + HotIssueHighlight.tsx에서 thumbnail_urls 관련 코드 제거
 *           + IssuePreviewDrawer.tsx에서 이미지 미리보기 섹션 제거
 */

import { supabaseAdmin } from '@/lib/supabase/server'

const CATEGORY_FALLBACK: Record<string, string> = {
    '연예': 'entertainment stage concert',
    '스포츠': 'sports stadium field',
    '정치': 'politics building architecture',
    '사회': 'society cityscape urban',
    '경제': 'economy business skyline',
    'IT과학': 'technology abstract circuit',
    '기술': 'technology abstract circuit',
    '생활문화': 'lifestyle architecture interior',
    '세계': 'world landmark architecture',
}

/**
 * Groq API 직접 호출로 한국어 이슈 제목 → 영어 검색 키워드 추출
 * (rate limit 시스템 우회 — 키워드 추출은 단순 작업이라 직접 호출이 안정적)
 */
async function extractEnglishKeywords(title: string): Promise<string | null> {
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
                        content: `Extract 2 English search keywords for a stock photo search from this Korean news headline. Reply with ONLY the keywords, nothing else.\n\n"${title}"`,
                    },
                ],
                max_tokens: 20,
                temperature: 0,
            }),
        })

        if (!res.ok) return null
        const data = await res.json()
        const keywords = data.choices?.[0]?.message?.content?.trim()
        return keywords || null
    } catch {
        return null
    }
}

/**
 * Unsplash 검색 후 결과 중 랜덤 3개 URL 반환
 * 매번 다른 이미지를 제공하기 위해 30개 중 랜덤 선택
 * 사람 얼굴/인물 이미지는 자동 제외 (오해 소지 방지)
 * 이미 사용 중인 이미지는 자동 제외 (중복 방지)
 */
async function searchUnsplash(query: string, accessKey: string, excludeUrls: string[] = []): Promise<string[]> {
    // 사람/얼굴 관련 키워드 제외 + 대상/장소 키워드 추가
    const excludeTerms = '-person -people -face -portrait -human -man -woman -selfie -crowd'
    const includeTerms = 'architecture abstract object concept'
    const searchQuery = `${query} ${includeTerms} ${excludeTerms}`
    
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(searchQuery)}&per_page=30&orientation=landscape`
    const res = await fetch(url, {
        headers: { Authorization: `Client-ID ${accessKey}` },
    })
    if (!res.ok) return []
    const data = await res.json()
    const results: Array<{ urls: { regular: string }; description?: string; alt_description?: string }> = data.results ?? []
    
    if (results.length === 0) return []
    
    // 설명에 사람 관련 단어가 있는 이미지 제외
    const personKeywords = ['person', 'people', 'man', 'woman', 'human', 'face', 'portrait', 'selfie', 'crowd', 'girl', 'boy', 'child', 'adult']
    const filtered = results.filter(r => {
        const desc = (r.description || r.alt_description || '').toLowerCase()
        const hasPerson = personKeywords.some(keyword => desc.includes(keyword))
        const isDuplicate = excludeUrls.includes(r.urls?.regular)
        return !hasPerson && !isDuplicate
    })
    
    // 필터링된 결과가 없으면 원본에서 중복만 제외
    const finalResults = filtered.length > 0 
        ? filtered 
        : results.filter(r => !excludeUrls.includes(r.urls?.regular))
    
    if (finalResults.length === 0) return []
    
    // 랜덤하게 3개 선택
    const shuffled = [...finalResults].sort(() => Math.random() - 0.5)
    return shuffled
        .slice(0, Math.min(3, shuffled.length))
        .map(r => r.urls?.regular)
        .filter(Boolean)
}

/**
 * 이슈 제목과 카테고리로 Unsplash 이미지 URL 최대 3개 반환
 * 다른 이슈에서 이미 사용 중인 이미지는 자동으로 제외됩니다.
 * 개발 환경에서는 실서버(프로덕션)의 이미지도 함께 제외합니다.
 * @returns 이미지 URL 배열 (1080px, 최대 3개) — 실패 시 빈 배열
 */
export async function fetchUnsplashImages(title: string, category: string): Promise<string[]>
export async function fetchUnsplashImages(title: string, category: string, debug: true): Promise<{ urls: string[]; keyword: string; source: 'groq' | 'fallback' }>
export async function fetchUnsplashImages(title: string, category: string, debug?: boolean): Promise<string[] | { urls: string[]; keyword: string; source: 'groq' | 'fallback' }> {
    const accessKey = process.env.UNSPLASH_ACCESS_KEY
    if (!accessKey) return debug ? { urls: [], keyword: '', source: 'fallback' } : []

    // DB에서 이미 사용 중인 이미지 URL 조회 (중복 방지)
    const usedUrls: string[] = []
    
    try {
        // 현재 환경(로컬/테스트) DB에서 사용 중인 이미지
        const { data } = await supabaseAdmin
            .from('issues')
            .select('thumbnail_urls')
            .not('thumbnail_urls', 'is', null)
        
        if (data) {
            data.forEach(issue => {
                if (Array.isArray(issue.thumbnail_urls)) {
                    usedUrls.push(...issue.thumbnail_urls)
                }
            })
        }

        // 프로덕션 DB URL이 설정되어 있으면 프로덕션 이미지도 제외
        const prodUrl = process.env.NEXT_PUBLIC_SUPABASE_PRODUCTION_URL
        const prodKey = process.env.SUPABASE_PRODUCTION_SERVICE_ROLE_KEY
        
        if (prodUrl && prodKey && prodUrl !== process.env.NEXT_PUBLIC_SUPABASE_URL) {
            try {
                const { createClient } = require('@supabase/supabase-js')
                const prodSupabase = createClient(prodUrl, prodKey)
                
                const { data: prodData } = await prodSupabase
                    .from('issues')
                    .select('thumbnail_urls')
                    .not('thumbnail_urls', 'is', null)
                
                if (prodData) {
                    prodData.forEach((issue: any) => {
                        if (Array.isArray(issue.thumbnail_urls)) {
                            usedUrls.push(...issue.thumbnail_urls)
                        }
                    })
                }
                
                console.log(`[Unsplash] 중복 체크: 로컬 + 프로덕션 총 ${usedUrls.length}개 이미지 제외`)
            } catch (error) {
                console.warn('[Unsplash] 프로덕션 이미지 조회 실패:', error)
                // 프로덕션 조회 실패 시 로컬만 사용
            }
        }
    } catch (error) {
        console.warn('[Unsplash] 사용 중인 이미지 조회 실패:', error)
        // 조회 실패 시 계속 진행 (중복 체크 없이)
    }

    // 1차: Groq로 영어 키워드 추출 후 검색
    const englishKeywords = await extractEnglishKeywords(title)
    if (englishKeywords) {
        try {
            const urls = await searchUnsplash(englishKeywords, accessKey, usedUrls)
            if (urls.length > 0) return debug ? { urls, keyword: englishKeywords, source: 'groq' } : urls
        } catch {
            // 실패 시 카테고리 폴백으로 진행
        }
    }

    // 2차 폴백: 카테고리 영어 키워드로 재검색
    const fallbackQuery = CATEGORY_FALLBACK[category] ?? 'news'
    try {
        const urls = await searchUnsplash(fallbackQuery, accessKey, usedUrls)
        return debug ? { urls, keyword: fallbackQuery, source: 'fallback' } : urls
    } catch {
        return debug ? { urls: [], keyword: fallbackQuery, source: 'fallback' } : []
    }
}
