/**
 * scripts/check-images-with-people.ts
 * 
 * 이슈에 등록된 이미지 중 사람이 포함된 이미지를 찾아서 보고합니다.
 * 
 * 사용법:
 * npx tsx scripts/check-images-with-people.ts
 * 
 * 옵션:
 * --fix : 문제가 있는 이미지를 자동으로 재검색하여 교체
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PERSON_KEYWORDS = [
    'person', 'people', 'man', 'woman', 'human', 'face', 
    'portrait', 'selfie', 'crowd', 'girl', 'boy', 
    'child', 'adult', 'male', 'female'
]

async function checkImageDescription(url: string): Promise<{ hasPerson: boolean; description: string }> {
    try {
        // Unsplash URL에서 이미지 ID 추출
        const match = url.match(/photo-([^?]+)/)
        if (!match) return { hasPerson: false, description: 'Unknown' }
        
        const photoId = match[1]
        
        // Unsplash API로 이미지 정보 조회
        const res = await fetch(`https://api.unsplash.com/photos/${photoId}`, {
            headers: {
                Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`
            }
        })
        
        if (!res.ok) return { hasPerson: false, description: 'API Error' }
        
        const data = await res.json()
        const description = (data.description || data.alt_description || '').toLowerCase()
        
        const hasPerson = PERSON_KEYWORDS.some(keyword => description.includes(keyword))
        
        return { hasPerson, description }
    } catch (error) {
        console.error('이미지 확인 실패:', url, error)
        return { hasPerson: false, description: 'Error' }
    }
}

async function main() {
    const shouldFix = process.argv.includes('--fix')
    
    console.log('=== 이슈 이미지 사람 포함 여부 확인 ===\n')
    
    // 이미지가 있는 모든 이슈 조회
    const { data: issues, error } = await supabase
        .from('issues')
        .select('id, title, category, thumbnail_urls, primary_thumbnail_index')
        .not('thumbnail_urls', 'is', null)
    
    if (error) {
        console.error('이슈 조회 실패:', error)
        return
    }
    
    if (!issues || issues.length === 0) {
        console.log('이미지가 있는 이슈가 없습니다.')
        return
    }
    
    // 빈 배열인 이슈 제외
    const issuesWithImages = issues.filter(issue => {
        const urls = issue.thumbnail_urls as string[]
        return Array.isArray(urls) && urls.length > 0
    })
    
    if (issuesWithImages.length === 0) {
        console.log('이미지가 있는 이슈가 없습니다.')
        return
    }
    
    console.log(`총 ${issuesWithImages.length}개 이슈의 이미지를 확인합니다...\n`)
    
    const problemIssues: Array<{
        id: string
        title: string
        category: string
        problemImages: Array<{ index: number; url: string; description: string }>
        isPrimaryAffected: boolean
    }> = []
    
    for (const issue of issuesWithImages) {
        const thumbnailUrls = issue.thumbnail_urls as string[]
        const primaryIndex = issue.primary_thumbnail_index ?? 0
        
        const problemImages: Array<{ index: number; url: string; description: string }> = []
        
        for (let i = 0; i < thumbnailUrls.length; i++) {
            const url = thumbnailUrls[i]
            const { hasPerson, description } = await checkImageDescription(url)
            
            if (hasPerson) {
                problemImages.push({ index: i, url, description })
            }
            
            // Rate limit 방지
            await new Promise(resolve => setTimeout(resolve, 100))
        }
        
        if (problemImages.length > 0) {
            const isPrimaryAffected = problemImages.some(img => img.index === primaryIndex)
            problemIssues.push({
                id: issue.id,
                title: issue.title,
                category: issue.category,
                problemImages,
                isPrimaryAffected
            })
            
            console.log(`❌ [${issue.category}] ${issue.title}`)
            console.log(`   문제 이미지: ${problemImages.length}/${thumbnailUrls.length}개`)
            if (isPrimaryAffected) {
                console.log(`   ⚠️  대표 이미지(${primaryIndex}번)에 사람 포함됨`)
            }
            problemImages.forEach(img => {
                console.log(`   - [${img.index}] ${img.description}`)
            })
            console.log()
        }
    }
    
    console.log('\n=== 요약 ===')
    console.log(`전체 이슈: ${issuesWithImages.length}개`)
    console.log(`문제 있는 이슈: ${problemIssues.length}개`)
    console.log(`대표 이미지에 문제: ${problemIssues.filter(i => i.isPrimaryAffected).length}개`)
    
    if (problemIssues.length === 0) {
        console.log('\n✅ 모든 이미지가 정상입니다!')
        return
    }
    
    if (shouldFix) {
        console.log('\n=== 자동 수정 시작 ===')
        
        const { fetchUnsplashImages } = await import('../lib/unsplash')
        
        for (const issue of problemIssues) {
            console.log(`\n${issue.title} 이미지 재검색 중...`)
            
            try {
                const newUrls = await fetchUnsplashImages(issue.title, issue.category)
                
                if (newUrls.length > 0) {
                    await supabase
                        .from('issues')
                        .update({
                            thumbnail_urls: newUrls,
                            primary_thumbnail_index: 0
                        })
                        .eq('id', issue.id)
                    
                    console.log(`✅ 완료: ${newUrls.length}개 새 이미지로 교체`)
                } else {
                    console.log(`❌ 실패: 새 이미지를 찾을 수 없음`)
                }
                
                // Rate limit 방지
                await new Promise(resolve => setTimeout(resolve, 3000))
            } catch (error) {
                console.error(`❌ 에러:`, error)
            }
        }
        
        console.log('\n=== 수정 완료 ===')
    } else {
        console.log('\n자동 수정하려면 --fix 옵션을 추가하세요:')
        console.log('npx tsx scripts/check-images-with-people.ts --fix')
    }
}

main().catch(console.error)
