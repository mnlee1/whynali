/**
 * scripts/fix-dev-images.ts
 *
 * 테스트 DB(whynali-dev)의 모든 이슈 이미지를 Pexels 이미지로 교체합니다.
 *
 * 사용법:
 * npx tsx scripts/fix-dev-images.ts --dry-run  # 미리보기만
 * npx tsx scripts/fix-dev-images.ts             # 실제 수정
 *
 * 옵션:
 * --dry-run  : 실제 수정 없이 미리보기만
 * --limit=N  : 처리할 이슈 수 제한 (기본값: 전체)
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { fetchPexelsImages } from '../lib/pexels'

const devUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const devKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!devUrl || !devKey) {
    console.error('테스트 DB 정보가 .env.local에 설정되지 않았습니다.')
    console.error('NEXT_PUBLIC_SUPABASE_URL')
    console.error('SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
}

if (!process.env.PEXELS_API_KEY) {
    console.error('PEXELS_API_KEY가 .env.local에 없습니다.')
    process.exit(1)
}

const supabase = createClient(devUrl, devKey)

// Pexels 200회/시간 제한 — 18초 간격으로 안전하게 유지
const DELAY_MS = 20_000

interface Issue {
    id: string
    title: string
    category: string
    thumbnail_urls: string[] | null
}

async function main() {
    const isDryRun = process.argv.includes('--dry-run')
    const limitArg = process.argv.find(arg => arg.startsWith('--limit='))
    const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 10000

    console.log('=== 테스트 DB 이슈 이미지 전체 Pexels 교체 ===')
    console.log(`DB: ${devUrl}`)
    console.log(`모드: ${isDryRun ? '미리보기 (수정 안 함)' : '실제 수정'}`)
    console.log(`최대 처리: ${limit}개`)
    console.log(`요청 간격: ${DELAY_MS / 1000}초 (Pexels 200회/시간 제한)\n`)

    const { data: issues, error } = await supabase
        .from('issues')
        .select('id, title, category, thumbnail_urls')
        .order('created_at', { ascending: false })
        .limit(limit)

    if (error) {
        console.error('이슈 조회 실패:', error)
        return
    }

    if (!issues || issues.length === 0) {
        console.log('이슈가 없습니다.')
        return
    }

    const estimatedMinutes = Math.ceil((issues.length * DELAY_MS) / 60000)
    console.log(`총 ${issues.length}개 이슈 처리 예정 (예상 소요 시간: 약 ${estimatedMinutes}분)\n`)

    let successCount = 0
    let failedCount = 0

    for (let i = 0; i < issues.length; i++) {
        const issue = issues[i] as Issue
        const progress = `[${i + 1}/${issues.length}]`
        const currentUrls = issue.thumbnail_urls ?? []
        const source = currentUrls[0]?.includes('unsplash') ? 'Unsplash'
            : currentUrls[0]?.includes('pixabay') ? 'Pixabay'
            : currentUrls[0]?.includes('pexels') ? 'Pexels'
            : '없음'

        process.stdout.write(`${progress} [${source}] "${issue.title.substring(0, 35)}"... `)

        try {
            const newUrls = await fetchPexelsImages(issue.title, issue.category)

            if (newUrls.length === 0) {
                console.log('⚠️  이미지 없음 (스킵)')
                failedCount++
            } else if (isDryRun) {
                console.log(`✅ ${newUrls.length}개 (미리보기) → ${newUrls[0].substring(0, 60)}...`)
                successCount++
            } else {
                const { error: updateError } = await supabase
                    .from('issues')
                    .update({ thumbnail_urls: newUrls, primary_thumbnail_index: 0 })
                    .eq('id', issue.id)

                if (updateError) {
                    console.log(`❌ DB 오류: ${updateError.message}`)
                    failedCount++
                } else {
                    console.log(`✅ ${newUrls.length}개 교체 완료`)
                    successCount++
                }
            }
        } catch (e) {
            console.log(`❌ 오류: ${e}`)
            failedCount++
        }

        if (i < issues.length - 1) {
            await new Promise(r => setTimeout(r, DELAY_MS))
        }
    }

    console.log('\n' + '='.repeat(50))
    console.log(`완료 — 성공: ${successCount}개 / 실패: ${failedCount}개 / 전체: ${issues.length}개`)

    if (isDryRun) {
        console.log('\n⚠️  미리보기 모드였습니다. 실제 교체하려면:')
        console.log('npx tsx scripts/fix-dev-images.ts')
    }
}

main().catch(console.error)
