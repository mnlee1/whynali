/**
 * scripts/remove-all-production-images.ts
 * 
 * 프로덕션 DB의 모든 이슈 이미지를 제거합니다.
 * API 호출 없이 DB 업데이트만 수행합니다.
 * 
 * 사용법:
 * npx tsx scripts/remove-all-production-images.ts --dry-run  # 미리보기만
 * npx tsx scripts/remove-all-production-images.ts             # 실제 수정
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'

const prodUrl = process.env.NEXT_PUBLIC_SUPABASE_PRODUCTION_URL
const prodKey = process.env.SUPABASE_PRODUCTION_SERVICE_ROLE_KEY

if (!prodUrl || !prodKey) {
    console.error('프로덕션 DB 정보가 .env.local에 설정되지 않았습니다.')
    process.exit(1)
}

const supabase = createClient(prodUrl, prodKey)

async function main() {
    const isDryRun = process.argv.includes('--dry-run')
    
    console.log('=== 프로덕션 DB 이미지 전체 제거 ===')
    console.log(`모드: ${isDryRun ? '미리보기 (수정 안 함)' : '실제 수정'}\n`)
    
    // 이미지가 있는 모든 이슈 조회
    const { data: issues, error } = await supabase
        .from('issues')
        .select('id, title, category, thumbnail_urls')
        .not('thumbnail_urls', 'is', null)
    
    if (error) {
        console.error('이슈 조회 실패:', error)
        return
    }
    
    if (!issues || issues.length === 0) {
        console.log('이미지가 있는 이슈가 없습니다.')
        return
    }
    
    // 빈 배열이 아닌 이슈만 필터링
    const issuesWithImages = issues.filter(issue => {
        const urls = issue.thumbnail_urls as string[]
        return Array.isArray(urls) && urls.length > 0
    })
    
    if (issuesWithImages.length === 0) {
        console.log('제거할 이미지가 없습니다.')
        return
    }
    
    console.log(`${issuesWithImages.length}개 이슈의 이미지를 제거합니다...\n`)
    
    if (isDryRun) {
        issuesWithImages.forEach((issue, i) => {
            console.log(`[${i + 1}/${issuesWithImages.length}] [${issue.category}] ${issue.title.substring(0, 50)}...`)
        })
        
        console.log('\n=== 미리보기 완료 ===')
        console.log(`제거할 이슈: ${issuesWithImages.length}개`)
        console.log('\n실제 제거하려면:')
        console.log('npx tsx scripts/remove-all-production-images.ts')
        return
    }
    
    // 실제 제거
    console.log('이미지 제거 중...\n')
    
    const { error: updateError } = await supabase
        .from('issues')
        .update({
            thumbnail_urls: []
        })
        .in('id', issuesWithImages.map(i => i.id))
    
    if (updateError) {
        console.error('❌ 이미지 제거 실패:', updateError)
        return
    }
    
    console.log('=== 제거 완료 ===')
    console.log(`✅ ${issuesWithImages.length}개 이슈의 이미지를 제거했습니다.`)
    console.log('\n새로운 이슈는 자동으로 올바른 이미지가 생성됩니다.')
    console.log('기존 이슈는 그라디언트 배경으로 표시됩니다.')
}

main().catch(console.error)
