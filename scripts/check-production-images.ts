/**
 * scripts/check-production-images.ts
 * 
 * 프로덕션(실서버) DB의 이슈 이미지 중 사람이 포함된 이미지를 찾아서 보고합니다.
 * 
 * 사용법:
 * npx tsx scripts/check-production-images.ts
 * 
 * 옵션:
 * --fix : 문제가 있는 이미지를 자동으로 재검색하여 교체
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'

const prodUrl = process.env.NEXT_PUBLIC_SUPABASE_PRODUCTION_URL
const prodKey = process.env.SUPABASE_PRODUCTION_SERVICE_ROLE_KEY

if (!prodUrl || !prodKey) {
    console.error('프로덕션 DB 정보가 .env.local에 설정되지 않았습니다.')
    console.error('NEXT_PUBLIC_SUPABASE_PRODUCTION_URL')
    console.error('SUPABASE_PRODUCTION_SERVICE_ROLE_KEY')
    process.exit(1)
}

const supabase = createClient(prodUrl, prodKey)

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
        return { hasPerson: false, description: 'Error' }
    }
}

async function main() {
    const shouldFix = process.argv.includes('--fix')
    const limit = parseInt(process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] || '10')
    
    console.log('=== 프로덕션 DB 이미지 사람 포함 여부 확인 ===')
    console.log(`확인할 이슈 수: ${limit}개\n`)
    
    // 최근 이슈부터 확인
    const { data: issues, error } = await supabase
        .from('issues')
        .select('id, title, category, thumbnail_urls')
        .not('thumbnail_urls', 'is', null)
        .order('created_at', { ascending: false })
        .limit(limit)
    
    if (error) {
        console.error('이슈 조회 실패:', error)
        return
    }
    
    if (!issues || issues.length === 0) {
        console.log('이미지가 있는 이슈가 없습니다.')
        return
    }
    
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
        const primaryIndex = 0 // 프로덕션에는 아직 primary_thumbnail_index 없음
        
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
            
            console.log(`❌ [${issue.category}] ${issue.title.substring(0, 50)}...`)
            console.log(`   문제 이미지: ${problemImages.length}/${thumbnailUrls.length}개`)
            if (isPrimaryAffected) {
                console.log(`   ⚠️  대표 이미지(${primaryIndex}번)에 사람 포함됨`)
            }
            problemImages.forEach(img => {
                console.log(`   - [${img.index}] ${img.description}`)
            })
            console.log()
        } else {
            console.log(`✅ [${issue.category}] ${issue.title.substring(0, 50)}...`)
        }
    }
    
    console.log('\n=== 요약 ===')
    console.log(`확인한 이슈: ${issuesWithImages.length}개`)
    console.log(`문제 있는 이슈: ${problemIssues.length}개`)
    console.log(`대표 이미지에 문제: ${problemIssues.filter(i => i.isPrimaryAffected).length}개`)
    
    if (problemIssues.length === 0) {
        console.log('\n✅ 확인한 이미지가 모두 정상입니다!')
        return
    }
    
    console.log('\n⚠️  프로덕션 DB 수정은 신중하게 진행하세요!')
    console.log('관리자 페이지에서 수동으로 "이미지 재검색" 버튼을 사용하는 것을 권장합니다.')
}

main().catch(console.error)
