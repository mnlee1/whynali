/**
 * scripts/check-specific-issue.ts
 * 
 * 특정 이슈의 이미지 URL과 설명을 확인합니다.
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
    const searchTitle = process.argv[2] || '대장동 논란'
    
    console.log(`=== "${searchTitle}" 이슈 이미지 확인 ===\n`)
    
    const { data: issues, error } = await supabase
        .from('issues')
        .select('id, title, category, thumbnail_urls')
        .ilike('title', `%${searchTitle}%`)
    
    if (error) {
        console.error('이슈 조회 실패:', error)
        return
    }
    
    if (!issues || issues.length === 0) {
        console.log('해당 이슈를 찾을 수 없습니다.')
        return
    }
    
    for (const issue of issues) {
        console.log(`ID: ${issue.id}`)
        console.log(`제목: ${issue.title}`)
        console.log(`카테고리: ${issue.category}`)
        console.log(`\n이미지 URL:`)
        
        const urls = issue.thumbnail_urls as string[]
        if (!urls || urls.length === 0) {
            console.log('  이미지 없음')
            continue
        }
        
        for (let i = 0; i < urls.length; i++) {
            const url = urls[i]
            console.log(`\n[${i}] ${url}`)
            
            // Unsplash API로 상세 정보 조회
            const match = url.match(/photo-([^?]+)/)
            if (match) {
                const photoId = match[1]
                
                try {
                    const res = await fetch(`https://api.unsplash.com/photos/${photoId}`, {
                        headers: {
                            Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`
                        }
                    })
                    
                    if (res.ok) {
                        const data = await res.json()
                        console.log(`    설명: ${data.description || data.alt_description || '(없음)'}`)
                        console.log(`    작가: ${data.user.name}`)
                        console.log(`    태그: ${data.tags?.map((t: any) => t.title).join(', ') || '(없음)'}`)
                    }
                } catch (error) {
                    console.log('    설명 조회 실패')
                }
                
                await new Promise(resolve => setTimeout(resolve, 100))
            }
        }
        
        console.log('\n' + '='.repeat(80) + '\n')
    }
}

main().catch(console.error)
