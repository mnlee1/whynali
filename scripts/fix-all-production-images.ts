/**
 * scripts/fix-all-production-images.ts
 * 
 * 프로덕션 DB의 모든 이슈 이미지를 재검색합니다.
 * 이미지를 찾을 수 없는 경우 이미지를 제거합니다.
 * 
 * 사용법:
 * npx tsx scripts/fix-all-production-images.ts --dry-run  # 미리보기만
 * npx tsx scripts/fix-all-production-images.ts             # 실제 수정
 * 
 * 옵션:
 * --dry-run : 실제 수정 없이 미리보기만
 * --limit=N : 처리할 이슈 수 제한
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { fetchUnsplashImages } from '../lib/unsplash'

const prodUrl = process.env.NEXT_PUBLIC_SUPABASE_PRODUCTION_URL
const prodKey = process.env.SUPABASE_PRODUCTION_SERVICE_ROLE_KEY

if (!prodUrl || !prodKey) {
    console.error('프로덕션 DB 정보가 .env.local에 설정되지 않았습니다.')
    console.error('NEXT_PUBLIC_SUPABASE_PRODUCTION_URL')
    console.error('SUPABASE_PRODUCTION_SERVICE_ROLE_KEY')
    process.exit(1)
}

const supabase = createClient(prodUrl, prodKey)

interface Issue {
    id: string
    title: string
    category: string
    thumbnail_urls: string[] | null
}

async function main() {
    const isDryRun = process.argv.includes('--dry-run')
    const limitArg = process.argv.find(arg => arg.startsWith('--limit='))
    const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 1000
    
    console.log('=== 프로덕션 DB 이미지 일괄 재검색 ===')
    console.log(`모드: ${isDryRun ? '미리보기 (수정 안 함)' : '실제 수정'}`)
    console.log(`최대 처리: ${limit}개\n`)
    
    // 이미지가 있는 모든 이슈 조회
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
    
    // 빈 배열 제외
    const issuesWithImages = (issues as Issue[]).filter(issue => {
        return Array.isArray(issue.thumbnail_urls) && issue.thumbnail_urls.length > 0
    })
    
    if (issuesWithImages.length === 0) {
        console.log('처리할 이슈가 없습니다.')
        return
    }
    
    console.log(`총 ${issuesWithImages.length}개 이슈를 처리합니다...\n`)
    
    let successCount = 0
    let removedCount = 0
    let failedCount = 0
    
    for (let i = 0; i < issuesWithImages.length; i++) {
        const issue = issuesWithImages[i]
        const progress = `[${i + 1}/${issuesWithImages.length}]`
        
        console.log(`${progress} ${issue.title.substring(0, 40)}...`)
        
        try {
            // 새 이미지 검색 (중복 체크 포함)
            const newUrls = await fetchUnsplashImages(issue.title, issue.category)
            
            if (newUrls.length > 0) {
                console.log(`  ✅ 새 이미지 ${newUrls.length}개 찾음`)
                
                if (!isDryRun) {
                    const { error: updateError } = await supabase
                        .from('issues')
                        .update({
                            thumbnail_urls: newUrls,
                            primary_thumbnail_index: 0
                        })
                        .eq('id', issue.id)
                    
                    if (updateError) {
                        console.log(`  ❌ DB 업데이트 실패:`, updateError.message)
                        failedCount++
                    } else {
                        successCount++
                    }
                } else {
                    successCount++
                }
            } else {
                console.log(`  ⚠️  이미지를 찾을 수 없음 → 이미지 제거`)
                
                if (!isDryRun) {
                    const { error: updateError } = await supabase
                        .from('issues')
                        .update({
                            thumbnail_urls: [],
                            primary_thumbnail_index: 0
                        })
                        .eq('id', issue.id)
                    
                    if (updateError) {
                        console.log(`  ❌ DB 업데이트 실패:`, updateError.message)
                        failedCount++
                    } else {
                        removedCount++
                    }
                } else {
                    removedCount++
                }
            }
            
            // Rate limit 방지 (Unsplash: 50회/시간, Groq: 매우 여유)
            await new Promise(resolve => setTimeout(resolve, 3000))
            
        } catch (error) {
            console.log(`  ❌ 에러:`, error)
            failedCount++
        }
    }
    
    console.log('\n=== 처리 완료 ===')
    console.log(`처리한 이슈: ${issuesWithImages.length}개`)
    console.log(`새 이미지로 교체: ${successCount}개`)
    console.log(`이미지 제거: ${removedCount}개`)
    console.log(`실패: ${failedCount}개`)
    
    if (isDryRun) {
        console.log('\n⚠️  미리보기 모드였습니다. 실제 수정하려면:')
        console.log('npx tsx scripts/fix-all-production-images.ts')
    }
}

main().catch(console.error)
